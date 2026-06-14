import type { TasteProfile, BigAromaCategory } from './types';

export type CompositionAxis = 'acidity' | 'sweetness' | 'flavor' | 'mouthfeel' | 'aftertaste' | 'overall';

export const COMPOSITION_AXES: CompositionAxis[] = ['acidity', 'sweetness', 'flavor', 'mouthfeel', 'aftertaste', 'overall'];

export const COMPOSITION_LABELS: Record<CompositionAxis, string> = {
  acidity: 'Acidity',
  sweetness: 'Sweetness',
  flavor: 'Flavor',
  mouthfeel: 'Mouthfeel',
  aftertaste: 'Aftertaste',
  overall: 'Overall',
};

export interface CompositionOptions {
  categoryCounts?: Partial<Record<BigAromaCategory, number>>;
  selectedCount?: number;
  wcrCount?: number;
  customCount?: number;
}

export function computeConfidence(options?: CompositionOptions): number {
  const n = options?.selectedCount || 0;
  const wcr = options?.wcrCount || 0;
  const custom = options?.customCount || 0;
  const wcrRatio = n > 0 ? wcr / n : 0;
  const customRatio = n > 0 ? custom / n : 0;

  let score = 2;
  if (n >= 2) score += 1;
  if (n >= 4) score += 1;
  if (n >= 6) score += 1;
  if (wcrRatio >= 0.5) score += 1;
  if (customRatio > 0.8) score -= 1;

  const cat = options?.categoryCounts;
  if (cat) {
    const entries = Object.entries(cat).filter(([, c]) => c > 0);
    if (entries.length === 1) score += 1;
  }

  return Math.max(1, Math.min(5, Math.round(score)));
}

export function tasteToComposition(
  avgTaste: TasteProfile,
  options?: CompositionOptions,
): Record<CompositionAxis, number> {
  const map = (v: number) => (v / 5) * 10 - 5;

  const result: Record<CompositionAxis, number> = {
    acidity: map(avgTaste.sour),
    sweetness: map(avgTaste.sweet),
    mouthfeel: map((avgTaste.sour + avgTaste.bitter) / 2),
    flavor: map((avgTaste.bitter + avgTaste.umami) / 2),
    aftertaste: map((avgTaste.bitter + avgTaste.sweet) / 2),
    overall: map((avgTaste.sour + avgTaste.sweet + avgTaste.bitter + avgTaste.salty + avgTaste.umami) / 5),
  };

  if (options?.categoryCounts && options.selectedCount && options.selectedCount > 0) {
    const cat = options.categoryCounts;
    const n = options.selectedCount;

    const enzymaticPct = (cat.enzymatic || 0) / n;
    if (enzymaticPct > 0.5) result.acidity = Math.min(5, result.acidity + 1);
    if (enzymaticPct > 0.75) result.acidity = Math.min(5, result.acidity + 1);

    const sbPct = (cat['sugar-browning'] || 0) / n;
    if (sbPct > 0.3) result.sweetness = Math.min(5, result.sweetness + 1);
    if (sbPct > 0.6) result.sweetness = Math.min(5, result.sweetness + 1);

    const ddPct = (cat['dry-distillation'] || 0) / n;
    if (ddPct > 0.3) {
      result.aftertaste = Math.min(5, result.aftertaste + 1);
      result.mouthfeel = Math.min(5, result.mouthfeel + 0.5);
    }
    if (ddPct > 0.6) {
      result.aftertaste = Math.min(5, result.aftertaste + 1);
    }

    const otherPct = (cat['other'] || 0) / n;
    if (otherPct > 0.3) result.mouthfeel = Math.min(5, result.mouthfeel + 1);
  }

  if (options?.selectedCount) {
    if (options.selectedCount >= 3) result.flavor = Math.min(5, result.flavor + 0.5);
    if (options.selectedCount >= 5) result.flavor = Math.min(5, result.flavor + 0.5);
  }

  return result;
}
