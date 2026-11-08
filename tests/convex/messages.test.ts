import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import { couple, setup } from './helpers';

const texts = (r: { messages: { text?: string }[] }) => r.messages.map((m) => m.text);

describe('chat', () => {
  afterEach(() => vi.useRealTimers());

  it('delivers a message to the partner with a notification', async () => {
    const t = setup();
    const { a, b, bId } = await couple(t);
    await a.mutation(api.messages.send, { text: 'hi' });

    expect(texts(await b.query(api.messages.list, {}))).toEqual(['hi']);
    const [note] = await b.query(api.notifications.list, {});
    expect(note).toMatchObject({ userId: bId, kind: 'message', title: 'Asha', body: 'hi' });
  });

  it('refuses an empty message', async () => {
    const t = setup();
    const { a } = await couple(t);
    await expect(a.mutation(api.messages.send, {})).rejects.toThrow(/Empty message/);
  });

  it('tracks sent → delivered → read', async () => {
    const t = setup();
    const { a, b } = await couple(t);
    await a.mutation(api.messages.send, { text: 'ping' });
    expect(await b.query(api.messages.hasUndelivered, {})).toBe(true);
    expect(await a.query(api.messages.hasUndelivered, {})).toBe(false); // own messages don't count

    await b.mutation(api.messages.markDelivered, {});
    expect(await b.query(api.messages.hasUndelivered, {})).toBe(false);

    await b.mutation(api.messages.markRead, {});
    const [m] = (await a.query(api.messages.list, {})).messages;
    expect(m.deliveredAt).toBeTypeOf('number');
    expect(m.readAt).toBeTypeOf('number');
  });

  it('marking read never stamps your own messages', async () => {
    const t = setup();
    const { a } = await couple(t);
    await a.mutation(api.messages.send, { text: 'mine' });
    await a.mutation(api.messages.markRead, {});
    const [m] = (await a.query(api.messages.list, {})).messages;
    expect(m.readAt).toBeUndefined();
  });

  it('keeps working once the chat history is longer than Convex will scan', async () => {
    // markRead used to .filter() the whole table. On a real Convex backend
    // that fails at this size ("too many system operations"; verified against
    // a local backend with 34k messages). convex-test counts only documents a
    // .filter() *matches*, not ones it scans, so it can't reproduce that
    // exact failure -- but this still catches a regression to an unfiltered
    // read, which does trip the 32k limit here.
    const t = setup();
    const { a, b, aId } = await couple(t);
    for (let batch = 0; batch < 4; batch++) {
      await t.run(async (ctx) => {
        for (let i = 0; i < 8_500; i++) {
          await ctx.db.insert('messages', { senderId: aId, text: 'old', deliveredAt: 1, readAt: 1 });
        }
      });
    }
    await a.mutation(api.messages.send, { text: 'new' });
    await expect(b.mutation(api.messages.markRead, {})).resolves.toBeNull();
  }, 120_000);

  it('unsend removes the content for both but leaves a placeholder', async () => {
    const t = setup();
    const { a, b } = await couple(t);
    const id = await a.mutation(api.messages.send, { text: 'oops' });
    await expect(b.mutation(api.messages.deleteForEveryone, { id })).rejects.toThrow(/Only the sender/);
    await a.mutation(api.messages.deleteForEveryone, { id });

    const [m] = (await b.query(api.messages.list, {})).messages;
    expect(m.text).toBeUndefined();
    expect(m.deletedAt).toBeTypeOf('number');
  });

  it('delete-for-me hides it on one side, and removes it once both have', async () => {
    const t = setup();
    const { a, b } = await couple(t);
    const id = await a.mutation(api.messages.send, { text: 'secret' });

    await a.mutation(api.messages.deleteForMe, { id });
    expect(texts(await a.query(api.messages.list, {}))).toEqual([]);
    expect(texts(await b.query(api.messages.list, {}))).toEqual(['secret']);

    await b.mutation(api.messages.deleteForMe, { id });
    expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
  });

  it('clear chat only clears your own view', async () => {
    const t = setup();
    const { a, b } = await couple(t);
    vi.useFakeTimers();
    await a.mutation(api.messages.send, { text: 'before' });
    vi.advanceTimersByTime(1_000);
    await a.mutation(api.messages.clearChat, {});
    // Real clocks: on a fast machine the next message could land in the same
    // millisecond as the clear and tie on _creationTime. People don't type
    // that fast; the fake clock keeps the test deterministic.
    vi.advanceTimersByTime(1_000);
    await b.mutation(api.messages.send, { text: 'after' });
    vi.useRealTimers();

    expect(texts(await a.query(api.messages.list, {}))).toEqual(['after']);
    expect(texts(await b.query(api.messages.list, {}))).toEqual(['before', 'after']);
  });

  it('pages: newest N, oldest first, with hasMore', async () => {
    const t = setup();
    const { a } = await couple(t);
    for (const text of ['1', '2', '3']) await a.mutation(api.messages.send, { text });
    const page = await a.query(api.messages.list, { limit: 2 });
    expect(texts(page)).toEqual(['2', '3']);
    expect(page.hasMore).toBe(true);
  });
});
