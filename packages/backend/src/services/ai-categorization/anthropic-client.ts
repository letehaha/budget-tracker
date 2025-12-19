import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@js/utils/logger';

export enum AnthropicClientModel {
  haiku = 'claude-haiku-4-5',
  sonnet = 'claude-sonnet-4-5-20250929',
  opus = 'claude-opus-4-5-20251101',
}

export interface AnthropicClientOptions {
  apiKey: string;
  maxTokens?: number;

  model: AnthropicClientModel;
}

/**
 * Anthropic API client for categorization using official SDK
 */
export class AnthropicClient {
  private client: Anthropic;
  private maxTokens: number;
  private model: string;

  constructor(options: AnthropicClientOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
    });
    this.maxTokens = options.maxTokens ?? 4096;
    this.model = options.model;
  }

  /**
   * Send a message to Claude and get a response
   */
  async sendMessage({ systemPrompt, userMessage }: { systemPrompt: string; userMessage: string }): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in response');
      }

      logger.info(
        `AI categorization API call: ${response.usage.input_tokens} input, ${response.usage.output_tokens} output tokens`,
      );

      return textContent.text;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        const status = error.status;
        const message = error.message;

        if (status === 401) {
          throw new Error('Invalid Anthropic API key');
        }
        if (status === 429) {
          throw new Error('Anthropic API rate limit exceeded');
        }
        if (status === 500 || status === 503) {
          throw new Error('Anthropic API temporarily unavailable');
        }

        throw new Error(`Anthropic API error: ${message}`);
      }
      throw error;
    }
  }
}
