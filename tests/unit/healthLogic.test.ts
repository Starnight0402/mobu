import { describe, expect, it } from 'vitest';
import { addDays, addMonths, ageOn, localParts, localToUtc, safeTimeZone } from '../../convex/health/time';
import { dosesPerDay, slotsOn } from '../../convex/health/schedule';
import { customCode, flagFor, normaliseUnit, parseRange, toAltUnit } from '../../convex/health/labLogic';
import { periodsFrom, summarise } from '../../convex/health/cycleLogic';
import { preventionFor, screeningStatus, SCREENINGS, vaccineStatus, VACCINES } from '../../convex/health/preventionLogic';
import { interactionWarnings } from '../../convex/health/interactions';
import { buildBundle, parseBundle } from '../../convex/health/fhir';

describe('time in the couple timezone', () => {
  it('turns a local 21:30 in India into the right UTC instant and back', () => {
    const t = localToUtc('2026-11-08', '21:30', 'Asia/Kolkata');
    expect(new Date(t).toISOString()).toBe('2026-11-08T16:00:00.000Z');
    expect(localParts(t, 'Asia/Kolkata')).toEqual({ date: '2026-11-08', hm: '21:30' });
  });
  it('understands the short timezone names Settings stores', () => {
    expect(safeTimeZone('IST')).toBe('Asia/Kolkata');
    expect(safeTimeZone('PST')).toBe('America/Los_Angeles');
    expect(safeTimeZone('Asia/Dubai')).toBe('Asia/Dubai');
    expect(safeTimeZone('Nonsense/Zone')).toBe('UTC');
    expect(safeTimeZone(undefined)).toBe('UTC');
  });
  it('handles a DST day', () => {
    // 2026-03-08 is the US spring-forward day; 09:00 local is UTC-4 by then.
    expect(new Date(localToUtc('2026-03-08', '09:00', 'America/New_York')).toISOString()).toBe('2026-03-08T13:00:00.000Z');
  });
  it('adds days and months, clamping month ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(ageOn('1997-11-09', '2026-11-08')).toBe(28);
    expect(ageOn('1997-11-08', '2026-11-08')).toBe(29);
  });
});

describe('medicine schedules', () => {
  const daily = { type: 'daily' as const, times: ['21:30', '06:30'], startDate: '2026-11-01', endDate: '2026-11-30' };
  it('lists sorted times inside the course only', () => {
    expect(slotsOn(daily, '2026-11-08')).toEqual(['06:30', '21:30']);
    expect(slotsOn(daily, '2026-10-31')).toEqual([]);
    expect(slotsOn(daily, '2026-12-01')).toEqual([]);
  });
  it('handles weekly and every-N-days', () => {
    const sundays = { type: 'weekly' as const, times: ['09:00'], days: [0], startDate: '2026-01-01' };
    expect(slotsOn(sundays, '2026-11-08')).toEqual(['09:00']); // a Sunday
    expect(slotsOn(sundays, '2026-11-09')).toEqual([]);
    const every3 = { type: 'interval' as const, times: ['08:00'], everyDays: 3, startDate: '2026-11-01' };
    expect(slotsOn(every3, '2026-11-04')).toEqual(['08:00']);
    expect(slotsOn(every3, '2026-11-05')).toEqual([]);
    expect(dosesPerDay(sundays)).toBeCloseTo(1 / 7);
  });
});

describe('lab values', () => {
  it('flags high, low, near the edge and normal', () => {
    expect(flagFor(112, undefined, 100)).toBe('high');
    expect(flagFor(5.6, undefined, 5.7)).toBe('borderline');
    expect(flagFor(48, 40)).toBe('normal');
    expect(flagFor(11.2, 12, 15.5)).toBe('low');
    expect(flagFor(2.4, 0.4, 4.5)).toBe('normal');
    expect(flagFor(undefined, 1, 2)).toBeUndefined();
  });
  it("lets the doctor's target win over the lab range", () => {
    // Lab said under 130; doctor wants under 100.
    expect(flagFor(112, undefined, 130)).toBe('normal');
    expect(flagFor(112, undefined, 130, { high: 100 })).toBe('high');
  });
  it('parses printed ranges', () => {
    expect(parseRange('70 - 99')).toEqual({ low: 70, high: 99 });
    expect(parseRange('0.4–4.5')).toEqual({ low: 0.4, high: 4.5 });
    expect(parseRange('<100')).toEqual({ high: 100 });
    expect(parseRange('> 40')).toEqual({ low: 40 });
    expect(parseRange('Negative')).toEqual({});
  });
  it('normalises the SI unit back to the catalogue unit, and converts for display', () => {
    expect(normaliseUnit('glucose_fasting', 5.3, 'mmol/L')).toMatchObject({ unit: 'mg/dL', converted: true });
    expect(normaliseUnit('glucose_fasting', 5.3, 'mmol/L').value).toBeCloseTo(95.5, 0);
    expect(toAltUnit('ldl', 112)).toEqual({ value: 2.9, unit: 'mmol/L' });
    expect(customCode('Dengue NS1 Antigen')).toBe('x:dengue_ns1_antigen');
  });
});

describe('cycles', () => {
  const days = (start: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), flow: 'medium' as const }));
  const logs = [...days('2026-08-01', 5), ...days('2026-08-29', 5), ...days('2026-09-27', 4), ...days('2026-10-26', 5)];
  it('groups bleeding days into periods', () => {
    expect(periodsFrom(logs).map((p) => [p.start, p.days])).toEqual([
      ['2026-08-01', 5],
      ['2026-08-29', 5],
      ['2026-09-27', 4],
      ['2026-10-26', 5],
    ]);
  });
  it('predicts the next period and fertile window', () => {
    const s = summarise(logs, '2026-11-12');
    expect(s.cycleLengths).toEqual([28, 29, 29]);
    expect(s.avgCycle).toBe(29);
    expect(s.cycleDay).toBe(18);
    expect(s.nextStart).toBe('2026-11-24');
    expect(s.ovulation).toBe('2026-11-10');
    expect(s.fertileStart).toBe('2026-11-05');
    expect(s.flags).toEqual([]);
  });
  it('flags short cycles and long periods', () => {
    const s = summarise([...days('2026-09-01', 9), ...days('2026-09-19', 4)], '2026-10-01');
    expect(s.flags).toContain('A cycle was shorter than 21 days.');
    expect(s.flags).toContain('A period lasted more than 7 days.');
  });
});

describe('prevention', () => {
  const flu = VACCINES.find((v) => v.key === 'influenza')!;
  it('makes the flu shot due a year after the last one', () => {
    expect(vaccineStatus(flu, [{ date: '2025-10-09' }], 29, '2026-11-08')).toMatchObject({ status: 'due', dueOn: '2026-10-09' });
    expect(vaccineStatus(flu, [{ date: '2026-10-01' }], 29, '2026-11-08').status).toBe('done');
    // Nothing logged is "no record", never "overdue".
    expect(vaccineStatus(flu, [], 29, '2026-11-08').status).toBe('unknown');
  });
  it('asks for a talk about HPV between 27 and 45', () => {
    const hpv = VACCINES.find((v) => v.key === 'hpv')!;
    expect(vaccineStatus(hpv, [], 29, '2026-11-08').status).toBe('discuss');
    expect(vaccineStatus(hpv, [], 22, '2026-11-08').status).toBe('unknown');
  });
  it('moves a mammogram earlier with a family history of breast cancer', () => {
    const mammo = SCREENINGS.find((s) => s.key === 'mammogram')!;
    expect(screeningStatus(mammo, { age: 33, sex: 'female', familyText: '' }, '2026-11-08')?.status).toBe('later');
    expect(screeningStatus(mammo, { age: 33, sex: 'female', familyText: 'mother breast cancer at 54' }, '2026-11-08')?.status).toBe('unknown');
    expect(screeningStatus(mammo, { age: 33, sex: 'female', familyText: 'mother breast cancer at 54', override: { key: 'mammogram', lastDone: '2024-01-10' } }, '2026-11-08')?.status).toBe('overdue');
    expect(screeningStatus(mammo, { age: 50, sex: 'male', familyText: '' }, '2026-11-08')).toBeNull();
  });
  it('shows nothing age- or sex-specific until the profile says so', () => {
    const out = preventionFor({ sex: undefined, dob: undefined, familyText: '', immunizations: [], overrides: [], lastRecordByType: {}, today: '2026-11-08' });
    const keys = [...out.screenings, ...out.habits].map((s) => s.key);
    expect(keys).not.toContain('mammogram');
    expect(keys).not.toContain('cervical');
    expect(keys).not.toContain('colon');
    expect(out.vaccines.find((v) => v.key === 'pneumococcal')?.status).toBe('later');
    expect([...out.vaccines, ...out.screenings].filter((x) => x.status === 'due' || x.status === 'overdue')).toEqual([]);
  });
  it('counts a dental record as the last cleaning', () => {
    const out = preventionFor({ sex: 'female', dob: '1998-01-01', familyText: '', immunizations: [], overrides: [], lastRecordByType: { dental: '2026-03-10' }, today: '2026-11-08' });
    expect(out.screenings.find((s) => s.key === 'dental')).toMatchObject({ status: 'overdue', dueOn: '2026-09-10' });
    expect(out.habits.map((h) => h.key)).toContain('breast_self');
  });
});

describe('medicine interactions', () => {
  it('warns about iron with thyroid medicine and double paracetamol', () => {
    const w = interactionWarnings(['Levothyroxine', 'Ferrous ascorbate', 'Dolo 650', 'Crocin']);
    expect(w.some((x) => x.text.includes('4 hours apart'))).toBe(true);
    expect(w.some((x) => x.text.includes('paracetamol'))).toBe(true);
  });
  it('stays quiet for unrelated medicines', () => {
    expect(interactionWarnings(['Atorvastatin', 'Vitamin D3'])).toEqual([]);
  });
});

describe('FHIR', () => {
  it('round-trips labs, BP, conditions, allergies, vaccines and medicines', () => {
    const bundle = buildBundle({
      name: 'Asha',
      dob: '1997-11-09',
      sex: 'female',
      labs: [{ code: 'tsh', name: 'TSH', date: '2026-10-28', value: 2.4, unit: 'µIU/mL', refLow: 0.4, refHigh: 4.5 }],
      vitals: [{ type: 'bp', time: Date.parse('2026-11-01T03:00:00Z'), value: 118, value2: 76 }],
      history: [
        { kind: 'condition', name: 'Hypothyroidism', date: '2026-01-10', status: 'active' },
        { kind: 'allergy', name: 'Prawns', reaction: 'Lip swelling', severity: 'moderate' },
      ],
      immunizations: [{ vaccine: 'influenza', date: '2025-10-09' }],
      meds: [{ name: 'Levothyroxine', strength: '50 mcg', active: true, start: '2026-01-10' }],
    });
    const back = parseBundle(bundle);
    expect(back.labs[0]).toMatchObject({ code: 'tsh', value: 2.4, refLow: 0.4, refHigh: 4.5 });
    expect(back.vitals[0]).toMatchObject({ type: 'bp', value: 118, value2: 76 });
    expect(back.history.map((h) => h.kind).sort()).toEqual(['allergy', 'condition']);
    expect(back.vaccines[0]).toMatchObject({ vaccine: 'influenza', date: '2025-10-09' });
    expect(back.meds[0]).toMatchObject({ name: 'Levothyroxine 50 mcg', active: true });
  });
  it('rejects files that are not FHIR', () => {
    expect(() => parseBundle({ hello: 'world' })).toThrow(/FHIR/);
  });
});
