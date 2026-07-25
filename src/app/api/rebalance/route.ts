import { rebalance, type RebalanceInput } from "@/lib/domain/rebalance";

function isValid(body: Partial<RebalanceInput>): body is RebalanceInput {
  return (
    Array.isArray(body.accounts) &&
    Array.isArray(body.positions) &&
    Array.isArray(body.mappings) &&
    Array.isArray(body.assetClasses) &&
    Array.isArray(body.targetWeights) &&
    typeof body.settings === "object" &&
    body.settings !== null
  );
}

export async function POST(request: Request) {
  let body: Partial<RebalanceInput>;
  try {
    body = (await request.json()) as Partial<RebalanceInput>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isValid(body)) {
    return Response.json(
      {
        error:
          "Expected accounts, positions, mappings, assetClasses, targetWeights and settings.",
      },
      { status: 400 },
    );
  }

  const totalWeight = body.targetWeights.reduce(
    (sum, weight) => sum + weight.weightPct,
    0,
  );
  if (body.targetWeights.length > 0 && Math.abs(totalWeight - 100) > 0.01) {
    return Response.json(
      { error: `Target weights must sum to 100%, got ${totalWeight.toFixed(2)}%.` },
      { status: 422 },
    );
  }

  return Response.json(rebalance(body));
}
