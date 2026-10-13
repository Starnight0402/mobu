export type Who = 'him' | 'her';

export type Zone = 'head' | 'body' | 'feet';

export type GiftId =
  | 'chocolate'
  | 'ring'
  | 'flowers'
  | 'teddy'
  | 'icecream'
  | 'lego'
  | 'bottle'
  | 'pizza'
  | 'controller'
  | 'blanket';

export interface Gift {
  id: GiftId;
  label: string;
  emoji: string;
}

export const GIFTS: Gift[] = [
  { id: 'chocolate', label: 'Chocolate', emoji: '🍫' },
  { id: 'ring', label: 'Jewellery', emoji: '💍' },
  { id: 'flowers', label: 'Flowers', emoji: '💐' },
  { id: 'teddy', label: 'Teddy', emoji: '🧸' },
  { id: 'icecream', label: 'Ice cream', emoji: '🍦' },
  { id: 'lego', label: 'Lego', emoji: '🧱' },
  { id: 'bottle', label: 'Baby bottle', emoji: '🍼' },
  { id: 'pizza', label: 'Pizza', emoji: '🍕' },
  { id: 'controller', label: 'Games', emoji: '🎮' },
  { id: 'blanket', label: 'Tuck in', emoji: '🛏️' },
];

// Liked gifts get the big heart-eyes reaction; everything else still gets a
// happy one. Later these become editable per person and synced via Convex.
export const LIKES: Record<Who, GiftId[]> = {
  her: ['chocolate', 'ring', 'flowers', 'teddy', 'icecream'],
  him: ['lego', 'bottle', 'pizza', 'controller', 'blanket'],
};

export type ActionKind =
  | 'pat'
  | 'poke'
  | 'tickle'
  | 'gift'
  | 'feed'
  | 'sleep'
  | 'wake'
  | 'hug'
  | 'kiss'
  | 'dance'
  | 'wave'
  | 'cry';

export interface Action {
  kind: ActionKind;
  gift?: GiftId;
  love?: boolean;
}

export const DURATION: Record<ActionKind, number> = {
  pat: 1.4,
  poke: 1.0,
  tickle: 1.6,
  gift: 2.4,
  feed: 3.6,
  sleep: 6,
  wake: 0.9,
  hug: 3.0,
  kiss: 2.6,
  dance: 4.2,
  wave: 1.6,
  cry: 9,
};

/** Actions both minis do together; solo touches are ignored while one runs. */
export const COUPLE_ACTIONS: ActionKind[] = ['hug', 'kiss', 'dance'];

export interface MiniApi {
  play: (action: Action) => void;
  setTalk: (level: number) => void;
  current: () => ActionKind | null;
  /** Crying, or sulking after being ignored. Touching them cheers them up. */
  sad: () => boolean;
}

export interface Look {
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  dress: boolean;
  beard: boolean;
  longHair: boolean;
}

export const LOOKS: Record<Who, Look> = {
  him: {
    skin: '#e8b48f',
    hair: '#2b1d17',
    top: '#a855f7',
    bottom: '#2f3a55',
    dress: false,
    beard: true,
    longHair: false,
  },
  her: {
    skin: '#f0c4a3',
    hair: '#1c1412',
    top: '#f472b6',
    bottom: '#f472b6',
    dress: true,
    beard: false,
    longHair: true,
  },
};
