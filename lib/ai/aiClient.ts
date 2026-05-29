export interface AIResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIClient {
  complete(systemPrompt: string, userMessage: string): Promise<AIResponse>;
  completeChat(systemPrompt: string, messages: ChatMessage[]): Promise<AIResponse>;
}
