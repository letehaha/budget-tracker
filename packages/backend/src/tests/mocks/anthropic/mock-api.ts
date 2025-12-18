import { HttpResponse, http } from 'msw';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export const VALID_ANTHROPIC_API_KEY = 'sk-ant-test-valid-key-12345';
export const INVALID_ANTHROPIC_API_KEY = 'sk-ant-test-invalid-key';

interface MockCategorizationOptions {
  /** Map of transactionId to categoryId for the mock response */
  categorizations?: Record<number, number>;
  /** If true, returns an error response */
  shouldFail?: boolean;
  /** Custom error status code */
  errorStatus?: number;
}

/**
 * Creates a mock response for the Anthropic messages API
 * Returns categorization in the format "transactionId:categoryId" per line
 */
export function createAnthropicMock(options: MockCategorizationOptions = {}) {
  const { categorizations = {}, shouldFail = false, errorStatus = 500 } = options;

  return http.post(ANTHROPIC_API_URL, ({ request }) => {
    const apiKey = request.headers.get('x-api-key');

    // Check for invalid API key
    if (apiKey === INVALID_ANTHROPIC_API_KEY) {
      return HttpResponse.json(
        {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Invalid API key',
          },
        },
        { status: 401 },
      );
    }

    // Simulate failure if requested
    if (shouldFail) {
      return HttpResponse.json(
        {
          type: 'error',
          error: {
            type: 'api_error',
            message: 'Internal server error',
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
      id: 'msg_test_123',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: responseText || '# No categorizations',
        },
      ],
      model: 'claude-haiku-4-5',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
      },
    });
  });
}

/**
 * Creates a dynamic mock that extracts transaction IDs from the request
 * and assigns them to the provided categoryId
 */
export function createDynamicCategorizationMock({ categoryId }: { categoryId: number }) {
  return http.post(ANTHROPIC_API_URL, async ({ request }) => {
    const apiKey = request.headers.get('x-api-key');

    if (apiKey === INVALID_ANTHROPIC_API_KEY) {
      return HttpResponse.json(
        {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Invalid API key',
          },
        },
        { status: 401 },
      );
    }

    // Parse request body to extract transaction IDs
    const body = (await request.json()) as { messages: { content: string }[] };
    const userMessage = body.messages[0]?.content || '';

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
      id: 'msg_test_dynamic',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: responseText || '# No transactions found',
        },
      ],
      model: 'claude-haiku-4-5',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 150,
        output_tokens: transactionIds.length * 3,
      },
    });
  });
}

/**
 * Default handler that returns empty categorization
 */
export const anthropicHandlers = [createAnthropicMock()];
