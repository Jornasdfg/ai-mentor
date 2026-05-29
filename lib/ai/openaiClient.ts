import OpenAI from "openai";
import type { AIClient, AIResponse, ChatMessage } from "./aiClient";

const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o":        { input: 2.50,  output: 10.00 },
  "gpt-4o-mini":   { input: 0.15,  output: 0.60  },
  "gpt-4.1":       { input: 2.00,  output: 8.00  },
  "gpt-4.1-mini":  { input: 0.40,  output: 1.60  },
  "gpt-4-turbo":   { input: 10.00, output: 30.00 },
};

function calcCost(model: string, inp: number, out: number): number {
  const p = PRICING[model] ?? { input: 2.50, output: 10.00 };
  return (inp / 1_000_000) * p.input + (out / 1_000_000) * p.output;
}

export class OpenAIClient implements AIClient {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY niet ingesteld");
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  }

  async complete(systemPrompt: string, userMessage: string): Promise<AIResponse> {
    return this.completeChat(systemPrompt, [{ role: "user", content: userMessage }]);
  }

  async completeChat(systemPrompt: string, messages: ChatMessage[]): Promise<AIResponse> {
    const temperature = parseFloat(process.env.OPENAI_TEMPERATURE ?? "0.2");
    const max_tokens  = parseInt(process.env.OPENAI_MAX_TOKENS ?? "800", 10);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages as OpenAI.ChatCompletionMessageParam[],
      ],
      temperature,
      max_tokens,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content ?? "";
    const inp  = response.usage?.prompt_tokens ?? 0;
    const out  = response.usage?.completion_tokens ?? 0;
    return { text, inputTokens: inp, outputTokens: out, costUSD: calcCost(this.model, inp, out) };
  }
}
