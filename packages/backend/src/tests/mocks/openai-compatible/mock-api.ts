import { HttpResponse, http } from 'msw';

/**
 * Stand-in for a user-supplied OpenAI-compatible endpoint (Ollama, vLLM, LiteLLM).
 * msw answers these in-process, so the hostname never has to resolve.
 *
 * Two paths are handled: `<baseUrl>/chat/completions`, which the AI SDK's
 * `openai.chat()` model posts to, and `<baseUrl>/models`, which validation reads
 * to check a model name against what the server actually serves. A request to any
 * other path stays unhandled and fails, which is what should happen if the client
 * stops targeting those paths.
 *
 * `CUSTOM_ENDPOINT_BASE_URL`, `CUSTOM_ENDPOINT_LOOPBACK_BASE_URL` and
 * `CUSTOM_ENDPOINT_OFFLINE_BASE_URL` answer 404 on `/models`, standing in for the
 * many OpenAI-compatible servers that do not implement the route — validation
 * falls back to the generate probe for them.
 */

/** Public-looking host, so the outbound URL guard is not what a test is measuring. */
export const CUSTOM_ENDPOINT_BASE_URL = 'http://custom-llm.test/v1';

/** Loopback base URL — blocked by the guard in cloud mode, reachable in self-host mode. */
export const CUSTOM_ENDPOINT_LOOPBACK_BASE_URL = 'http://127.0.0.1:11434/v1';

/** Base URL whose handler fails the connection itself, standing in for a host that is down. */
export const CUSTOM_ENDPOINT_OFFLINE_BASE_URL = 'http://offline-llm.test/v1';

/** Base URL that serves a `/models` catalogue, the way LM Studio and OpenRouter do. */
export const CUSTOM_ENDPOINT_LISTING_BASE_URL = 'http://listing-llm.test/v1';

export const CUSTOM_ENDPOINT_MODEL = 'llama3.2';

/** The default handler answers 404 for this model name and succeeds for every other. */
export const CUSTOM_ENDPOINT_UNKNOWN_MODEL = 'model-that-was-never-pulled';

/** What `CUSTOM_ENDPOINT_LISTING_BASE_URL` reports as served. */
export const CUSTOM_ENDPOINT_LISTED_MODELS = [CUSTOM_ENDPOINT_MODEL, `${CUSTOM_ENDPOINT_MODEL}:70b`, 'qwen2.5'];

export const VALID_CUSTOM_ENDPOINT_API_KEY = 'custom-endpoint-valid-key';

/** The default handler answers 401 for this key. */
export const INVALID_CUSTOM_ENDPOINT_API_KEY = 'custom-endpoint-invalid-key';

function chatCompletionsUrl({ baseUrl }: { baseUrl: string }): string {
  return `${baseUrl}/chat/completions`;
}

function modelsUrl({ baseUrl }: { baseUrl: string }): string {
  return `${baseUrl}/models`;
}

function bearerToken({ request }: { request: Request }): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

async function requestedModel({ request }: { request: Request }): Promise<string> {
  const body = (await request.clone().json()) as { model?: string };
  return body.model ?? '';
}

/** Chat-completion payload shaped the way `@ai-sdk/openai`'s chat model parses it. */
function completionResponse({ model }: { model: string }) {
  return HttpResponse.json({
    id: 'chatcmpl-custom-endpoint-test',
    object: 'chat.completion',
    created: 1_700_000_000,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'ok' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 },
  });
}

function authErrorResponse() {
  return HttpResponse.json(
    {
      error: {
        message: 'Incorrect API key provided',
        type: 'invalid_request_error',
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
        message: `model "${model}" not found, try pulling it first`,
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    },
    { status: 404 },
  );
}

/** Model-catalogue payload shaped the way an OpenAI-compatible `/models` route answers. */
function modelListResponse({ modelIds }: { modelIds: string[] }) {
  return HttpResponse.json({
    object: 'list',
    data: modelIds.map((id) => ({ id, object: 'model', owned_by: 'organization_owner' })),
  });
}

/** What a server without the route answers, so the caller has to probe some other way. */
function routeNotFoundResponse() {
  return HttpResponse.json({ error: { message: 'Unexpected endpoint or method' } }, { status: 404 });
}

/**
 * Succeeds unless the request carries `INVALID_CUSTOM_ENDPOINT_API_KEY` or asks for
 * `CUSTOM_ENDPOINT_UNKNOWN_MODEL`, so most tests drive the outcome through the
 * request payload instead of registering an override.
 */
async function defaultResolver({ request }: { request: Request }) {
  if (bearerToken({ request }) === INVALID_CUSTOM_ENDPOINT_API_KEY) {
    return authErrorResponse();
  }

  const model = await requestedModel({ request });
  if (model === CUSTOM_ENDPOINT_UNKNOWN_MODEL) {
    return modelNotFoundResponse({ model });
  }

  return completionResponse({ model });
}

/** Answers the catalogue unless the request carries `INVALID_CUSTOM_ENDPOINT_API_KEY`. */
function defaultModelListResolver({ request }: { request: Request }) {
  if (bearerToken({ request }) === INVALID_CUSTOM_ENDPOINT_API_KEY) {
    return authErrorResponse();
  }

  return modelListResponse({ modelIds: CUSTOM_ENDPOINT_LISTED_MODELS });
}

export const openAiCompatibleHandlers = [
  http.post(chatCompletionsUrl({ baseUrl: CUSTOM_ENDPOINT_BASE_URL }), ({ request }) => defaultResolver({ request })),
  http.post(chatCompletionsUrl({ baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL }), ({ request }) =>
    defaultResolver({ request }),
  ),
  // A transport-level failure, the way an unroutable or refused host behaves
  http.post(chatCompletionsUrl({ baseUrl: CUSTOM_ENDPOINT_OFFLINE_BASE_URL }), () => HttpResponse.error()),

  http.get(modelsUrl({ baseUrl: CUSTOM_ENDPOINT_BASE_URL }), () => routeNotFoundResponse()),
  http.get(modelsUrl({ baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL }), () => routeNotFoundResponse()),
  http.get(modelsUrl({ baseUrl: CUSTOM_ENDPOINT_OFFLINE_BASE_URL }), () => HttpResponse.error()),

  http.get(modelsUrl({ baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL }), ({ request }) =>
    defaultModelListResolver({ request }),
  ),
  http.post(chatCompletionsUrl({ baseUrl: CUSTOM_ENDPOINT_LISTING_BASE_URL }), ({ request }) =>
    defaultResolver({ request }),
  ),
];

/**
 * Always-succeeding override.
 *
 * Usage: `global.mswMockServer.use(getCustomEndpointSuccessMock())`
 */
export const getCustomEndpointSuccessMock = ({ baseUrl = CUSTOM_ENDPOINT_BASE_URL }: { baseUrl?: string } = {}) =>
  http.post(chatCompletionsUrl({ baseUrl }), async ({ request }) =>
    completionResponse({ model: await requestedModel({ request }) }),
  );

/** Always answers 401, whatever key the request carries. */
export const getCustomEndpointAuthErrorMock = ({ baseUrl = CUSTOM_ENDPOINT_BASE_URL }: { baseUrl?: string } = {}) =>
  http.post(chatCompletionsUrl({ baseUrl }), () => authErrorResponse());

/**
 * Fails the connection itself, whatever the request carries. Lets a test take a
 * base URL that answered a moment ago — a saved endpoint, say — offline.
 */
export const getCustomEndpointOfflineMock = ({ baseUrl = CUSTOM_ENDPOINT_BASE_URL }: { baseUrl?: string } = {}) =>
  http.post(chatCompletionsUrl({ baseUrl }), () => HttpResponse.error());

/**
 * Always answers 404, whatever model the request asks for — the way Ollama and
 * vLLM answer for a model that was never pulled. `onCall` reports every request,
 * so a test can count the outbound attempts one run makes.
 */
export const getCustomEndpointModelNotFoundMock = ({
  onCall,
  baseUrl = CUSTOM_ENDPOINT_BASE_URL,
}: { onCall?: () => void; baseUrl?: string } = {}) =>
  http.post(chatCompletionsUrl({ baseUrl }), async ({ request }) => {
    onCall?.();
    return modelNotFoundResponse({ model: await requestedModel({ request }) });
  });

/**
 * Succeeds and reports every probe through `onCall`, so a test can prove whether
 * the server issued an outbound request at all.
 */
export const getCustomEndpointCallCountingMock = ({
  onCall,
  baseUrl = CUSTOM_ENDPOINT_BASE_URL,
}: {
  onCall: () => void;
  baseUrl?: string;
}) =>
  http.post(chatCompletionsUrl({ baseUrl }), async ({ request }) => {
    onCall();
    return completionResponse({ model: await requestedModel({ request }) });
  });

/**
 * Succeeds only for the exact bearer token given, so a test can prove which key
 * the server actually sent (a stored one vs. one supplied in the request).
 */
export const getCustomEndpointRequireKeyMock = ({
  apiKey,
  baseUrl = CUSTOM_ENDPOINT_BASE_URL,
}: {
  apiKey: string;
  baseUrl?: string;
}) =>
  http.post(chatCompletionsUrl({ baseUrl }), async ({ request }) => {
    if (bearerToken({ request }) !== apiKey) return authErrorResponse();
    return completionResponse({ model: await requestedModel({ request }) });
  });

/**
 * Gives a base URL a `/models` catalogue of exactly `modelIds`, so a test can put
 * a server behind it that serves something other than the model being asked for.
 */
export const getCustomEndpointModelListMock = ({
  modelIds,
  baseUrl = CUSTOM_ENDPOINT_LISTING_BASE_URL,
}: {
  modelIds: string[];
  baseUrl?: string;
}) => http.get(modelsUrl({ baseUrl }), () => modelListResponse({ modelIds }));

/** Answers 401 on `/models`, whatever key the request carries. */
export const getCustomEndpointModelListAuthErrorMock = ({
  baseUrl = CUSTOM_ENDPOINT_LISTING_BASE_URL,
}: { baseUrl?: string } = {}) => http.get(modelsUrl({ baseUrl }), () => authErrorResponse());
