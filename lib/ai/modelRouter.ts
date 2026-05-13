import type { AIClient } from "./aiClient";
import { DeepSeekClient } from "./deepseekClient";
import { OpenAIClient } from "./openaiClient";

// Schakel tussen providers via ACTIVE_MODEL in .env.local.
// Standaard: openai. MCP-client: voeg hier een extra case toe.
export function getAIClient(): AIClient {
  const provider = process.env.ACTIVE_MODEL ?? "openai";

  switch (provider) {
    case "deepseek":
      return new DeepSeekClient();
    case "openai":
    default:
      return new OpenAIClient();
  }
}
