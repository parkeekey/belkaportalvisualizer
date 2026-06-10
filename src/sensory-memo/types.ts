// ── Big Aroma Categories (4 pillars) ──
export type BigAromaCategory = 'enzymatic' | 'sugar-browning' | 'dry-distillation' | 'other';

export type BigAromaSubgroup =
  // Enzymatic
  | 'herb-flowery'
  | 'citrus-other-fruit'
  | 'tropical-fruit'
  | 'stone-fruit'
  | 'berry-like'
  // Sugar Browning
  | 'cereal-nut'
  | 'caramel-chocolate'
  // Dry Distillation
  | 'spice-others'
  // Other
  | 'vegetables'
  | 'savory'
  | 'others-other';

export const BIG_CATEGORIES: {
  key: BigAromaCategory; label: string; color: string; bgColor: string; textColor: string; borderColor: string;
  subgroups: { key: BigAromaSubgroup; label: string; color: string }[];
}[] = [
  {
    key: 'enzymatic', label: 'Enzymatic', color: '#ec4899', bgColor: 'bg-pink-50', textColor: 'text-pink-700', borderColor: 'border-pink-200',
    subgroups: [
      { key: 'herb-flowery',      label: 'Herb & Flowery',       color: '#ec4899' },
      { key: 'citrus-other-fruit', label: 'Citrus & Other Fruit', color: '#eab308' },
      { key: 'tropical-fruit',    label: 'Tropical Fruit',       color: '#c084fc' },
      { key: 'stone-fruit',       label: 'Stone Fruit',          color: '#fb923c' },
      { key: 'berry-like',        label: 'Berry-like',           color: '#a855f7' },
    ],
  },
  {
    key: 'sugar-browning', label: 'Sugar Browning', color: '#a16207', bgColor: 'bg-amber-50', textColor: 'text-amber-800', borderColor: 'border-amber-200',
    subgroups: [
      { key: 'cereal-nut',         label: 'Cereal & Nut',        color: '#a16207' },
      { key: 'caramel-chocolate',  label: 'Caramel & Chocolate', color: '#b45309' },
    ],
  },
  {
    key: 'dry-distillation', label: 'Dry Distillation', color: '#78350f', bgColor: 'bg-stone-100', textColor: 'text-stone-800', borderColor: 'border-stone-300',
    subgroups: [
      { key: 'spice-others',       label: 'Spice & Others',       color: '#78350f' },
    ],
  },
  {
    key: 'other', label: 'Other', color: '#6b7280', bgColor: 'bg-slate-100', textColor: 'text-slate-700', borderColor: 'border-slate-300',
    subgroups: [
      { key: 'vegetables',         label: 'Vegetables',          color: '#65a30d' },
      { key: 'savory',             label: 'Savory',              color: '#d97706' },
      { key: 'others-other',       label: 'Others',              color: '#6b7280' },
    ],
  },
];

export const BIG_SUBGROUP_LABEL: Record<BigAromaSubgroup, string> = {
  'herb-flowery': 'Herb & Flowery',
  'citrus-other-fruit': 'Citrus & Other Fruit',
  'tropical-fruit': 'Tropical Fruit',
  'stone-fruit': 'Stone Fruit',
  'berry-like': 'Berry-like',
  'cereal-nut': 'Cereal & Nut',
  'caramel-chocolate': 'Caramel & Chocolate',
  'spice-others': 'Spice & Others',
  'vegetables': 'Vegetables',
  'savory': 'Savory',
  'others-other': 'Others',
};

// ── Legacy Aroma Families (kept for backward compat) ──
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
  bigCategory: BigAromaCategory;
  bigSubgroup: BigAromaSubgroup;
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
  bigCategory: BigAromaCategory;
  bigSubgroup: BigAromaSubgroup;
  taste: TasteProfile;
  description: string;
  createdBy: 'user' | 'ai';
  createdAt: string;
  updatedAt: string;
  similarTo?: string;
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

// ── Sensory Profile (saved from checklist session) ──
export interface SensoryProfile {
  id: string;
  name: string;
  coffeeName?: string;
  roaster?: string;
  origin?: string;
  process?: string;
  roastLevel?: string;
  checkedFlavors: Record<string, SessionEntry>;
  createdAt: string;
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
  categoryCounts?: Partial<Record<BigAromaCategory, number>>;
  subgroupCounts?: Record<string, number>;
  vibrancyScore?: number;
  depthScore?: number;
}

// ── Brew Profile for RecipeGenerator -> Brew.tsx pipeline ──
export interface BrewProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  dose: number;
  ratio: number;
  grindUm: number;
  waterTemp: number;
  targetEYmin: number;
  targetEYmax: number;
  targetEYmid: number;
  targetFinishSec: number;
  bloomRatio: number;
  bloomTime: number;
  pourCount: number;
  sourceType: 'coffee' | 'sensory' | '';
  sourceName: string;
  roastLevel?: number;
  process?: string;
  dimension?: string;
}
