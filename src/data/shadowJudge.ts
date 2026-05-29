export interface ScoreDescription {
  scoreMin: number;
  scoreMax: number;
  text: string;
  tone: 'cheer' | 'neutral' | 'pressure';
}

export interface AxisDescriptions {
  descriptions: ScoreDescription[];
}

export interface DrinkabilityRule {
  scoreMin: number;
  text: string;
  icon: string;
}

export interface ShadowJudgeData {
  axes: Record<string, AxisDescriptions>;
  patterns: {
    condition: string;
    text: string;
  }[];
  verdicts: {
    cheerMin: number;
    pressureMin: number;
    hasFlags: boolean | 'any';
    text: string;
  }[];
  drinkability: DrinkabilityRule[];
  transcript: {
    openers: string[];
    closers: string[];
  };
}

const data: ShadowJudgeData = {
  axes: {
    acidity: {
      descriptions: [
        { scoreMin: 0, scoreMax: 1, text: 'Basically none. This is flat — no life, no energy. You want some kind of structure here.', tone: 'pressure' },
        { scoreMin: 2, scoreMax: 3, text: 'Pretty muted. It\'s there if you look for it but the cup feels flat and one-dimensional.', tone: 'pressure' },
        { scoreMin: 4, scoreMax: 5, text: 'It\'s there. Not exciting, not offensive — just alright. It could do more.', tone: 'neutral' },
        { scoreMin: 6, scoreMax: 7, text: 'Bright and lively — this is where acidity actually does its job. Clean, crisp, structured.', tone: 'cheer' },
        { scoreMin: 8, scoreMax: 8, text: 'Really nice — wine-like, complex. You\'ve got real clarity here.', tone: 'cheer' },
        { scoreMin: 9, scoreMax: 9, text: 'Stunning. Razor-sharp but perfectly integrated. This is the kind of acidity that makes you stop and pay attention.', tone: 'cheer' },
      ],
    },
    sweetness: {
      descriptions: [
        { scoreMin: 0, scoreMax: 1, text: 'Nowhere to be found. It\'s all savoury and austere — you need sweetness to carry the cup.', tone: 'pressure' },
        { scoreMin: 2, scoreMax: 3, text: 'Barely hanging on. There\'s a hint but not enough to balance anything.', tone: 'pressure' },
        { scoreMin: 4, scoreMax: 5, text: 'Barely there. It\'s not absent but it\'s not doing any work either — just middling.', tone: 'neutral' },
        { scoreMin: 6, scoreMax: 7, text: 'Well-developed — caramel, honey. Comforting sweetness that supports the profile.', tone: 'cheer' },
        { scoreMin: 8, scoreMax: 8, text: 'Rich and luscious. This is dessert-level sweetness without being cloying.', tone: 'cheer' },
        { scoreMin: 9, scoreMax: 9, text: 'Absolutely gorgeous. Syrupy, refined, intense — the kind of sweetness that defines a great coffee.', tone: 'cheer' },
      ],
    },
    flavor: {
      descriptions: [
        { scoreMin: 0, scoreMax: 1, text: 'Almost nothing. This is worryingly dilute — check your ratio and contact time.', tone: 'pressure' },
        { scoreMin: 2, scoreMax: 3, text: 'Underwhelming. There\'s flavour in there somewhere but it\'s not showing up.', tone: 'pressure' },
        { scoreMin: 4, scoreMax: 5, text: 'Clean but simple. Nothing wrong, nothing interesting — it\'s just okay.', tone: 'neutral' },
        { scoreMin: 6, scoreMax: 7, text: 'Pronounced and pleasant — you\'re getting clear origin character here. Good job.', tone: 'cheer' },
        { scoreMin: 8, scoreMax: 8, text: 'Complex and layered — keeps unfolding. This is interesting coffee.', tone: 'cheer' },
        { scoreMin: 9, scoreMax: 9, text: 'World-class. Every note is intentional and articulate. This is what specialty tastes like.', tone: 'cheer' },
      ],
    },
    mouthfeel: {
      descriptions: [
        { scoreMin: 0, scoreMax: 1, text: 'Watery. There\'s no body to speak of — it\'s like the coffee dissolved and gave up.', tone: 'pressure' },
        { scoreMin: 2, scoreMax: 3, text: 'Thin. Passes through without leaving any impression — you want more presence.', tone: 'pressure' },
        { scoreMin: 4, scoreMax: 5, text: 'Medium-light. It\'s fine but it won\'t carry the cup — you want more presence.', tone: 'neutral' },
        { scoreMin: 6, scoreMax: 7, text: 'Satisfying — coats the palate nicely. Good weight for this style.', tone: 'cheer' },
        { scoreMin: 8, scoreMax: 8, text: 'Luxurious and syrupy. Really nice texture that sticks with you.', tone: 'cheer' },
        { scoreMin: 9, scoreMax: 9, text: 'Velvety, heavy, unforgettable. This is the kind of body you crave in a natural or anaerobic.', tone: 'cheer' },
      ],
    },
    aftertaste: {
      descriptions: [
        { scoreMin: 0, scoreMax: 1, text: 'Bad finish. It lingers in the wrong way — you want it gone.', tone: 'pressure' },
        { scoreMin: 2, scoreMax: 3, text: 'Short and forgettable. Fades fast and doesn\'t leave anything good behind.', tone: 'pressure' },
        { scoreMin: 4, scoreMax: 5, text: 'Clean but short. Fine while it lasts, which isn\'t long — alright at best.', tone: 'neutral' },
        { scoreMin: 6, scoreMax: 7, text: 'Pleasant — makes you want another sip. That\'s what finish should do.', tone: 'cheer' },
        { scoreMin: 8, scoreMax: 8, text: 'Long and evolving. The finish keeps giving — this is quality.', tone: 'cheer' },
        { scoreMin: 9, scoreMax: 9, text: 'Beautiful. The finish alone makes the cup worth drinking. Long, clean, evolving — everything you want.', tone: 'cheer' },
      ],
    },
    overall: {
      descriptions: [
        { scoreMin: 0, scoreMax: 1, text: 'Fundamentally broken. Multiple things went wrong — start from scratch.', tone: 'pressure' },
        { scoreMin: 2, scoreMax: 3, text: 'Not good. Several issues adding up. You\'ve got work to do.', tone: 'pressure' },
        { scoreMin: 4, scoreMax: 5, text: 'Average. It\'s alright — not bad but not good either. It can be better, and it should be.', tone: 'neutral' },
        { scoreMin: 6, scoreMax: 7, text: 'Good — solid, drinkable, with clear strengths. You should be happy with this.', tone: 'cheer' },
        { scoreMin: 8, scoreMax: 8, text: 'Excellent. This is specialty-grade stuff. Well integrated, well executed.', tone: 'cheer' },
        { scoreMin: 9, scoreMax: 9, text: 'Outstanding. This competes. Memorable, refined, and absolutely dialled in.', tone: 'cheer' },
      ],
    },
  },
  patterns: [
    { condition: 'p.acidity>=6&&p.sweetness>=5&&p.flavor>=6&&p.mouthfeel>=4&&p.mouthfeel<=6', text: 'Bright & lively — acidity and flavour lead, body stays out of the way. Classic washed profile.' },
    { condition: 'p.acidity<=4&&p.sweetness>=6&&p.mouthfeel>=6&&p.aftertaste>=6', text: 'Rich & heavy — low acid, heavy body, long finish. This wants to be a natural or anaerobic.' },
    { condition: 'p.acidity>=5&&p.sweetness>=4&&p.sweetness<=6&&p.flavor>=5&&p.mouthfeel>=3&&p.mouthfeel<=5', text: 'Delicate & tea-like — light body with nice acidity. Subtle and elegant.' },
    { condition: 'p.acidity>=7&&p.mouthfeel>=7', text: '⚠ High acid AND heavy body — that\'s an unusual pair. Watch for textural clash.' },
    { condition: 'p.flavor<=3&&p.overall>=7', text: '⚠ Low flavour but high overall — these don\'t add up. Revisit your scoring logic.' },
    { condition: 'p.acidity>=7&&p.sweetness<=2', text: '⚠ Aggressive acidity with hardly any sweetness. This will read as sour to most people.' },
    { condition: 'p.mouthfeel<=3&&p.aftertaste>=7', text: '⚠ Thin body but long finish — sure that\'s real length or is it drying astringency?' },
  ],
  verdicts: [
    { cheerMin: 4, pressureMin: 0, hasFlags: false, text: 'Solid work. This is a genuinely good coffee — consistent, well-balanced, and enjoyable.' },
    { cheerMin: 4, pressureMin: 0, hasFlags: true, text: 'Strong profile with a couple of quirks. Sort the flags and this is competition-ready.' },
    { cheerMin: 0, pressureMin: 3, hasFlags: 'any', text: 'Too many weak points here. Go back to basics — grind, ratio, water temp — and rebuild.' },
    { cheerMin: 0, pressureMin: 1, hasFlags: 'any', text: 'A few things to tighten up. Pick the lowest axis and work on it — you\'ll feel the difference.' },
    { cheerMin: 0, pressureMin: 0, hasFlags: 'any', text: 'Balanced across the board. Nothing jumps out as wrong. Now pick one thing and push it to great.' },
  ],
  drinkability: [
    { scoreMin: 8, text: 'I\'d happily drink this again — and I\'d look forward to the next cup.', icon: '🔄' },
    { scoreMin: 6, text: 'I\'d finish the cup and probably order another. Solid daily drinker.', icon: '👍' },
    { scoreMin: 4, text: 'I\'d finish it, but I wouldn\'t miss it. It\'s alright — not bad, not memorable.', icon: '😐' },
    { scoreMin: 0, text: 'Honestly? I\'d struggle to finish this cup. Too many issues.', icon: '👎' },
  ],
  transcript: {
    openers: [
      'Alright, here\'s what I\'m getting.',
      'Let me walk you through the cup.',
      'This is my read on it — attribute by attribute.',
      'OK so starting from the top.',
    ],
    closers: [
      'That\'s where it\'s at. You know what to do.',
      'There you go. Fix the lows, keep the highs.',
      'That\'s the picture. Your call on what to chase next.',
      'So that\'s the honest read. Work the weak spots and this will come together.',
    ],
  },
};

export default data;
