import { HttpResponse, http } from 'msw';

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const VALID_OPENROUTER_API_KEY = 'sk-or-v1-test-valid-key';
export const INVALID_OPENROUTER_API_KEY = 'sk-or-v1-test-invalid-key';

export const openRouterHandlers = [
  http.post(OPENROUTER_API_URL, async ({ request }) => {
    if (request.headers.get('authorization') === `Bearer ${INVALID_OPENROUTER_API_KEY}`) {
      return HttpResponse.json({ error: { message: 'Invalid API key', code: 401 } }, { status: 401 });
    }

    const body = (await request.json()) as { model?: string };
    return HttpResponse.json({
      id: 'chatcmpl-openrouter-test',
      object: 'chat.completion',
      created: 1_700_000_000,
      model: body.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'ok' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 },
    });
  }),
];
