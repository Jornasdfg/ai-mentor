// Abstracte interface voor AI-providers.
// complete() retourneert altijd usage + cost zodat alle providers traceerbaar zijn.

export interface AIResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

export interface AIClient {
  complete(systemPrompt: string, userMessage: string): Promise<AIResponse>;
}
