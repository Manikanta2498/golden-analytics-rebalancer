import Papa from "papaparse";
import type {
  Account,
  AccountType,
  ParseResult,
  ParseWarning,
  Position,
} from "./types";

const CORE_CASH_SUFFIX = "**";
const RETIREMENT_NAME_PATTERN = /\b(ira|401\s*\(?k\)?|403\s*\(?b\)?|roth|hsa|sep|simple)\b/i;

type RawRow = Record<string, string | undefined>;

export function parseMoney(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "--") return null;

  const negative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const cleaned = trimmed.replace(/[$,()\s]/g, "");
  if (cleaned === "") return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  return negative ? -value : value;
}

export function parsePercent(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "--") return null;

  const negative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const cleaned = trimmed.replace(/[%,()\s]/g, "");
  if (cleaned === "") return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  return negative ? -value : value;
}

export function inferAccountType(accountName: string): AccountType {
  if (RETIREMENT_NAME_PATTERN.test(accountName)) return "retirement";
  return "taxable";
}

function normalizeSymbol(raw: string): { symbol: string; isCoreCash: boolean } {
  const trimmed = raw.trim();
  if (trimmed.endsWith(CORE_CASH_SUFFIX)) {
    return {
      symbol: trimmed.slice(0, -CORE_CASH_SUFFIX.length).trim(),
      isCoreCash: true,
    };
  }
  return { symbol: trimmed, isCoreCash: false };
}

function assignCashPreferenceRanks(accounts: Account[]): void {
  const ordered = accounts
    .map((account, index) => ({ account, index }))
    .sort((a, b) => {
      const aTaxable = a.account.type === "taxable" ? 0 : 1;
      const bTaxable = b.account.type === "taxable" ? 0 : 1;
      if (aTaxable !== bTaxable) return aTaxable - bTaxable;
      return a.index - b.index;
    });

  ordered.forEach(({ account }, rank) => {
    account.cashPreferenceRank = rank;
  });
}

export function parsePortfolioCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<RawRow>(csvText, {
    header: true,
    skipEmptyLines: false,
  });

  const warnings: ParseWarning[] = [];
  const accountsById = new Map<string, Account>();
  const positions: Position[] = [];

  for (let i = 0; i < parsed.data.length; i += 1) {
    const row = parsed.data[i];
    const rowNumber = i + 2;

    const externalId = (row["Account Number"] ?? "").trim();
    if (externalId === "") break;

    const accountName = (row["Account Name"] ?? "").trim();
    const rawSymbol = (row["Symbol"] ?? "").trim();
    if (rawSymbol === "") {
      warnings.push({ row: rowNumber, message: "Row has no symbol; skipped." });
      continue;
    }

    const { symbol, isCoreCash } = normalizeSymbol(rawSymbol);
    const description = (row["Description"] ?? "").trim();
    const marketValue = parseMoney(row["Current Value"]);

    if (marketValue == null) {
      warnings.push({
        row: rowNumber,
        message: `Position ${symbol} has no Current Value; skipped.`,
      });
      continue;
    }

    let account = accountsById.get(externalId);
    if (!account) {
      account = {
        id: externalId,
        externalId,
        name: accountName,
        type: inferAccountType(accountName),
        cashPreferenceRank: 0,
        coreCashSymbol: null,
      };
      accountsById.set(externalId, account);
    }

    if (isCoreCash) {
      if (account.coreCashSymbol && account.coreCashSymbol !== symbol) {
        warnings.push({
          row: rowNumber,
          message: `Account ${accountName} has multiple core cash sleeves (${account.coreCashSymbol}, ${symbol}); keeping ${account.coreCashSymbol}.`,
        });
      } else {
        account.coreCashSymbol = symbol;
      }
    }

    const parsedQuantity = parseMoney(row["Quantity"]);
    const parsedPrice = parseMoney(row["Last Price"]);

    let quantity: number;
    let price: number;

    if (parsedQuantity == null || parsedPrice == null) {
      quantity = marketValue;
      price = 1;
      if (!isCoreCash) {
        warnings.push({
          row: rowNumber,
          message: `Position ${symbol} has no quantity or price; treated as a cash balance.`,
        });
      }
    } else {
      quantity = parsedQuantity;
      price = parsedPrice;
    }

    positions.push({
      id: `${externalId}:${symbol}`,
      accountId: externalId,
      symbol,
      description,
      quantity,
      price,
      marketValue,
      isCoreCash,
      isCashEquivalent: isCoreCash,
      reportedPercentOfAccount: parsePercent(row["Percent Of Account"]),
    });
  }

  const accounts = [...accountsById.values()];
  assignCashPreferenceRanks(accounts);

  return { accounts, positions, warnings };
}

export function accountTotal(positions: Position[], accountId: string): number {
  return positions
    .filter((position) => position.accountId === accountId)
    .reduce((sum, position) => sum + position.marketValue, 0);
}

export function householdTotal(positions: Position[]): number {
  return positions.reduce((sum, position) => sum + position.marketValue, 0);
}
