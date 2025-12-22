import { GoogleGenerativeAI, GoogleGenerativeAIError } from '@google/generative-ai';
import { logger } from '@js/utils/logger';

export enum GeminiClientModel {
  flash = 'gemini-3-flash-preview',
  pro = 'gemini-3-pro-preview',
}

export interface GeminiClientOptions {
  apiKey: string;
  model: GeminiClientModel;
}

/**
 * Google Gemini API client for categorization using official SDK
 */
export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(options: GeminiClientOptions) {
    this.genAI = new GoogleGenerativeAI(options.apiKey);
    this.model = options.model;
  }

  /**
   * Send a message to Gemini and get a response
   */
  async sendMessage({ systemPrompt, userMessage }: { systemPrompt: string; userMessage: string }): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: this.model,
        systemInstruction: systemPrompt,
      });

      const result = await model.generateContent(userMessage);
      const response = result.response;
      const text = response.text();

      const usageMetadata = response.usageMetadata;
      if (usageMetadata) {
        logger.info(
          `AI categorization API call: ${usageMetadata.promptTokenCount} input, ${usageMetadata.candidatesTokenCount} output tokens`,
        );
      }

      return text;
    } catch (error) {
      if (error instanceof GoogleGenerativeAIError) {
        const message = error.message;

        if (message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED')) {
          throw new Error('Invalid Gemini API key');
        }
        if (message.includes('RESOURCE_EXHAUSTED')) {
          throw new Error('Gemini API rate limit exceeded');
        }
        if (message.includes('UNAVAILABLE') || message.includes('INTERNAL')) {
          throw new Error('Gemini API temporarily unavailable');
        }

        throw new Error(`Gemini API error: ${message}`);
      }
      throw error;
    }
  }
}
