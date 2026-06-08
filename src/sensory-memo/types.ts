export type AromaFamily =
  | 'floral'
  | 'fruity'
  | 'sour-fermented'
  | 'nutty'
  | 'cocoa'
  | 'sweet'
  | 'spice'
  | 'roasted-smoke'
  | 'cereal'
  | 'burnt-tobacco-green'
  | 'other';

export const AROMA_FAMILIES: { key: AromaFamily; emoji: string; label: string }[] = [
  { key: 'floral',            emoji: '🌸', label: 'Floral' },
  { key: 'fruity',            emoji: '🍏', label: 'Fruity (Berry / Dried Fruit / Citrus)' },
  { key: 'sour-fermented',    emoji: '🍷', label: 'Sour / Fermented' },
  { key: 'nutty',             emoji: '🥜', label: 'Nutty' },
  { key: 'cocoa',             emoji: '🍫', label: 'Cocoa' },
  { key: 'sweet',             emoji: '🍯', label: 'Sweet (Vanilla / Brown Sugar)' },
  { key: 'spice',             emoji: '🌿', label: 'Spice' },
  { key: 'roasted-smoke',     emoji: '🔥', label: 'Roasted / Smoke' },
  { key: 'cereal',            emoji: '🌾', label: 'Cereal' },
  { key: 'burnt-tobacco-green', emoji: '⚫', label: 'Burnt / Tobacco / Green / Vegetable' },
  { key: 'other',             emoji: '❓', label: 'Others' },
];

export interface TasteProfile {
  sour: number;   // 0–5
  sweet: number;  // 0–5
  bitter: number; // 0–5
  salty: number;  // 0–5
  umami: number;  // 0–5
}

export interface FlavorEntry {
  id: string;
  emoji: string;
  label: string;
  family: AromaFamily;
  subgroup?: string;
  taste: TasteProfile;
  description: string;
  wcr_ref?: boolean;
  wcr_category?: string;
}

export interface SessionEntry {
  checked: boolean;
  intensity: number;
  notes: string;
}

export interface SessionState {
  active: boolean;
  entries: Record<string, SessionEntry>;
  notes: string;
}

export const TASTE_LABELS: { key: keyof TasteProfile; label: string; color: string }[] = [
  { key: 'sour',  label: 'Sour',  color: 'bg-amber-400' },
  { key: 'sweet', label: 'Sweet', color: 'bg-pink-400' },
  { key: 'bitter',label: 'Bitter',color: 'bg-red-700' },
  { key: 'salty', label: 'Salty', color: 'bg-blue-300' },
  { key: 'umami', label: 'Umami', color: 'bg-orange-600' },
];

// ── Custom flavor (user-created) ──
export interface CustomFlavorEntry {
  id: string;
  emoji: string;
  label: string;
  family: AromaFamily;
  subgroup?: string;
  taste: TasteProfile;
  description: string;
  createdBy: 'user' | 'ai';
  createdAt: string;
  updatedAt: string;
}

// ── Coffee Profile (bag notes) ──
export interface CoffeeProfile {
  id: string;
  name: string;
  roaster?: string;
  origin?: string;
  process?: string;
  roastLevel?: string;
  flavorIds: string[];       // references FlavorEntry.id or CustomFlavorEntry.id
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Aggregate analysis of selected flavors ──
export interface AggregateAnalysis {
  totalTaste: TasteProfile;
  avgTaste: TasteProfile;
  dimension: 'aroma' | 'flavor' | 'mouthfeel' | 'balanced';
  dimensionReason: string;
  possibilityScore: number;   // 0–100
  selectedCount: number;
  wcrCount: number;
  customCount: number;
}
