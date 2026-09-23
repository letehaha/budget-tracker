import { HttpResponse, http } from 'msw';

/** OpenAI's own API, which native `openai` connections dial through the Responses API. */
const OPENAI_API_URL = 'https://api.openai.com/v1';

export const OPENAI_RESPONSES_URL = `${OPENAI_API_URL}/responses`;

export const VALID_OPENAI_API_KEY = 'sk-openai-test-valid-key';

/** The default handlers answer 401 for this key. */
export const INVALID_OPENAI_API_KEY = 'sk-openai-test-invalid-key';

/** The default `/responses` handler answers 404 for this model and succeeds for every other. */
export const OPENAI_UNKNOWN_MODEL = 'gpt-model-that-does-not-exist';

/** What the default `/models` handler lists. */
export const OPENAI_LISTED_MODELS = ['gpt-5.4-nano', 'gpt-5.6-luna', 'gpt-5.6-terra', 'text-embedding-3-small'];

function bearerToken({ request }: { request: Request }): string | null {
  return request.headers.get('authorization')?.replace(/^Bearer /, '') ?? null;
}

function authErrorResponse() {
  return HttpResponse.json(
    {
      error: {
        message: 'Incorrect API key provided.',
        type: 'invalid_request_error',
        param: null,
        code: 'invalid_api_key',
      },
    },
    { status: 401 },
  );
}

function modelNotFoundResponse({ model }: { model: string }) {
  return HttpResponse.json(
    {
      error: {
        message: `The model \`${model}\` does not exist or you do not have access to it.`,
        type: 'invalid_request_error',
        param: null,
        code: 'model_not_found',
      },
    },
    { status: 404 },
  );
}

/** Responses API payload shaped the way `@ai-sdk/openai`'s responses model parses it. */
function responsesResponse({ model }: { model: string }) {
  return HttpResponse.json({
    id: 'resp_test',
    object: 'response',
    created_at: 1_700_000_000,
    model,
    output: [
      {
        type: 'message',
        role: 'assistant',
        id: 'msg_test',
        content: [{ type: 'output_text', text: 'ok', annotations: [] }],
      },
    ],
    usage: { input_tokens: 12, output_tokens: 1 },
  });
}

/** Succeeds unless the request carries `INVALID_OPENAI_API_KEY` or asks for `OPENAI_UNKNOWN_MODEL`. */
const responsesHandler = http.post(OPENAI_RESPONSES_URL, async ({ request }) => {
  if (bearerToken({ request }) === INVALID_OPENAI_API_KEY) return authErrorResponse();

  const { model = '' } = (await request.json()) as { model?: string };

  if (model === OPENAI_UNKNOWN_MODEL) return modelNotFoundResponse({ model });

  return responsesResponse({ model });
});

/** Rejects every key, the way OpenAI answers once a saved key is revoked. */
export const createOpenAiAuthErrorMock = () => http.post(OPENAI_RESPONSES_URL, () => authErrorResponse());

/** Answers 404 for every model, the way OpenAI answers once a saved model is retired. */
export const createOpenAiModelNotFoundMock = () =>
  http.post(OPENAI_RESPONSES_URL, async ({ request }) => {
    const { model = '' } = (await request.json()) as { model?: string };
    return modelNotFoundResponse({ model });
  });

const modelListHandler = http.get(`${OPENAI_API_URL}/models`, ({ request }) => {
  if (bearerToken({ request }) === INVALID_OPENAI_API_KEY) return authErrorResponse();

  return HttpResponse.json({
    object: 'list',
    data: OPENAI_LISTED_MODELS.map((id) => ({ id, object: 'model', created: 1_700_000_000, owned_by: 'openai' })),
  });
});

export const openAiHandlers = [responsesHandler, modelListHandler];
