import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { UnexpectedError, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { extractCashFlowsWithAI } from '@services/import-export/portfolio-cash-flow-import';
import { extractTextFromFile, validateFileBuffer } from '@services/import-export/statement-parser';
import { z } from 'zod';

const MAX_INPUT_CHARS = 50_000;
const LOG_PREFIX = '[CashFlowImport/extract]';

const baseFields = {
  portfolioId: recordId(),
  userHint: z.string().max(2_000).optional().nullable(),
};

const textBody = z.object({
  ...baseFields,
  text: z.string().min(1).max(MAX_INPUT_CHARS),
});

const fileBody = z.object({
  ...baseFields,
  fileBase64: z.string().min(1),
  fileName: z.string().max(256).optional(),
});

export const extractCashFlowController = createController(
  z.object({ body: z.union([textBody, fileBody]) }),
  async ({ user, body }) => {
    const overallStart = Date.now();
    const isFile = 'fileBase64' in body;

    logger.info(
      `${LOG_PREFIX} request received userId=${user.id} portfolioId=${body.portfolioId} mode=${isFile ? 'file' : 'text'}` +
        (isFile
          ? ` fileName=${body.fileName ?? 'unknown'} base64Length=${body.fileBase64.length}`
          : ` textLength=${body.text.length}`),
    );

    const text = isFile
      ? await extractTextFromBase64({ fileBase64: body.fileBase64, fileName: body.fileName })
      : body.text;

    logger.info(
      `${LOG_PREFIX} text ready, calling AI userId=${user.id} portfolioId=${body.portfolioId} textLength=${text.length}`,
    );
    const aiStart = Date.now();

    const result = await extractCashFlowsWithAI({
      userId: user.id,
      text,
      userHint: body.userHint ?? null,
    });

    const aiMs = Date.now() - aiStart;

    if (!result.success) {
      logger.warn(
        `${LOG_PREFIX} AI extraction failed userId=${user.id} portfolioId=${body.portfolioId} aiMs=${aiMs} code=${result.error.code} message=${result.error.message}`,
      );
      throw new UnexpectedError({ message: result.error.message });
    }

    logger.info(
      `${LOG_PREFIX} done userId=${user.id} portfolioId=${body.portfolioId} aiMs=${aiMs} totalMs=${Date.now() - overallStart} rows=${result.result.rows.length} model=${result.result.modelName}`,
    );

    return { data: result.result };
  },
);

async function extractTextFromBase64({
  fileBase64,
  fileName,
}: {
  fileBase64: string;
  fileName?: string;
}): Promise<string> {
  const decodeStart = Date.now();
  const rawBuffer = Buffer.from(fileBase64, 'base64');
  logger.info(
    `${LOG_PREFIX} decoded base64 fileName=${fileName ?? 'unknown'} bufferBytes=${rawBuffer.length} decodeMs=${Date.now() - decodeStart}`,
  );

  const validateStart = Date.now();
  const validation = validateFileBuffer({ buffer: rawBuffer });
  logger.info(
    `${LOG_PREFIX} validated buffer valid=${validation.valid} fileType=${validation.fileType ?? 'n/a'} validateMs=${Date.now() - validateStart}`,
  );

  if (!validation.valid) {
    throw new ValidationError({
      message: validation.error?.message ?? 'Invalid file',
    });
  }

  const extractStart = Date.now();
  const textResult = await extractTextFromFile({
    buffer: validation.fileBuffer!,
    fileType: validation.fileType!,
  });
  logger.info(
    `${LOG_PREFIX} extracted text fileType=${validation.fileType} success=${textResult.success} pageCount=${textResult.pageCount ?? 'n/a'} textLength=${textResult.text?.length ?? 0} extractMs=${Date.now() - extractStart}`,
  );

  if (!textResult.success || !textResult.text) {
    throw new ValidationError({
      message: textResult.error ?? 'Failed to extract text from file',
    });
  }

  if (textResult.text.length > MAX_INPUT_CHARS) {
    throw new ValidationError({
      message: `Extracted text exceeds ${MAX_INPUT_CHARS.toLocaleString()} character limit. Try a smaller file.`,
    });
  }

  return textResult.text;
}
