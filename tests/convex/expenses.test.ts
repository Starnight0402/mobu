import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import { couple, setup } from './helpers';

const expense = (over: Partial<{ amount: number; splitRatio: number; currency: string; category: string }> = {}) => ({
  amount: 1000,
  splitRatio: 50,
  currency: 'INR',
  category: 'Food',
  ...over,
});

describe('expense ledger', () => {
  it('shows the same debt from both sides', async () => {
    const t = setup();
    const { a, b } = await couple(t);

    await a.mutation(api.expenses.add, expense()); // A paid 1000, half each → B owes 500

    const fromA = await a.query(api.expenses.balance, {});
    const fromB = await b.query(api.expenses.balance, {});
    expect(fromA.byCurrency).toEqual([{ currency: 'INR', net: 500 }]);
    expect(fromB.byCurrency).toEqual([{ currency: 'INR', net: -500 }]);
    expect(fromA.partnerName).toBe('Bilal');
    expect(fromB.partnerName).toBe('Asha');
  });

  it('nets expenses in both directions and keeps currencies separate', async () => {
    const t = setup();
    const { a, b } = await couple(t);

    await a.mutation(api.expenses.add, expense({ amount: 1000 })); // B owes 500
    await b.mutation(api.expenses.add, expense({ amount: 300, splitRatio: 0 })); // A owes all 300
    await b.mutation(api.expenses.add, expense({ amount: 40, currency: 'USD' })); // A owes $20

    const bal = await a.query(api.expenses.balance, {});
    expect(bal.byCurrency).toEqual([
      { currency: 'INR', net: 200 },
      { currency: 'USD', net: -20 },
    ]);
    expect(bal.unsettledCount).toBe(3);
  });

  it('settling up records who paid whom and zeroes only that currency', async () => {
    const t = setup();
    const { a, b, aId, bId } = await couple(t);
    await a.mutation(api.expenses.add, expense({ amount: 999, splitRatio: 50 })); // B owes 499.5
    await a.mutation(api.expenses.add, expense({ amount: 10, currency: 'USD' }));

    const res = await b.mutation(api.expenses.settleUp, { currency: 'INR' });
    expect(res).toEqual({ amount: 499.5, currency: 'INR' });

    const [s] = await a.query(api.expenses.settlements, {});
    expect(s).toMatchObject({ fromUserId: bId, toUserId: aId, amount: 499.5, currency: 'INR' });
    expect((await a.query(api.expenses.balance, {})).byCurrency).toEqual([{ currency: 'USD', net: 5 }]);

    // The partner hears about it.
    const notes = await t.run((ctx) => ctx.db.query('notifications').collect());
    expect(notes.some((n) => n.userId === aId && n.title === 'All settled up')).toBe(true);
  });

  it('refuses to edit an expense after it has been settled', async () => {
    const t = setup();
    const { a } = await couple(t);
    const id = await a.mutation(api.expenses.add, expense());
    await a.mutation(api.expenses.settleUp, { currency: 'INR' });
    await expect(a.mutation(api.expenses.update, { id, ...expense({ amount: 1 }) })).rejects.toThrow(/Settled/);
  });

  it.each([
    ['zero amount', { amount: 0 }, /greater than 0/],
    ['negative amount', { amount: -5 }, /greater than 0/],
    ['NaN amount', { amount: NaN }, /greater than 0/],
    ['split over 100', { splitRatio: 101 }, /between 0 and 100/],
    ['blank category', { category: '   ' }, /empty/],
  ])('rejects %s', async (_label, over, err) => {
    const t = setup();
    const { a } = await couple(t);
    await expect(a.mutation(api.expenses.add, expense(over))).rejects.toThrow(err);
    expect(await t.run((ctx) => ctx.db.query('expenses').collect())).toEqual([]);
  });

  it('round-trips a CSV re-import with the payer mapped from each side', async () => {
    const t = setup();
    const { a, b, aId, bId } = await couple(t);
    const { inserted } = await a.mutation(api.expenses.importRows, {
      rows: [
        { amount: 100, category: 'Food', currency: 'INR', splitRatio: 50, spentAt: 1, paidByMe: true, settled: false },
        { amount: 60, category: '', currency: 'INR', splitRatio: 50, spentAt: 2, paidByMe: false, settled: false },
        { amount: -1, category: 'Bad', currency: 'INR', splitRatio: 50, spentAt: 3, paidByMe: true, settled: false },
      ],
    });
    expect(inserted).toBe(2);

    const rows = await b.query(api.expenses.list, {});
    expect(rows.map((r) => [r.payerId, r.category, r.myDelta])).toEqual([
      [bId, 'General', 30],
      [aId, 'Food', -50],
    ]);
  });
});
