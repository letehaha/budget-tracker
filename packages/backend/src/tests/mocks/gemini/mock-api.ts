import { AI_FEATURE, getModelNameFromModelId } from '@bt/shared/types';
import { getDefaultModelForFeature } from '@services/ai/models-config';
import { HttpResponse, http } from 'msw';

// Gemini API uses a different URL pattern, with the model name baked into the
// path. Wildcard the model segment so swapping the configured default model
// doesn't silently unmatch every handler here.
export const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/*';

export const VALID_GEMINI_API_KEY = 'test-valid-gemini-key-12345';
export const INVALID_GEMINI_API_KEY = 'test-invalid-gemini-key';

/** The mock in this file only backs the categorization feature's Gemini calls. */
const DEFAULT_EXPECTED_MODEL = getModelNameFromModelId({
  modelId: getDefaultModelForFeature({ feature: AI_FEATURE.categorization }),
});

/**
 * Pulls the `<model>` segment out of `.../v1beta/models/<model>:generateContent`.
 * Returns null if the URL doesn't match that shape at all.
 */
function extractModelSegment({ url }: { url: string }): string | null {
  const match = /\/v1beta\/models\/([^/:]+):/.exec(url);
  return match?.[1] ?? null;
}

/**
 * The wildcarded URL matches any model, so this is the only place that still
 * checks the app requested the model it was configured for. Returns an error
 * response (instead of throwing) so the failure surfaces as a readable test
 * assertion rather than an unhandled rejection inside the MSW handler. Exported
 * so other Gemini handlers (e.g. the investment-import CSV mock) can reuse the
 * same check instead of re-implementing it.
 */
export function rejectIfWrongModel({ request, expectedModel }: { request: Request; expectedModel: string }) {
  const actualModel = extractModelSegment({ url: request.url });
  if (actualModel === expectedModel) return null;

  return HttpResponse.json(
    {
      error: {
        code: 400,
        message: `Mock Gemini handler expected model "${expectedModel}" but request targeted "${actualModel}". Request URL: ${request.url}`,
        status: 'INVALID_ARGUMENT',
      },
    },
    { status: 400 },
  );
}

interface MockCategorizationOptions {
  /** Map of transaction ordinal to category ordinal (1-based, prompt order), emitted as "t1:c2" alias pairs */
  categorizations?: Record<number, number>;
  /** Map of transaction ordinal to a skip reason code, emitted as "t1:skip:transfer" lines */
  skips?: Record<number, string>;
  /** Verbatim response text; overrides categorizations/skips (e.g. a prose refusal) */
  rawText?: string;
  /** finishReason for the candidate; MAX_TOKENS simulates a truncated response */
  finishReason?: string;
  /** If true, returns an error response */
  shouldFail?: boolean;
  /** Custom error status code */
  errorStatus?: number;
}

/**
 * Creates a mock response for the Gemini generateContent API
 * Returns categorization in the short-alias format "t<n>:c<n>" per line
 */
export function createGeminiMock(options: MockCategorizationOptions = {}) {
  const {
    categorizations = {},
    skips = {},
    rawText,
    finishReason = 'STOP',
    shouldFail = false,
    errorStatus = 500,
  } = options;

  return http.post(GEMINI_API_URL, ({ request }) => {
    const modelMismatch = rejectIfWrongModel({ request, expectedModel: DEFAULT_EXPECTED_MODEL });
    if (modelMismatch) return modelMismatch;

    const url = new URL(request.url);
    // The SDK sends the key as the `x-goog-api-key` header; the REST API also
    // accepts a `?key=` query param, so honour both transports.
    const apiKey = request.headers.get('x-goog-api-key') ?? url.searchParams.get('key');

    // Check for invalid API key
    if (apiKey === INVALID_GEMINI_API_KEY) {
      return HttpResponse.json(
        {
          error: {
            code: 401,
            message: 'API_KEY_INVALID',
            status: 'UNAUTHENTICATED',
          },
        },
        { status: 401 },
      );
    }

    // Simulate failure if requested
    if (shouldFail) {
      return HttpResponse.json(
        {
          error: {
            code: errorStatus,
            message: 'Internal server error',
            status: 'INTERNAL',
          },
        },
        { status: errorStatus },
      );
    }

    const responseText =
      rawText ??
      [
        ...Object.entries(categorizations).map(([txOrdinal, catOrdinal]) => `t${txOrdinal}:c${catOrdinal}`),
        ...Object.entries(skips).map(([txOrdinal, reason]) => `t${txOrdinal}:skip:${reason}`),
      ].join('\n');

    return HttpResponse.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: responseText || '# No categorizations',
              },
            ],
            role: 'model',
          },
          finishReason,
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150,
      },
    });
  });
}
