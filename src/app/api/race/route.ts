import { generateText } from "ai";
import { gatewayStats } from "@/lib/jev";

// Asks a general-purpose LLM the same Choice question Jev gets, for a side-by-side.
export async function POST(request: Request) {
  const { model, state, instructions, options } = (await request.json()) as {
    model: string;
    state: string;
    instructions: string;
    options: Record<string, string>;
  };

  const prompt = [
    `State:\n${state}`,
    `Question: ${instructions}`,
    `Options:\n${Object.entries(options)
      .map(([key, desc]) => `- ${key}: ${desc}`)
      .join("\n")}`,
    "Reply with only the option key, nothing else.",
  ].join("\n\n");

  const started = performance.now();
  try {
    const result = await generateText({ model, prompt, maxRetries: 1 });
    return Response.json({
      text: result.text.trim(),
      latencyMs: performance.now() - started,
      usage: result.usage,
      ...gatewayStats(result.providerMetadata),
      prompt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 502 });
  }
}
