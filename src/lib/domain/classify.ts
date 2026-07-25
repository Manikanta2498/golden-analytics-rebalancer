import { ASSET_CLASS_IDS, SEED_SYMBOL_MAP } from "./seed";
import type { MappingSource, Position, SymbolMapping } from "./types";

export const REVIEW_CONFIDENCE_THRESHOLD = 0.6;

export interface ClassifyInput {
  symbol: string;
  description: string;
  price: number;
  isCoreCash: boolean;
}

export interface Classification {
  symbol: string;
  assetClassId: string | null;
  source: MappingSource;
  confidence: number;
  isCashEquivalent: boolean;
  rule: string | null;
  needsReview: boolean;
}

interface HeuristicRule {
  id: string;
  assetClassId: string;
  confidence: number;
  matches: (text: string, price: number) => boolean;
}

const has = (text: string, ...needles: string[]): boolean =>
  needles.some((needle) => text.includes(needle));

const MONEY_MARKET_TERMS = [
  "MONEY MARKET",
  "MMKT",
  "MONEY MKT",
  "FCASH",
  "GOVERNMENT PORTFOLIO",
  "GOVT PORTFOLIO",
  "CASH RESERVES",
  "CASH MANAGEMENT",
  "TREASURY ONLY PORTFOLIO",
];

const DOLLAR_NAV_FUND_TERMS = [
  "PORTFOLIO",
  "FUND",
  "INSTL",
  "GOVT",
  "GOVERNMENT",
  "TREASURY",
  "RESERVES",
];

export const HEURISTIC_RULES: HeuristicRule[] = [
  {
    id: "money-market-terms",
    assetClassId: ASSET_CLASS_IDS.cash,
    confidence: 0.95,
    matches: (text) => has(text, ...MONEY_MARKET_TERMS),
  },
  {
    id: "dollar-nav-fund",
    assetClassId: ASSET_CLASS_IDS.cash,
    confidence: 0.75,
    matches: (text, price) =>
      price === 1 && has(text, ...DOLLAR_NAV_FUND_TERMS),
  },
  {
    id: "treasury-terms",
    assetClassId: ASSET_CLASS_IDS.treasuries,
    confidence: 0.9,
    matches: (text) =>
      has(text, "T-BILL", "T BILL", "TBILL", "TREASURY", "TREASURIES"),
  },
  {
    id: "precious-metals",
    assetClassId: ASSET_CLASS_IDS.gold,
    confidence: 0.9,
    matches: (text) =>
      has(text, "GOLD", "SILVER", "PRECIOUS METAL", "COMMODIT"),
  },
  {
    id: "thematic-sector",
    assetClassId: ASSET_CLASS_IDS.thematic,
    confidence: 0.8,
    matches: (text) =>
      has(
        text,
        "NUCLEAR",
        "URANIUM",
        "DEFENSE",
        "DEFENCE",
        "AEROSPACE",
        "SEMICONDUCTOR",
        "BIOTECH",
        "CYBER",
        "ROBOTIC",
        "CLEAN ENERGY",
        "SOLAR",
        "INFRASTRUCTURE",
      ),
  },
  {
    id: "international-terms",
    assetClassId: ASSET_CLASS_IDS.international,
    confidence: 0.85,
    matches: (text) =>
      has(
        text,
        "INTERNATIONAL",
        "INTL",
        "EX-US",
        "EX US",
        "FTSE",
        "EUROPE",
        "EMERGING",
        "DEVELOPED MARKET",
        "PACIFIC",
        "WORLD EX",
      ),
  },
  {
    id: "us-equity-terms",
    assetClassId: ASSET_CLASS_IDS.usEquity,
    confidence: 0.8,
    matches: (text) =>
      has(
        text,
        "LARGE CAP",
        "MID CAP",
        "SMALL CAP",
        "TOTAL MARKET",
        "TOTAL STOCK",
        "S&P 500",
        "SP 500",
        "500 INDEX",
        "US EQUITY",
        "EXTENDED MARKET",
        "NASDAQ",
      ),
  },
];

export function matchHeuristics(
  description: string,
  price: number,
): { assetClassId: string; confidence: number; rule: string } | null {
  const text = description.toUpperCase();
  for (const rule of HEURISTIC_RULES) {
    if (rule.matches(text, price)) {
      return {
        assetClassId: rule.assetClassId,
        confidence: rule.confidence,
        rule: rule.id,
      };
    }
  }
  return null;
}

function build(
  symbol: string,
  assetClassId: string | null,
  source: MappingSource,
  confidence: number,
  rule: string | null,
): Classification {
  return {
    symbol,
    assetClassId,
    source,
    confidence,
    isCashEquivalent: assetClassId === ASSET_CLASS_IDS.cash,
    rule,
    needsReview:
      assetClassId === null || confidence < REVIEW_CONFIDENCE_THRESHOLD,
  };
}

export function classifySymbol(
  input: ClassifyInput,
  overrides: Map<string, SymbolMapping> = new Map(),
): Classification {
  const override = overrides.get(input.symbol);
  if (override && override.source === "user" && override.assetClassId) {
    return build(input.symbol, override.assetClassId, "user", 1, "user-override");
  }

  if (input.isCoreCash) {
    return build(
      input.symbol,
      ASSET_CLASS_IDS.cash,
      "inferred",
      1,
      "core-cash-sleeve",
    );
  }

  const seeded = SEED_SYMBOL_MAP[input.symbol];
  if (seeded) {
    return build(input.symbol, seeded, "seed", 1, "seed-map");
  }

  const heuristic = matchHeuristics(input.description, input.price);
  if (heuristic) {
    return build(
      input.symbol,
      heuristic.assetClassId,
      "inferred",
      heuristic.confidence,
      heuristic.rule,
    );
  }

  return build(input.symbol, null, "inferred", 0, null);
}

export function classifySymbols(
  inputs: ClassifyInput[],
  overrides: SymbolMapping[] = [],
): Classification[] {
  const overrideMap = new Map(
    overrides.map((mapping) => [mapping.symbol, mapping]),
  );
  const seen = new Set<string>();
  const results: Classification[] = [];

  for (const input of inputs) {
    if (seen.has(input.symbol)) continue;
    seen.add(input.symbol);
    results.push(classifySymbol(input, overrideMap));
  }

  return results;
}

export function classifyInputsFromPositions(
  positions: Position[],
): ClassifyInput[] {
  return positions.map((position) => ({
    symbol: position.symbol,
    description: position.description,
    price: position.price,
    isCoreCash: position.isCoreCash,
  }));
}

export function applyClassifications(
  positions: Position[],
  classifications: Classification[],
): Position[] {
  const bySymbol = new Map(
    classifications.map((classification) => [
      classification.symbol,
      classification,
    ]),
  );

  return positions.map((position) => {
    const classification = bySymbol.get(position.symbol);
    if (!classification) return position;
    return {
      ...position,
      isCashEquivalent: classification.isCashEquivalent,
    };
  });
}

export function toMappings(
  classifications: Classification[],
): SymbolMapping[] {
  return classifications.map((classification) => ({
    symbol: classification.symbol,
    assetClassId: classification.assetClassId,
    source: classification.source,
    confidence: classification.confidence,
  }));
}

export function unresolvedSymbols(
  classifications: Classification[],
): string[] {
  return classifications
    .filter((classification) => classification.assetClassId === null)
    .map((classification) => classification.symbol);
}
