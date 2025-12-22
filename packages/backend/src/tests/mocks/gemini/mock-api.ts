import { HttpResponse, http } from 'msw';

// Gemini API uses a different URL pattern
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

export const VALID_GEMINI_API_KEY = 'test-valid-gemini-key-12345';
export const INVALID_GEMINI_API_KEY = 'test-invalid-gemini-key';

interface MockCategorizationOptions {
  /** Map of transactionId to categoryId for the mock response */
  categorizations?: Record<number, number>;
  /** If true, returns an error response */
  shouldFail?: boolean;
  /** Custom error status code */
  errorStatus?: number;
}

/**
 * Creates a mock response for the Gemini generateContent API
 * Returns categorization in the format "transactionId:categoryId" per line
 */
export function createGeminiMock(options: MockCategorizationOptions = {}) {
  const { categorizations = {}, shouldFail = false, errorStatus = 500 } = options;

  return http.post(GEMINI_API_URL, ({ request }) => {
    const url = new URL(request.url);
    const apiKey = url.searchParams.get('key');

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

    // Build response text from categorizations map
    const responseText = Object.entries(categorizations)
      .map(([txId, catId]) => `${txId}:${catId}`)
      .join('\n');

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
          finishReason: 'STOP',
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

/**
 * Creates a dynamic mock that extracts transaction IDs from the request
 * and assigns them to the provided categoryId
 */
export function createDynamicCategorizationMock({ categoryId }: { categoryId: number }) {
  return http.post(GEMINI_API_URL, async ({ request }) => {
    const url = new URL(request.url);
    const apiKey = url.searchParams.get('key');

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

    // Parse request body to extract transaction IDs
    const body = (await request.json()) as { contents: { parts: { text: string }[] }[] };
    const userMessage = body.contents?.[0]?.parts?.[0]?.text || '';

    // Extract transaction IDs from the TRANSACTIONS section
    // Format: id|amount|currency|account|datetime|note
    const transactionSection = userMessage.split('TRANSACTIONS:')[1] || '';
    const lines = transactionSection.trim().split('\n');

    const transactionIds: number[] = [];
    for (const line of lines) {
      if (line.startsWith('id|')) continue; // Skip header
      const id = parseInt(line.split('|')[0] || '', 10);
      if (!isNaN(id)) {
        transactionIds.push(id);
      }
    }

    // Build response - assign all transactions to the given category
    const responseText = transactionIds.map((txId) => `${txId}:${categoryId}`).join('\n');

    return HttpResponse.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: responseText || '# No transactions found',
              },
            ],
            role: 'model',
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 150,
        candidatesTokenCount: transactionIds.length * 3,
        totalTokenCount: 150 + transactionIds.length * 3,
      },
    });
  });
}

/**
 * Default handler that returns empty categorization
 */
export const geminiHandlers = [createGeminiMock()];
