import { describe, expect, it } from 'vitest';
import { computeChatStats, detectConflicts, detectConnection, parseWhatsApp } from '../../convex/chatAnalysis';

/**
 * The whole chat import (parse → stats → both detectors) runs inside a single
 * Convex action, which has a hard execution limit. The detectors scan every
 * 4-hour window, so cost grows with message *density*, not just count.
 *
 * Fixture: 30k messages (2x the real 14.7k-message export the heuristics
 * were tuned on), including dense burst days, which are the worst case.
 */
const LINES = [
  'good morning baby', 'what are you doing', 'office se aa rahi hu', 'miss you jaan',
  'you never listen to me', 'i am upset', 'sorry baby, my bad', 'kya kar rahe ho',
  'proud of you, you deserve this', 'thank you so much', 'ok.', 'nothing',
  'aaj bahut thak gayi', 'love you ❤️', 'call later?', 'whatever makes you satisfied',
];

function syntheticExport(count: number): string {
  const out: string[] = [];
  let t = Date.UTC(2024, 0, 1, 8);
  for (let i = 0; i < count; i++) {
    // Every 10th day is a 300-message burst (messages 30s apart).
    const burst = Math.floor(i / 300) % 10 === 0;
    t += burst ? 30_000 : 25 * 60_000;
    const d = new Date(t);
    const sender = (i * 7) % 3 === 0 ? 'Asha' : 'Bilal';
    const stamp = `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${String(d.getUTCFullYear()).slice(2)}, ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    out.push(`${stamp} - ${sender}: ${LINES[(i * 13) % LINES.length]}`);
  }
  return out.join('\n');
}

// Measured ~1.1s on a dev laptop; CI runners are 2-3x slower. An accidental
// O(n²) scan at this size blows straight through it.
const BUDGET_MS = 5_000;

describe('chat import pipeline performance', () => {
  it(`analyses 30k messages in under ${BUDGET_MS / 1000}s`, () => {
    const raw = syntheticExport(30_000);

    const t0 = performance.now();
    const msgs = parseWhatsApp(raw);
    const t1 = performance.now();
    const stats = computeChatStats(msgs);
    const t2 = performance.now();
    detectConflicts(msgs, stats);
    const t3 = performance.now();
    detectConnection(msgs, stats);
    const t4 = performance.now();

    const report = {
      parse: Math.round(t1 - t0),
      stats: Math.round(t2 - t1),
      conflicts: Math.round(t3 - t2),
      connection: Math.round(t4 - t3),
      total: Math.round(t4 - t0),
    };
    console.log('chat pipeline ms', report);

    expect(msgs).toHaveLength(30_000);
    expect(report.total).toBeLessThan(BUDGET_MS);
  });
});
