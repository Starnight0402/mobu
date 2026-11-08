import { parseCsvTable } from './csv';

export type ExpenseCsvRow = {
  spentAt: number;
  category: string;
  amount: number;
  currency: string;
  paidByMe: boolean;
  splitRatio: number;
  settled: boolean;
  note?: string;
};

const HEADER = [
  'Date',
  'Category',
  'Amount',
  'Currency',
  'Paid by',
  'PaidByMe',
  'Payer share %',
  'Settled',
  'Note',
];

export function buildExpenseCsv(
  rows: { spentAt: number; category: string; amount: number; currency: string; payerName: string; paidByMe: boolean; splitRatio: number; settled: boolean; note?: string }[],
): string {
  const lines = [
    HEADER,
    ...rows.map((e) => [
      new Date(e.spentAt).toISOString(),
      e.category,
      e.amount.toString(),
      e.currency,
      e.payerName,
      e.paidByMe ? 'yes' : 'no',
      e.splitRatio.toString(),
      e.settled ? 'yes' : 'no',
      e.note ?? '',
    ]),
  ];
  return lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function parseExpenseCsv(text: string): { rows: ExpenseCsvRow[]; error?: string } {
  // Parse the whole text at once, not line by line: a quoted note may contain
  // a line break, and splitting on newlines first cut such notes in half.
  const table = parseCsvTable(text);
  if (table.length < 2) return { rows: [], error: 'That file has no rows to import.' };

  const header = table[0].map((h) => h.trim());
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const idx = {
    date: col('Date'),
    category: col('Category'),
    amount: col('Amount'),
    currency: col('Currency'),
    paidByMe: col('PaidByMe'),
    splitRatio: col('Payer share %'),
    settled: col('Settled'),
    note: col('Note'),
  };
  if (idx.date < 0 || idx.amount < 0 || idx.currency < 0 || idx.paidByMe < 0 || idx.splitRatio < 0) {
    return { rows: [], error: "This doesn't look like a file exported from this app." };
  }

  const rows: ExpenseCsvRow[] = [];
  for (const f of table.slice(1)) {
    const spentAt = new Date(f[idx.date]).getTime();
    const amount = parseFloat(f[idx.amount]);
    const splitRatio = parseFloat(f[idx.splitRatio]);
    if (!Number.isFinite(spentAt) || !Number.isFinite(amount) || !Number.isFinite(splitRatio)) continue;
    rows.push({
      spentAt,
      category: idx.category >= 0 ? f[idx.category] || 'General' : 'General',
      amount,
      currency: f[idx.currency] || 'USD',
      paidByMe: (f[idx.paidByMe] || '').trim().toLowerCase() === 'yes',
      splitRatio,
      settled: idx.settled >= 0 ? (f[idx.settled] || '').trim().toLowerCase() === 'yes' : false,
      note: idx.note >= 0 && f[idx.note] ? f[idx.note] : undefined,
    });
  }
  return { rows };
}
