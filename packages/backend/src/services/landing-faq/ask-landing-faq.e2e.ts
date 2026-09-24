import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { redisClient } from '@root/redis-client';
import * as helpers from '@tests/helpers';
import { VALID_GEMINI_API_KEY, createGeminiMock } from '@tests/mocks/gemini/mock-api';

import { HEDGE_AFTER_MS, LANDING_FAQ_FALLBACK_MODEL, LANDING_FAQ_MODEL } from './ask-landing-faq.service';

const QUESTION = 'Can I self-host it?';

const modelReply = ({ answer, status = 'answered' }: { answer: string; status?: string }) =>
  JSON.stringify({ answer, status });

describe('Landing FAQ assistant', () => {
  let faqKeyBeforeTest: string | undefined;
  let cookiesBeforeTest: string | null;

  beforeEach(() => {
    faqKeyBeforeTest = process.env.LANDING_FAQ_GEMINI_API_KEY;
    process.env.LANDING_FAQ_GEMINI_API_KEY = VALID_GEMINI_API_KEY;

    // Landing visitors have no session, so every request here goes out without the auth cookie.
    cookiesBeforeTest = global.APP_AUTH_COOKIES;
    global.APP_AUTH_COOKIES = null;
  });

  afterEach(() => {
    global.APP_AUTH_COOKIES = cookiesBeforeTest;

    if (faqKeyBeforeTest === undefined) {
      delete process.env.LANDING_FAQ_GEMINI_API_KEY;
    } else {
      process.env.LANDING_FAQ_GEMINI_API_KEY = faqKeyBeforeTest;
    }
  });

  describe('POST /landing/faq/ask', () => {
    it('returns the model answer', async () => {
      global.mswMockServer.use(
        createGeminiMock({
          rawText: modelReply({ answer: '  Yes, with Docker Compose.  ' }),
          expectedModel: LANDING_FAQ_MODEL,
        }),
      );

      const result = await helpers.askLandingFaq({ question: QUESTION, raw: true });

      expect(result).toEqual({ answer: 'Yes, with Docker Compose.', status: 'answered' });
    });

    it.each([503, 429])('answers from the fallback model when the primary returns %i', async (errorStatus) => {
      const startedAt = Date.now();

      global.mswMockServer.use(
        createGeminiMock({
          shouldFail: true,
          errorStatus,
          expectedModel: LANDING_FAQ_MODEL,
          passthroughOtherModels: true,
        }),
        createGeminiMock({
          rawText: modelReply({ answer: 'From the fallback.' }),
          expectedModel: LANDING_FAQ_FALLBACK_MODEL,
        }),
      );

      const result = await helpers.askLandingFaq({ question: QUESTION, raw: true });

      expect(result).toEqual({ answer: 'From the fallback.', status: 'answered' });
      // A failed primary starts the fallback at once, not after the hedge delay.
      expect(Date.now() - startedAt).toBeLessThan(HEDGE_AFTER_MS);
    });

    it.each([
      ['does not match the answer schema', modelReply({ answer: 'Yes.', status: 'maybe' })],
      ['is empty', modelReply({ answer: '   ' })],
    ])('answers from the fallback model when the primary reply %s', async (_label, rawText) => {
      global.mswMockServer.use(
        createGeminiMock({ rawText, expectedModel: LANDING_FAQ_MODEL, passthroughOtherModels: true }),
        createGeminiMock({
          rawText: modelReply({ answer: 'From the fallback.' }),
          expectedModel: LANDING_FAQ_FALLBACK_MODEL,
        }),
      );

      const result = await helpers.askLandingFaq({ question: QUESTION, raw: true });

      expect(result).toEqual({ answer: 'From the fallback.', status: 'answered' });
    });

    it(
      'answers from the fallback model when the primary is still silent after the hedge delay',
      async () => {
        global.mswMockServer.use(
          createGeminiMock({
            rawText: modelReply({ answer: 'From the primary.' }),
            delayMs: HEDGE_AFTER_MS + 2_000,
            expectedModel: LANDING_FAQ_MODEL,
            passthroughOtherModels: true,
          }),
          createGeminiMock({
            rawText: modelReply({ answer: 'From the fallback.' }),
            expectedModel: LANDING_FAQ_FALLBACK_MODEL,
          }),
        );

        const result = await helpers.askLandingFaq({ question: QUESTION, raw: true });

        expect(result).toEqual({ answer: 'From the fallback.', status: 'answered' });
      },
      HEDGE_AFTER_MS + 10_000,
    );

    it('waits for a primary that answers before the hedge delay', async () => {
      global.mswMockServer.use(
        createGeminiMock({
          rawText: modelReply({ answer: 'From the primary.' }),
          delayMs: 1_000,
          expectedModel: LANDING_FAQ_MODEL,
          passthroughOtherModels: true,
        }),
        createGeminiMock({
          rawText: modelReply({ answer: 'From the fallback.' }),
          expectedModel: LANDING_FAQ_FALLBACK_MODEL,
        }),
      );

      const result = await helpers.askLandingFaq({ question: QUESTION, raw: true });

      expect(result).toEqual({ answer: 'From the primary.', status: 'answered' });
    });

    it.each(['unknown', 'off_topic'])('passes the %s status through', async (status) => {
      global.mswMockServer.use(
        createGeminiMock({
          rawText: modelReply({ answer: "I don't know.", status }),
          expectedModel: LANDING_FAQ_MODEL,
        }),
      );

      const result = await helpers.askLandingFaq({ question: QUESTION, raw: true });

      expect(result).toEqual({ answer: "I don't know.", status });
    });

    it('returns 503 when neither model reply matches the answer schema', async () => {
      const rawText = modelReply({ answer: 'Yes.', status: 'maybe' });

      global.mswMockServer.use(
        createGeminiMock({ rawText, expectedModel: LANDING_FAQ_MODEL, passthroughOtherModels: true }),
        createGeminiMock({ rawText, expectedModel: LANDING_FAQ_FALLBACK_MODEL }),
      );

      const res = await helpers.askLandingFaq({ question: QUESTION });

      expect(res.statusCode).toBe(503);
    });

    it('returns 503 when the landing FAQ key is not configured', async () => {
      delete process.env.LANDING_FAQ_GEMINI_API_KEY;

      const res = await helpers.askLandingFaq({ question: QUESTION });

      expect(res.statusCode).toBe(503);
    });

    it('returns 503 when both models fail', async () => {
      global.mswMockServer.use(
        createGeminiMock({ shouldFail: true, expectedModel: LANDING_FAQ_MODEL, passthroughOtherModels: true }),
        createGeminiMock({ shouldFail: true, expectedModel: LANDING_FAQ_FALLBACK_MODEL }),
      );

      const res = await helpers.askLandingFaq({ question: QUESTION });

      expect(res.statusCode).toBe(503);
    });

    it('returns 503 instead of an empty answer when neither model emits visible text', async () => {
      const rawText = modelReply({ answer: '   ' });

      global.mswMockServer.use(
        createGeminiMock({
          rawText,
          finishReason: 'MAX_TOKENS',
          expectedModel: LANDING_FAQ_MODEL,
          passthroughOtherModels: true,
        }),
        createGeminiMock({ rawText, finishReason: 'MAX_TOKENS', expectedModel: LANDING_FAQ_FALLBACK_MODEL }),
      );

      const res = await helpers.askLandingFaq({ question: QUESTION });

      expect(res.statusCode).toBe(503);
    });

    it.each([
      ['too short', 'hi'],
      ['whitespace only', '     '],
      ['too long', 'a'.repeat(301)],
      ['not a string', 42],
      ['missing', undefined],
    ])('rejects a %s question with 422', async (_label, question) => {
      const res = await helpers.askLandingFaq({ question });

      expect(res.statusCode).toBe(422);
    });

    it('returns 429 after 10 questions from one IP, without counting rejected bodies', async () => {
      global.mswMockServer.use(
        createGeminiMock({ rawText: modelReply({ answer: 'Answer.' }), expectedModel: LANDING_FAQ_MODEL }),
      );

      const rejected = await helpers.askLandingFaq({ question: 'hi' });
      expect(rejected.statusCode).toBe(422);

      for (let i = 0; i < 10; i++) {
        const res = await helpers.askLandingFaq({ question: QUESTION });
        expect(res.statusCode).toBe(200);
      }

      const limited = await helpers.askLandingFaq({ question: QUESTION });

      expect(limited.statusCode).toBe(429);
      expect(limited.header['x-ratelimit-limit']).toBe('10');
    });

    it('limits each visitor behind the reverse proxy separately and ignores forged forwarded addresses', async () => {
      global.mswMockServer.use(
        createGeminiMock({ rawText: modelReply({ answer: 'Answer.' }), expectedModel: LANDING_FAQ_MODEL }),
      );

      for (let i = 0; i < 10; i++) {
        const res = await helpers.askLandingFaq({
          question: QUESTION,
          headers: { 'X-Forwarded-For': `198.51.100.${i}, 203.0.113.1` },
        });
        expect(res.statusCode).toBe(200);
      }

      const sameVisitor = await helpers.askLandingFaq({
        question: QUESTION,
        headers: { 'X-Forwarded-For': '198.51.100.99, 203.0.113.1' },
      });
      const otherVisitor = await helpers.askLandingFaq({
        question: QUESTION,
        headers: { 'X-Forwarded-For': '203.0.113.2' },
      });

      expect(sameVisitor.statusCode).toBe(429);
      expect(otherVisitor.statusCode).toBe(200);
    });

    it('returns 429 once the daily budget shared by all visitors is spent', async () => {
      global.mswMockServer.use(
        createGeminiMock({ rawText: modelReply({ answer: 'Answer.' }), expectedModel: LANDING_FAQ_MODEL }),
      );
      await redisClient.set('rate_limit:landing-faq:global', '1000', 'EX', 60);

      const limited = await helpers.askLandingFaq({ question: QUESTION });

      expect(limited.statusCode).toBe(429);
      expect(limited.header['x-ratelimit-limit']).toBe('1000');
    });
  });
});
