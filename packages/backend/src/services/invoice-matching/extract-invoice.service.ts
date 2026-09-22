import { AI_FEATURE, type ExtractedInvoice, TRANSACTION_TYPES } from '@bt/shared/types';
import type { Expect, MutuallyAssignable } from '@bt/shared/types/type-testing';
import { currencyCode } from '@common/lib/zod/custom-types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { AI_MAX_OUTPUT_TOKENS, aiCallGuards, createAIClient, describeMissingAiConfiguration } from '@services/ai';
import { detectMimeType } from '@services/attachments/attachments.service';
import { resolveAiExtractionFailure } from '@services/import-export/core/ai-extraction-failure';
import { Output, generateText } from 'ai';
import { isValid, parseISO } from 'date-fns';
import { z } from 'zod';

const SYSTEM_PROMPT = [
  'You read a single billing document and report what it says.',
  'Invoices, receipts, order confirmations, order summaries and payment confirmations all count: anything stating who charged whom, how much and when.',
  'Report the grand total the customer owes, including tax, not a subtotal or a line item.',
  'currencyCode is the ISO 4217 code of that total, e.g. USD, EUR, SEK.',
  'vendorName is the party that issued the document; customerName is the party it is billed to, null when none is named.',
  'issueDate is the date the document was issued or the order was placed, in YYYY-MM-DD, never the due or delivery date.',
  'invoiceUrl is an https link printed in the document that opens this exact document or its payment page, so it carries an identifier or token unique to it.',
  'A vendor homepage, customer account, order-status, FAQ, support or terms page is not an invoice link: report null for those.',
  'Never invent a URL and never guess one from the vendor name; report null when none is printed.',
  'Set isInvoice to false only when the document states no amount charged (a contract, a letter, an unrelated photo), and leave the other fields null.',
].join(' ');

// ponytail: a link to one invoice carries an id or token, so a digit-free path is taken for
// a generic page (order status, FAQ) and dropped. Revisit if a real invoice link gets lost.
const DOCUMENT_SPECIFIC_URL = /^https:\/\/[^/]+\/.*\d/;

/** Every field is nullable so a "this is not an invoice" answer still parses. */
const aiAnswerSchema = z.object({
  isInvoice: z.boolean(),
  vendorName: z.string().nullable(),
  customerName: z.string().nullable(),
  totalAmount: z.number().nullable(),
  currencyCode: z.string().nullable(),
  issueDate: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceUrl: z.string().nullable(),
});

export const invoiceSchema = z.object({
  transactionType: z.nativeEnum(TRANSACTION_TYPES),
  vendorName: z.string().trim().min(1),
  customerName: z.string().trim().min(1).nullable(),
  totalAmount: z.number().positive(),
  currencyCode: currencyCode(),
  // `Date.parse` rolls "2026-02-30" over into March, which would then reach the date
  // window arithmetic as a day the invoice never carried.
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => isValid(parseISO(value)), 'Invalid calendar date'),
  invoiceNumber: z.string().trim().min(1).nullable(),
  invoiceUrl: z
    .string()
    .max(2048, 'The URL must not exceed 2048 characters.')
    .url('Invalid URL')
    .startsWith('https://')
    .nullable(),
});

/**
 * Fails `tsc` when the extraction schema and the shared invoice type drift apart.
 * @public exported only so the assertion is not flagged as unused.
 */
export type InvoiceSchemaIsInSync = Expect<MutuallyAssignable<z.infer<typeof invoiceSchema>, ExtractedInvoice>>;

interface ExtractInvoiceResult {
  invoice: ExtractedInvoice;
  provider: string;
  modelId: string;
}

/**
 * Reads one uploaded invoice with the user's AI model. Nothing is stored: the bytes live
 * only for the duration of the call.
 */
export async function extractInvoice({
  userId,
  bytes,
  transactionType,
  allowOperatorKey,
}: {
  userId: number;
  bytes: Buffer;
  transactionType: TRANSACTION_TYPES;
  allowOperatorKey?: boolean;
}): Promise<ExtractInvoiceResult> {
  const mimeType = detectMimeType({ bytes });
  if (!mimeType) {
    throw new ValidationError({ message: t({ key: 'invoiceMatching.unsupportedFileType' }) });
  }

  const aiClient = await createAIClient({ userId, feature: AI_FEATURE.receiptParsing, allowOperatorKey });
  if (!aiClient) {
    throw new ValidationError({ message: await describeMissingAiConfiguration({ userId }) });
  }

  const { abortSignal, maxRetries } = aiCallGuards({ provider: aiClient.provider });

  let answer: z.infer<typeof aiAnswerSchema>;
  try {
    const { output } = await generateText({
      model: aiClient.model,
      output: Output.object({ schema: aiAnswerSchema, name: 'invoice' }),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Report the invoice fields for the attached document.' },
            { type: 'file', data: bytes, mediaType: mimeType },
          ],
        },
      ],
      abortSignal,
      maxRetries,
      maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
    });
    answer = output;
  } catch (error) {
    const failure = await resolveAiExtractionFailure({ userId, aiClient, error, logPrefix: '[Invoice Matching]' });
    throw new ValidationError({ message: failure.error.message });
  }

  if (!answer.isInvoice) {
    throw new ValidationError({ message: t({ key: 'invoiceMatching.notAnInvoice' }) });
  }

  const parsed = invoiceSchema.safeParse({
    ...answer,
    transactionType,
    customerName: answer.customerName?.trim() || null,
    invoiceNumber: answer.invoiceNumber?.trim() || null,
    invoiceUrl: answer.invoiceUrl && DOCUMENT_SPECIFIC_URL.test(answer.invoiceUrl) ? answer.invoiceUrl : null,
  });

  if (!parsed.success) {
    logger.info('[Invoice Matching] AI answer was missing required invoice fields', {
      userId,
      modelId: aiClient.modelId,
      issues: parsed.error.issues.map((issue) => issue.path.join('.')),
    });
    throw new ValidationError({ message: t({ key: 'invoiceMatching.incompleteInvoice' }) });
  }

  return { invoice: parsed.data, provider: aiClient.provider, modelId: aiClient.modelId };
}
