export type TrackingType = 'money' | 'mood' | 'health' | 'food' | 'activity' | 'location';

export interface TrackingEntry {
  id: number;
  type: TrackingType;
  value: number;
  category: string;
  note: string;
  timestamp: string;
  user: string;
}

export interface Memory {
  id: number;
  title: string;
  description: string;
  image_url: string;
  timestamp: string;
  category: 'photo' | 'travel' | 'food' | 'milestone' | 'event' | 'capsule';
  location?: string;
  card_width?: number;
  card_height?: number;
  text_size?: number;
  font_family?: string;
  text_color?: string;
  bg_color?: string;
  border_style?: string;
  border_width?: number;
  border_color?: string;
  shadow_effect?: string;
  bg_image_overlay?: string;
}

export interface Goal {
  id: number;
  title: string;
  category: 'cooking' | 'travel' | 'fitness' | 'relaxation' | 'adventure';
  target: number;
  current: number;
  completed: boolean;
}

export interface Capsule {
  id: number;
  title: string;
  type: 'letter' | 'photos' | 'voice' | 'video';
  unlock_date: string;
  is_locked: boolean;
  content_url?: string;
}

export interface Insight {
  id: number;
  title: string;
  content: string;
  type: 'pattern' | 'trend' | 'suggestion';
  timestamp: string;
}

export interface Stats {
  totalMoney: number;
  avgMood: number;
  activities: { category: string; count: number }[];
  connectionScore: number;
}

export interface AppSettings {
  currency: string;
  timezone: string;
}

export type WidgetSize = 'small' | 'wide' | 'tall' | 'large';

export interface WidgetConfig {
  id: string;
  size: WidgetSize;
  order: number;
}
