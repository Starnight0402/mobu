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

export interface ConflictEpisode {
  date: string;
  startedAt: number;
  endedAt: number;
  score: number;
  severity: number;
  topic: string;
  messageCount: number;
  openedBy?: string;
  closedBy?: string;
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
  };
}

/**
 * Finds days that look like real conflict, then merges consecutive ones into
 * single episodes -- an argument that runs past midnight, or picks back up the
 * next evening, is one fight rather than two.
 */
export function detectConflicts(msgs: ParsedMessage[], stats: ChatStats): ConflictEpisode[] {
  if (msgs.length === 0) return [];

  const byDay = new Map<string, ParsedMessage[]>();
  for (const m of msgs) {
    const k = dayKey(m.sentAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(m);
  }
  const dayKeys = [...byDay.keys()].sort();
  const baseline = stats.avgPerDay;

  interface Scored {
    key: string;
    score: number;
    msgs: ParsedMessage[];
    flagged: ParsedMessage[];
    qualifies: boolean;
  }

  const scored: Scored[] = dayKeys.map((key) => {
    const dayMsgs = byDay.get(key)!;

    // Message length is deliberately NOT a primary signal. Long messages mark
    // any serious conversation -- career advice, family history, trip planning
    // -- and scoring on them flagged all three as fights. What separates an
    // argument is negativity aimed at the partner, so that carries the weight
    // and length only amplifies a message already scored negative.
    const sentiments = dayMsgs.map((m) => scoreMessage(m.text));

    let accusation = 0;
    let hurt = 0;
    let trust = 0;
    let repair = 0;
    let affection = 0;
    let negTotal = 0;
    const negBySender = new Map<string, number>();
    const flagged: ParsedMessage[] = [];

    dayMsgs.forEach((m, i) => {
      const s = sentiments[i];
      if (s.accusation) accusation++;
      if (s.hurt) hurt++;
      if (s.trust) trust++;
      if (s.repair) repair++;
      if (s.affection) affection++;
      if (s.negative > 0) {
        // A long negative message is someone laying out a grievance in full.
        const weight = s.negative * (m.text.length > LONG ? 1.6 : 1);
        negTotal += weight;
        negBySender.set(m.sender, (negBySender.get(m.sender) ?? 0) + weight);
        flagged.push(m);
      }
    });

    // A fight is concentrated, not spread across a day: find the heaviest
    // 90-minute window rather than summing everything from breakfast to bed.
    let burst = 0;
    for (let i = 0; i < dayMsgs.length; i++) {
      let sum = 0;
      for (let j = i; j < dayMsgs.length; j++) {
        if (dayMsgs[j].sentAt - dayMsgs[i].sentAt > 90 * 60 * 1000) break;
        sum += sentiments[j].negative;
      }
      burst = Math.max(burst, sum);
    }

    // Both people being negative is what makes it an argument rather than one
    // person venting about work or a third party.
    const mutual = negBySender.size > 1 ? Math.min(...negBySender.values()) : 0;

    // Warmth dampens: a day thick with affection is a couple talking, however
    // heavy the subject.
    const affectionRatio = affection / Math.max(1, dayMsgs.length);
    const damp = Math.max(0.35, 1 - affectionRatio * 2.5);

    const raw =
      accusation * 5 + hurt * 4 + trust * 2 + burst * 2 + mutual * 1.5 + repair * 0.5;
    const score = raw * damp;

    // A gate on top of the score, because score alone can be reached by an
    // emotionally intense but perfectly friendly day (worry about a parent,
    // venting about work). Something has to be directed AT the partner:
    // repeated accusation, accusation plus sustained hurt, or a real cluster
    // of suspicion.
    const qualifies =
      accusation >= 2 || (accusation >= 1 && hurt >= 2) || trust >= 4 || hurt >= 5;

    return { key, score, msgs: dayMsgs, flagged, qualifies };
  });

  const HOT = 16;
  const MAX_EPISODE_DAYS = 5;
  const hot = scored.filter((s) => s.score >= HOT && s.qualifies);
  if (hot.length === 0) return [];

  // Merge runs of consecutive (or single-day-gap) hot days into one episode.
  const episodes: ConflictEpisode[] = [];
  let group: Scored[] = [];

  const flush = () => {
    if (group.length === 0) return;
    const all = group.flatMap((g) => g.msgs);
    const flagged = group.flatMap((g) => g.flagged);
    const score = group.reduce((sum, g) => sum + g.score, 0);
    const first = group[0];

    // Topic: whichever pattern matches most across the flagged messages.
    const topicScores = new Map<string, number>();
    for (const m of flagged) {
      for (const { topic, re } of TOPIC_PATTERNS) {
        if (re.test(m.text)) topicScores.set(topic, (topicScores.get(topic) ?? 0) + 1);
      }
    }
    const topic =
      [...topicScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";

    const repairs = all.filter((m) => REPAIR_RE.test(m.text.toLowerCase()));
    const dayCount = group.reduce((sum, g) => sum + g.msgs.length, 0);
    const idx = dayKeys.indexOf(group[group.length - 1].key);
    const nextKey = dayKeys[idx + 1];

    let longestGapHours = 0;
    for (let i = 1; i < all.length; i++) {
      longestGapHours = Math.max(longestGapHours, (all[i].sentAt - all[i - 1].sentAt) / 3600000);
    }

    episodes.push({
      date: first.key,
      startedAt: all[0].sentAt,
      endedAt: all[all.length - 1].sentAt,
      score: Math.round(score),
      // 18 is the detection floor, ~100 was the worst episode in the reference
      // export, so this maps the observed range onto 1-5.
      severity: Math.max(1, Math.min(5, Math.round(score / 22) + 1)),
      topic,
      messageCount: dayCount,
      openedBy: flagged[0]?.sender,
      closedBy: repairs.length ? repairs[repairs.length - 1].sender : undefined,
      repaired: repairs.length > 0,
      excerpts: flagged.slice(0, 6).map((m) => ({
        sender: m.sender,
        text: m.text.length > 400 ? m.text.slice(0, 400) + "…" : m.text,
        at: m.sentAt,
      })),
      context: {
        days: group.length,
        messagesInEpisode: dayCount,
        peakDayMessages: Math.max(...group.map((g) => g.msgs.length)),
        baseline,
        // Per-day average against the all-time daily average, so a two-day
        // episode isn't reported as twice the traffic of a one-day one.
        volumeRatio: baseline ? +(dayCount / group.length / baseline).toFixed(2) : 1,
        longestGapHours: +longestGapHours.toFixed(1),
        nextDayMessages: nextKey ? (byDay.get(nextKey)?.length ?? null) : null,
      },
    });
    group = [];
  };

  for (const s of hot) {
    if (group.length === 0) {
      group = [s];
      continue;
    }
    // Calendar distance, not position in the list of days that happen to have
    // messages -- otherwise a quiet day between two flare-ups makes them look
    // adjacent when they're a week apart.
    const prevDay = new Date(group[group.length - 1].key).getTime();
    const curDay = new Date(s.key).getTime();
    const daysApart = Math.round((curDay - prevDay) / 86400000);
    const spanFromStart = Math.round((curDay - new Date(group[0].key).getTime()) / 86400000);
    // The span cap matters as much as the gap: in a dense stretch, a rolling
    // 2-day window will happily chain a whole fortnight into one "fight".
    if (daysApart <= 2 && spanFromStart <= MAX_EPISODE_DAYS) group.push(s);
    else {
      flush();
      group = [s];
    }
  }
  flush();

  return episodes.sort((a, b) => b.startedAt - a.startedAt);
}
