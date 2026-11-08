import { describe, expect, it } from 'vitest';
import { computeCarryover, parseSplitwiseCsv } from '../../src/lib/splitwiseImport';

const HEADER = 'Date,Description,Category,Cost,Currency,Amritanshu,Swati';

const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

describe('parseSplitwiseCsv', () => {
  it('turns an even split paid by the first person into a 50% expense', () => {
    const res = parseSplitwiseCsv(csv('2025-03-01,Dinner,Dining out,1000.00,INR,500.00,-500.00'));
    expect(res.error).toBeUndefined();
    expect(res.people).toEqual(['Amritanshu', 'Swati']);
    expect(res.expenses).toEqual([
      {
        date: Date.parse('2025-03-01'),
        description: 'Dinner',
        category: 'Dining out',
        cost: 1000,
        currency: 'INR',
        payerIndex: 0,
        payerShare: 50,
      },
    ]);
  });

  it('attributes an expense to the second person when their column is positive', () => {
    const res = parseSplitwiseCsv(csv('2025-03-02,Cab,Taxi,300,INR,-300,300'));
    expect(res.expenses[0]).toMatchObject({ payerIndex: 1, payerShare: 0 });
  });

  it('reads Payment rows as settlements, in the right direction', () => {
    const res = parseSplitwiseCsv(
      csv(
        '2025-03-03,Amritanshu paid Swati,Payment,200,INR,200,-200',
        '2025-03-04,Swati paid Amritanshu,Payment,50,INR,-50,50',
      ),
    );
    expect(res.expenses).toEqual([]);
    expect(res.settlements.map((s) => [s.fromIndex, s.toIndex, s.cost])).toEqual([
      [0, 1, 200],
      [1, 0, 50],
    ]);
  });

  it('finds the header even when Splitwise prepends a note line', () => {
    const text = 'Note: does not include group expenses\n\n' + csv('2025-03-01,Tea,General,20,INR,10,-10');
    expect(parseSplitwiseCsv(text).expenses).toHaveLength(1);
  });

  it('handles quoted descriptions containing commas and thousands separators', () => {
    const res = parseSplitwiseCsv(csv('2025-03-01,"Flights, Goa",Travel,"12,000.00",INR,"6,000.00","-6,000.00"'));
    expect(res.expenses[0]).toMatchObject({ description: 'Flights, Goa', cost: 12000, payerShare: 50 });
  });

  it('refuses a three-person group rather than guessing', () => {
    const res = parseSplitwiseCsv('Date,Description,Category,Cost,Currency,A,B,C\n2025-01-01,x,General,30,INR,20,-10,-10');
    expect(res.error).toMatch(/3 people/);
    expect(res.expenses).toEqual([]);
  });

  it('rejects files that are not Splitwise exports', () => {
    expect(parseSplitwiseCsv('foo,bar\n1,2').error).toMatch(/Splitwise export/);
    expect(parseSplitwiseCsv('').error).toMatch(/no data rows/);
  });

  it('reports bad rows as skipped with a reason instead of dropping them silently', () => {
    const res = parseSplitwiseCsv(
      csv('garbage,Dinner,Food,100,INR,50,-50', '2025-01-01,Nothing,Food,,INR,0,0', '2025-01-02,Odd,Food,100,INR,0,0'),
    );
    expect(res.skipped.map((s) => s.reason)).toEqual([
      'No valid date',
      'Missing amount or currency',
      "Couldn't tell who paid",
    ]);
  });

  it('captures Splitwise\'s own "Total balance" row as a cross-check', () => {
    const res = parseSplitwiseCsv(csv('2025-01-01,Dinner,Food,100,INR,50,-50', ',Total balance,,,INR,50,-50'));
    expect(res.statedBalance).toEqual([{ currency: 'INR', net: 50 }]);
  });
});

describe('computeCarryover', () => {
  it('nets expenses and settlements per currency', () => {
    const res = parseSplitwiseCsv(
      csv(
        '2025-01-01,Dinner,Food,1000,INR,500,-500', // Swati owes 500
        '2025-01-02,Cab,Taxi,400,INR,-200,200', // Amritanshu owes 200
        '2025-01-03,Swati paid Amritanshu,Payment,100,INR,-100,100', // Swati pays 100 down
        '2025-01-04,Coffee,Food,10,USD,5,-5',
      ),
    );
    expect(computeCarryover(res.expenses, res.settlements)).toEqual([
      { currency: 'INR', net: 200 },
      { currency: 'USD', net: 5 },
    ]);
  });

  it('drops currencies that net to zero', () => {
    const res = parseSplitwiseCsv(
      csv('2025-01-01,Dinner,Food,100,INR,50,-50', '2025-01-02,Swati paid Amritanshu,Payment,50,INR,-50,50'),
    );
    expect(computeCarryover(res.expenses, res.settlements)).toEqual([]);
  });

  it("agrees with Splitwise's stated total balance when splits are not whole percentages", () => {
    // Unequal splits are ordinary in Splitwise ("by exact amounts"). The
    // carried-over balance is real money owed, so it has to match to the paisa.
    const res = parseSplitwiseCsv(
      csv(
        '2025-01-01,Groceries,Food,99.00,INR,33.00,-33.00', // payer owed 33 of 99
        '2025-01-02,Movie,Fun,1250.00,INR,-416.67,416.67', // a 2/3 vs 1/3 split
        '2025-01-03,Dinner,Food,777.00,INR,259.00,-259.00',
        ',Total balance,,,INR,-124.67,124.67',
      ),
    );
    expect(computeCarryover(res.expenses, res.settlements)).toEqual(res.statedBalance);
  });
});
