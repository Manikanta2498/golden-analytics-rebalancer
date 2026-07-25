import {
  classifySymbols,
  matchHeuristics,
  unresolvedSymbols,
  type ClassifyInput,
  type Classification,
} from "@/lib/domain/classify";
import { ASSET_CLASS_IDS } from "@/lib/domain/seed";
import type { SymbolMapping } from "@/lib/domain/types";
import { lookupSymbols } from "@/lib/server/openfigi";

interface ClassifyRequestBody {
  inputs?: ClassifyInput[];
  overrides?: SymbolMapping[];
  enrichment?: boolean;
}

function isValidInput(value: unknown): value is ClassifyInput {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ClassifyInput>;
  return (
    typeof candidate.symbol === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.price === "number" &&
    typeof candidate.isCoreCash === "boolean"
  );
}

export async function POST(request: Request) {
  let body: ClassifyRequestBody;
  try {
    body = (await request.json()) as ClassifyRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const inputs = body.inputs;
  if (!Array.isArray(inputs) || !inputs.every(isValidInput)) {
    return Response.json(
      {
        error:
          "Expected `inputs` to be an array of { symbol, description, price, isCoreCash }.",
      },
      { status: 400 },
    );
  }

  const classifications = classifySymbols(inputs, body.overrides ?? []);
  const unresolved = unresolvedSymbols(classifications);
  const enrichmentRequested = body.enrichment !== false;

  let enrichmentError: string | null = null;

  if (enrichmentRequested && unresolved.length > 0) {
    try {
      const records = await lookupSymbols(unresolved);
      const byIndex = new Map(
        classifications.map((classification, index) => [
          classification.symbol,
          index,
        ]),
      );

      for (const record of records) {
        if (!record.name) continue;
        const index = byIndex.get(record.symbol);
        if (index === undefined) continue;

        const match = matchHeuristics(record.name, 0);
        if (!match) continue;

        const enriched: Classification = {
          symbol: record.symbol,
          assetClassId: match.assetClassId,
          source: "figi",
          confidence: match.confidence,
          isCashEquivalent: match.assetClassId === ASSET_CLASS_IDS.cash,
          rule: `figi:${match.rule}`,
          needsReview: false,
        };
        classifications[index] = enriched;
      }
    } catch (error) {
      enrichmentError =
        error instanceof Error ? error.message : "OpenFIGI lookup failed.";
    }
  }

  return Response.json({
    classifications,
    unresolved: unresolvedSymbols(classifications),
    enrichmentError,
  });
}
