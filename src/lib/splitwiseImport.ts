/**
 * Parses a Splitwise CSV export and reduces it to what this app's `expenses`
 * schema needs. Pure and Convex-free so it can run entirely client-side —
 * Splitwise histories are small enough that there's no need to round-trip a
 * file through storage and a server action the way the (much larger)
 * WhatsApp import does.
 *
 * Splitwise's column convention: after Date/Description/Category/Cost/
 * Currency, each remaining column is one group member's *balance delta* for
 * that row — positive means the row moved money toward them, negative away.
 * For an ordinary expense the payer's column is positive (they're owed their
 * partner's share); for a "Payment" row (someone settling up) the person who
 * physically sent money is the one who shows positive, since paying down a
 * debt moves their balance toward zero from below.
 */

export interface ParsedExpense {
  date: number;
  description: string;
  category: string;
  cost: number;
  currency: string;
  payerIndex: 0 | 1;
  payerShare: number; // 0-100, matches this app's `splitRatio`
}

export interface ParsedSettlement {
  date: number;
  cost: number;
  currency: string;
  fromIndex: 0 | 1; // who sent the money
  toIndex: 0 | 1;
  note?: string;
}

export interface SkippedRow {
  cells: string[];
  reason: string;
}

export interface SplitwiseParseResult {
  people: string[];
  currencies: string[];
  dateRange: { start: number; end: number } | null;
  expenses: ParsedExpense[];
  settlements: ParsedSettlement[];
  skipped: SkippedRow[];
  /** Splitwise's own running-total row, when the export includes one. */
  statedBalance: Carryover[];
  error?: string;
}

function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\r") {
      // skip
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function num(cell: string | undefined): number {
  if (!cell) return 0;
  const n = parseFloat(cell.replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const empty = (error?: string): SplitwiseParseResult => ({
  people: [],
  currencies: [],
  dateRange: null,
  expenses: [],
  settlements: [],
  skipped: [],
  statedBalance: [],
  error,
});

export function parseSplitwiseCsv(text: string): SplitwiseParseResult {
  const table = parseCsvTable(text);
  if (table.length < 2) return empty("That file has no data rows.");

  // Splitwise prepends a "Note: does not include group expenses" line before
  // the real header when the export covers a single friend rather than a
  // group, so the header isn't reliably row 0 — scan for it instead.
  const headerIdx = table.findIndex((row) => {
    const norm = row.map((c) => c.trim());
    return norm.includes("Date") && norm.includes("Cost") && norm.includes("Currency");
  });

  if (headerIdx < 0) {
    return empty(
      "That doesn't look like a Splitwise export — expected Date, Cost and Currency columns.",
    );
  }

  const header = table[headerIdx].map((h) => h.trim());
  const iDate = header.indexOf("Date");
  const iDesc = header.indexOf("Description");
  const iCat = header.indexOf("Category");
  const iCost = header.indexOf("Cost");
  const iCur = header.indexOf("Currency");

  const reserved = new Set([iDate, iDesc, iCat, iCost, iCur]);
  const personCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => !reserved.has(i) && h !== "");

  if (personCols.length !== 2) {
    return {
      ...empty(
        personCols.length === 0
          ? "Couldn't find any people in this export."
          : `This export has ${personCols.length} people in it — Mobu only supports a 1:1 split. Export just the two-person group with your partner from Splitwise.`,
      ),
      people: personCols.map((p) => p.h),
    };
  }

  const people = personCols.map((p) => p.h);
  const [colA, colB] = personCols.map((p) => p.i);

  const expenses: ParsedExpense[] = [];
  const settlements: ParsedSettlement[] = [];
  const skipped: SkippedRow[] = [];
  const currencySet = new Set<string>();
  const stated: Carryover[] = [];
  let minDate = Infinity;
  let maxDate = -Infinity;

  for (let r = headerIdx + 1; r < table.length; r++) {
    const row = table[r];
    const description = (row[iDesc] || "").trim();
    const currency = (row[iCur] || "").trim();

    // Splitwise's own running-total row -- Cost is blank, but the person
    // columns carry the actual final balance. Worth keeping rather than
    // discarding: it's a free cross-check against this parser's own math.
    if (description.toLowerCase() === "total balance") {
      const a = num(row[colA]);
      if (currency && Math.abs(a) > 0.005) stated.push({ currency, net: Math.round(a * 100) / 100 });
      continue;
    }

    const dateStr = row[iDate]?.trim();
    const ts = dateStr ? Date.parse(dateStr) : NaN;
    if (!dateStr || Number.isNaN(ts)) {
      skipped.push({ cells: row, reason: "No valid date" });
      continue;
    }

    const cost = num(row[iCost]);
    const category = (row[iCat] || "").trim() || "General";
    const a = num(row[colA]);
    const b = num(row[colB]);

    if (!(cost > 0) || !currency) {
      skipped.push({ cells: row, reason: "Missing amount or currency" });
      continue;
    }

    currencySet.add(currency);
    minDate = Math.min(minDate, ts);
    maxDate = Math.max(maxDate, ts);

    if (category.toLowerCase() === "payment") {
      if (a > 0 && b < 0) {
        settlements.push({ date: ts, cost, currency, fromIndex: 0, toIndex: 1, note: description || undefined });
      } else if (b > 0 && a < 0) {
        settlements.push({ date: ts, cost, currency, fromIndex: 1, toIndex: 0, note: description || undefined });
      } else {
        skipped.push({ cells: row, reason: "Couldn't tell which direction the payment went" });
      }
      continue;
    }

    if (a > 0 && b <= 0) {
      const share = Math.max(0, Math.min(100, Math.round((1 - a / cost) * 100)));
      expenses.push({ date: ts, description, category, cost, currency, payerIndex: 0, payerShare: share });
    } else if (b > 0 && a <= 0) {
      const share = Math.max(0, Math.min(100, Math.round((1 - b / cost) * 100)));
      expenses.push({ date: ts, description, category, cost, currency, payerIndex: 1, payerShare: share });
    } else {
      skipped.push({ cells: row, reason: "Couldn't tell who paid" });
    }
  }

  return {
    people,
    currencies: [...currencySet],
    dateRange: Number.isFinite(minDate) ? { start: minDate, end: maxDate } : null,
    expenses,
    settlements,
    skipped,
    statedBalance: stated,
  };
}

export interface Carryover {
  currency: string;
  /** Positive: index-0 person is owed this by index-1. Negative: the reverse. */
  net: number;
}

/**
 * Every imported expense/settlement is written as historical record
 * (`settled: true`) rather than replayed into a live balance — reconstructing
 * exactly which of hundreds of old line items are still technically
 * outstanding isn't something a CSV export can tell you reliably. Instead,
 * this nets the *entire* history per currency down to a single number: what's
 * actually still owed, right now, as of the last row in the file. The import
 * step turns each non-zero result into one clean "carried over from
 * Splitwise" expense, which is what actually needs tracking going forward.
 */
export function computeCarryover(
  expenses: ParsedExpense[],
  settlements: ParsedSettlement[],
): Carryover[] {
  const net = new Map<string, number>();
  const bump = (currency: string, delta: number) => net.set(currency, (net.get(currency) ?? 0) + delta);

  for (const e of expenses) {
    const lent = Math.round(e.cost * (1 - e.payerShare / 100) * 100) / 100;
    bump(e.currency, e.payerIndex === 0 ? lent : -lent);
  }
  for (const s of settlements) {
    // Paying down a debt moves the payer's balance up and the receiver's
    // down — exactly one of fromIndex/toIndex is 0, so this is a single net
    // effect, not two independent ones.
    bump(s.currency, s.fromIndex === 0 ? s.cost : -s.cost);
  }

  return [...net.entries()]
    .map(([currency, n]) => ({ currency, net: Math.round(n * 100) / 100 }))
    .filter((row) => Math.abs(row.net) > 0.005);
}
