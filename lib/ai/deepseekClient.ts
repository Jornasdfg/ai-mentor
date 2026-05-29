import OpenAI from "openai";
import type { AIClient, AIResponse, ChatMessage } from "./aiClient";

// DeepSeek gebruikt een OpenAI-compatibele API.
// Prijzen per 1M tokens (USD) — deepseek-chat V3
const DEEPSEEK_PRICING = { input: 0.27, output: 1.10 };

export class DeepSeekClient implements AIClient {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseURL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is niet ingesteld in .env.local");

    this.client = new OpenAI({ apiKey, baseURL });
    this.model = "deepseek-chat";
  }

  async complete(systemPrompt: string, userMessage: string): Promise<AIResponse> {
    return this.completeChat(systemPrompt, [{ role: "user", content: userMessage }]);
  }

  async completeChat(systemPrompt: string, messages: ChatMessage[]): Promise<AIResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages as OpenAI.ChatCompletionMessageParam[],
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    const text = response.choices[0]?.message?.content ?? "";
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const costUSD = (inputTokens / 1_000_000) * DEEPSEEK_PRICING.input
                  + (outputTokens / 1_000_000) * DEEPSEEK_PRICING.output;

    return { text, inputTokens, outputTokens, costUSD };
  }
}
