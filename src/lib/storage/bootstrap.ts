import type { Classification } from "@/lib/domain/classify";
import {
  DEFAULT_ASSET_CLASSES,
  DEFAULT_SETTINGS,
  DEFAULT_TARGET_SET,
  DEFAULT_TARGET_WEIGHTS,
  SCHEMA_VERSION,
} from "@/lib/domain/seed";
import type {
  Account,
  PortfolioStore,
  Position,
  SymbolMapping,
} from "@/lib/domain/types";

export const SAMPLE_CSV_URL = "/portfolio.csv";

interface ParseResponse {
  accounts: Account[];
  positions: Position[];
  warnings: { row: number; message: string }[];
}

interface ClassifyResponse {
  classifications: Classification[];
  unresolved: string[];
  enrichmentError: string | null;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request to ${url} failed.`);
  }
  return payload as T;
}

export async function parseCsvText(csvText: string): Promise<ParseResponse> {
  const response = await fetch("/api/portfolio/parse", {
    method: "POST",
    headers: { "Content-Type": "text/csv" },
    body: csvText,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? "Could not read that CSV.");
  }
  return payload as ParseResponse;
}

export async function classifyPositions(
  positions: Position[],
  overrides: SymbolMapping[],
  enrichment: boolean,
): Promise<ClassifyResponse> {
  const inputs = positions.map((position) => ({
    symbol: position.symbol,
    description: position.description,
    price: position.price,
    isCoreCash: position.isCoreCash,
  }));

  return postJson<ClassifyResponse>("/api/classify", {
    inputs,
    overrides,
    enrichment,
  });
}

export function applyClassificationsToPositions(
  positions: Position[],
  classifications: Classification[],
): Position[] {
  const bySymbol = new Map(
    classifications.map((classification) => [classification.symbol, classification]),
  );
  return positions.map((position) => ({
    ...position,
    isCashEquivalent:
      bySymbol.get(position.symbol)?.isCashEquivalent ?? position.isCashEquivalent,
  }));
}

export function classificationsToMappings(
  classifications: Classification[],
): SymbolMapping[] {
  return classifications.map((classification) => ({
    symbol: classification.symbol,
    assetClassId: classification.assetClassId,
    source: classification.source,
    confidence: classification.confidence,
  }));
}

export async function buildStoreFromCsv(
  csvText: string,
  previous?: PortfolioStore | null,
): Promise<PortfolioStore> {
  const parsed = await parseCsvText(csvText);
  const overrides = (previous?.mappings ?? []).filter(
    (mapping) => mapping.source === "user",
  );
  const classified = await classifyPositions(
    parsed.positions,
    overrides,
    previous?.settings.enrichmentEnabled ?? DEFAULT_SETTINGS.enrichmentEnabled,
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    accounts: parsed.accounts,
    positions: applyClassificationsToPositions(
      parsed.positions,
      classified.classifications,
    ),
    assetClasses: previous?.assetClasses ?? DEFAULT_ASSET_CLASSES,
    mappings: classificationsToMappings(classified.classifications),
    targetSets: previous?.targetSets ?? [DEFAULT_TARGET_SET],
    targetWeights: previous?.targetWeights ?? DEFAULT_TARGET_WEIGHTS,
    settings: previous?.settings ?? DEFAULT_SETTINGS,
  };
}

export async function loadSampleCsv(): Promise<string> {
  const response = await fetch(SAMPLE_CSV_URL);
  if (!response.ok) {
    throw new Error("Could not load the bundled sample portfolio.");
  }
  return response.text();
}
