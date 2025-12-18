import Anthropic from '@anthropic-ai/sdk';

import { AnthropicClient, AnthropicClientModel } from './anthropic-client';

// Mock the Anthropic SDK but import the real APIError class
jest.mock('@anthropic-ai/sdk');

const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;
const RealAnthropic = jest.requireActual('@anthropic-ai/sdk') as typeof Anthropic;

describe('AnthropicClient', () => {
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate = jest.fn();
    MockedAnthropic.mockImplementation(
      () =>
        ({
          messages: { create: mockCreate },
        }) as unknown as Anthropic,
    );
    // Make APIError available on the mocked Anthropic class
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MockedAnthropic as any).APIError = RealAnthropic.APIError;
  });

  describe('sendMessage', () => {
    it('sends message and returns text response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '100:1\n200:2' }],
        usage: { input_tokens: 100, output_tokens: 10 },
      });

      const client = new AnthropicClient({
        apiKey: 'test-key',
        model: AnthropicClientModel.haiku,
      });

      const result = await client.sendMessage({
        systemPrompt: 'You are a categorizer',
        userMessage: 'Categorize these transactions',
      });

      expect(result).toBe('100:1\n200:2');
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-haiku-4-5',
        max_tokens: 4096,
        system: 'You are a categorizer',
        messages: [{ role: 'user', content: 'Categorize these transactions' }],
      });
    });

    it('uses custom maxTokens when provided', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 50, output_tokens: 5 },
      });

      const client = new AnthropicClient({
        apiKey: 'test-key',
        model: AnthropicClientModel.sonnet,
        maxTokens: 1024,
      });

      await client.sendMessage({
        systemPrompt: 'prompt',
        userMessage: 'message',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 1024,
          model: 'claude-sonnet-4-5-20250929',
        }),
      );
    });

    it('throws error when no text content in response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'tool_use', id: '123', name: 'test', input: {} }],
        usage: { input_tokens: 50, output_tokens: 5 },
      });

      const client = new AnthropicClient({
        apiKey: 'test-key',
        model: AnthropicClientModel.haiku,
      });

      await expect(
        client.sendMessage({
          systemPrompt: 'prompt',
          userMessage: 'message',
        }),
      ).rejects.toThrow('No text content in response');
    });

    it('handles 401 error as invalid API key', async () => {
      const apiError = new RealAnthropic.APIError(401, { message: 'Unauthorized' }, 'Unauthorized', new Headers());
      mockCreate.mockRejectedValue(apiError);

      const client = new AnthropicClient({
        apiKey: 'invalid-key',
        model: AnthropicClientModel.haiku,
      });

      await expect(
        client.sendMessage({
          systemPrompt: 'prompt',
          userMessage: 'message',
        }),
      ).rejects.toThrow('Invalid Anthropic API key');
    });

    it('handles 429 error as rate limit', async () => {
      const apiError = new RealAnthropic.APIError(429, { message: 'Rate limited' }, 'Rate limited', new Headers());
      mockCreate.mockRejectedValue(apiError);

      const client = new AnthropicClient({
        apiKey: 'test-key',
        model: AnthropicClientModel.haiku,
      });

      await expect(
        client.sendMessage({
          systemPrompt: 'prompt',
          userMessage: 'message',
        }),
      ).rejects.toThrow('Anthropic API rate limit exceeded');
    });

    it('handles 500 error as temporarily unavailable', async () => {
      const apiError = new RealAnthropic.APIError(
        500,
        { message: 'Internal Server Error' },
        'Internal Server Error',
        new Headers(),
      );
      mockCreate.mockRejectedValue(apiError);

      const client = new AnthropicClient({
        apiKey: 'test-key',
        model: AnthropicClientModel.haiku,
      });

      await expect(
        client.sendMessage({
          systemPrompt: 'prompt',
          userMessage: 'message',
        }),
      ).rejects.toThrow('Anthropic API temporarily unavailable');
    });

    it('handles 503 error as temporarily unavailable', async () => {
      const apiError = new RealAnthropic.APIError(
        503,
        { message: 'Service Unavailable' },
        'Service Unavailable',
        new Headers(),
      );
      mockCreate.mockRejectedValue(apiError);

      const client = new AnthropicClient({
        apiKey: 'test-key',
        model: AnthropicClientModel.haiku,
      });

      await expect(
        client.sendMessage({
          systemPrompt: 'prompt',
          userMessage: 'message',
        }),
      ).rejects.toThrow('Anthropic API temporarily unavailable');
    });

    it('handles other API errors with message', async () => {
      const apiError = new RealAnthropic.APIError(
        400,
        { message: 'Bad Request' },
        'Invalid request format',
        new Headers(),
      );
      mockCreate.mockRejectedValue(apiError);

      const client = new AnthropicClient({
        apiKey: 'test-key',
        model: AnthropicClientModel.haiku,
      });

      await expect(
        client.sendMessage({
          systemPrompt: 'prompt',
          userMessage: 'message',
        }),
      ).rejects.toThrow('Anthropic API error:');
    });

    it('re-throws non-API errors', async () => {
      const genericError = new Error('Network failure');
      mockCreate.mockRejectedValue(genericError);

      const client = new AnthropicClient({
        apiKey: 'test-key',
        model: AnthropicClientModel.haiku,
      });

      await expect(
        client.sendMessage({
          systemPrompt: 'prompt',
          userMessage: 'message',
        }),
      ).rejects.toThrow('Network failure');
    });
  });

  describe('model selection', () => {
    it.each([
      [AnthropicClientModel.haiku, 'claude-haiku-4-5'],
      [AnthropicClientModel.sonnet, 'claude-sonnet-4-5-20250929'],
      [AnthropicClientModel.opus, 'claude-opus-4-5-20251101'],
    ])('uses correct model string for %s', async (modelEnum, expectedModel) => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 50, output_tokens: 5 },
      });

      const client = new AnthropicClient({
        apiKey: 'test-key',
        model: modelEnum,
      });

      await client.sendMessage({
        systemPrompt: 'prompt',
        userMessage: 'message',
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: expectedModel }));
    });
  });
});
