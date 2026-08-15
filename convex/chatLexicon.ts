/**
 * Bilingual (English + romanised Hindi/Hinglish) sentiment lexicons.
 *
 * Built by reading a real 14.7k-message Hinglish couple's export rather than
 * translating an English word list, because the two behave very differently:
 * "sorry" and "wtf" are affectionate filler in this register, while the words
 * that actually mark conflict are often Hindi ("naraz", "bura laga", "farak
 * nahi padta") and never appear in an English lexicon at all.
 *
 * Everything is matched against lowercased text with word boundaries where the
 * term is a single word, and as a phrase otherwise.
 */

/** Directed blame/accusation — the strongest single signal of a real fight. */
export const ACCUSATION = [
  // English
  "you never", "you always", "you didn't even", "you dont even", "you don't even",
  "you never even", "why did you", "why didnt you", "why didn't you", "why do you",
  "why are you", "you said you", "you promised", "you lied", "you hid", "you're hiding",
  "youre hiding", "you kept it", "behind my back", "not once did you", "you made me",
  "your fault", "blame me", "blaming me",
  // Hinglish
  "tumne kyu", "tumne kyun", "aapne kyu", "aapne kyun", "tumne bola tha", "aapne bola tha",
  "tumne kaha tha", "aapne kaha tha", "kyu nahi bataya", "kyun nahi bataya",
  "kyu chupaya", "kyun chupaya", "chupa rahe ho", "chupaya tumne", "jhoot bola",
  "jhoot bol rahe", "meri galti", "teri galti", "tumhari galti", "aapki galti",
  "farak nahi padta", "fark nahi padta", "parwah nahi",
];

/** Hurt, withdrawal, emotional distress aimed at the relationship. */
export const HURT = [
  // English
  "hurt me", "hurts me", "it hurt", "i'm upset", "im upset", "i am upset",
  "suffocating", "suffocated", "shut off", "shut down", "by myself", "on my own",
  "not coming from within", "i feel alone", "feel alone", "feels one sided",
  "one sided", "taken for granted", "not a priority", "deprioriti",
  "ignoring me", "you ignored", "left me on read", "no reply", "didn't reply",
  "didnt reply", "i'm done", "im done", "so done", "fed up", "can't do this",
  "cant do this", "want to be alone", "leave me alone", "running away",
  "want to hide", "i can't anymore", "i cant anymore", "disrespect",
  "not fair", "unfair", "unreasonable", "overspeaking", "perceived as an attack",
  "scared of me", "scared of talking", "dragged for days", "staying quiet",
  "staying quite", "bothering you", "makes me anxious", "gives me anxiety",
  // Hinglish
  "bura laga", "bura lagta", "bura lag raha", "dukh hua", "dukh hota",
  "takleef", "tang aa gaya", "tang aa gayi", "thak gaya", "thak gayi",
  "pareshan", "gussa aa raha", "gussa aaya", "gussa hu", "gussa ho",
  "naraz", "naaraz", "chidh", "rula diya", "ro raha", "ro rahi", "rona aa raha",
  "akela feel", "akela mehsoos", "ignore kar rahe", "ignore kar rahi",
  "baat mat karo", "baat nahi karni", "baat nahi karunga", "baat nahi karungi",
  "mujhe accha nahi laga", "acha nahi laga", "theek nahi laga",
  "dil dukh", "dil toot", "man nahi", "mood kharab",
];

/** Suspicion / secrecy / third-party friction. */
export const TRUST = [
  "don't trust", "dont trust", "trust issues", "trust you", "secretive",
  "hiding", "hide from you", "hid it", "why is he", "why is she",
  "who is he", "who is she", "texted her", "texted him", "talking to her",
  "talking to him", "flirt", "jealous", "screenshot", "checked your",
  "bharosa", "shak", "dhoka", "chupa", "chupaya", "kis se baat",
  "usse baat", "uske saath", "wo ladki", "wo ladka",
];

/** Repair, de-escalation, ownership — what closing a fight looks like. */
export const REPAIR = [
  "i'm sorry", "im sorry", "i am sorry", "genuinely sorry", "really sorry",
  "my fault", "my bad", "i was wrong", "i shouldn't have", "i shouldnt have",
  "didn't mean", "didnt mean", "won't happen again", "wont happen again",
  "forgive me", "let's not fight", "lets not fight", "i understand now",
  "i hear you", "you're right", "youre right", "i get it now",
  "maaf", "maafi", "galti ho gayi", "galti thi", "aage se nahi",
  "ab nahi karunga", "ab nahi karungi", "samajh gaya", "samajh gayi",
  "tum sahi ho", "aap sahi ho", "jaane do", "chhod do", "chodo na",
];

/**
 * Affection. Used as a DAMPENER: a day thick with these is a couple having a
 * long warm conversation, not a fight, however many paragraphs it runs to.
 */
export const AFFECTION = [
  "love you", "i love you", "miss you", "missing you", "my love", "baby",
  "babe", "jaan", "cutie", "sweetheart", "good morning", "good night",
  "goodnight", "kiss", "hug", "cuddle", "proud of you", "so happy",
  "can't wait to see", "cant wait to see", "excited to see",
  "pyaar", "pyar", "mohabbat", "jaanu", "meri jaan", "yaad aa rahi",
  "yaad aa raha", "miss kar raha", "miss kar rahi",
];

export const AFFECTION_EMOJI = /😘|💋|🥰|❤|❤️|😍|🤗|💕|💖|😚|🫶|🥹/u;
export const DISTRESS_EMOJI = /😭|💔|😔|😞|😤|🙄|😑|😒|😡|🤬/u;

function buildMatcher(terms: string[]): RegExp {
  // Single words get word boundaries; phrases match literally.
  const parts = terms.map((t) => {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return /\s/.test(t) ? esc : `\\b${esc}\\b`;
  });
  return new RegExp(parts.join("|"), "i");
}

export const ACCUSATION_RE = buildMatcher(ACCUSATION);
export const HURT_RE = buildMatcher(HURT);
export const TRUST_RE = buildMatcher(TRUST);
export const REPAIR_RE = buildMatcher(REPAIR);
export const AFFECTION_RE = buildMatcher(AFFECTION);

export interface MessageSentiment {
  accusation: boolean;
  hurt: boolean;
  trust: boolean;
  repair: boolean;
  affection: boolean;
  distress: boolean;
  /** Net negativity for this single message. */
  negative: number;
}

export function scoreMessage(text: string): MessageSentiment {
  const t = text.toLowerCase();
  const accusation = ACCUSATION_RE.test(t);
  const hurt = HURT_RE.test(t);
  const trust = TRUST_RE.test(t);
  const repair = REPAIR_RE.test(t);
  const affection = AFFECTION_RE.test(t) || AFFECTION_EMOJI.test(text);
  const distress = DISTRESS_EMOJI.test(text);

  let negative = 0;
  if (accusation) negative += 3;
  if (hurt) negative += 3;
  if (trust) negative += 2;
  if (distress) negative += 1;
  // Affection inside an otherwise negative message softens it ("baby I'm
  // upset" is real but milder than the same words without it); affection with
  // nothing negative is just warmth.
  if (affection) negative -= 1.5;

  return { accusation, hurt, trust, repair, affection, distress, negative: Math.max(0, negative) };
}

/** Rough Hindi/Hinglish detector for the language-mix stat. */
const HINGLISH_MARKERS = new Set(
  ("hai hain ho hu hoon tha thi the ka ki ke ko se me mein par pe aur ya nahi na nai bhi hi to toh kya kyu kyun kaise kab kahan koi kuch sab yeh ye woh wo main mera meri mere tera teri tere aap aapka tum tumhara hum hamara raha rahi rahe kar karo kiya karna karke liye wala wali abhi acha accha bas ek do teen phir agar lekin jab tab jo us is ab bohot bahut thoda zyada matlab arre aare haan gaya gayi gaye diya de dena lena liya milega hoga hogi honge sakta sakte sakti chahiye pata baat bola boli kehna kaha sun suno dekh dekho chal chalo aaja jaana jaa raha rahi khana peena sona uthna baithna ghar bahar andar upar niche aaj kal parso subah shaam raat din mujhe tujhe usse humein tumhe aapko apna apne apni")
    .split(/\s+/),
);

export function hinglishRatio(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  let hits = 0;
  for (const w of words) {
    const clean = w.replace(/[^\p{L}]/gu, "");
    if (HINGLISH_MARKERS.has(clean)) hits++;
  }
  return hits / words.length;
}
