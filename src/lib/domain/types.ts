export type AccountType = "taxable" | "retirement" | "unknown";

export type MappingSource = "seed" | "inferred" | "figi" | "user";

export interface Account {
  id: string;
  externalId: string;
  name: string;
  type: AccountType;
  cashPreferenceRank: number;
  coreCashSymbol: string | null;
}

export interface Position {
  id: string;
  accountId: string;
  symbol: string;
  description: string;
  quantity: number;
  price: number;
  marketValue: number;
  isCoreCash: boolean;
  isCashEquivalent: boolean;
  reportedPercentOfAccount: number | null;
}

export interface AssetClass {
  id: string;
  name: string;
  sortOrder: number;
}

export interface SymbolMapping {
  symbol: string;
  assetClassId: string | null;
  source: MappingSource;
  confidence: number;
  figi?: string;
  securityType?: string;
  normalizedName?: string;
}

export interface TargetSet {
  id: string;
  name: string;
  createdAt: string;
}

export interface TargetWeight {
  targetSetId: string;
  assetClassId: string;
  weightPct: number;
}

export interface Settings {
  driftBandPct: number;
  driftBandAbs: number;
  cashAssetClassId: string;
  enrichmentEnabled: boolean;
  sharePrecision: number;
  wholeShareSymbols: string[];
}

export interface PortfolioStore {
  schemaVersion: number;
  accounts: Account[];
  positions: Position[];
  assetClasses: AssetClass[];
  mappings: SymbolMapping[];
  targetSets: TargetSet[];
  targetWeights: TargetWeight[];
  settings: Settings;
}

export interface ParseWarning {
  row: number;
  message: string;
}

export interface ParseResult {
  accounts: Account[];
  positions: Position[];
  warnings: ParseWarning[];
}
