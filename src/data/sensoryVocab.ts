export interface VocabWord {
  emoji: string;
  label: string;
  weight: number;
  polarity?: 'positive' | 'negative' | 'neutral';
}

export interface VocabSubCategory {
  name: string;
  polarity: 'positive' | 'negative' | 'neutral';
  acidType?: string;
  words: VocabWord[];
}

export interface AxisSensoryVocab {
  posLabel: string;
  negLabel: string;
  posVerdict: string;
  negVerdict: string;
  categories: VocabSubCategory[];
}

export const POLARITY_COLORS: Record<string, string> = {
  positive: 'text-emerald-600',
  negative: 'text-red-500',
  neutral: 'text-slate-400',
};

export const SENSORY_VOCAB: Record<string, AxisSensoryVocab> = {
  mouthfeel: {
    posLabel: 'Smooth',
    negLabel: 'Rough',
    posVerdict: 'heavier body works well',
    negVerdict: 'dial it back',
    categories: [
      {
        name: 'Body Weight',
        polarity: 'neutral',
        words: [
          { emoji: '💧', label: 'Light Body', weight: -4 },
          { emoji: '⚖️', label: 'Medium Body', weight: 0 },
          { emoji: '🪨', label: 'Heavy Body', weight: 2 },
          { emoji: '🧱', label: 'Full Body', weight: 4 },
        ],
      },
      {
        name: 'Viscosity',
        polarity: 'neutral',
        words: [
          { emoji: '💦', label: 'Watery', weight: -5 },
          { emoji: '🎀', label: 'Thin', weight: -3 },
          { emoji: '🧃', label: 'Juicy', weight: -1 },
          { emoji: '🌊', label: 'Thick', weight: 2 },
          { emoji: '🧴', label: 'Sticky', weight: 4 },
          { emoji: '🛡️', label: 'Coating', weight: 5 },
        ],
      },
      {
        name: '▸ Smooth',
        polarity: 'positive',
        words: [
          { emoji: '🧵', label: 'Velvety', weight: -1 },
          { emoji: '✨', label: 'Silky', weight: -1 },
          { emoji: '🥛', label: 'Creamy', weight: 0 },
          { emoji: '⭕', label: 'Round', weight: 0 },
          { emoji: '🍯', label: 'Syrupy', weight: 3 },
          { emoji: '🛢️', label: 'Oily', weight: 4 },
        ],
      },
      {
        name: '▸ Rough',
        polarity: 'negative',
        words: [
          { emoji: '🪵', label: 'Coarse', weight: -3 },
          { emoji: '⚠️', label: 'Harsh', weight: 3 },
          { emoji: '🧱', label: 'Hard', weight: 4 },
        ],
      },
      {
        name: '▸ Particle',
        polarity: 'negative',
        words: [
          { emoji: '🌫️', label: 'Powdery', weight: 3 },
          { emoji: '🌾', label: 'Grainy', weight: -2 },
          { emoji: '🪨', label: 'Gritty', weight: -4 },
        ],
      },
    ],
  },
  acidity: {
    posLabel: 'Bright/Fruity',
    negLabel: 'Defect',
    posVerdict: 'brightness lifts the cup',
    negVerdict: 'defect notes — check extraction',
    categories: [
      {
        name: '⚡ Intensity',
        polarity: 'neutral',
        words: [
          { emoji: '🌫️', label: 'Flat', weight: -5, polarity: 'negative' },
          { emoji: '🎀', label: 'Soft', weight: -3, polarity: 'negative' },
          { emoji: '🍯', label: 'Mellow', weight: 0, polarity: 'positive' },
          { emoji: '🌶️', label: 'Tangy', weight: 2, polarity: 'positive' },
          { emoji: '💫', label: 'Bright', weight: 1, polarity: 'positive' },
          { emoji: '❄️', label: 'Crisp', weight: 0, polarity: 'positive' },
          { emoji: '🔪', label: 'Sharp', weight: 4, polarity: 'negative' },
        ],
      },
      {
        name: '🍋 Citric',
        polarity: 'neutral',
        acidType: 'Citric Acid',
        words: [
          { emoji: '🍋', label: 'Lemon', weight: 1 },
          { emoji: '🍋', label: 'Lime', weight: 2 },
          { emoji: '🍊', label: 'Orange', weight: 0 },
          { emoji: '🍈', label: 'Grapefruit', weight: 3 },
          { emoji: '🥭', label: 'Tropical', weight: 1 },
          { emoji: '🍋', label: 'Tart', weight: 4 },
        ],
      },
      {
        name: '🍏 Malic',
        polarity: 'positive',
        acidType: 'Malic Acid',
        words: [
          { emoji: '🍎', label: 'Apple', weight: 1 },
          { emoji: '🍐', label: 'Pear', weight: 0 },
          { emoji: '🫐', label: 'Blueberry', weight: 0 },
          { emoji: '🍓', label: 'Strawberry', weight: 1 },
          { emoji: '🍇', label: 'Raspberry', weight: 2 },
        ],
      },
      {
        name: '🍇 Tartaric',
        polarity: 'neutral',
        acidType: 'Tartaric Acid',
        words: [
          { emoji: '🍇', label: 'Grape', weight: 0 },
          { emoji: '🍇', label: 'Raisin', weight: -1 },
          { emoji: '🫐', label: 'Fig', weight: -2 },
          { emoji: '🍑', label: 'Prune', weight: -3 },
          { emoji: '🍷', label: 'Wine-like', weight: 2 },
        ],
      },
      {
        name: '💧 Phosphoric',
        polarity: 'positive',
        acidType: 'Phosphoric Acid',
        words: [
          { emoji: '🧼', label: 'Clean', weight: -2 },
          { emoji: '🪨', label: 'Mineral', weight: -3 },
          { emoji: '🥤', label: 'Cola', weight: -1 },
        ],
      },

    ],
  },
  aftertaste: {
    posLabel: 'Long/Refined',
    negLabel: 'Short/Harsh',
    posVerdict: 'aftertaste lingers with clarity',
    negVerdict: 'aftertaste is too short or harsh',
    categories: [
      {
        name: '⏱ Length',
        polarity: 'neutral',
        words: [
          { emoji: '⏱', label: 'Short', weight: -5 },
          { emoji: '⏱', label: 'Quick Aftertaste', weight: -3 },
          { emoji: '⏱', label: 'Med', weight: -1 },
          { emoji: '⏱', label: 'Medium Aftertaste', weight: 0 },
          { emoji: '⏱', label: 'Long', weight: 2 },
          { emoji: '🌀', label: 'Lingering', weight: 3 },
          { emoji: '♾️', label: 'Persistent', weight: 4 },
        ],
      },
      {
        name: '✨ Finish',
        polarity: 'positive',
        words: [
          { emoji: '🧼', label: 'Clean', weight: -1, polarity: 'positive' },
          { emoji: '🌸', label: 'Flowery', weight: 2, polarity: 'positive' },
          { emoji: '✨', label: 'Long', weight: 2, polarity: 'positive' },
          { emoji: '🍯', label: 'Sweet', weight: 1, polarity: 'positive' },
          { emoji: '🌿', label: 'Bitter', weight: 5, polarity: 'negative' },
        ],
      },
    ],
  },
  flavor: {
    posLabel: 'Complex',
    negLabel: 'Muddled',
    posVerdict: 'clean, layered flavor profile',
    negVerdict: 'flavor is cluttered or conflicted',
    categories: [
      {
        name: '⚖️ Balance',
        polarity: 'neutral',
        words: [
          { emoji: '⚖️', label: 'Balanced', weight: 0 },
          { emoji: '🔗', label: 'Integrated', weight: -1 },
          { emoji: '🧩', label: 'Disjointed', weight: 3 },
        ],
      },
      {
        name: '✨ Clarity',
        polarity: 'positive',
        words: [
          { emoji: '🌫️', label: 'Dirty', weight: -3 },
          { emoji: '✨', label: 'Clean', weight: -1 },
        ],
      },
      {
        name: '🌈 Complexity',
        polarity: 'positive',
        words: [
          { emoji: '🌈', label: 'Rich', weight: 2 },
          { emoji: '▫️', label: 'Poor', weight: -4 },
        ],
      },
      {
        name: '🌵 Astringent',
        polarity: 'negative',
        words: [
          { emoji: '🌵', label: 'Tingy', weight: 2 },
          { emoji: '😮‍💨', label: 'Puckering', weight: 4 },
        ],
      },
      {
        name: '🍂 Drying',
        polarity: 'negative',
        words: [
          { emoji: '🍂', label: 'Parching', weight: 5 },
        ],
      },
      {
        name: '🌾 Grassy',
        polarity: 'negative',
        words: [
          { emoji: '🌾', label: 'Grassy', weight: -4 },
        ],
      },
    ],
  },
  sweetness: {
    posLabel: 'Refined',
    negLabel: 'Flat',
    posVerdict: 'identifiable sweetness profile',
    negVerdict: 'sweetness is one-dimensional or muddy',
    categories: [
      {
        name: '🍯 Sweet',
        polarity: 'neutral',
        words: [
          { emoji: '🍯', label: 'Honey', weight: -1 },
          { emoji: '🧴', label: 'Syrup', weight: 0 },
          { emoji: '🍬', label: 'Sugar-like', weight: 1 },
        ],
      },
      {
        name: '🥜 Nutty',
        polarity: 'positive',
        words: [
          { emoji: '🥜', label: 'Almond', weight: -5 },
          { emoji: '🥜', label: 'Hazelnut', weight: -4 },
          { emoji: '🥜', label: 'Walnut', weight: -3 },
        ],
      },
      {
        name: '🍫 Cocoa',
        polarity: 'positive',
        words: [
          { emoji: '🍫', label: 'Cocoa Powder', weight: 3 },
          { emoji: '🍫', label: 'Dark Chocolate', weight: 4 },
          { emoji: '🍫', label: 'Chocolate', weight: 5 },
        ],
      },
      {
        name: '🌿 Spice',
        polarity: 'positive',
        words: [
          { emoji: '🌿', label: 'Cinnamon', weight: -3 },
          { emoji: '🌿', label: 'Clove', weight: -2 },
          { emoji: '🌿', label: 'Nutmeg', weight: -2 },
          { emoji: '🌿', label: 'Pepper', weight: -1 },
        ],
      },
      {
        name: '🍦 Vanilla',
        polarity: 'positive',
        words: [
          { emoji: '🥛', label: 'Creamy', weight: 1 },
          { emoji: '🍦', label: 'Soft Vanilla Notes', weight: 2 },
        ],
      },
      {
        name: '🍬 Brown Sugar',
        polarity: 'positive',
        words: [
          { emoji: '🍬', label: 'Caramel', weight: 3 },
          { emoji: '🍬', label: 'Toffee', weight: 4 },
          { emoji: '🍬', label: 'Molasses', weight: 5 },
        ],
      },
    ],
  },
};
