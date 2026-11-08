import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import { couple, setup } from './helpers';

describe('calls', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('rings the partner, connects when answered, and ends for both', async () => {
    const t = setup();
    const { a, b, bId } = await couple(t);

    const callId = await a.mutation(api.calls.start, { calleeId: bId });
    const ringing = await b.query(api.calls.current, {});
    expect(ringing).toMatchObject({ callId, status: 'ringing', isCaller: false, peerName: 'Asha' });

    await b.mutation(api.calls.answer, { callId });
    expect(await a.query(api.calls.current, {})).toMatchObject({ status: 'active', isCaller: true });

    await a.mutation(api.calls.end, { callId });
    expect(await a.query(api.calls.current, {})).toBeNull();
    expect(await b.query(api.calls.current, {})).toBeNull();
  });

  it('cannot answer a call the caller already hung up', async () => {
    const t = setup();
    const { a, b, bId } = await couple(t);
    const callId = await a.mutation(api.calls.start, { calleeId: bId });
    await a.mutation(api.calls.end, { callId, reason: 'hangup' });

    await expect(b.mutation(api.calls.answer, { callId })).rejects.toThrow(/already ended/);
    expect(await b.query(api.calls.current, {})).toBeNull();
  });

  it('only the callee can answer, and nobody can call themselves', async () => {
    const t = setup();
    const { a, aId, bId } = await couple(t);
    const callId = await a.mutation(api.calls.start, { calleeId: bId });
    await expect(a.mutation(api.calls.answer, { callId })).rejects.toThrow(/isn't for you/);
    await expect(a.mutation(api.calls.start, { calleeId: aId })).rejects.toThrow(/call yourself/);
  });

  it('stops ringing after 45s if the caller vanished without hanging up', async () => {
    const t = setup();
    const { a, b, bId } = await couple(t);
    await a.mutation(api.calls.start, { calleeId: bId });
    vi.advanceTimersByTime(46_000);
    expect(await b.query(api.calls.current, {})).toBeNull();
  });

  it('notifies the callee about a missed call, and only for a ring', async () => {
    const t = setup();
    const { a, b, bId } = await couple(t);
    const missed = await a.mutation(api.calls.start, { calleeId: bId });
    await a.mutation(api.calls.end, { callId: missed, reason: 'missed' });

    const answered = await a.mutation(api.calls.start, { calleeId: bId });
    await b.mutation(api.calls.answer, { callId: answered });
    await a.mutation(api.calls.end, { callId: answered, reason: 'missed' });

    const notes = await t.run((ctx) => ctx.db.query('notifications').collect());
    expect(notes.filter((n) => n.kind === 'missed-call' && n.userId === bId)).toHaveLength(1);
  });

  it('a new call clears a stale one the caller left behind', async () => {
    const t = setup();
    const { a, b, bId } = await couple(t);
    const first = await a.mutation(api.calls.start, { calleeId: bId });
    await b.mutation(api.calls.answer, { callId: first }); // tab then crashes mid-call
    const second = await a.mutation(api.calls.start, { calleeId: bId });
    expect((await b.query(api.calls.current, {}))?.callId).toBe(second);
  });

  it('delivers signals only to their addressee and purges them after', async () => {
    const t = setup();
    const { a, b, aId, bId } = await couple(t);
    const callId = await a.mutation(api.calls.start, { calleeId: bId });
    await a.mutation(api.calls.sendSignal, { callId, toUserId: bId, type: 'offer', payload: '{}' });
    await b.mutation(api.calls.sendSignal, { callId, toUserId: aId, type: 'answer', payload: '{}' });

    expect((await b.query(api.calls.signalsFor, { callId })).map((s) => s.type)).toEqual(['offer']);
    expect((await a.query(api.calls.signalsFor, { callId })).map((s) => s.type)).toEqual(['answer']);

    await a.mutation(api.calls.purgeSignals, { callId });
    expect(await b.query(api.calls.signalsFor, { callId })).toEqual([]);
  });
});
