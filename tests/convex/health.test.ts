import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import { couple, setup, type T } from './helpers';
import { localDate } from '../../convex/health/time';

const today = () => localDate(Date.now(), 'UTC');

async function file(t: T) {
  return await t.run((ctx) => ctx.storage.store(new Blob(['%PDF-1.4 test'], { type: 'application/pdf' })));
}

describe('health sharing between the two of you', () => {
  it('shows records to the partner by default, and hides them once set to hidden', async () => {
    const t = setup();
    const { a, b } = await couple(t);
    await a.mutation(api.health.records.create, { files: [], title: 'Lipid profile', source: 'manual', read: false, type: 'lab' });
    expect(await b.query(api.health.records.list, { who: 'partner' })).toHaveLength(1);

    await a.mutation(api.health.profile.setSharing, { category: 'records', level: 'hidden' });
    expect(await b.query(api.health.records.list, { who: 'partner' })).toHaveLength(0);
    expect(await b.query(api.health.records.list, { who: 'both' })).toHaveLength(0);
    expect(await a.query(api.health.records.list, { who: 'me' })).toHaveLength(1);
  });

  it('keeps "summary" records closed to opening', async () => {
    const t = setup();
    const { a, b } = await couple(t);
    const id = await a.mutation(api.health.records.create, { files: [], title: 'X-ray', source: 'manual', read: false, type: 'imaging' });
    await a.mutation(api.health.profile.setSharing, { category: 'records', level: 'summary' });
    expect(await b.query(api.health.records.list, { who: 'partner' })).toHaveLength(1);
    await expect(b.query(api.health.records.get, { id })).rejects.toThrow(/summary/);
  });

  it('hides mind by default and strips symptom notes at "summary"', async () => {
    const t = setup();
    const { a, b } = await couple(t);
    await a.mutation(api.health.mind.addCheckin, { kind: 'gad7', answers: [1, 1, 1, 1, 0, 0, 0] });
    expect(await b.query(api.health.mind.overview, { who: 'partner' })).toEqual([]);

    await a.mutation(api.health.symptoms.log, { name: 'Headache', severity: 6, notes: 'after the long call' });
    const seen = await b.query(api.health.symptoms.list, { who: 'partner', days: 7 });
    expect(seen[0]).toMatchObject({ name: 'Headache', severity: 6 });
    expect(seen[0].notes).toBeUndefined();
  });

  it('shares cycle dates but not symptoms or intimacy', async () => {
    const t = setup();
    const { a, b } = await couple(t);
    await a.mutation(api.health.profile.save, { cycleEnabled: true });
    await a.mutation(api.health.cycle.logDay, { date: today(), flow: 'medium', symptoms: ['cramps'], intimacy: 'protected' });
    const [view] = await b.query(api.health.cycle.overview, { who: 'partner' });
    expect(view.enabled).toBe(true);
    if (!view.enabled) return;
    expect(view.logs[0]).toMatchObject({ flow: 'medium' });
    expect(view.logs[0]).not.toHaveProperty('symptoms');
    expect(view.logs[0]).not.toHaveProperty('intimacy');
  });

  it('never lets one of you change the other\'s data', async () => {
    const t = setup();
    const { a, b } = await couple(t);
    const med = await a.mutation(api.health.meds.add, {
      name: 'Atorvastatin',
      kind: 'medicine',
      schedule: { type: 'daily', times: ['21:30'], startDate: today() },
    });
    await expect(b.mutation(api.health.meds.remove, { id: med })).rejects.toThrow(/your own/);
    await expect(b.mutation(api.health.meds.logDose, { medId: med, slot: `${today()}T21:30`, status: 'taken' })).rejects.toThrow(/your own/);
  });

  it('always shows the Medical ID to both, whatever the sharing settings', async () => {
    const t = setup();
    const { a, b } = await couple(t);
    await a.mutation(api.health.profile.save, { bloodGroup: 'B+' });
    await a.mutation(api.health.history.add, { kind: 'allergy', name: 'Penicillin', severity: 'severe', reaction: 'Hives' });
    for (const category of ['records', 'meds', 'visits', 'vitals', 'symptoms'] as const) {
      await a.mutation(api.health.profile.setSharing, { category, level: 'hidden' });
    }
    const [id] = await b.query(api.health.profile.medicalId, { who: 'partner' });
    expect(id).toMatchObject({ bloodGroup: 'B+', allergies: [{ name: 'Penicillin', severity: 'severe' }] });
  });
});

describe('medicines', () => {
  it('tracks stock as doses are taken and un-taken, and refuses off-schedule doses', async () => {
    const t = setup();
    const { a } = await couple(t);
    const id = await a.mutation(api.health.meds.add, {
      name: 'Levothyroxine',
      strength: '50 mcg',
      kind: 'medicine',
      schedule: { type: 'daily', times: ['06:30'], startDate: today() },
      stockCount: 10,
    });
    const slot = `${today()}T06:30`;
    await a.mutation(api.health.meds.logDose, { medId: id, slot, status: 'taken' });
    await a.mutation(api.health.meds.logDose, { medId: id, slot, status: 'taken' }); // idempotent
    expect(((await t.run((ctx) => ctx.db.get(id))) as { stockCount?: number } | null)?.stockCount).toBe(9);
    await a.mutation(api.health.meds.logDose, { medId: id, slot, status: 'skipped', reason: 'Felt sick' });
    expect(((await t.run((ctx) => ctx.db.get(id))) as { stockCount?: number } | null)?.stockCount).toBe(10);
    await expect(a.mutation(api.health.meds.logDose, { medId: id, slot: `${today()}T07:00`, status: 'taken' })).rejects.toThrow(/schedule/);
  });

  it('enforces the gap and daily maximum for as-needed medicines', async () => {
    const t = setup();
    const { a } = await couple(t);
    const id = await a.mutation(api.health.meds.add, {
      name: 'Paracetamol 650',
      kind: 'medicine',
      schedule: { type: 'prn', times: [], startDate: today() },
      prnMinGapHours: 4,
      prnMaxPerDay: 4,
    });
    expect(await a.mutation(api.health.meds.takePrn, { medId: id })).toMatchObject({ ok: true });
    const second = await a.mutation(api.health.meds.takePrn, { medId: id });
    expect(second.ok).toBe(false);
    expect(second.warning).toMatch(/too recent/);
    expect(await a.mutation(api.health.meds.takePrn, { medId: id, force: true })).toMatchObject({ ok: true });
  });

  it("shows interaction warnings on the person's list", async () => {
    const t = setup();
    const { a } = await couple(t);
    for (const name of ['Levothyroxine', 'Ferrous ascorbate']) {
      await a.mutation(api.health.meds.add, { name, kind: 'medicine', schedule: { type: 'daily', times: ['08:00'], startDate: today() } });
    }
    const [mine] = await a.query(api.health.meds.list, { who: 'me' });
    expect(mine.warnings[0].text).toMatch(/4 hours apart/);
  });
});

describe('lab results from a reviewed report', () => {
  it("saves confirmed values, converts units, and re-judges against the doctor's target", async () => {
    const t = setup();
    const { a, aId } = await couple(t);
    const storageId = await file(t);
    const id = await a.mutation(api.health.records.create, {
      files: [{ storageId, name: 'report.pdf', mime: 'application/pdf' }],
      source: 'upload',
      read: false,
    });
    await a.mutation(api.health.records.saveReview, {
      id,
      type: 'lab',
      title: 'Lipid profile + sugar',
      date: '2026-11-02',
      results: [
        { code: 'ldl', name: 'LDL Cholesterol', value: 112, unit: 'mg/dL', refText: '<130' },
        { code: 'glucose_fasting', name: 'Glucose, fasting', value: 5.3, unit: 'mmol/L', refLow: 3.9, refHigh: 5.5 },
        { name: 'Dengue NS1', valueText: 'Negative' },
      ],
    });
    let [mine] = await a.query(api.health.labs.overview, { who: 'me' });
    const ldl = mine.markers.find((m) => m.code === 'ldl')!;
    expect(ldl.latest.flag).toBe('normal'); // within the lab's <130
    const glucose = mine.markers.find((m) => m.code === 'glucose_fasting')!;
    expect(glucose.unit).toBe('mg/dL');
    expect(glucose.latest.value).toBeCloseTo(95.5, 0);
    expect(mine.markers.some((m) => m.code === 'x:dengue_ns1')).toBe(true);

    await a.mutation(api.health.labs.setTarget, { code: 'ldl', high: 100, setBy: 'Dr. Mehta' });
    [mine] = await a.query(api.health.labs.overview, { who: 'me' });
    expect(mine.markers.find((m) => m.code === 'ldl')!.latest.flag).toBe('high');

    const summary = await a.query(api.health.summary.today, {});
    expect(summary.attention.some((x) => x.title.startsWith('LDL cholesterol is above'))).toBe(true);
    const record = await a.query(api.health.records.get, { id });
    expect(record?.results).toHaveLength(3);
    expect(record?.ownerId).toBe(aId);
  });
});

describe('doctor share links', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('opens a view-only page, counts the open, and stops working once revoked', async () => {
    vi.stubEnv('CONVEX_SITE_URL', 'https://example.convex.site');
    const t = setup();
    const { a } = await couple(t);
    await a.mutation(api.health.history.add, { kind: 'allergy', name: 'Penicillin', severity: 'severe' });
    await a.mutation(api.health.meds.add, { name: 'Atorvastatin', strength: '10 mg', kind: 'medicine', schedule: { type: 'daily', times: ['21:30'], startDate: today() } });
    const { token, url } = await a.action(api.health.sharing.createLink, { kind: 'doctor', scopes: ['meds', 'allergies'], hours: 24 });
    expect(url).toContain(`/health/share?t=${token}`);

    const res = await t.fetch(`/health/share?t=${token}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Penicillin');
    expect(html).toContain('Atorvastatin 10 mg');
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const [link] = await a.query(api.health.sharing.links, {});
    expect(link.opens).toBe(1);
    await a.mutation(api.health.sharing.revokeLink, { id: link._id });
    expect((await t.fetch(`/health/share?t=${token}`)).status).toBe(404);
  });

  it('escapes what people typed', async () => {
    vi.stubEnv('CONVEX_SITE_URL', 'https://example.convex.site');
    const t = setup();
    const { a } = await couple(t);
    await a.mutation(api.health.history.add, { kind: 'allergy', name: '<script>alert(1)</script>' });
    const { token } = await a.action(api.health.sharing.createLink, { kind: 'medid', scopes: [] });
    const html = await (await t.fetch(`/health/share?t=${token}`)).text();
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('care mode', () => {
  it('lets the carer log for the patient and runs a shared dose timer', async () => {
    const t = setup();
    const { a, b, bId } = await couple(t);
    const episodeId = await a.mutation(api.health.care.start, { patient: 'partner', title: 'Viral fever' });
    await a.mutation(api.health.care.log, { episodeId, kind: 'temp', value: 38.9 });
    await b.mutation(api.health.care.log, { episodeId, kind: 'med', medName: 'Paracetamol 650' });
    const [view] = await a.query(api.health.care.active, {});
    expect(view.episode.ownerId).toBe(bId);
    expect(view.logs).toHaveLength(2);
    expect(view.timers[0]).toMatchObject({ medName: 'Paracetamol 650', countToday: 1, maxPerDay: 4 });
    expect(view.timers[0].nextAt! - view.timers[0].lastAt).toBe(4 * 3_600_000);
    const notes = await t.run((ctx) => ctx.db.query('notifications').collect());
    expect(notes.some((n) => n.userId === bId && n.kind === 'health')).toBe(true);
  });
});

describe('reminders', () => {
  afterEach(() => vi.useRealTimers());

  it('reminds at dose time once, then nudges the partner an hour later without the name', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T21:31:00Z'));
    const t = setup();
    const { a, aId, bId } = await couple(t);
    await a.mutation(api.health.meds.add, {
      name: 'Atorvastatin',
      kind: 'medicine',
      schedule: { type: 'daily', times: ['21:30'], startDate: '2026-11-01' },
    });
    await t.mutation(internal.health.reminders.tick, {});
    await t.mutation(internal.health.reminders.tick, {});
    let notes = await t.run((ctx) => ctx.db.query('notifications').collect());
    expect(notes.filter((n) => n.userId === aId)).toHaveLength(1);
    expect(notes[0].title).toBe('Time for your 21:30 medicine'); // details hidden by default

    vi.setSystemTime(new Date('2026-11-08T22:35:00Z'));
    await t.mutation(internal.health.reminders.tick, {});
    notes = await t.run((ctx) => ctx.db.query('notifications').collect());
    const nudge = notes.find((n) => n.userId === bId);
    expect(nudge?.title).toMatch(/21:30 dose isn't marked/);
    expect(nudge?.title).not.toMatch(/Atorvastatin/);
  });
});

describe('health data controls', () => {
  it("deletes only the caller's health data", async () => {
    const t = setup();
    const { a, b } = await couple(t);
    await a.mutation(api.health.history.add, { kind: 'allergy', name: 'Penicillin' });
    await a.mutation(api.health.vitals.add, { type: 'weight', value: 74 });
    await b.mutation(api.health.history.add, { kind: 'allergy', name: 'Prawns' });
    await a.mutation(api.health.profile.deleteMine, { confirm: 'DELETE' });
    const [mine] = await a.query(api.health.history.list, { who: 'me' });
    expect(mine.items).toHaveLength(0);
    const [theirs] = await b.query(api.health.history.list, { who: 'me' });
    expect(theirs.items).toHaveLength(1);
    expect(await a.query(api.health.vitals.series, { who: 'me', type: 'weight', days: 30 })).toEqual([{ userId: expect.anything(), isMe: true, points: [] }]);
  });

  it('keeps a record as typed when AI reading is switched off', async () => {
    const t = setup();
    const { a } = await couple(t);
    await a.mutation(api.health.profile.save, { aiReading: false });
    const storageId = await file(t);
    const id = await a.mutation(api.health.records.create, { files: [{ storageId, name: 'r.pdf', mime: 'application/pdf' }], title: 'My report', source: 'upload', read: true });
    const rec = await a.query(api.health.records.get, { id });
    expect(rec?.status).toBe('saved');
  });

  it('upserts Health Connect readings by id and fills cycle days without overwriting', async () => {
    const t = setup();
    const { a } = await couple(t);
    const reading = { hcId: 'hc-1', type: 'weight' as const, time: Date.now() - 1000, value: 74.2, source: 'Galaxy Watch' };
    expect(await a.mutation(api.health.vitals.importHealthConnect, { vitals: [reading] })).toEqual({ added: 1, updated: 0 });
    expect(await a.mutation(api.health.vitals.importHealthConnect, { vitals: [reading] })).toEqual({ added: 0, updated: 0 });
    expect(await a.mutation(api.health.vitals.importHealthConnect, { vitals: [{ ...reading, value: 74.0 }] })).toEqual({ added: 0, updated: 1 });
    // Absurd values are dropped, not stored.
    expect(await a.mutation(api.health.vitals.importHealthConnect, { vitals: [{ ...reading, hcId: 'hc-2', value: 9000 }] })).toEqual({ added: 0, updated: 0 });

    await a.mutation(api.health.cycle.logDay, { date: today(), flow: 'heavy' });
    await a.mutation(api.health.vitals.importHealthConnect, { vitals: [], cycle: [{ date: today(), flow: 'light', bbt: 36.5 }] });
    const [c] = await a.query(api.health.cycle.overview, { who: 'me' });
    if (!c.enabled) {
      await a.mutation(api.health.profile.save, { cycleEnabled: true });
    }
    const [c2] = await a.query(api.health.cycle.overview, { who: 'me' });
    expect(c2.enabled && c2.logs[0]).toMatchObject({ flow: 'heavy', bbt: 36.5 });
  });

  it('rejects implausible readings and a bottom BP number above the top', async () => {
    const t = setup();
    const { a } = await couple(t);
    await expect(a.mutation(api.health.vitals.add, { type: 'bp', value: 80, value2: 120 })).rejects.toThrow(/top number/);
    await expect(a.mutation(api.health.vitals.add, { type: 'weight', value: 740 })).rejects.toThrow(/look right/);
  });
});
