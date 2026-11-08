import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import { couple, setup } from './helpers';

describe('goals', () => {
  it('completes at the target and congratulates the partner exactly once', async () => {
    const t = setup();
    const { a, b, bId } = await couple(t);
    const id = await a.mutation(api.goals.create, { title: 'Run 5k', category: 'fitness', target: 5 });

    await a.mutation(api.goals.updateProgress, { id, current: 3 });
    expect((await b.query(api.goals.list, {}))[0]).toMatchObject({ current: 3, completed: false });

    await a.mutation(api.goals.updateProgress, { id, current: 5 });
    await a.mutation(api.goals.updateProgress, { id, current: 6 }); // nudging past done
    expect((await b.query(api.goals.list, {}))[0]).toMatchObject({ completed: true });

    const notes = await t.run((ctx) => ctx.db.query('notifications').collect());
    expect(notes.filter((n) => n.kind === 'goal' && n.userId === bId)).toHaveLength(1);
  });

  it('reopens a goal if progress drops back below target', async () => {
    const t = setup();
    const { a } = await couple(t);
    const id = await a.mutation(api.goals.create, { title: 'x', category: 'travel', target: 2, current: 2 });
    await a.mutation(api.goals.updateProgress, { id, current: 1 });
    expect((await a.query(api.goals.list, {}))[0].completed).toBe(false);
  });

  it.each([
    [{ title: ' ', target: 1 }, /Title/],
    [{ title: 'ok', target: 0 }, /Target/],
  ])('rejects invalid goals %#', async (over, err) => {
    const t = setup();
    const { a } = await couple(t);
    await expect(a.mutation(api.goals.create, { category: 'cooking', ...over })).rejects.toThrow(err);
  });

  it('rejects negative progress and missing goals', async () => {
    const t = setup();
    const { a } = await couple(t);
    const id = await a.mutation(api.goals.create, { title: 'x', category: 'cooking', target: 3 });
    await expect(a.mutation(api.goals.updateProgress, { id, current: -1 })).rejects.toThrow(/negative/);
    await a.mutation(api.goals.remove, { id });
    await expect(a.mutation(api.goals.updateProgress, { id, current: 1 })).rejects.toThrow(/not found/);
  });
});

describe('capsules', () => {
  it('creates a capsule both people can see', async () => {
    const t = setup();
    const { a, b } = await couple(t);
    await a.mutation(api.capsules.create, { title: 'Open on our anniversary', type: 'letter', unlockDate: '2027-02-14' });
    expect(await b.query(api.capsules.list, {})).toMatchObject([{ title: 'Open on our anniversary', unlockDate: '2027-02-14' }]);
  });

  it('rejects an empty title or an unparseable unlock date', async () => {
    const t = setup();
    const { a } = await couple(t);
    await expect(a.mutation(api.capsules.create, { title: '', type: 'letter', unlockDate: '2027-01-01' })).rejects.toThrow(/Title/);
    await expect(a.mutation(api.capsules.create, { title: 'x', type: 'letter', unlockDate: 'someday' })).rejects.toThrow(/unlock date/);
  });
});
