import { lookupSymbols } from "@/lib/server/openfigi";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const symbols = (body as { symbols?: unknown })?.symbols;
  if (
    !Array.isArray(symbols) ||
    symbols.some((symbol) => typeof symbol !== "string")
  ) {
    return Response.json(
      { error: "Expected a `symbols` array of strings." },
      { status: 400 },
    );
  }

  if (symbols.length === 0) {
    return Response.json({ records: [] });
  }

  try {
    const records = await lookupSymbols(symbols as string[]);
    return Response.json({ records });
  } catch (error) {
    return Response.json(
      {
        error: "OpenFIGI lookup failed.",
        detail: error instanceof Error ? error.message : String(error),
        records: [],
      },
      { status: 502 },
    );
  }
}
