import { getFunctionName } from 'convex/server';
const img = (a: string, b: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="300" cy="90" r="46" fill="#ffd9a0" opacity=".9"/><path d="M0 230 Q100 170 200 220 T400 200 V300 H0Z" fill="#1d2b3a" opacity=".7"/></svg>`);
const now = Date.now();
const mem = (i: number, title: string, a: string, b: string) => ({ _id: 'm' + i, _creationTime: now - i * 86400000, title, imageUrl: img(a, b), location: 'Goa', category: 'photo', memoryDate: now - i * 86400000 * 365 });
const DATA: Record<string, unknown> = {
  'users:current': { _id: 'u1', name: 'Amritanshu', avatarUrl: null },
  'users:partner': { _id: 'u2', name: 'Swati', avatarUrl: null },
  'settings:get': { currency: 'INR', timezone: 'IST', theme: 'dark', startDate: '2023-07-12', partnerPhone: '' },
  'tracking:list': [{ _id: 't1', _creationTime: now - 3600000, type: 'mood', category: 'Mood', value: 8, user: 'Swati' }],
  'memories:list': [mem(0, 'Sunset at Baga', '#ff9a8b', '#6a3cd0'), mem(1, 'Chai at midnight', '#3a6ea5', '#1b2a49'), mem(2, 'Rainy drive', '#5fb98b', '#1f4d4a'), mem(3, 'Pottery class', '#e0a96d', '#7a3d2a')],
  'memories:onThisDay': [mem(0, 'Sunset at Baga beach', '#ff9a8b', '#6a3cd0')],
  'insights:list': [{ id: 'i', title: "You're happiest on Saturdays", content: 'Usually after a walk together.', type: 'pattern' }],
  'capsules:list': [{ _id: 'c1', title: 'For our 5th', unlockDate: new Date(now + 12 * 86400000).toISOString() }],
  'tracking:streak': { days: 23 },
  'expenses:balance': { byCurrency: [{ currency: 'INR', net: 1240 }], partnerName: 'Swati' },
  'liveLocations:both': { mine: { lat: 12.97, lng: 77.59 }, partner: { lat: 12.99, lng: 77.6 } },
  'tracking:togetherness': [],
};
export function useQuery(ref: never) { return DATA[getFunctionName(ref)]; }
export function useMutation() { return async () => {}; }
export function useConvex() { return {}; }
