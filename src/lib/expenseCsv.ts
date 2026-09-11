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

/** Splits one CSV line into fields, honoring quoted commas and escaped quotes. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

export function parseExpenseCsv(text: string): { rows: ExpenseCsvRow[]; error?: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], error: 'That file has no rows to import.' };

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
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
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line);
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
