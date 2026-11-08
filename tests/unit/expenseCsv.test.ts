import { describe, expect, it } from 'vitest';
import { buildExpenseCsv, parseExpenseCsv } from '../../src/lib/expenseCsv';

const row = (over: Partial<Parameters<typeof buildExpenseCsv>[0][number]> = {}) => ({
  spentAt: Date.UTC(2025, 5, 11, 18, 30),
  category: 'Food',
  amount: 450.5,
  currency: 'INR',
  payerName: 'Amritanshu',
  paidByMe: true,
  splitRatio: 50,
  settled: false,
  ...over,
});

describe('buildExpenseCsv', () => {
  it('writes a header and one quoted line per expense', () => {
    const csv = buildExpenseCsv([row()]);
    const [header, line] = csv.split('\n');
    expect(header).toBe(
      '"Date","Category","Amount","Currency","Paid by","PaidByMe","Payer share %","Settled","Note"',
    );
    expect(line).toBe('"2025-06-11T18:30:00.000Z","Food","450.5","INR","Amritanshu","yes","50","no",""');
  });

  it('escapes embedded quotes by doubling them', () => {
    const csv = buildExpenseCsv([row({ note: 'the "good" biryani' })]);
    expect(csv).toContain('"the ""good"" biryani"');
  });
});

describe('parseExpenseCsv', () => {
  it('round-trips exactly what buildExpenseCsv writes', () => {
    const input = [
      row(),
      row({ paidByMe: false, payerName: 'Swati', splitRatio: 70, settled: true, note: 'Taxi, airport' }),
      row({ category: 'Rent "share"', amount: 12000, currency: 'USD', note: 'He said "ok", fine' }),
    ];
    const { rows, error } = parseExpenseCsv(buildExpenseCsv(input));
    expect(error).toBeUndefined();
    expect(rows).toEqual(
      input.map(({ payerName: _drop, ...r }) => ({ ...r, note: r.note })),
    );
  });

  it('round-trips a note that contains a line break', () => {
    // Notes are free text typed on a phone; a newline in one must not split
    // the row in half (or silently drop it) when the export is re-imported.
    const input = [row({ note: 'Groceries\nand milk' }), row({ category: 'Fuel' })];
    const { rows } = parseExpenseCsv(buildExpenseCsv(input));
    expect(rows).toHaveLength(2);
    expect(rows[0].note).toBe('Groceries\nand milk');
    expect(rows[1].category).toBe('Fuel');
  });

  it('accepts Windows line endings and a trailing blank line', () => {
    const csv = buildExpenseCsv([row(), row()]).replace(/\n/g, '\r\n') + '\r\n';
    expect(parseExpenseCsv(csv).rows).toHaveLength(2);
  });

  it('rejects a file with only a header', () => {
    expect(parseExpenseCsv('"Date","Amount"').error).toMatch(/no rows/);
  });

  it('rejects a CSV that is not one of our exports', () => {
    const res = parseExpenseCsv('Name,Age\nBob,30');
    expect(res.rows).toEqual([]);
    expect(res.error).toMatch(/exported from this app/);
  });

  it('skips rows with an unparseable date or amount instead of inserting garbage', () => {
    const csv = [
      'Date,Amount,Currency,PaidByMe,Payer share %',
      'not-a-date,10,INR,yes,50',
      '2025-01-01,abc,INR,yes,50',
      '2025-01-02,25,INR,yes,50',
    ].join('\n');
    const { rows } = parseExpenseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 25, category: 'General', settled: false });
  });
});
