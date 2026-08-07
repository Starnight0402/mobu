import { Doc, Id } from '../convex/_generated/dataModel';

export type TrackingType = 'money' | 'mood' | 'health' | 'food' | 'activity' | 'location';

export type TrackingEntry = Doc<'tracking'>;
export type Memory = Doc<'memories'>;
export type Goal = Doc<'goals'>;
export type Capsule = Doc<'capsules'>;
export type Insight = Doc<'insights'>;

export interface Stats {
  totalMoney: number;
  avgMood: number;
  activities: { category: string; count: number }[];
  totalMemories: number;
  connectionScore: number;
}

export interface AppSettings {
  currency: string;
  timezone: string;
  theme?: 'light' | 'dark';
}

export type WidgetSize = 'small' | 'wide' | 'tall' | 'large';

export interface WidgetConfig {
  id: string;
  size: WidgetSize;
  order: number;
}

export type { Id };
