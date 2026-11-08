import { describe, expect, it } from 'vitest';
import {
  computeChatStats,
  detectConflicts,
  detectConnection,
  parseWhatsApp,
  type ParsedMessage,
} from '../../convex/chatAnalysis';
import { scoreMessage } from '../../convex/chatLexicon';

// Every test runs with TZ=UTC (see tests/setup/timezone.ts), matching the
// Convex runtime where the import action actually executes.

describe('parseWhatsApp', () => {
  it('parses the Android export format with 12-hour times', () => {
    const msgs = parseWhatsApp('12/4/24, 9:41 pm - Swati: hello there');
    expect(msgs).toEqual([
      { sender: 'Swati', text: 'hello there', sentAt: Date.UTC(2024, 3, 12, 21, 41), isMedia: false },
    ]);
  });

  it('parses the iOS format with seconds and brackets', () => {
    const [m] = parseWhatsApp('[12/4/24, 9:41:02 AM] Amritanshu: morning');
    expect(m.sender).toBe('Amritanshu');
    expect(m.sentAt).toBe(Date.UTC(2024, 3, 12, 9, 41, 2));
  });

  it('maps 12 am to midnight and 12 pm to noon', () => {
    const [am, pm] = parseWhatsApp('1/1/25, 12:05 am - A: x\n1/1/25, 12:05 pm - A: y');
    expect(new Date(am.sentAt).getUTCHours()).toBe(0);
    expect(new Date(pm.sentAt).getUTCHours()).toBe(12);
  });

  it('parses 24-hour exports and four-digit years', () => {
    const [m] = parseWhatsApp('05/06/2023, 23:15 - A: late');
    expect(m.sentAt).toBe(Date.UTC(2023, 5, 5, 23, 15));
  });

  it('folds continuation lines into the previous message', () => {
    const msgs = parseWhatsApp('1/1/25, 10:00 am - A: line one\nline two\n\nline three\n1/1/25, 10:01 am - B: ok');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].text).toBe('line one\nline two\nline three');
  });

  it('drops WhatsApp system notices and flags media', () => {
    const msgs = parseWhatsApp(
      [
        '1/1/25, 10:00 am - A: Messages and calls are end-to-end encrypted.',
        '1/1/25, 10:01 am - A: This message was deleted',
        '1/1/25, 10:02 am - B: <Media omitted>',
        '1/1/25, 10:03 am - B: real text',
      ].join('\n'),
    );
    expect(msgs.map((m) => [m.text, m.isMedia])).toEqual([
      ['<Media omitted>', true],
      ['real text', false],
    ]);
  });

  it('strips the invisible left-to-right marks WhatsApp inserts', () => {
    const [m] = parseWhatsApp('‎[1/1/25, 10:00:00 AM] A: ‎image omitted');
    expect(m).toMatchObject({ sender: 'A', isMedia: true });
  });

  it('handles CRLF exports from Windows', () => {
    expect(parseWhatsApp('1/1/25, 10:00 am - A: x\r\n1/1/25, 10:01 am - B: y\r\n')).toHaveLength(2);
  });
});

describe('scoreMessage', () => {
  it('treats affectionate filler as warm, not negative', () => {
    const s = scoreMessage('sorry baby, love you ❤️');
    expect(s.affection).toBe(true);
    expect(s.negative).toBe(0);
  });

  it('detects Hinglish hurt and accusation', () => {
    const s = scoreMessage('tumne kyu nahi bataya, bura laga mujhe');
    expect(s.hurt).toBe(true);
    expect(s.negative).toBeGreaterThanOrEqual(3);
  });

  it('only counts a denial when it is the whole message', () => {
    expect(scoreMessage('nothing.').denial).toBe(true);
    expect(scoreMessage('nothing much, just watching tv').denial).toBe(false);
  });

  it('matches single words on word boundaries only', () => {
    // "shak" (suspicion) must not fire inside "shakshuka".
    expect(scoreMessage('made shakshuka today').trust).toBe(false);
    expect(scoreMessage('mujhe shak hai').trust).toBe(true);
  });

  it('zeroes warmth inside an accusation', () => {
    expect(scoreMessage('you never say you are proud of you').positive).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Detector scenarios
 * ------------------------------------------------------------------ */

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2025, 0, 1, 10);

function chat(lines: Array<[sender: string, text: string]>, start: number, gapMs = 3 * 60 * 1000): ParsedMessage[] {
  return lines.map(([sender, text], i) => ({ sender, text, sentAt: start + i * gapMs, isMedia: false }));
}

/** Ten days of the couple's ordinary warm baseline, so each person has a norm to fall below. */
function warmBaseline(): ParsedMessage[] {
  const out: ParsedMessage[] = [];
  for (let d = 0; d < 10; d++) {
    out.push(
      ...chat(
        [
          ['A', 'good morning baby'],
          ['B', 'good morning jaan, love you'],
          ['A', 'what are you doing today'],
          ['B', 'office, then gym. miss you'],
          ['A', 'miss you too baby'],
          ['B', 'call later?'],
          ['A', 'yes babe'],
          ['B', 'good night ❤️'],
        ],
        T0 + d * DAY,
      ),
    );
  }
  return out;
}

const FIGHT: Array<[string, string]> = [
  ['A', 'why did you not tell me you went out with them'],
  ['B', 'you never let me explain anything'],
  ['A', 'you always do this, you hid it from me'],
  ['B', 'i am upset that you think that'],
  ['A', 'ok.'],
  ['B', 'you made me feel like a liar'],
  ['A', 'it hurt me that you lied'],
  ['B', 'fine. i will not bring it up again. i wont bring it up'],
  ['A', 'whatever makes you satisfied'],
  ['B', 'nothing'],
  ['A', 'you said you would call and you didnt even'],
  ['B', 'not fair, i am done talking'],
];

describe('detectConflicts', () => {
  it('finds nothing in a chat that is warm every day', () => {
    const msgs = warmBaseline();
    expect(detectConflicts(msgs, computeChatStats(msgs))).toEqual([]);
  });

  it('finds the fight, attributes it, and reports it without a repair', () => {
    const fightStart = T0 + 10 * DAY;
    const msgs = [...warmBaseline(), ...chat(FIGHT, fightStart)];
    const episodes = detectConflicts(msgs, computeChatStats(msgs));

    expect(episodes).toHaveLength(1);
    const [e] = episodes;
    expect(e.kind).toBe('conflict');
    expect(e.date).toBe('2025-01-11');
    expect(e.startedAt).toBeGreaterThanOrEqual(fightStart);
    expect(e.openedBy).toBe('A');
    expect(e.repaired).toBe(false);
    expect(e.severity).toBeGreaterThanOrEqual(1);
    expect(e.severity).toBeLessThanOrEqual(5);
    expect(e.messageCount).toBe(e.context.messagesInEpisode);
    expect(e.excerpts.length).toBeGreaterThan(0);
  });

  it('marks the fight repaired and credits whoever apologised last', () => {
    const msgs = [
      ...warmBaseline(),
      ...chat([...FIGHT, ['B', "i'm sorry, i was wrong"], ['A', 'my bad too']], T0 + 10 * DAY),
    ];
    const [e] = detectConflicts(msgs, computeChatStats(msgs));
    expect(e.repaired).toBe(true);
    expect(e.closedBy).toBe('A');
  });

  it('does not call it a fight when only one person is negative', () => {
    // One person venting about work while the other comforts is not an argument.
    const vent: Array<[string, string]> = FIGHT.map(([, text], i) =>
      i % 2 === 0 ? (['A', text] as [string, string]) : (['B', 'aww baby, i am here for you'] as [string, string]),
    );
    const msgs = [...warmBaseline(), ...chat(vent, T0 + 10 * DAY)];
    expect(detectConflicts(msgs, computeChatStats(msgs))).toEqual([]);
  });

  it('returns nothing for tiny chats', () => {
    const msgs = chat([['A', 'hi'], ['B', 'hi']], T0);
    expect(detectConflicts(msgs, computeChatStats(msgs))).toEqual([]);
  });
});

describe('detectConnection', () => {
  const DEEP: Array<[string, string]> = [
    ['A', 'i am so proud of you, you deserve this job'],
    ['B', 'thank you for always believing in me, means a lot'],
    ['A', 'i believe in you. you can do it'],
    ['B', 'thank you jaan. grateful for you'],
    ['A', 'congratulations again, so happy for you'],
    ['B', 'you are amazing, thank you for being there'],
    ['A', 'well done baby, you got this'],
    ['B', 'thank you, i love you'],
  ];

  it('finds a warm two-sided conversation and labels what carried it', () => {
    const msgs = [...warmBaseline(), ...chat(DEEP, T0 + 10 * DAY)];
    const episodes = detectConnection(msgs, computeChatStats(msgs));
    expect(episodes.length).toBeGreaterThanOrEqual(1);
    const e = episodes.find((x) => x.date === '2025-01-11')!;
    expect(e).toBeDefined();
    expect(e.kind).toBe('connection');
    expect(e.repaired).toBe(true); // both people took part
    expect(e.context.signals).toContain('Backing each other');
  });

  it('never reports a fight as a connection', () => {
    const msgs = [...warmBaseline(), ...chat(FIGHT, T0 + 10 * DAY)];
    const eps = detectConnection(msgs, computeChatStats(msgs));
    expect(eps.filter((e) => e.date === '2025-01-11')).toEqual([]);
  });
});
