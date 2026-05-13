import OpenAI from "openai";
import type { AIClient, AIResponse } from "./aiClient";

const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o":       { input: 2.50,  output: 10.00 },
  "gpt-4o-mini":  { input: 0.15,  output: 0.60  },
  "gpt-4.1":      { input: 2.00,  output: 8.00  },
  "gpt-4.1-mini": { input: 0.40,  output: 1.60  },
  "gpt-4-turbo":  { input: 10.00, output: 30.00 },
};

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING[model] ?? { input: 2.50, output: 10.00 };
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

function supportsJsonMode(model: string): boolean {
  return model.startsWith("gpt-4") || model.startsWith("gpt-3.5-turbo");
}

export class OpenAIClient implements AIClient {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is niet ingesteld in .env.local");
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL ?? "gpt-4o";
  }

  async complete(systemPrompt: string, userMessage: string): Promise<AIResponse> {
    const temperature = parseFloat(process.env.OPENAI_TEMPERATURE ?? "0.1");
    const max_tokens = parseInt(process.env.OPENAI_MAX_TOKENS ?? "2500", 10);

    const doCall = async (extraInstruction?: string) => {
      const msgs: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ];
      if (extraInstruction) {
        msgs.push({ role: "user", content: extraInstruction });
      }
      return this.client.chat.completions.create({
        model: this.model,
        messages: msgs,
        temperature,
        max_tokens,
        ...(supportsJsonMode(this.model) ? { response_format: { type: "json_object" } } : {}),
      });
    };

    let response = await doCall();
    let text = response.choices[0]?.message?.content ?? "";
    const finishReason = response.choices[0]?.finish_reason;

    // Retry if truncated or unparseable
    if (finishReason === "length" || (text && !isValidJSON(text))) {
      const retry = await doCall("Geef uitsluitend geldige compacte JSON terug. Geen markdown. Geen uitleg.");
      const retryText = retry.choices[0]?.message?.content ?? "";
      if (isValidJSON(retryText)) {
        text = retryText;
        response = retry;
      }
    }

    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const costUSD = calcCost(this.model, inputTokens, outputTokens);

    return { text, inputTokens, outputTokens, costUSD };
  }
}

function isValidJSON(str: string): boolean {
  try {
    const cleaned = str.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    JSON.parse(cleaned);
    return true;
  } catch {
    return false;
  }
}
