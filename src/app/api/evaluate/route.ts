import { experimental_evaluate as evaluate, type Experimental_EvaluationQuestion } from "ai";
import {
  entropyConfidence,
  findProviderConfidence,
  gatewayStats,
  type EvaluateRequest,
  type EvaluateResponse,
} from "@/lib/jev";

export async function POST(request: Request) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json(
      { error: "Missing AI_GATEWAY_API_KEY. Add it to .env.local and restart `npm run dev`." },
      { status: 500 },
    );
  }

  const { state, questions } = (await request.json()) as EvaluateRequest;
  const started = performance.now();

  try {
    // Our JsonInput is looser than the SDK's JSONValue; the payload is plain JSON from the browser.
    const result = await evaluate({
      model: "typesafe-ai/jev",
      state: state as Parameters<typeof evaluate>[0]["state"],
      questions: questions as Record<string, Experimental_EvaluationQuestion>,
      maxRetries: 1,
    });
    const latencyMs = performance.now() - started;

    const confidence: EvaluateResponse["confidence"] = {};
    for (const [id, answer] of Object.entries(result.answers)) {
      if (answer.type === "boolean") continue;
      const provided = findProviderConfidence(result.providerMetadata, id);
      if (provided !== undefined) confidence[id] = { value: provided, source: "provider" };
      else if (answer.probabilities)
        confidence[id] = { value: entropyConfidence(answer.probabilities), source: "computed" };
    }

    const body: EvaluateResponse = {
      answers: result.answers,
      confidence,
      usage: result.usage,
      latencyMs,
      ...gatewayStats(result.providerMetadata),
      providerMetadata: result.providerMetadata,
      warnings: result.warnings,
    };
    return Response.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 502 });
  }
}
