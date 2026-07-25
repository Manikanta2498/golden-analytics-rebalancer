const OPENFIGI_URL = "https://api.openfigi.com/v3/mapping";

export const MAX_JOBS_PER_REQUEST = 10;

export interface FigiRecord {
  symbol: string;
  figi: string | null;
  name: string | null;
  securityType: string | null;
}

interface OpenFigiDatum {
  figi?: string;
  name?: string;
  securityType?: string;
  securityType2?: string;
}

interface OpenFigiResult {
  data?: OpenFigiDatum[];
  warning?: string;
  error?: string;
}

const cache = new Map<string, FigiRecord>();

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

async function fetchBatch(
  symbols: string[],
  signal?: AbortSignal,
): Promise<FigiRecord[]> {
  const response = await fetch(OPENFIGI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      symbols.map((symbol) => ({ idType: "TICKER", idValue: symbol })),
    ),
    signal,
  });

  if (!response.ok) {
    throw new Error(`OpenFIGI responded ${response.status}`);
  }

  const payload = (await response.json()) as OpenFigiResult[];

  return symbols.map((symbol, index) => {
    const datum = payload[index]?.data?.[0];
    return {
      symbol,
      figi: datum?.figi ?? null,
      name: datum?.name ?? null,
      securityType: datum?.securityType ?? datum?.securityType2 ?? null,
    };
  });
}

export async function lookupSymbols(
  symbols: string[],
  signal?: AbortSignal,
): Promise<FigiRecord[]> {
  const unique = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  const results: FigiRecord[] = [];
  const missing: string[] = [];

  for (const symbol of unique) {
    const cached = cache.get(symbol);
    if (cached) {
      results.push(cached);
    } else {
      missing.push(symbol);
    }
  }

  for (const batch of chunk(missing, MAX_JOBS_PER_REQUEST)) {
    const records = await fetchBatch(batch, signal);
    for (const record of records) {
      cache.set(record.symbol, record);
      results.push(record);
    }
  }

  return results;
}

export function clearFigiCache(): void {
  cache.clear();
}
