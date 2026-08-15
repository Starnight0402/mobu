/**
 * Pure chat-analysis functions: parsing, statistics, and conflict detection.
 *
 * Deliberately free of Convex imports so everything here is a plain function
 * over an in-memory array -- the import action computes all of it in one pass
 * before anything is written, and never reads the messages back out of the DB.
 *
 * The detection heuristics were tuned against a real 14.7k-message export
 * rather than picked off a list: keyword scoring alone produced mostly false
 * positives, because affectionate filler ("wtf", "sorry") is extremely common
 * in ordinary conversation. Long paragraph messages turned out to be the
 * reliable tell -- people write essays when working something out and almost
 * never otherwise.
 */

import { scoreMessage, hinglishRatio, REPAIR_RE, AFFECTION_RE } from "./chatLexicon";

export interface ParsedMessage {
  sender: string;
  text: string;
  sentAt: number;
  isMedia: boolean;
}

// Android ("12/4/24, 9:41 pm - Name: text") and iOS ("[12/4/24, 9:41:02 PM] Name: text").
const LINE_RE =
  /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s?([APap][Mm])?\]?\s*-?\s*([^:]+):\s([\s\S]*)$/;

const MEDIA_RE =
  /<Media omitted>|image omitted|video omitted|sticker omitted|audio omitted|document omitted|GIF omitted/i;

// WhatsApp's own notices, which aren't messages from either person.
const SYSTEM_RE =
  /^(Messages and calls are end-to-end|.* is a contact$|You deleted this message|This message was deleted|Missed voice call|Missed video call)/;

export function parseWhatsApp(raw: string): ParsedMessage[] {
  const out: ParsedMessage[] = [];
  for (const line of raw.split(/\r?\n/)) {
    // Strip the LTR marks WhatsApp sprinkles through exports.
    const clean = line.replace(/‎/g, "");
    const m = clean.match(LINE_RE);
    if (m) {
      const [, d, mo, y, hh, mm, ss, ampm, sender, text] = m;
      let hour = parseInt(hh, 10);
      if (ampm) {
        const isPM = /p/i.test(ampm);
        if (isPM && hour !== 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;
      }
      const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
      const sentAt = new Date(
        year,
        parseInt(mo, 10) - 1,
        parseInt(d, 10),
        hour,
        parseInt(mm, 10),
        ss ? parseInt(ss, 10) : 0,
      ).getTime();
      if (SYSTEM_RE.test(text)) continue;
      out.push({ sender: sender.trim(), text, sentAt, isMedia: MEDIA_RE.test(text) });
    } else if (out.length > 0 && clean.trim()) {
      // Continuation line of a multi-line message.
      out[out.length - 1].text += "\n" + clean;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Statistics
 * ------------------------------------------------------------------ */

// One threshold drives both "this reply doesn't count as a response time" and
// "whoever speaks next is starting a new conversation", so the two stats can
// never tell contradictory stories about the same gap.
const GAP_MS = 4 * 60 * 60 * 1000;

const STOPWORDS = new Set(
  (
    // English
    "the a an and or but if then than that this these those i you he she it we they me him her them my your his its our their is am are was were be been being do does did done have has had will would can could should shall may might must not no yes so just very really too also as at by for from in into of on to with about up down out off over under again once here there when where why how all any both each few more most other some such only own same s t don now got get go going went come came take took know knew think thought say said see saw want wanted need needed like liked make made time day today tomorrow yesterday okay ok yeah yep nope hey hi hello bye good great nice well much many lot bit even still back way thing things one two three "
    // Hinglish -- code-mixed transliteration, no standard stopword list exists,
    // so this is a hand-picked "good enough" set from the real export.
    + "hai hain ho hu hoon tha thi the ka ki ke ko se me mein par pe aur ya nahi na nai bhi hi to toh kya kyu kyun kaise kab kahan koi kuch sab yeh ye woh wo main mera meri mere tera teri tere aap aapka tum tumhara hum hamara raha rahi rahe kar karo kiya karna karke liye wala wali abhi acha accha bas ek do teen phir agar lekin jab tab jo us is ab bohot bahut thoda zyada matlab arre aare are haan ha nahin gaya gayi gaye diya di de dena lena liya milega hoga hogi honge sakta sakte sakti chahiye pata baat "
  ).split(/\s+/).filter(Boolean),
);

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(t: number): string {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return dayKey(d.getTime());
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface ChatStats {
  totalMessages: number;
  dateRange: { start: number; end: number };
  daysCovered: number;
  spanDays: number;
  avgPerDay: number;
  senders: string[];
  bySender: Record<
    string,
    {
      messages: number;
      words: number;
      media: number;
      avgMessageLength: number;
      questionRate: number;
      longMessages: number;
    }
  >;
  dailyCounts: Array<Record<string, number | string>>;
  weeklyCounts: Array<Record<string, number | string>>;
  monthlyCounts: Array<Record<string, number | string>>;
  hourlyHeatmap: number[][];
  responseTimes: Record<string, { avgMinutes: number; medianMinutes: number; samples: number }>;
  streaks: { longest: number; current: number };
  longestSilence: { hours: number; start: number; end: number };
  initiations: Record<string, number>;
  doubleTexts: Record<string, number>;
  topWords: Record<string, Array<[string, number]>>;
  topEmojis: Array<[string, number]>;
  mediaCount: number;
  /** Per-sender split of English vs romanised-Hindi vocabulary. */
  languageMix: Record<string, { hinglishShare: number; topHindi: Array<[string, number]>; topEnglish: Array<[string, number]> }>;
  /** Per-sender tone counts from the bilingual lexicon. */
  tone: Record<
    string,
    { affection: number; accusation: number; hurt: number; trust: number; repair: number; distress: number }
  >;
}

// Romanised-Hindi vocabulary worth surfacing (the stopword list strips the
// grammatical glue, so this catches the content words that survive).
const HINDI_CONTENT =
  /^(pyaar|pyar|jaan|jaanu|bacha|baccha|khana|khana|ghar|office|neend|so|soja|sona|uthna|yaad|miss|dil|man|mann|zindagi|shaadi|shadi|pareshan|gussa|naraz|naaraz|maaf|maafi|galti|jhoot|bharosa|shak|takleef|dukh|khush|khushi|acha|accha|theek|thik|bura|sach|paisa|paise|kaam|thak|thaka|thaki|bhookh|bhook|chai|pani|garmi|thand|barish|raat|subah|shaam|din|kal|aaj|parso|jaldi|dhyan|tension|masti|bakwas|pagal|paagal|cute|bore|mazaa|maza)$/;

export function computeChatStats(msgs: ParsedMessage[]): ChatStats {
  const senders = [...new Set(msgs.map((m) => m.sender))];
  const bySender: ChatStats["bySender"] = {};
  const wordFreq: Record<string, Map<string, number>> = {};
  const emojiFreq = new Map<string, number>();

  for (const s of senders) {
    bySender[s] = {
      messages: 0,
      words: 0,
      media: 0,
      avgMessageLength: 0,
      questionRate: 0,
      longMessages: 0,
    };
    wordFreq[s] = new Map();
  }

  const tone: ChatStats["tone"] = {};
  const hinglishSum: Record<string, number> = {};
  for (const s of senders) {
    tone[s] = { affection: 0, accusation: 0, hurt: 0, trust: 0, repair: 0, distress: 0 };
    hinglishSum[s] = 0;
  }

  const daily = new Map<string, Map<string, number>>();
  const weekly = new Map<string, Map<string, number>>();
  const monthly = new Map<string, Map<string, number>>();
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));

  let totalChars: Record<string, number> = {};
  let questions: Record<string, number> = {};
  for (const s of senders) {
    totalChars[s] = 0;
    questions[s] = 0;
  }

  const bump = (map: Map<string, Map<string, number>>, key: string, sender: string) => {
    if (!map.has(key)) map.set(key, new Map());
    const inner = map.get(key)!;
    inner.set(sender, (inner.get(sender) ?? 0) + 1);
  };

  for (const m of msgs) {
    const s = bySender[m.sender];
    s.messages++;
    if (m.isMedia) s.media++;
    const words = m.text.trim().split(/\s+/).filter(Boolean);
    s.words += words.length;
    totalChars[m.sender] += m.text.length;
    if (m.text.trim().endsWith("?")) questions[m.sender]++;
    if (m.text.length > 220) s.longMessages++;

    if (!m.isMedia) {
      const sent = scoreMessage(m.text);
      if (sent.affection) tone[m.sender].affection++;
      if (sent.accusation) tone[m.sender].accusation++;
      if (sent.hurt) tone[m.sender].hurt++;
      if (sent.trust) tone[m.sender].trust++;
      if (sent.repair) tone[m.sender].repair++;
      if (sent.distress) tone[m.sender].distress++;
      hinglishSum[m.sender] += hinglishRatio(m.text);

      for (const raw of words) {
        const w = raw.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
        if (w.length < 3 || STOPWORDS.has(w)) continue;
        wordFreq[m.sender].set(w, (wordFreq[m.sender].get(w) ?? 0) + 1);
      }
      for (const e of m.text.match(EMOJI_RE) ?? []) {
        emojiFreq.set(e, (emojiFreq.get(e) ?? 0) + 1);
      }
    }

    bump(daily, dayKey(m.sentAt), m.sender);
    bump(weekly, weekKey(m.sentAt), m.sender);
    bump(monthly, monthKey(m.sentAt), m.sender);
    const d = new Date(m.sentAt);
    heatmap[d.getDay()][d.getHours()]++;
  }

  for (const s of senders) {
    bySender[s].avgMessageLength =
      bySender[s].messages > 0 ? +(totalChars[s] / bySender[s].messages).toFixed(1) : 0;
    bySender[s].questionRate =
      bySender[s].messages > 0 ? +(questions[s] / bySender[s].messages).toFixed(3) : 0;
  }

  // Response times, initiations, double-texts -- all from one walk.
  const replyGaps: Record<string, number[]> = {};
  const initiations: Record<string, number> = {};
  const doubleTexts: Record<string, number> = {};
  for (const s of senders) {
    replyGaps[s] = [];
    initiations[s] = 0;
    doubleTexts[s] = 0;
  }
  let longestSilence = { hours: 0, start: 0, end: 0 };

  if (msgs.length > 0) initiations[msgs[0].sender]++;
  for (let i = 1; i < msgs.length; i++) {
    const prev = msgs[i - 1];
    const cur = msgs[i];
    const gap = cur.sentAt - prev.sentAt;
    if (gap > longestSilence.hours * 3600000) {
      longestSilence = { hours: +(gap / 3600000).toFixed(1), start: prev.sentAt, end: cur.sentAt };
    }
    if (cur.sender === prev.sender) {
      doubleTexts[cur.sender]++;
    } else if (gap >= GAP_MS) {
      initiations[cur.sender]++;
    } else {
      replyGaps[cur.sender].push(gap / 60000);
    }
  }

  const responseTimes: ChatStats["responseTimes"] = {};
  for (const s of senders) {
    const g = replyGaps[s];
    responseTimes[s] = {
      avgMinutes: g.length ? +(g.reduce((a, b) => a + b, 0) / g.length).toFixed(1) : 0,
      medianMinutes: +median(g).toFixed(1),
      samples: g.length,
    };
  }

  // Streaks: consecutive days where BOTH people sent something.
  const dayKeys = [...daily.keys()].sort();
  const bothDays = new Set(
    dayKeys.filter((k) => (daily.get(k)?.size ?? 0) >= Math.min(2, senders.length)),
  );
  let longest = 0;
  let run = 0;
  const first = dayKeys[0] ? new Date(dayKeys[0]) : new Date();
  const last = dayKeys.length ? new Date(dayKeys[dayKeys.length - 1]) : new Date();
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    if (bothDays.has(dayKey(d.getTime()))) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  let current = 0;
  for (let d = new Date(last); d >= first; d.setDate(d.getDate() - 1)) {
    if (bothDays.has(dayKey(d.getTime()))) current++;
    else break;
  }

  const seriesFrom = (map: Map<string, Map<string, number>>, label: string) =>
    [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, inner]) => {
        const row: Record<string, number | string> = { [label]: key };
        let total = 0;
        for (const s of senders) {
          const n = inner.get(s) ?? 0;
          row[s] = n;
          total += n;
        }
        row.total = total;
        return row;
      });

  const topWords: ChatStats["topWords"] = {};
  const languageMix: ChatStats["languageMix"] = {};
  for (const s of senders) {
    const ranked = [...wordFreq[s].entries()].sort((a, b) => b[1] - a[1]);
    topWords[s] = ranked.slice(0, 12);
    languageMix[s] = {
      hinglishShare: bySender[s].messages
        ? +(hinglishSum[s] / bySender[s].messages).toFixed(3)
        : 0,
      topHindi: ranked.filter(([w]) => HINDI_CONTENT.test(w)).slice(0, 10),
      topEnglish: ranked.filter(([w]) => !HINDI_CONTENT.test(w)).slice(0, 10),
    };
  }

  const start = msgs.length ? msgs[0].sentAt : 0;
  const end = msgs.length ? msgs[msgs.length - 1].sentAt : 0;
  const spanDays = Math.max(1, Math.round((end - start) / 86400000));

  return {
    totalMessages: msgs.length,
    dateRange: { start, end },
    daysCovered: dayKeys.length,
    spanDays,
    avgPerDay: Math.round(msgs.length / Math.max(1, dayKeys.length)),
    senders,
    bySender,
    dailyCounts: seriesFrom(daily, "date"),
    weeklyCounts: seriesFrom(weekly, "weekStart"),
    monthlyCounts: seriesFrom(monthly, "month"),
    hourlyHeatmap: heatmap,
    responseTimes,
    streaks: { longest, current },
    longestSilence,
    initiations,
    doubleTexts,
    topWords,
    topEmojis: [...emojiFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    mediaCount: msgs.filter((m) => m.isMedia).length,
    languageMix,
    tone,
  };
}

/* ------------------------------------------------------------------ *
 * Conflict detection
 * ------------------------------------------------------------------ */

const LONG = 220;

const TOPIC_PATTERNS: Array<{ topic: string; re: RegExp }> = [
  {
    topic: "trust",
    re: /\b(trust|jealous|secretive|hiding|hide from you|texted her|texted him|screenshot|behind my back|flirt|ex\b|another (guy|girl))\b/i,
  },
  {
    topic: "communication",
    re: /\b(suffocating|shut off|can'?t fight|cant fight|talk about (it|things)|overspeaking|perceived as an attack|we need to talk|say it on my face|articulate|not coming from within|staying quiet|staying quite|dragged for days)\b/i,
  },
  {
    topic: "attention",
    re: /\b(didn'?t (text|reply)|not text|reply back|worried|waiting for (you|your)|ignoring me|priorit|left on read|no reply|didnt reply)\b/i,
  },
  {
    topic: "family",
    re: /\b(mom|dad|papa|mummy|parents|family|marriage|marry|shaadi|in-?laws|uncle|aunty|brother|sister)\b/i,
  },
  { topic: "money", re: /\b(salary|money|paisa|paise|income|job|career|hike|rent|expensive|afford|provide|lakh|lac)\b/i },
  { topic: "plans", re: /\b(plan|planning|booking|booked|reservation|cancel|late|reach|bus|train|flight|trip)\b/i },
  { topic: "distance", re: /\b(miss you|missing you|far away|long distance|when will you come|apart|alone here)\b/i },
];


/* ------------------------------------------------------------------ *
 * Episode detection (shared machinery)
 * ------------------------------------------------------------------ */

export interface Episode {
  kind: "conflict" | "connection";
  date: string;
  startedAt: number;
  endedAt: number;
  score: number;
  /** 1-5, derived from score. Intensity for conflict, depth for connection. */
  severity: number;
  topic: string;
  messageCount: number;
  openedBy?: string;
  closedBy?: string;
  /** Conflict: ended in repair. Connection: both people took part. */
  repaired: boolean;
  excerpts: Array<{ sender: string; text: string; at: number }>;
  context: {
    days: number;
    messagesInEpisode: number;
    peakDayMessages: number;
    baseline: number;
    volumeRatio: number;
    longestGapHours: number;
    nextDayMessages: number | null;
    /** Conflict only: how far warmth fell below each person's own norm. */
    toneDrop?: number;
    /** Connection only: which signals fired, for labelling. */
    signals?: string[];
  };
}

// Kept as an alias so existing callers/tables keep compiling.
export type ConflictEpisode = Episode;

const WINDOW_MS = 4 * 60 * 60 * 1000; // a fight or a deep talk is hours, not days
const MIN_WINDOW_MSGS = 6;

function dayKeyOf(t: number) {
  return dayKey(t);
}

interface Candidate {
  start: number;
  end: number;
  from: number;
  to: number;
  score: number;
  extra: Record<string, unknown>;
}

/** Greedily takes the best-scoring windows, skipping any that overlap one already taken. */
function pickNonOverlapping(cands: Candidate[], limit = 12): Candidate[] {
  const chosen: Candidate[] = [];
  for (const c of [...cands].sort((a, b) => b.score - a.score)) {
    if (chosen.length >= limit) break;
    if (chosen.some((x) => c.from <= x.to && c.to >= x.from)) continue;
    chosen.push(c);
  }
  return chosen.sort((a, b) => b.start - a.start);
}

function topicFor(msgs: ParsedMessage[]): string {
  const counts = new Map<string, number>();
  for (const m of msgs) {
    for (const { topic, re } of TOPIC_PATTERNS) {
      if (re.test(m.text)) counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
}

function contextFor(
  window: ParsedMessage[],
  byDay: Map<string, ParsedMessage[]>,
  dayKeys: string[],
  baseline: number,
): Episode["context"] {
  const days = new Set(window.map((m) => dayKeyOf(m.sentAt)));
  const perDay = [...days].map((d) => byDay.get(d)?.length ?? 0);
  const lastDay = [...days].sort().pop()!;
  const nextKey = dayKeys[dayKeys.indexOf(lastDay) + 1];
  let longestGapHours = 0;
  for (let i = 1; i < window.length; i++) {
    longestGapHours = Math.max(longestGapHours, (window[i].sentAt - window[i - 1].sentAt) / 3600000);
  }
  const dayTotal = perDay.reduce((a, b) => a + b, 0);
  return {
    days: days.size,
    messagesInEpisode: window.length,
    peakDayMessages: Math.max(0, ...perDay),
    baseline,
    volumeRatio: baseline ? +(dayTotal / days.size / baseline).toFixed(2) : 1,
    longestGapHours: +longestGapHours.toFixed(1),
    nextDayMessages: nextKey ? (byDay.get(nextKey)?.length ?? null) : null,
  };
}

/**
 * Conflict detection.
 *
 * Scores 4-hour windows rather than whole days, because a fight is a burst:
 * in the reference export, 11 June was ordinary banter until 10:56pm and an
 * argument from then until midnight. Scoring the day averaged the two together
 * and the day-level signal was dominated by the banter.
 *
 * Message length is deliberately not a signal at all -- it marks any serious
 * conversation, and using it flagged career advice, family history and holiday
 * planning as fights. What actually separates an argument is negativity aimed
 * at the partner plus *tone collapse*: warmth dropping below what these two
 * specific people normally do. That catches the real tell, which is
 * "Okay baby" turning into "Okay." and pet names turning into first names.
 */
export function detectConflicts(msgs: ParsedMessage[], stats: ChatStats): Episode[] {
  if (msgs.length < MIN_WINDOW_MSGS) return [];

  const sentiments = msgs.map((m) => scoreMessage(m.text));
  const byDay = new Map<string, ParsedMessage[]>();
  for (const m of msgs) {
    const k = dayKeyOf(m.sentAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(m);
  }
  const dayKeys = [...byDay.keys()].sort();
  const baseline = stats.avgPerDay;

  // Each person's own warmth rate. Comparing against a shared average would
  // punish whoever is simply less effusive by default.
  const affectionBase: Record<string, number> = {};
  for (const s of stats.senders) {
    const own = msgs.filter((m) => m.sender === s);
    const warm = own.filter((_, i) => scoreMessage(own[i].text).affection).length;
    affectionBase[s] = own.length ? warm / own.length : 0;
  }

  const cands: Candidate[] = [];
  for (let i = 0; i < msgs.length; i++) {
    let neg = 0;
    let accusation = 0;
    let hurt = 0;
    let withdrawal = 0;
    let denial = 0;
    let trust = 0;
    const negBySender = new Map<string, number>();
    const warmBySender = new Map<string, { warm: number; total: number }>();

    for (let j = i; j < msgs.length; j++) {
      if (msgs[j].sentAt - msgs[i].sentAt > WINDOW_MS) break;
      const s = sentiments[j];
      const who = msgs[j].sender;
      neg += s.negative;
      if (s.accusation) accusation++;
      if (s.hurt) hurt++;
      if (s.withdrawal) withdrawal++;
      if (s.denial) denial++;
      if (s.trust) trust++;
      if (s.negative > 0) negBySender.set(who, (negBySender.get(who) ?? 0) + s.negative);

      const w = warmBySender.get(who) ?? { warm: 0, total: 0 };
      w.total++;
      if (s.affection) w.warm++;
      warmBySender.set(who, w);

      const count = j - i + 1;
      if (count < MIN_WINDOW_MSGS) continue;

      // Tone collapse: how far below their own norm each person's warmth fell,
      // weighted by how much they said. This is what catches a cold exchange
      // that never uses an angry word.
      let toneDrop = 0;
      for (const [who2, w2] of warmBySender) {
        if (w2.total < 4) continue;
        const drop = affectionBase[who2] - w2.warm / w2.total;
        if (drop > 0) toneDrop += drop * Math.min(w2.total, 25);
      }

      // Both sides negative = an argument, not one person venting about work.
      const mutual = negBySender.size > 1 ? Math.min(...negBySender.values()) : 0;

      const score =
        neg + toneDrop * 2.5 + mutual * 2 + accusation * 2 + withdrawal * 3 + denial * 1.5;

      // Tone must actually have collapsed. Without this, an affectionate
      // exchange that happens to contain one charged phrase still qualifies --
      // and warmth staying at its normal level is the clearest evidence that
      // whatever was said, it wasn't a fight.
      const qualifies =
        (accusation >= 2 || (accusation >= 1 && hurt >= 1) || withdrawal >= 1 || trust >= 3) &&
        mutual > 0 &&
        toneDrop >= 1.5;

      if (qualifies && score >= 30) {
        cands.push({
          start: msgs[i].sentAt,
          end: msgs[j].sentAt,
          from: i,
          to: j,
          score,
          extra: { toneDrop: +toneDrop.toFixed(2) },
        });
      }
    }
  }

  return pickNonOverlapping(cands).map((c) => {
    const window = msgs.slice(c.from, c.to + 1);
    const flagged = window.filter((_, k) => sentiments[c.from + k].negative > 0);
    const repairs = window.filter((_, k) => sentiments[c.from + k].repair);
    return {
      kind: "conflict" as const,
      date: dayKeyOf(c.start),
      startedAt: c.start,
      endedAt: c.end,
      score: Math.round(c.score),
      severity: Math.max(1, Math.min(5, Math.round(c.score / 45) + 1)),
      topic: topicFor(flagged.length ? flagged : window),
      messageCount: window.length,
      openedBy: flagged[0]?.sender,
      closedBy: repairs.length ? repairs[repairs.length - 1].sender : undefined,
      repaired: repairs.length > 0,
      excerpts: (flagged.length ? flagged : window).slice(0, 6).map((m) => ({
        sender: m.sender,
        text: m.text.length > 400 ? m.text.slice(0, 400) + "…" : m.text,
        at: m.sentAt,
      })),
      context: {
        ...contextFor(window, byDay, dayKeys, baseline),
        toneDrop: c.extra.toneDrop as number,
      },
    };
  });
}

const CONNECTION_LABELS: Array<{ key: string; label: string }> = [
  { key: "future", label: "Building a life" },
  { key: "vulnerability", label: "Opening up" },
  { key: "support", label: "Backing each other" },
  { key: "caretaking", label: "Looking after" },
  { key: "gratitude", label: "Gratitude" },
];

/**
 * Connection detection -- the mirror of the above, and it reuses the very
 * signal that made the first conflict detector wrong.
 *
 * Long, sustained, two-sided exchanges with no negativity in them are not
 * fights; they are the best conversations these two have. Scoring them as
 * their own thing turns the old false positives (career advice, family
 * history, planning a trip) into the feature they should always have been.
 */
export function detectConnection(msgs: ParsedMessage[], stats: ChatStats): Episode[] {
  if (msgs.length < MIN_WINDOW_MSGS) return [];

  const sentiments = msgs.map((m) => scoreMessage(m.text));
  const byDay = new Map<string, ParsedMessage[]>();
  for (const m of msgs) {
    const k = dayKeyOf(m.sentAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(m);
  }
  const dayKeys = [...byDay.keys()].sort();
  const baseline = stats.avgPerDay;

  const cands: Candidate[] = [];
  for (let i = 0; i < msgs.length; i++) {
    let pos = 0;
    let neg = 0;
    let longMsgs = 0;
    const posBySender = new Map<string, number>();
    const hits: Record<string, number> = {
      support: 0, vulnerability: 0, future: 0, caretaking: 0, gratitude: 0,
    };

    for (let j = i; j < msgs.length; j++) {
      if (msgs[j].sentAt - msgs[i].sentAt > WINDOW_MS) break;
      const s = sentiments[j];
      const who = msgs[j].sender;
      pos += s.positive;
      neg += s.negative;
      if (msgs[j].text.length > LONG) longMsgs++;
      if (s.support) hits.support++;
      if (s.vulnerability) hits.vulnerability++;
      if (s.future) hits.future++;
      if (s.caretaking) hits.caretaking++;
      if (s.gratitude) hits.gratitude++;
      if (s.positive > 0) posBySender.set(who, (posBySender.get(who) ?? 0) + s.positive);

      const count = j - i + 1;
      if (count < MIN_WINDOW_MSGS) continue;

      // Both people contributing is what makes it a conversation rather than
      // one person monologuing.
      const mutual = posBySender.size > 1 ? Math.min(...posBySender.values()) : 0;
      // Depth: substantial messages, but only counted alongside real warmth,
      // never on their own.
      const depth = Math.min(longMsgs, 12) * 1.5;
      const distinct = Object.values(hits).filter((n) => n > 0).length;

      // Any real negativity disqualifies the window outright -- a warm patch
      // inside an argument is repair, and belongs to the fight, not here.
      const score = neg > 4 ? 0 : pos + mutual * 2 + depth + distinct * 3;

      if (score >= 32 && mutual > 0 && neg <= 4) {
        cands.push({
          start: msgs[i].sentAt,
          end: msgs[j].sentAt,
          from: i,
          to: j,
          score,
          extra: { hits: { ...hits } },
        });
      }
    }
  }

  return pickNonOverlapping(cands).map((c) => {
    const window = msgs.slice(c.from, c.to + 1);
    const hits = c.extra.hits as Record<string, number>;
    const signals = CONNECTION_LABELS.filter((l) => hits[l.key] > 0)
      .sort((a, b) => hits[b.key] - hits[a.key])
      .map((l) => l.label);

    // Show the messages that carried the warmth, preferring substantial ones.
    const notable = window
      .map((m, k) => ({ m, s: sentiments[c.from + k] }))
      .filter((x) => x.s.positive > 0)
      .sort((a, b) => b.s.positive - a.s.positive || b.m.text.length - a.m.text.length)
      .slice(0, 6)
      .map((x) => x.m)
      .sort((a, b) => a.sentAt - b.sentAt);

    const senders = new Set(window.map((m) => m.sender));
    return {
      kind: "connection" as const,
      date: dayKeyOf(c.start),
      startedAt: c.start,
      endedAt: c.end,
      score: Math.round(c.score),
      severity: Math.max(1, Math.min(5, Math.round(c.score / 40) + 1)),
      topic: signals[0] ? CONNECTION_LABELS.find((l) => l.label === signals[0])!.key : topicFor(window),
      messageCount: window.length,
      openedBy: (notable[0] ?? window[0]).sender,
      closedBy: (notable[notable.length - 1] ?? window[window.length - 1]).sender,
      repaired: senders.size > 1,
      excerpts: (notable.length ? notable : window.slice(0, 6)).map((m) => ({
        sender: m.sender,
        text: m.text.length > 400 ? m.text.slice(0, 400) + "…" : m.text,
        at: m.sentAt,
      })),
      context: {
        ...contextFor(window, byDay, dayKeys, baseline),
        signals,
      },
    };
  });
}
