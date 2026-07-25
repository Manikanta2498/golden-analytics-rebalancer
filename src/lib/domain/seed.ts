import type {
  AssetClass,
  ParseResult,
  PortfolioStore,
  Settings,
  SymbolMapping,
  TargetSet,
  TargetWeight,
} from "./types";

export const SCHEMA_VERSION = 1;

export const ASSET_CLASS_IDS = {
  usEquity: "us-equity",
  international: "international-equity",
  treasuries: "treasuries",
  gold: "commodities-gold",
  thematic: "thematic-equity",
  cash: "cash",
} as const;

export const DEFAULT_ASSET_CLASSES: AssetClass[] = [
  { id: ASSET_CLASS_IDS.usEquity, name: "US Equity", sortOrder: 0 },
  {
    id: ASSET_CLASS_IDS.international,
    name: "International Equity",
    sortOrder: 1,
  },
  { id: ASSET_CLASS_IDS.treasuries, name: "Treasuries", sortOrder: 2 },
  { id: ASSET_CLASS_IDS.gold, name: "Commodities / Gold", sortOrder: 3 },
  { id: ASSET_CLASS_IDS.thematic, name: "Thematic Equity", sortOrder: 4 },
  { id: ASSET_CLASS_IDS.cash, name: "Cash", sortOrder: 5 },
];

export const SEED_SYMBOL_MAP: Record<string, string> = {
  FNILX: ASSET_CLASS_IDS.usEquity,
  FXAIX: ASSET_CLASS_IDS.usEquity,
  FZROX: ASSET_CLASS_IDS.usEquity,
  VTI: ASSET_CLASS_IDS.usEquity,
  VOO: ASSET_CLASS_IDS.usEquity,
  SPY: ASSET_CLASS_IDS.usEquity,
  ITOT: ASSET_CLASS_IDS.usEquity,
  FZILX: ASSET_CLASS_IDS.international,
  VGK: ASSET_CLASS_IDS.international,
  VXUS: ASSET_CLASS_IDS.international,
  VEA: ASSET_CLASS_IDS.international,
  VWO: ASSET_CLASS_IDS.international,
  IEFA: ASSET_CLASS_IDS.international,
  FTIHX: ASSET_CLASS_IDS.international,
  BIL: ASSET_CLASS_IDS.treasuries,
  SGOV: ASSET_CLASS_IDS.treasuries,
  SHV: ASSET_CLASS_IDS.treasuries,
  VGIT: ASSET_CLASS_IDS.treasuries,
  VGSH: ASSET_CLASS_IDS.treasuries,
  IEF: ASSET_CLASS_IDS.treasuries,
  TLT: ASSET_CLASS_IDS.treasuries,
  IAU: ASSET_CLASS_IDS.gold,
  GLD: ASSET_CLASS_IDS.gold,
  GLDM: ASSET_CLASS_IDS.gold,
  SGOL: ASSET_CLASS_IDS.gold,
  NUKZ: ASSET_CLASS_IDS.thematic,
  SHLD: ASSET_CLASS_IDS.thematic,
  SMH: ASSET_CLASS_IDS.thematic,
  XLE: ASSET_CLASS_IDS.thematic,
  ICLN: ASSET_CLASS_IDS.thematic,
  FZFXX: ASSET_CLASS_IDS.cash,
  SPAXX: ASSET_CLASS_IDS.cash,
  FCASH: ASSET_CLASS_IDS.cash,
  FRGXX: ASSET_CLASS_IDS.cash,
  FDRXX: ASSET_CLASS_IDS.cash,
  SPRXX: ASSET_CLASS_IDS.cash,
  VMFXX: ASSET_CLASS_IDS.cash,
};

export const DEFAULT_TARGET_SET_ID = "default-target";

export const DEFAULT_TARGET_SET: TargetSet = {
  id: DEFAULT_TARGET_SET_ID,
  name: "Balanced (default)",
  createdAt: "1970-01-01T00:00:00.000Z",
};

export const DEFAULT_TARGET_WEIGHTS: TargetWeight[] = [
  {
    targetSetId: DEFAULT_TARGET_SET_ID,
    assetClassId: ASSET_CLASS_IDS.usEquity,
    weightPct: 35,
  },
  {
    targetSetId: DEFAULT_TARGET_SET_ID,
    assetClassId: ASSET_CLASS_IDS.international,
    weightPct: 20,
  },
  {
    targetSetId: DEFAULT_TARGET_SET_ID,
    assetClassId: ASSET_CLASS_IDS.treasuries,
    weightPct: 20,
  },
  {
    targetSetId: DEFAULT_TARGET_SET_ID,
    assetClassId: ASSET_CLASS_IDS.gold,
    weightPct: 10,
  },
  {
    targetSetId: DEFAULT_TARGET_SET_ID,
    assetClassId: ASSET_CLASS_IDS.thematic,
    weightPct: 10,
  },
  {
    targetSetId: DEFAULT_TARGET_SET_ID,
    assetClassId: ASSET_CLASS_IDS.cash,
    weightPct: 5,
  },
];

export const DEFAULT_SETTINGS: Settings = {
  driftBandPct: 0.5,
  driftBandAbs: 500,
  cashAssetClassId: ASSET_CLASS_IDS.cash,
  enrichmentEnabled: true,
  sharePrecision: 3,
  wholeShareSymbols: [],
};

export function seedMappingsFor(symbols: string[]): SymbolMapping[] {
  const unique = [...new Set(symbols)];
  return unique
    .filter((symbol) => SEED_SYMBOL_MAP[symbol] !== undefined)
    .map((symbol) => ({
      symbol,
      assetClassId: SEED_SYMBOL_MAP[symbol],
      source: "seed" as const,
      confidence: 1,
    }));
}

export function createStore(parsed: ParseResult): PortfolioStore {
  return {
    schemaVersion: SCHEMA_VERSION,
    accounts: parsed.accounts,
    positions: parsed.positions,
    assetClasses: DEFAULT_ASSET_CLASSES,
    mappings: seedMappingsFor(parsed.positions.map((p) => p.symbol)),
    targetSets: [DEFAULT_TARGET_SET],
    targetWeights: DEFAULT_TARGET_WEIGHTS,
    settings: DEFAULT_SETTINGS,
  };
}

export function targetWeightsSumTo100(weights: TargetWeight[]): boolean {
  const total = weights.reduce((sum, weight) => sum + weight.weightPct, 0);
  return Math.abs(total - 100) < 1e-9;
}
