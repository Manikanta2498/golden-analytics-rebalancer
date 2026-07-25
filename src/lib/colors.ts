const PALETTE = [
  "#0f172a",
  "#0ea5e9",
  "#14b8a6",
  "#f59e0b",
  "#8b5cf6",
  "#94a3b8",
  "#ef4444",
  "#22c55e",
];

const KNOWN: Record<string, string> = {
  "us-equity": "#0f172a",
  "international-equity": "#0ea5e9",
  treasuries: "#14b8a6",
  "commodities-gold": "#f59e0b",
  "thematic-equity": "#8b5cf6",
  cash: "#94a3b8",
};

export function colorForClass(assetClassId: string, index = 0): string {
  return KNOWN[assetClassId] ?? PALETTE[index % PALETTE.length];
}
