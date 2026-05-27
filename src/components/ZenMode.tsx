import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ZenNote {
  id: string;
  text: string;
  tag: string;
  direction: 'under' | 'over' | '';
  x: number;
  y: number;
  locked: boolean;
  starred: boolean;
  counter: number;
  counterLabel: string;
  pct: number;
  timeM: number;
  timeS: number;
  grind: number;
  grindLow: number;
  grindHigh: number;
  temp: number;
  ratio: number;
  turbulence: number;
}

interface ZenArrow {
  id: string;
  fromNoteId: string;
  toFoundation: string;
  toNoteId?: string;
  color: 'hypothesis' | 'confirmed' | 'wrong';
  tag: string;
}

interface TagKnowledge {
  [tag: string]: {
    connections: { to: string; count: number; confirmed: number; wrong: number }[];
  };
}

const FOUNDATIONS = [
  { id: 'grind', label: 'Grindsize', color: '#3b82f6', rank: 1, desc: 'most impact — surface area & extraction' },
  { id: 'ratio', label: 'Ratio', color: '#22c55e', rank: 2, desc: 'strength — water to coffee balance' },
  { id: 'turbulence', label: 'Turbulence', color: '#f59e0b', rank: 3, desc: 'agitation — pour height & flow' },
  { id: 'temp-time', label: 'Temp & Time', color: '#ef4444', rank: 4, desc: 'heat & contact duration' },
];

const ZEN_KEY = 'belka.zenMode';
const KNOWLEDGE_KEY = 'belka.zenKnowledge';
// ── Bean Defect Knowledge ────────────────────────────────────
// Some taste symptoms are bean defects, not extraction problems.
// No foundation adjustment fixes a defective bean.

const DEFECT_KNOWLEDGE: Record<string, {
  defect: string;
  desc: string;
  signs: string;
  fix: string;
}> = {
  sour: { defect: 'Quakers / underripe beans', desc: 'Pale, underdeveloped beans taste like peanut shells, grass, or sharp sour — easily mistaken for under-extraction.', signs: 'Look at your roasted beans: do you see pale or light-brown beans mixed with darker ones? Pick them out, cup them separately.', fix: 'Pick out pale quakers before grinding. No extraction change fixes a quaker.' },
  grassy: { defect: 'Quakers / underripe beans', desc: 'Raw, grassy flavor that no amount of heat develops.', signs: 'Same as sour — pale beans in the roast. Also check roast date: too fresh (＜3 days) can taste grassy.', fix: 'Sort quakers, or rest beans 5-7 days post-roast.' },
  bitter: { defect: 'Tipped / scorched beans', desc: 'Dark beans with burned tips from roasting too fast. The tip chars before the center develops.', signs: 'Look for beans with dark/black tips. Also check for over-fermented (medicinal) notes.', fix: 'Sort tipped beans, or switch roaster. No pour-over adjustment fixes a scorched tip.' },
  muddy: { defect: 'Over-fermented / stinker beans', desc: 'Funky, fermented, almost medicinal. Some origins (natural Ethiopians) can mimic this in small doses.', signs: 'Does the muddiness taste like overripe fruit or rot? Check one bean at a time in your palm.', fix: 'Cull stinkers. If every brew has this, the green coffee is defective.' },
  flat: { defect: 'Baked beans / staling', desc: 'Stalled roast (baked) or simply old beans. No vibrancy, bread-like.', signs: 'Roast date older than 4 weeks? Or did the bean temp stall during roasting?', fix: 'Fresh roast, properly developed. Baked beans are permanently flat.' },
  astringent: { defect: 'Insect damage / broca', desc: 'Coffee borer beetle damage makes beans crumbly, producing harsh astringency.', signs: 'Look for tiny holes in beans. Broken or hollow beans in the bag.', fix: 'Sort damaged beans. No extraction change fixes insect damage.' },
};

// ── Extraction Direction ─────────────────────────────────────
// Every coffee problem is either under-extraction or over-extraction.
// First answer: do I need ↑ more or ↓ less extraction?

const TAG_DIRECTION: Record<string, 'under' | 'over' | ''> = {
  sour: 'under', weak: 'under', hollow: 'under', flat: 'under', sharp: 'under',
  bitter: 'over', dry: 'over', astringent: 'over', muddy: 'over', creamy: 'over',
  intensity: '', body: '', acidity: '', sweetness: '', balance: '',
  time: '', temp: '', grindsize: '', ratio: '', turbulence: '',
  equipment: '', grinder: '', 'water ppm': '', 'dripper flowrate': '',
  clogged: '', 'muddy bed': '', channeling: '', 'fast drawdown': '', stalling: '', 'even bed': '',
  counter: '', pct: '',
};

const UNDER_TAGS = Object.entries(TAG_DIRECTION).filter(([, d]) => d === 'under').map(([t]) => t);
const OVER_TAGS = Object.entries(TAG_DIRECTION).filter(([, d]) => d === 'over').map(([t]) => t);
const RECIPE_TAGS = ['time', 'temp', 'grindsize', 'ratio', 'turbulence'];
const EQUIPMENT_TAGS = ['equipment', 'grinder', 'water ppm', 'dripper flowrate'];
const BED_TAGS = ['clogged', 'muddy bed', 'channeling', 'fast drawdown', 'stalling', 'even bed'];
const UTILITY_TAGS = ['counter', 'pct'];

type TagGroup = { name: string; icon: string; base: string; active: string; hover: string; tags: string[] };
const TAG_GROUPS: TagGroup[] = [
  { name: '↑ Under', icon: '', base: 'bg-green-50 text-green-700 border-green-200', active: 'bg-green-700 text-white border-green-700', hover: 'hover:bg-green-100', tags: UNDER_TAGS },
  { name: '↓ Over', icon: '', base: 'bg-red-50 text-red-700 border-red-200', active: 'bg-red-700 text-white border-red-700', hover: 'hover:bg-red-100', tags: OVER_TAGS },
  { name: '📊 Recipe', icon: '', base: 'bg-white text-slate-600 border-slate-200', active: 'bg-slate-700 text-white border-slate-700', hover: 'hover:bg-slate-100', tags: RECIPE_TAGS },
  { name: '🔧 Equipment', icon: '', base: 'bg-indigo-50 text-indigo-600 border-indigo-200', active: 'bg-indigo-700 text-white border-indigo-700', hover: 'hover:bg-indigo-100', tags: EQUIPMENT_TAGS },
  { name: '☕ Bed', icon: '', base: 'bg-amber-50 text-amber-700 border-amber-200', active: 'bg-amber-700 text-white border-amber-700', hover: 'hover:bg-amber-100', tags: BED_TAGS },
  { name: '🧰 Utility', icon: '', base: 'bg-white text-slate-500 border-slate-200', active: 'bg-slate-700 text-white border-slate-700', hover: 'hover:bg-slate-100', tags: UTILITY_TAGS },
  { name: '🔄 You decide', icon: '', base: 'bg-white text-slate-500 border-slate-200', active: 'bg-slate-700 text-white border-slate-700', hover: 'hover:bg-slate-100', tags: ['intensity', 'body', 'acidity', 'sweetness', 'balance'] },
];

const FOUNDATION_ACTIONS: Record<string, string[]> = {
  grind: [
    'Turn the grinder knob — finer ↑ flow ↓ contact ↑',
    'Coarser ↓ flow ↑ contact ↓',
    'Your step: 0.1 = 11 micron — huge resolution',
    'Delivery time = how fast water flows through',
  ],
  ratio: [
    'Change coffee dose (grams)',
    'Change water volume (ml)',
    'More coffee = stronger cup, not more extraction',
    'Ratio changes strength, not contact time',
  ],
  turbulence: [
    'Pour height — higher = more agitation',
    'Pour speed — faster pours = more agitation',
    'Spout type — narrow spout = more jet',
    'More agitation = uneven extraction risk',
  ],
  'temp-time': [
    'Water temperature (°C) — hotter ↑ extraction',
    'Total brew time (seconds) — longer ↑ extraction',
    'Bloom time & volume',
    'Contact time = how long water sits with coffee',
  ],
};

const EXTRACTION_DIRECTIONS: Record<string, {
  label: string;
  arrow: string;
  color: string;
  desc: string;
  priority: string[];
  foundations: Record<string, { action: string; subTopic: string; causalChain: string; evidence: string; impact: number; impactDesc: string }>;
}> = {
  under: {
    label: 'Need MORE extraction',
    arrow: '↑', color: '#22c55e',
    desc: 'Not enough flavor compounds dissolved. Push extraction harder.',
    priority: ['grind', 'temp-time', 'turbulence', 'ratio'],
    foundations: {
      grind: { action: '↑ finer', subTopic: 'Surface area', causalChain: 'Finer grind → more surface → more compounds dissolve → higher extraction', evidence: 'EC peak too low, short extraction window', impact: 5, impactDesc: 'BIG rock — 1-2 clicks can overshoot' },
      'temp-time': { action: '↑ hotter/longer', subTopic: 'Thermal energy', causalChain: 'More heat or time → more energy for dissolution → deeper extraction', evidence: 'EC still rising when brew ends', impact: 3, impactDesc: 'Medium rock — adjust 3-5°C or 10-15s' },
      turbulence: { action: '↑ more agitation', subTopic: 'Convection', causalChain: 'More agitation → fresh water reaches particles → more diffusion → slightly more extraction', evidence: 'EC slope too shallow', impact: 2, impactDesc: 'Small rock — pour from higher, spiral outward' },
      ratio: { action: '↑ tighter ratio', subTopic: 'Concentration', causalChain: 'More coffee per water → higher TDS ceiling → more intense', evidence: 'EC curve low but shape normal', impact: 1, impactDesc: 'Tiny rock — 1-2g change, fine-tune last' },
    },
  },
  over: {
    label: 'Need LESS extraction',
    arrow: '↓', color: '#ef4444',
    desc: 'Too many compounds dissolved, especially bitter ones. Pull extraction back.',
    priority: ['temp-time', 'grind', 'turbulence', 'ratio'],
    foundations: {
      grind: { action: '↓ coarser', subTopic: 'Surface area', causalChain: 'Coarser grind → less surface → extraction slows → fewer bitter compounds', evidence: 'Peak EC too high, early peak', impact: 5, impactDesc: 'BIG rock — 1-2 clicks can fix it' },
      'temp-time': { action: '↓ cooler/shorter', subTopic: 'Thermal energy', causalChain: 'Less heat or time → less energy → stops before tannins dissolve', evidence: 'Long declining tail after peak', impact: 3, impactDesc: 'Medium rock — reduce 3-5°C or 10-15s' },
      turbulence: { action: '↓ gentler pours', subTopic: 'Channeling', causalChain: 'Gentler pours → fewer channels → no localized over-extraction → less bitterness', evidence: 'Sudden EC spikes then collapse', impact: 2, impactDesc: 'Small rock — pour lower, center stream' },
      ratio: { action: '↓ looser ratio', subTopic: 'Dilution', causalChain: 'More water per coffee → less concentration → bitter compounds diluted', evidence: 'EC stays elevated past peak', impact: 1, impactDesc: 'Tiny rock — 1-2g change, fine-tune last' },
    },
  },
};

// ── Mechanism Knowledge Base ────────────────────────────────
// Links taste symptoms (tags) through secondary physical concepts
// to the 4 foundations. This is the "why" behind each connection.

const MECHANISM_KNOWLEDGE: Record<string, {
  mechanism: string;
  summary: string;
  priority: string[]; // foundation IDs from most → least likely
  foundations: Record<string, {
    subTopic?: string;          // the secondary concept (concentration, surface area, etc.)
    causalChain?: string;       // step-by-step "this → that → result"
    experiment?: string;        // what to try to verify
    explanation: string;       // brief explanation
    evidence: string;          // EC curve evidence
    whyNot?: string;
    tell: string;              // observable signs to distinguish which foundation is the culprit
  }>;
}> = {
  bitter: {
    mechanism: 'Over-extraction of late solubles',
    summary: 'Tannins dissolve after desirable compounds are gone. Your bed gave too much contact.',
    priority: ['temp-time', 'grind', 'turbulence', 'ratio'],
    foundations: {
      grind: {
        subTopic: 'Surface area / Fines',
        causalChain: 'Finer grind → more surface area → extraction runs faster → bitter fractions dissolve before you can stop them',
        experiment: 'Go 1 click coarser at same time. If bitter drops but body holds, grind was the cause.',
        explanation: 'Finer = more surface area = faster extraction of bitter fractions at the end',
        evidence: 'Peak EC too high, early peak, steep decline', whyNot: 'If peak EC is normal but tail is long, grind is fine — suspect time.',
        tell: 'Drawdown fast, bitterness hits early in sip, fines visible on filter',
      },
      ratio: {
        subTopic: 'Solvent volume / Solubility curve',
        causalChain: 'More water → more solvent → extracts deeper into the solubility curve → pulls bitter compounds that would otherwise stay in the grounds',
        experiment: 'Increase dose by 1g (tighter ratio) at same grind and time. If bitterness drops, ratio was pushing too deep.',
        explanation: 'More water pulls deeper into the solubility curve, extracting bitter fractions',
        evidence: 'EC stays elevated well past peak, long flat decline', whyNot: 'Bitter from ratio is rare unless below 1:14. Check time and grind first.',
        tell: 'Thin body despite bitterness, normal drawdown, bitterness is hollow',
      },
      turbulence: {
        subTopic: 'Channeling / Localized over-extraction',
        causalChain: 'Aggressive pour → channels form → water rushes through some zones → those zones over-extract → bitter pockets in an otherwise balanced bed',
        experiment: 'Switch to gentle spiral pours at same ratio and grind. If bitter smooths out, turbulence was the cause.',
        explanation: 'Channeling creates localized over-extraction zones',
        evidence: 'Sudden EC spikes then rapid collapse', whyNot: 'Turbulence bitter usually comes with dryness. If not dry, rule out turbulence.',
        tell: 'Spurty/uneven drawdown, mud on one side of bed, sweet spots + bitter spots',
      },
      'temp-time': {
        subTopic: 'Contact time / Thermal energy',
        causalChain: 'Longer brew time → more contact between water and exhausted bed → tannins continue dissolving → bitter dominates the finish',
        experiment: 'Cut your brew 10s earlier at same ratio and grind. If the bitter finish disappears, time was the cause.',
        explanation: 'Longer time lets tannins dissolve after good extraction finishes',
        evidence: 'Long declining tail after peak, extended extraction phase', whyNot: '',
        tell: 'Drawdown normal, harsh/astringent finish at the very end, long EC tail',
      },
    },
  },
  sour: {
    mechanism: 'Under-extraction of sugars',
    summary: 'Acids extract first, sugars need more time. Sour means the brew stopped too early for sweetness.',
    priority: ['grind', 'temp-time', 'turbulence', 'ratio'],
    foundations: {
      grind: {
        explanation: 'Too coarse = insufficient surface area for sugar dissolution',
        evidence: 'EC peaks low, short extraction window', whyNot: '',
        tell: 'Very fast drawdown, sour from first sip, pale bed',
      },
      ratio: {
        explanation: 'Too little water = not enough solvent to reach sugars deep in particles',
        evidence: 'EC curve truncated, never reaches expected peak',
        whyNot: 'Sour from ratio usually comes with low body. If body is OK, suspect grind or time.',
        tell: 'Thin and sour together, weak body, normal drawdown speed',
      },
      turbulence: {
        explanation: 'Too little agitation = water sits stagnant, sugars don\'t diffuse out',
        evidence: 'Slow EC rise, shallow slope, low peak',
        whyNot: 'Low turbulence sour usually tastes "flat" rather than sharp. Sharp sour is grind or time.',
        tell: 'Uneven extraction, sour pockets in an otherwise okay cup',
      },
      'temp-time': {
        explanation: 'Too short or too cool = insufficient energy for sugar dissolution',
        evidence: 'EC drops while still rising, cut before peak', whyNot: '',
        tell: 'Drawdown stalled or too slow, sour at the end, water cooled too much',
      },
    },
  },
  dry: {
    mechanism: 'Fines migration & channeling',
    summary: 'Dry/astringent means micro-particles clogged the filter, creating uneven flow.',
    priority: ['turbulence', 'grind', 'temp-time'],
    foundations: {
      grind: {
        explanation: 'Too fine creates excess fines that migrate to the filter',
        evidence: 'Irregular phase pattern, then sudden collapse', whyNot: '',
        tell: 'Slow drawdown, astringent feeling coats entire tongue, muddy bed',
      },
      turbulence: {
        explanation: 'Aggressive pour dislodges fines from particles into the filter',
        evidence: 'Bed Integrity drops sharply at turbulence step', whyNot: '',
        tell: 'Some sweet spots, some dry spots, uneven bed cratering',
      },
      'temp-time': {
        explanation: 'Long drawdown from clogged filter prolongs contact with exhausted bed',
        evidence: 'Extended declining phase, very long tail',
        whyNot: 'Temp & Time alone doesn\'t cause dryness — it amplifies the effect of fines. Fix the source first.',
        tell: 'Normal drawdown, drying sensation only at finish, EC tail stays elevated',
      },
    },
  },
  weak: {
    mechanism: 'Insufficient total dissolved solids',
    summary: 'Not enough coffee solids made it into the cup. The brew left flavor behind.',
    priority: ['grind', 'temp-time', 'turbulence', 'ratio'],
    foundations: {
      grind: {
        explanation: 'Too coarse = particles too large, water can\'t penetrate fast enough',
        evidence: 'EC never rises to expected peak, low amplitude', whyNot: '',
        tell: 'Fast drawdown, watery from start, no body',
      },
      ratio: {
        explanation: 'Too much water relative to coffee = dilution exceeds extraction',
        evidence: 'EC curve low but shape is normal, just compressed',
        whyNot: 'Weak from ratio is the most obvious — if your ratio is 1:17+, that\'s probably it. Below 1:16, check grind.',
        tell: 'Classic \'not enough coffee\' — weak but balanced flavor, normal drawdown',
      },
      turbulence: {
        explanation: 'Too fast a pour = water passes through without sufficient contact',
        evidence: 'EC slope too shallow, peak too early', whyNot: '',
        tell: 'Inconsistent strength between pours, some layers extracted others not',
      },
      'temp-time': {
        explanation: 'Too short brew time = extraction stops before peak',
        evidence: 'EC still rising when brew ends', whyNot: '',
        tell: 'Normal drawdown, weak but no sourness, water not hot enough',
      },
    },
  },
  muddy: {
    mechanism: 'Fines overload in the bed',
    summary: 'Excessive fines create a slurry that clogs the filter and stalls the brew.',
    priority: ['grind', 'turbulence'],
    foundations: {
      grind: {
        subTopic: 'Particle size / Fines generation',
        causalChain: 'Too fine → excessive fines → fines fill pore spaces → water can\'t flow → bed stalls → muddy, slow drawdown',
        experiment: 'Go 1 click coarser. If drawdown normalizes and muddiness clears, grind was generating excess fines.',
        explanation: 'Too fine or poor grind uniformity produces excess fines',
        evidence: 'Drawdown time significantly longer than expected', whyNot: '',
        tell: 'Very slow drawdown, bed looks like sludge, fines migration visible',
      },
      turbulence: {
        subTopic: 'Fines migration',
        causalChain: 'Aggressive pouring → fines driven deep into bed → pores clog mid-brew → bed stalls → muddy finish',
        experiment: 'Use gentle pulse pours instead of aggressive spiral. If clarity improves, turbulence was driving fines into the filter.',
        explanation: 'High agitation pushes fines downward into the filter, accelerating clog',
        evidence: 'Bed Integrity drops early, collapse during main pour', whyNot: '',
        tell: 'Aggressive pouring, bed disturbed, fines washed through',
      },
    },
  },
  intensity: {
    mechanism: 'Total flavor compound concentration',
    summary: 'Intensity = how many solubles per sip. The ceiling is set by ratio, then modulated by grind and time.',
    priority: ['ratio', 'grind', 'temp-time', 'turbulence'],
    foundations: {
      ratio: {
        subTopic: 'Concentration / Dilution',
        causalChain: 'More coffee per water → higher TDS ceiling → more solubles per sip → higher perceived intensity',
        experiment: 'Brew the same coffee at 1:15 and 1:17, same grind. The 1:15 will always taste more intense.',
        explanation: 'Ratio sets the maximum possible intensity for a given dose. This is the strongest lever.',
        evidence: 'EC curve higher across the entire brew, proportional to ratio change', whyNot: '',
        tell: 'Most direct control. Intense + good balance = tight ratio working. Intense + harsh = too tight',
      },
      grind: {
        subTopic: 'Surface area / Extraction rate',
        causalChain: 'Finer grind → more surface area → more total extraction → higher TDS from same ratio → more intensity',
        experiment: 'Keep ratio at 1:16, go 2 clicks finer. Intensity goes up without changing water amount.',
        explanation: 'Grind lets you extract more from the same dose, pushing intensity without changing ratio.',
        evidence: 'Peak EC higher, extraction window shifts earlier', whyNot: 'If intense but also bitter, grind might be too fine — dial back before changing ratio.',
        tell: 'Intense + bitter = over. Intense + sour = under. Check drawdown speed',
      },
      'temp-time': {
        subTopic: 'Solubility / Contact time',
        causalChain: 'Hotter or longer → more energy for dissolution → more compounds extracted → modest intensity gain',
        experiment: 'Brew at 92°C vs 96°C at same ratio and grind. The hotter cup is slightly more intense.',
        explanation: 'Time and temp increase extraction yield but have less impact than ratio or grind.',
        evidence: 'EC curve extends higher or longer', whyNot: 'Intensity gains from time alone are small after peak. Use ratio or grind for meaningful changes.',
        tell: 'Intense + long finish = time. Intense + sharp = temp',
      },
      turbulence: {
        subTopic: 'Agitation / Channeling risk',
        causalChain: 'More agitation → slightly more extraction → small intensity gain → but risks channeling which kills intensity',
        experiment: 'Pour with high agitation vs gentle pulses at same ratio. The gentle pour might actually taste more intense if channeling was avoided.',
        explanation: 'Weakest intensity lever. Only relevant when other signs of channeling exist.',
        evidence: 'Minor EC increase followed by instability', whyNot: 'If you need more intensity, don\'t reach for turbulence — change ratio or grind first.',
        tell: 'Intense + uneven = channeling. Consistent intensity = other factors',
      },
    },
  },
  body: {
    mechanism: 'Lipid & colloid suspension in the cup',
    summary: 'Body is the tactile weight and mouthfeel — driven by fines, oils, and insoluble particles that pass through the filter.',
    priority: ['grind', 'turbulence', 'ratio', 'temp-time'],
    foundations: {
      grind: {
        subTopic: 'Fines generation',
        causalChain: 'Finer grind → more fines → fines pass through filter → more suspended solids → heavier body',
        experiment: 'Go 1 click finer at same ratio. If body improves without becoming muddy, grind is the lever.',
        explanation: 'Finer grind produces more fines that pass through the filter, increasing body',
        evidence: 'Muddier bed, longer drawdown', whyNot: '',
        tell: 'Finer = more body. If body is lacking but flavor is OK, go finer',
      },
      turbulence: {
        subTopic: 'Fines mobilization',
        causalChain: 'More agitation → more fines pushed through bed → more colloids in cup → heavier mouthfeel',
        experiment: 'Pour from higher vs lower at same grind. Higher pour = more body from fines.',
        explanation: 'More agitation pushes fines and oils through the filter bed into the cup',
        evidence: 'Higher turbidity in the cup, sediment visible', whyNot: '',
        tell: 'More agitation = more body. If body is thin, pour more aggressively',
      },
      ratio: {
        subTopic: 'Concentration',
        causalChain: 'More coffee per water → higher TDS → more dissolved solids per sip → heavier perceived body',
        experiment: 'Try 1:15 vs 1:17 at same grind and time. The tighter ratio has more body from concentration alone.',
        explanation: 'Higher ratio (less water) concentrates everything including body-forming compounds',
        evidence: 'Smaller volume, thicker mouthfeel',
        whyNot: 'Ratio affects body mostly through concentration — the actual body-forming compounds come from fines.',
        tell: 'More coffee = more body. Last resort — changes strength too',
      },
      'temp-time': {
        subTopic: 'Oil extraction',
        causalChain: 'Hotter water → more oils extracted → oils add viscosity → slightly fuller body',
        experiment: 'Brew same coffee at 88°C vs 96°C. The hotter cup has slightly more body from oils.',
        explanation: 'Higher temp extracts more oils and colloids, but the effect on body is secondary',
        evidence: 'Slightly fuller feel at higher temps', whyNot: '',
        tell: 'More time = more body. If body is thin, extend contact time',
      },
    },
  },
  hollow: {
    mechanism: 'Mid-palate collapse from under-extraction',
    summary: 'The coffee starts okay but drops off in the middle — no sweetness, no body, just a hole where flavor should be.',
    priority: ['grind', 'temp-time', 'turbulence', 'ratio'],
    foundations: {
      grind: {
        subTopic: 'Particle size distribution',
        causalChain: 'Coarse grind → large particles under-extract → center of particles untouched → hollow mid-palate with no sweetness',
        experiment: 'Go 2 clicks finer. If mid-palate fills in, grind was too coarse for development.',
        explanation: 'Coarse grind leaves the center of particles untouched, creating a hole in the flavor profile',
        evidence: 'EC curve rises slowly and never reaches expected peak', whyNot: 'If hollow + sour, it\'s definitely under-extraction. If hollow but balanced, check ratio.',
        tell: 'Fast drawdown, hollow + sour, no sweetness',
      },
      'temp-time': {
        subTopic: 'Contact time / Development',
        causalChain: 'Short contact time → insufficient extraction of mid-palate sugars → hollow taste without body or sweetness',
        experiment: 'Extend brew time by 15s at same grind. If mid-palate fills, time was too short.',
        explanation: 'Mid-palate development requires enough contact time for sugars to fully dissolve',
        evidence: 'EC still rising when brew ends, never reaches plateau', whyNot: '',
        tell: 'Normal drawdown, hollow but not sour, sweetness missing',
      },
      turbulence: {
        subTopic: 'Extraction uniformity',
        causalChain: 'Inconsistent agitation → some zones extract fully, others barely → uneven cup → hollow middle sips',
        experiment: 'Use consistent spiral pours throughout vs aggressive then passive. Consistent pours fill the mid-palate.',
        explanation: 'Poor agitation leaves some coffee underextracted, creating inconsistency in the cup',
        evidence: 'EC curve jagged with dips mid-brew', whyNot: '',
        tell: 'Uneven extraction, hollow in middle sips, okay first sip',
      },
      ratio: {
        subTopic: 'Strength / Concentration',
        causalChain: 'Too loose ratio → low TDS → thin, hollow cup with no weight in the middle of each sip',
        experiment: 'Increase dose by 1g (tighter ratio). If mid-palate fills, ratio was too loose.',
        explanation: 'Too little coffee per water produces a thin cup that can\'t sustain flavor through the sip',
        evidence: 'EC curve low but shape otherwise normal', whyNot: '',
        tell: 'Hollow + thin, low strength, normal drawdown',
      },
    },
  },
  flat: {
    mechanism: 'Under-developed acidity from insufficient energy',
    summary: 'No vibrancy, no life — the coffee tastes one-dimensional because the acids never developed properly.',
    priority: ['temp-time', 'grind', 'turbulence', 'ratio'],
    foundations: {
      'temp-time': {
        subTopic: 'Thermal energy / Acid development',
        causalChain: 'Water too cool or contact too short → acids never fully extract → coffee tastes flat, bready, lifeless',
        experiment: 'Raise water temp by 4°C at same brew time. If vibrancy appears, temp was the issue.',
        explanation: 'Acids require thermal energy to dissolve. Without enough heat, you get a flat, muted cup.',
        evidence: 'EC curve never rises with expected slope, stays low', whyNot: 'If flat + sour, it\'s not flat — it\'s under-extracted acidity. Flat = no acidity at all.',
        tell: 'Normal to slow drawdown, flat but not sour, muted flavors',
      },
      grind: {
        subTopic: 'Extraction rate',
        causalChain: 'Coarse grind → extraction too slow → acids never fully extract in brew window → flat cup',
        experiment: 'Go 2 clicks finer. If acidity appears, grind was limiting extraction rate.',
        explanation: 'Grind determines how fast acids can dissolve — too coarse and you leave them behind',
        evidence: 'EC curve too shallow, never peaks properly', whyNot: '',
        tell: 'Fast drawdown, flat + lifeless, no acidity at all',
      },
      turbulence: {
        subTopic: 'Agitation / Mass transfer',
        causalChain: 'Too little agitation → water film around particles saturates → extraction stalls → acids don\'t reach the cup',
        experiment: 'Pour more aggressively (higher, faster) at same grind and temp. If acidity appears, agitation was limiting.',
        explanation: 'Agitation brings fresh water to particle surfaces, keeping extraction going',
        evidence: 'EC curve stalls mid-brew, resumes on stir', whyNot: '',
        tell: 'Little agitation, boring cup, no vibrancy',
      },
      ratio: {
        subTopic: 'Dilution / Buffering',
        causalChain: 'Too loose ratio → coffee is diluted → even properly extracted acids taste muted → flat perception',
        experiment: 'Tighten ratio by 1g more coffee. If the cup gains life, ratio was diluting the acids.',
        explanation: 'Ratio can mask acidity by diluting it below perception threshold',
        evidence: 'EC curve low but shape normal, simply diluted', whyNot: '',
        tell: 'Flat + weak, under-coffeed',
      },
    },
  },
  sharp: {
    mechanism: 'Aggressive, piercing acidity from under-extraction',
    summary: 'Not the pleasant bright acidity — this is sharp, almost vinegar-like. The coffee is under-extracted.',
    priority: ['grind', 'temp-time', 'turbulence', 'ratio'],
    foundations: {
      grind: {
        subTopic: 'Channeling / Fines',
        causalChain: 'Too fine → channeling → water rushes through channels → under-extracts most coffee → sharp, vinegary acidity',
        experiment: 'Go 1 click coarser to stop channeling, then check if sharpness turns into pleasant acidity.',
        explanation: 'Sharp acidity often comes from channeling where most coffee is untouched while some over-extracts',
        evidence: 'EC spikes then drops sharply, channeling pattern', whyNot: '',
        tell: 'Very fast drawdown, sharp acidity, almost vinegar-like',
      },
      'temp-time': {
        subTopic: 'Thermal energy',
        causalChain: 'Water too cool → only bright acids extract → harsh, sharp acidity dominates because nothing balances it',
        experiment: 'Increase water temp by 5°C. If sharpness softens into pleasant acidity, temp was too low.',
        explanation: 'Cool water extracts the sharpest acids first and leaves behind the balancing compounds',
        evidence: 'EC curve starts low and stays low, never developing', whyNot: '',
        tell: 'Normal drawdown, sharp at the end, water too cool at start',
      },
      turbulence: {
        subTopic: 'Channeling risk',
        causalChain: 'Inconsistent pours → channels form → some coffee under-extracts → sharp pockets of acidity in the cup',
        experiment: 'Switch to gentle, even spiral pours. If sharpness disappears, turbulence was causing channels.',
        explanation: 'Inconsistent agitation creates localized under-extraction',
        evidence: 'Irregular EC curve with dips and spikes', whyNot: '',
        tell: 'Sharp in some sips, not others, inconsistent',
      },
      ratio: {
        subTopic: 'Buffer / Balance',
        causalChain: 'Too little coffee → no body or sweetness to buffer the acids → sharp acidity is unopposed and piercing',
        experiment: 'Add 2g more coffee (tighter ratio). If sharpness turns into balanced brightness, ratio was too loose.',
        explanation: 'A tight enough ratio provides body and sweetness that balance and soften acidity',
        evidence: 'EC curve low but shape normal, simply under-coffeed', whyNot: '',
        tell: 'Sharp + thin, too little coffee buffering the acid',
      },
    },
  },
  creamy: {
    mechanism: 'Oil and fines suspension from over-extraction',
    summary: 'The coffee has a thick, almost buttery texture. Pleasant in small amounts, but can indicate fines overload.',
    priority: ['grind', 'turbulence', 'temp-time', 'ratio'],
    foundations: {
      grind: {
        subTopic: 'Fines generation',
        causalChain: 'Very fine grind → excessive fines → fines pass through filter → oils emulsify → creamy, thick texture',
        experiment: 'Go 1 click coarser. If creaminess becomes cleanliness without losing flavor, fines were the cause.',
        explanation: 'Fine grind produces the fines and oils that create creamy body',
        evidence: 'Oily sheen on brew surface, slow drawdown', whyNot: '',
        tell: 'Very fine grind, oils on surface of brew, slow drawdown',
      },
      turbulence: {
        subTopic: 'Fines mobilization',
        causalChain: 'Aggressive pours → fines pushed into cup → oils forced through filter → creamy but possibly muddy texture',
        experiment: 'Pour gently (lower height, slower flow). If creaminess reduces to clean body, agitation was pushing fines.',
        explanation: 'Turbulence mobilizes fines and forces oils through the filter',
        evidence: 'Cloudy cup, sediment at bottom', whyNot: '',
        tell: 'Agitation pushed fines through filter, cloudy cup',
      },
      'temp-time': {
        subTopic: 'Oil extraction',
        causalChain: 'Hot water + long contact → more oils extracted → oils coalesce → thick, creamy mouthfeel',
        experiment: 'Reduce brew time by 15s at same grind and temp. If still creamy, it\'s not time-driven.',
        explanation: 'Longer contact extracts more oils, especially at higher temperatures',
        evidence: 'EC curve long and flat, extended tail', whyNot: '',
        tell: 'Normal grind but very long contact, oils extracted',
      },
      ratio: {
        subTopic: 'Concentration',
        causalChain: 'Very tight ratio → everything is concentrated → oils and fines at higher per-sip dose → heavy, creamy texture',
        experiment: 'Loosen ratio by 2g less coffee. If creaminess becomes normal body, ratio was over-concentrating.',
        explanation: 'Tight ratios concentrate all compounds including oils, creating perceived creaminess',
        evidence: 'EC curve high throughout, thick texture', whyNot: '',
        tell: 'Creamy + heavy, too much coffee, over-concentrated',
      },
    },
  },
  astringent: {
    mechanism: 'Tannin over-extraction from excessive contact',
    summary: 'The mouth-puckering sensation of tannins. Unlike bitter (taste), astringency is a physical drying feeling.',
    priority: ['temp-time', 'grind', 'turbulence', 'ratio'],
    foundations: {
      'temp-time': {
        subTopic: 'Tannin solubility',
        causalChain: 'Very long contact or high heat → tannins dissolve from bean structure → coat the tongue → astringent drying sensation',
        experiment: 'Cut brew time by 20s. If astringency drops, time was extracting tannins at the end.',
        explanation: 'Tannins are late-extracting compounds that require extended contact to dissolve',
        evidence: 'EC curve has long flat tail at elevated level', whyNot: '',
        tell: 'Normal drawdown, puckering only at finish, otherwise okay',
      },
      grind: {
        subTopic: 'Surface area / Fines',
        causalChain: 'Too fine → excessive surface area → tannins dissolve earlier and in higher quantity → aggressive astringency throughout',
        experiment: 'Go 2 clicks coarser. If astringency turns into smoothness, grind was too fine.',
        explanation: 'Fine grinds expose more tannin-containing structures to water',
        evidence: 'Very slow drawdown, EC stays high', whyNot: '',
        tell: 'Very slow drawdown, mouth-puckering, fines slurry',
      },
      turbulence: {
        subTopic: 'Channeling / Fines migration',
        causalChain: 'Aggressive pours → channels form → localized over-extraction → tannins concentrate in channels → astringent pockets',
        experiment: 'Use gentler, more uniform pours. If astringency smooths out, turbulence was causing channeling.',
        explanation: 'Channeling creates zones of extreme over-extraction where tannins dominate',
        evidence: 'Erratic EC curve with localized spikes', whyNot: '',
        tell: 'Over-agitated bed, fines in cup, gritty mouthfeel',
      },
      ratio: {
        subTopic: 'Dilution',
        causalChain: 'Too little coffee → same extraction depth → higher proportion of tannins relative to desirable compounds → astringent and thin',
        experiment: 'Increase dose by 2g (tighter ratio). If astringency is masked by body, ratio was too loose.',
        explanation: 'A weak ratio can make astringency more noticeable by lacking body to mask it',
        evidence: 'EC low but normal shape, thin cup', whyNot: '',
        tell: 'Astringent + watery, too little coffee for the contact achieved',
      },
    },
  },
  acidity: {
    mechanism: 'Organic acid extraction (desirable and undesirable)',
    summary: 'Acidity is the bright, lively character of coffee — but it can be pleasant (citric, malic) or unpleasant (acetic, sharp). The goal is the former.',
    priority: ['temp-time', 'grind', 'turbulence', 'ratio'],
    foundations: {
      'temp-time': {
        subTopic: 'Acid selectivity',
        causalChain: 'Lower temp → only bright, sharp acids extract → perceived as high acidity. Higher temp → all acids including sweet/balanced extract → acidity integrates.',
        experiment: 'Brew at 90°C vs 96°C. The cooler cup will taste more acidic but potentially sharper.',
        explanation: 'Temperature selects which acids dissolve — cool water favors bright acids',
        evidence: 'EC curve rises slowly at low temp, faster at high temp', whyNot: 'If acidity is pleasant and integrated, it\'s not a problem — it\'s good acidity.',
        tell: 'Lower temp = brighter but potentially harsher acidity. Higher temp = balanced but potentially muted.',
      },
      grind: {
        subTopic: 'Extraction rate',
        causalChain: 'Coarser grind → fewer acids extracted → less perceived acidity. Finer grind → more acids including pleasant ones → brighter cup.',
        experiment: 'Vary grind by 2 clicks in either direction. Finer = more dissolved acids. Coarser = less.',
        explanation: 'Grind controls how much total acid mass enters the cup',
        evidence: 'EC curve higher at same ratio with finer grind', whyNot: '',
        tell: 'Finer = more acidity (good and bad). Coarser = less acidity.',
      },
      turbulence: {
        subTopic: 'Extraction uniformity',
        causalChain: 'Even agitation → uniform acid extraction → clean, integrated acidity. Uneven pours → some acids under-extracted → harsh, unbalanced acidity.',
        experiment: 'Use consistent spiral pours. If acidity becomes cleaner and more pleasant, uniformity was the issue.',
        explanation: 'Uniformity of extraction determines whether acidity tastes clean or harsh',
        evidence: 'Clean vs jagged EC curve', whyNot: '',
        tell: 'Even agitation = clean acidity. Uneven = harsh, unbalanced.',
      },
      ratio: {
        subTopic: 'Perception / Buffering',
        causalChain: 'Tighter ratio → higher concentration → acids are more perceptible → acidity is more prominent. Looser ratio → acids diluted → less perceived acidity.',
        experiment: 'Brew 1:14 vs 1:18 at same grind/time. The tighter ratio will have more prominent acidity.',
        explanation: 'Ratio doesn\'t change the acids present, but how prominent they taste',
        evidence: 'Same EC curve shape at different absolute levels', whyNot: '',
        tell: 'Tighter ratio = more prominent acidity. Looser = more muted.',
      },
    },
  },
  sweetness: {
    mechanism: 'Sugar extraction and acid-sugar balance',
    summary: 'Sweetness in coffee isn\'t added sugar — it\'s the perception of caramelized compounds and balanced acids. Maximum sweetness comes from optimal development.',
    priority: ['temp-time', 'grind', 'turbulence', 'ratio'],
    foundations: {
      'temp-time': {
        subTopic: 'Sugar development',
        causalChain: 'Enough heat and time → caramelized sugars extract → sweetness balances acidity. Too little → sour dominates. Too much → bitter dominates.',
        experiment: 'Find the sweet spot: brew at 93°C and adjust time in 10s increments. The sweetest cup is where acidity and body are in harmony.',
        explanation: 'Sweetness lives in the Goldilocks zone between under and over-extraction',
        evidence: 'EC curve rises steadily to plateau, then holds', whyNot: '',
        tell: 'Sweetness is the signal of optimal extraction. If present, you\'re in the right window.',
      },
      grind: {
        subTopic: 'Particle size / Extraction window',
        causalChain: 'Optimal grind → particles extract evenly → sugars and acids balance → sweetness emerges. Too coarse → sour. Too fine → bitterness masks sweetness.',
        experiment: 'Dial grind 1 click at a time tasting for the sweetest cup. It will be right before bitterness appears.',
        explanation: 'Grind finds the extraction window where sweetness is maximized',
        evidence: 'EC curve with clean peak and gentle decline', whyNot: '',
        tell: 'The sweetest grind setting is usually just before the first hint of bitterness.',
      },
      turbulence: {
        subTopic: 'Extraction uniformity',
        causalChain: 'Even agitation → all particles contribute equally → sweetness from all zones adds up. Uneven → some bitter, some sour → no sweetness.',
        experiment: 'Focus on consistent spiral pours. If sweetness appears, you were losing it to uneven extraction.',
        explanation: 'Uniform extraction maximizes the total sweetness in the cup',
        evidence: 'Clean, stable EC curve without dips', whyNot: '',
        tell: 'Even pours = more total sweetness. Uneven pours = lost sweetness.',
      },
      ratio: {
        subTopic: 'Balance / Perception',
        causalChain: 'Optimal ratio → sweetness is perceptible without being cloying. Too tight → sweetness becomes heavy/syrupy. Too loose → sweetness disappears into thinness.',
        experiment: 'Once grind/time are sweet, adjust ratio 1g at a time to find where sweetness is brightest.',
        explanation: 'Ratio fine-tunes how sweetness is perceived relative to strength',
        evidence: 'EC curve at right height for balanced cup', whyNot: '',
        tell: 'Sweetness is clearest at the right ratio — too tight masks it, too loose dilutes it.',
      },
    },
  },
  balance: {
    mechanism: 'Harmony between acidity, sweetness, body, and bitterness',
    summary: 'Balance isn\'t a single lever — it\'s the result of all four foundations working together. An unbalanced cup means one element is dominating.',
    priority: ['grind', 'temp-time', 'turbulence', 'ratio'],
    foundations: {
      grind: {
        subTopic: 'Extraction equilibrium',
        causalChain: 'Correct grind → acids, sugars, and structure compounds extract in proportion → balanced cup. Wrong grind favors one over the others.',
        experiment: 'If the cup is sour-harsh → go finer. If bitter-dry → go coarser. Balance lives between the two.',
        explanation: 'Grind is the primary balance tool because it affects all extraction rates simultaneously',
        evidence: 'EC curve peak height and timing indicate balance or imbalance', whyNot: '',
        tell: 'Sour = too coarse. Bitter = too fine. Balanced = just right.',
      },
      'temp-time': {
        subTopic: 'Sequential extraction',
        causalChain: 'Start with acids, then sugars, then structure → if each phase gets the right time → all elements present → balanced cup. Any phase cut short = imbalance.',
        experiment: 'Map your brew: first 30s = acids, middle = sugars, last = body/tannins. Adjust time so none is cut off.',
        explanation: 'Time controls which extraction phase dominates the cup',
        evidence: 'EC curve shape tells which phase is over or under-represented', whyNot: '',
        tell: 'Too sour = first phase too dominant. Too bitter = last phase too long. Balanced = all phases proportional.',
      },
      turbulence: {
        subTopic: 'Phase mixing',
        causalChain: 'Even agitation → all phases contribute evenly → balance. Channeling → some phases over-extracted, others under → imbalance.',
        experiment: 'Use the same pour structure every brew. If balance improves, turbulence inconsistency was the hidden issue.',
        explanation: 'Turbulence determines whether extraction happens uniformly across the bed',
        evidence: 'EC curve stability indicates uniform extraction', whyNot: '',
        tell: 'If balance varies between sips, check pour consistency. If every sip is equally unbalanced, it\'s not turbulence.',
      },
      ratio: {
        subTopic: 'Overall intensity',
        causalChain: 'Correct ratio → all flavors are at the right intensity → none overpowers. Wrong ratio → everything is too strong or too weak → balance feels off.',
        experiment: 'Once grind and time produce a balanced extraction, adjust ratio for the final polish. Too intense dials back, too thin dials forward.',
        explanation: 'Ratio is the final trim — it adjusts the volume of all flavors equally',
        evidence: 'EC curve height relative to expected range', whyNot: '',
        tell: 'Too intense = loosen ratio. Too thin = tighten ratio. Both can feel unbalanced.',
      },
    },
  },
};

function loadState() {
  try {
    const raw = localStorage.getItem(ZEN_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { notes: [], arrows: [], lockedFoundations: [], foundationPositions: {} };
}

function saveState(state: { notes: ZenNote[]; arrows: ZenArrow[]; lockedFoundations: string[]; foundationPositions: Record<string, {x: number; y: number}> }) {
  localStorage.setItem(ZEN_KEY, JSON.stringify(state));
}

function loadKnowledge(): TagKnowledge {
  try {
    const raw = localStorage.getItem(KNOWLEDGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveKnowledge(k: TagKnowledge) {
  localStorage.setItem(KNOWLEDGE_KEY, JSON.stringify(k));
}

let noteCounter = 0;

export default function ZenMode({ onClose }: { onClose?: () => void }) {
  const [notes, setNotes] = useState<ZenNote[]>(() => loadState().notes);
  const [arrows, setArrows] = useState<ZenArrow[]>(() => loadState().arrows);
  const [dragging, setDragging] = useState<{ noteId: string; offsetX: number; offsetY: number } | null>(null);
  const [foundationDrag, setFoundationDrag] = useState<{ fid: string; offsetX: number; offsetY: number } | null>(null);
  const [connecting, setConnecting] = useState<{ fromNoteId: string } | null>(null);
  const [hoverDot, setHoverDot] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<TagKnowledge>(() => loadKnowledge());
  const scrollRef = useRef<HTMLDivElement>(null);
  const noteElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [showTagPicker, setShowTagPicker] = useState<string | null>(null);
  const [selectedArrow, setSelectedArrow] = useState<string | null>(null);
  const [expandedChain, setExpandedChain] = useState<string | null>(null);
  const [defectOpen, setDefectOpen] = useState(false);
  const [expandedFoundation, setExpandedFoundation] = useState<string | null>(null);
  const [lockedFoundations, setLockedFoundations] = useState<string[]>(() => loadState().lockedFoundations ?? []);
  const [foundationPositions, setFoundationPositions] = useState<Record<string, {x: number; y: number}>>(() => {
    const saved = loadState().foundationPositions;
    if (saved && Object.keys(saved).length) return saved;
    const defaults: Record<string, {x: number; y: number}> = {};
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1400;
    const startX = vw - 200;
    FOUNDATIONS.forEach((f, i) => { defaults[f.id] = { x: startX, y: 100 + i * 130 }; });
    return defaults;
  });

  // Auto-expand first priority when 💡 opens, clear when it closes
  useEffect(() => {
    if (selectedArrow) {
      const n = notes.find(x => x.id === selectedArrow);
      const m = n?.tag ? MECHANISM_KNOWLEDGE[n.tag] : null;
      if (m?.priority?.[0]) setExpandedChain(`${selectedArrow}:${m.priority[0]}`);
      setDefectOpen(false);
    } else {
      setExpandedChain(null);
    }
  }, [selectedArrow]);
  const [showFoundations, setShowFoundations] = useState(true);
  const [, setScrollTick] = useState(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const grindDragRef = useRef<string | null>(null);

  const alignment = useMemo(() => {
    const dirs: Record<string, { total: number; aligned: number }> = { under: { total: 0, aligned: 0 }, over: { total: 0, aligned: 0 } };
    arrows.forEach(a => {
      if (a.color !== 'confirmed' || a.toNoteId) return;
      const note = notes.find(n => n.id === a.fromNoteId);
      if (!note || !note.direction) return;
      const tagDir = TAG_DIRECTION[a.tag] || '';
      dirs[note.direction].total++;
      if (tagDir === '' || tagDir === note.direction) dirs[note.direction].aligned++;
    });
    return {
      under: dirs.under.total ? Math.round(dirs.under.aligned / dirs.under.total * 100) : null,
      over: dirs.over.total ? Math.round(dirs.over.aligned / dirs.over.total * 100) : null,
    };
  }, [arrows, notes]);

  // Re-render on scroll so fixed SVG arrows track DOM positions
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTick(t => t + 1);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    saveState({ notes, arrows, lockedFoundations, foundationPositions });
  }, [notes, arrows, lockedFoundations, foundationPositions]);

  useEffect(() => {
    saveKnowledge(knowledge);
  }, [knowledge]);

  const addNote = useCallback(() => {
    noteCounter++;
    const note: ZenNote = {
      id: `note-${Date.now()}-${noteCounter}`,
      text: 'note',
      tag: '',
      direction: '',
      locked: false,
      starred: false,
      counter: 1,
      counterLabel: '',
      pct: 50,
      x: 60 + (noteCounter % 5) * 40,
      y: 100 + (noteCounter % 4) * 80,
      timeM: 0, timeS: 0, grind: 0, grindLow: 0, grindHigh: 0, temp: 0, ratio: 0, turbulence: 0,
    };
    setNotes(prev => [...prev, note]);
    setSelectedArrow(null);
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    setArrows(prev => prev.filter(a => a.fromNoteId !== id && a.toNoteId !== id));
    setSelectedArrow(prev => prev === id ? null : prev);
  }, []);

  const updateNote = useCallback((id: string, patch: Partial<ZenNote>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
  }, []);

  const startDrag = useCallback((noteId: string, e: React.MouseEvent) => {
    const note = notes.find(n => n.id === noteId);
    if (!note || note.locked) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    const cr = scroll.getBoundingClientRect();
    const sx = scroll.scrollLeft;
    const sy = scroll.scrollTop;
    setDragging({ noteId, offsetX: e.clientX - cr.left + sx - note.x, offsetY: e.clientY - cr.top + sy - note.y });
  }, [notes]);

  const startDragTouch = useCallback((noteId: string, e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'BUTTON') return;
    const note = notes.find(n => n.id === noteId);
    if (!note || note.locked) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    const t = e.touches[0];
    const cr = scroll.getBoundingClientRect();
    const sx = scroll.scrollLeft;
    const sy = scroll.scrollTop;
    setDragging({ noteId, offsetX: t.clientX - cr.left + sx - note.x, offsetY: t.clientY - cr.top + sy - note.y });
  }, [notes]);

  const startConnect = useCallback((noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConnecting({ fromNoteId: noteId });
    setHoverDot(null);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
    if (foundationDrag) {
      const clamped = {
        x: Math.max(8, Math.min(e.clientX - foundationDrag.offsetX, window.innerWidth - 160)),
        y: Math.max(76, Math.min(e.clientY - foundationDrag.offsetY, window.innerHeight - 110))
      };
      setFoundationPositions(prev => ({ ...prev, [foundationDrag.fid]: clamped }));
    }
    if (dragging) {
      const scroll = scrollRef.current;
      if (!scroll) return;
      const cr = scroll.getBoundingClientRect();
      const sx = scroll.scrollLeft;
      const sy = scroll.scrollTop;
      const canvasW = Math.max(1200, scroll.scrollWidth);
      const canvasH = Math.max(150 * window.innerHeight / 100, scroll.scrollHeight);
      setNotes(prev => prev.map(n =>
        n.id === dragging.noteId ? {
          ...n,
          x: Math.max(0, Math.min(e.clientX - cr.left + sx - dragging.offsetX, canvasW - 200)),
          y: Math.max(0, Math.min(e.clientY - cr.top + sy - dragging.offsetY, canvasH - 100))
        } : n
      ));
    }
    if (connecting) {
      const cx = e.clientX;
      const cy = e.clientY;
      // Check foundation dots
      const dot = document.querySelector('.foundation-dot:hover, .foundation-dot.hover');
      let closest: string | null = null;
      let closestDist = 28;
      if (dot) {
        const fid = dot.getAttribute('data-fid');
        closest = fid;
        closestDist = 0;
      } else {
        document.querySelectorAll('.foundation-dot').forEach(el => {
          const r = el.getBoundingClientRect();
          const ddx = r.left + r.width / 2;
          const ddy = r.top + r.height / 2;
          const dist = Math.sqrt((cx - ddx) ** 2 + (cy - ddy) ** 2);
          if (dist < closestDist) {
            closestDist = dist;
            closest = el.getAttribute('data-fid');
          }
        });
      }
      // Also check note connect dots (avoid self)
      document.querySelectorAll('.note-connect-dot').forEach(el => {
        const nid = el.getAttribute('data-noteid');
        if (nid === connecting.fromNoteId) return;
        const r = el.getBoundingClientRect();
        const ndx = r.left + r.width / 2;
        const ndy = r.top + r.height / 2;
        const dist = Math.sqrt((cx - ndx) ** 2 + (cy - ndy) ** 2);
        if (dist < closestDist) {
          closestDist = dist;
          closest = 'note:' + nid;
        }
      });
      setHoverDot(closest);
    }
  }, [dragging, connecting, foundationDrag]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (connecting) {
      const cx = e.clientX;
      const cy = e.clientY;
      let hitFid: string | null = null;
      let hitNid: string | null = null;
      document.querySelectorAll('.foundation-dot').forEach(el => {
        const r = el.getBoundingClientRect();
        const ddx = r.left + r.width / 2;
        const ddy = r.top + r.height / 2;
        const dist = Math.sqrt((cx - ddx) ** 2 + (cy - ddy) ** 2);
        if (dist < 30) hitFid = el.getAttribute('data-fid');
      });
      document.querySelectorAll('.note-connect-dot').forEach(el => {
        const nid = el.getAttribute('data-noteid');
        if (nid === connecting.fromNoteId) return;
        const r = el.getBoundingClientRect();
        const ndx = r.left + r.width / 2;
        const ndy = r.top + r.height / 2;
        const dist = Math.sqrt((cx - ndx) ** 2 + (cy - ndy) ** 2);
        if (dist < 30) hitNid = nid;
      });
      const note = notes.find(n => n.id === connecting.fromNoteId);
      const tag = note?.tag || 'untagged';
      if (hitFid) {
        const fid: string = hitFid;
        setArrows(prev => {
          const exists = prev.some(a => a.fromNoteId === connecting.fromNoteId && a.toFoundation === fid);
          if (exists) return prev;
          const arrow: ZenArrow = { id: `arrow-${Date.now()}`, fromNoteId: connecting.fromNoteId, toFoundation: fid, toNoteId: '', color: 'confirmed', tag };
          return [...prev, arrow];
        });
      }
      if (hitNid) {
        const nid: string = hitNid;
        setArrows(prev => {
          const exists = prev.some(a => a.fromNoteId === connecting.fromNoteId && a.toNoteId === nid);
          if (exists) return prev;
          const arrow: ZenArrow = { id: `arrow-${Date.now()}`, fromNoteId: connecting.fromNoteId, toFoundation: '', toNoteId: nid, color: 'hypothesis', tag };
          return [...prev, arrow];
        });
      }
    }
    if (dragging || connecting || foundationDrag) {
      setDragging(null);
      setConnecting(null);
      setFoundationDrag(null);
      setHoverDot(null);
    }
  }, [connecting, dragging, foundationDrag, notes]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    mouseRef.current = { x: t.clientX, y: t.clientY };
    if (foundationDrag) {
      e.preventDefault();
      const clamped = {
        x: Math.max(8, Math.min(t.clientX - foundationDrag.offsetX, window.innerWidth - 160)),
        y: Math.max(76, Math.min(t.clientY - foundationDrag.offsetY, window.innerHeight - 110))
      };
      setFoundationPositions(prev => ({ ...prev, [foundationDrag.fid]: clamped }));
    }
    if (dragging) {
      e.preventDefault();
      const scroll = scrollRef.current;
      if (!scroll) return;
      const cr = scroll.getBoundingClientRect();
      const sx = scroll.scrollLeft;
      const sy = scroll.scrollTop;
      const canvasW = Math.max(1200, scroll.scrollWidth);
      const canvasH = Math.max(150 * window.innerHeight / 100, scroll.scrollHeight);
      setNotes(prev => prev.map(n =>
        n.id === dragging.noteId ? {
          ...n,
          x: Math.max(0, Math.min(t.clientX - cr.left + sx - dragging.offsetX, canvasW - 200)),
          y: Math.max(0, Math.min(t.clientY - cr.top + sy - dragging.offsetY, canvasH - 100))
        } : n
      ));
    }
    if (connecting) {
      const cx = t.clientX;
      const cy = t.clientY;
      let closest: string | null = null;
      let closestDist = 28;
      document.querySelectorAll('.foundation-dot').forEach(el => {
        const r = el.getBoundingClientRect();
        const ddx = r.left + r.width / 2;
        const ddy = r.top + r.height / 2;
        const dist = Math.sqrt((cx - ddx) ** 2 + (cy - ddy) ** 2);
        if (dist < closestDist) { closestDist = dist; closest = el.getAttribute('data-fid'); }
      });
      document.querySelectorAll('.note-connect-dot').forEach(el => {
        const nid = el.getAttribute('data-noteid');
        if (nid === connecting.fromNoteId) return;
        const r = el.getBoundingClientRect();
        const ndx = r.left + r.width / 2;
        const ndy = r.top + r.height / 2;
        const dist = Math.sqrt((cx - ndx) ** 2 + (cy - ndy) ** 2);
        if (dist < closestDist) { closestDist = dist; closest = 'note:' + nid; }
      });
      setHoverDot(closest);
    }
  }, [dragging, connecting, foundationDrag]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (connecting) {
      const t = e.changedTouches[0];
      const cx = t.clientX;
      const cy = t.clientY;
      let hitFid: string | null = null;
      let hitNid: string | null = null;
      document.querySelectorAll('.foundation-dot').forEach(el => {
        const r = el.getBoundingClientRect();
        const ddx = r.left + r.width / 2;
        const ddy = r.top + r.height / 2;
        const dist = Math.sqrt((cx - ddx) ** 2 + (cy - ddy) ** 2);
        if (dist < 30) hitFid = el.getAttribute('data-fid');
      });
      document.querySelectorAll('.note-connect-dot').forEach(el => {
        const nid = el.getAttribute('data-noteid');
        if (nid === connecting.fromNoteId) return;
        const r = el.getBoundingClientRect();
        const ndx = r.left + r.width / 2;
        const ndy = r.top + r.height / 2;
        const dist = Math.sqrt((cx - ndx) ** 2 + (cy - ndy) ** 2);
        if (dist < 30) hitNid = nid;
      });
      const note = notes.find(n => n.id === connecting.fromNoteId);
      const tag = note?.tag || 'untagged';
      if (hitFid) {
        const fid: string = hitFid;
        setArrows(prev => {
          const exists = prev.some(a => a.fromNoteId === connecting.fromNoteId && a.toFoundation === fid);
          if (exists) return prev;
          const arrow: ZenArrow = { id: `arrow-${Date.now()}`, fromNoteId: connecting.fromNoteId, toFoundation: fid, toNoteId: '', color: 'confirmed', tag };
          return [...prev, arrow];
        });
      }
      if (hitNid) {
        const nid: string = hitNid;
        setArrows(prev => {
          const exists = prev.some(a => a.fromNoteId === connecting.fromNoteId && a.toNoteId === nid);
          if (exists) return prev;
          const arrow: ZenArrow = { id: `arrow-${Date.now()}`, fromNoteId: connecting.fromNoteId, toFoundation: '', toNoteId: nid, color: 'hypothesis', tag };
          return [...prev, arrow];
        });
      }
    }
    if (dragging || connecting || foundationDrag) {
      setDragging(null);
      setConnecting(null);
      setFoundationDrag(null);
      setHoverDot(null);
    }
  }, [connecting, dragging, foundationDrag, notes]);

  const cycleArrowColor = useCallback((arrowId: string) => {
    setArrows(prev => prev.map(a => {
      if (a.id !== arrowId) return a;
      // Foundation arrows: binary on/off (foundation color ↔ gray)
      if (a.toFoundation) {
        const newColor = a.color === 'confirmed' ? 'hypothesis' : 'confirmed';
        return { ...a, color: newColor };
      }
      // Note-to-note arrows: keep 3-way cycle
      const next: Record<string, 'confirmed' | 'wrong' | 'hypothesis'> = {
        hypothesis: 'confirmed',
        confirmed: 'wrong',
        wrong: 'hypothesis',
      };
      const newColor = next[a.color];
      // Update knowledge
      if (a.tag && a.tag !== 'untagged') {
        setKnowledge(k => {
          const nk = { ...k };
          const tagData = nk[a.tag];
          if (tagData) {
            const conn = tagData.connections.find(c => c.to === a.toFoundation);
            if (conn) {
              if (newColor === 'confirmed') conn.confirmed++;
              if (newColor === 'wrong') conn.wrong++;
            }
          }
          return nk;
        });
      }
      return { ...a, color: newColor };
    }));
  }, []);

  const deleteArrow = useCallback((arrowId: string) => {
    setArrows(prev => prev.filter(a => a.id !== arrowId));
  }, []);

  const getNoteDotPos = (noteId: string) => {
    const el = noteElsRef.current.get(noteId);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width, y: r.top + r.height / 2 };
  };

  const getFoundationDotPos = (fid: string) => {
    const el = document.querySelector(`.foundation-dot[data-fid="${fid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const arrowPath = (fromX: number, fromY: number, toX: number, toY: number) => {
    const dx = toX - fromX;
    const cp = Math.max(40, Math.abs(dx) * 0.4);
    return `M ${fromX} ${fromY} C ${fromX + cp} ${fromY}, ${toX - cp} ${toY}, ${toX} ${toY}`;
  };

  const arrowColor = (a: { color: string; toFoundation: string }) => {
    if (a.toFoundation) {
      if (a.color === 'confirmed') {
        return FOUNDATIONS.find(f => f.id === a.toFoundation)?.color || '#22c55e';
      }
      return '#94a3b8';
    }
    switch (a.color) {
      case 'confirmed': return '#22c55e';
      case 'wrong': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  const arrowStyle = (color: string) => {
    switch (color) {
      case 'hypothesis': return '3,3';
      default: return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f8f6f0] flex flex-col"
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onMouseUp={handleMouseUp}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white/70 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700 uppercase tracking-widest">☯ Zen</span>
          <span className="text-[10px] text-slate-400 italic">connect your taste to the fundamentals</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { saveState({ notes, arrows, lockedFoundations, foundationPositions }); }}
            className="px-3 py-1 text-[11px] font-semibold border border-slate-300 rounded-md text-slate-600 hover:bg-slate-100"
          >Save</button>
          <button onClick={() => { setShowFoundations(p => !p); }}
            className="px-3 py-1 text-[11px] font-semibold border border-slate-300 rounded-md text-slate-600 hover:bg-slate-100"
          >{showFoundations ? '🧭 Hide' : '🧭 Show'}</button>
          <button onClick={() => setFoundationPositions({})}
            className="px-3 py-1 text-[11px] font-semibold border border-slate-300 rounded-md text-slate-600 hover:bg-slate-100"
          >↺ Restore</button>
          <button onClick={() => { setNotes([]); setArrows([]); }}
            className="px-3 py-1 text-[11px] font-semibold border border-slate-300 rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
          >Clear</button>
          {onClose && (
            <button onClick={onClose}
              className="px-3 py-1 text-[11px] font-semibold border border-slate-300 rounded-md text-slate-600 hover:bg-slate-100"
            >× Exit</button>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="px-4 py-1.5 text-[10px] text-slate-400 italic border-b border-slate-100 bg-[#f8f6f0] shrink-0 select-none">
        Drag notes freely · <span className="font-medium text-slate-500">Drag the ◉ dot</span> from a note toward a foundation's dot to connect · Click arrow: dashed (hyp) → green (✓) → red (✗) · Right-click to delete
      </div>

      {/* SVG layer — fixed to viewport, behind notes so lines don't overlap */}
      <svg className="fixed inset-0 w-full h-full pointer-events-none z-[28]">
        {arrows.map(a => {
          const fromP = getNoteDotPos(a.fromNoteId);
          const toP = a.toNoteId ? getNoteDotPos(a.toNoteId) : getFoundationDotPos(a.toFoundation);
          if (!fromP || !toP) return null;
          const midX = (fromP.x + toP.x) / 2;
          const midY = (fromP.y + toP.y) / 2;
          return (
            <g key={a.id} className="pointer-events-auto cursor-pointer"
              onClick={() => cycleArrowColor(a.id)}
              onContextMenu={(e) => { e.preventDefault(); deleteArrow(a.id); }}
            >
              {selectedArrow === a.id && (
                <path d={arrowPath(fromP.x, fromP.y, toP.x, toP.y)}
                  fill="none" stroke="#3b82f6" strokeWidth={6} strokeDasharray={arrowStyle(a.color)} opacity={0.2}
                />
              )}
              <path d={arrowPath(fromP.x, fromP.y, toP.x, toP.y)}
                fill="none" stroke="white" strokeWidth={4.5} strokeDasharray={arrowStyle(a.color)} opacity={0.8}
              />
              <path d={arrowPath(fromP.x, fromP.y, toP.x, toP.y)}
                fill="none" stroke={arrowColor(a)} strokeWidth={2.5} strokeDasharray={arrowStyle(a.color)}
              />
              {a.toNoteId ? (
                <circle cx={toP.x} cy={toP.y} r={3} fill={arrowColor(a)} />
              ) : (
                <circle cx={toP.x} cy={toP.y} r={4} fill={arrowColor(a)} />
              )}
              <path d={arrowPath(fromP.x, fromP.y, toP.x, toP.y)}
                fill="none" stroke="transparent" strokeWidth={16}
              />
              {!a.toNoteId && a.tag && a.tag !== 'untagged' && (() => {
                const mech = MECHANISM_KNOWLEDGE[a.tag];
                const mechanismName = mech ? mech.mechanism : a.tag;
                return (
                  <text x={midX} y={midY - 10}
                    textAnchor="middle" fontSize="6" fill={arrowColor(a)} className="pointer-events-none select-none font-semibold"
                  >{mechanismName}</text>
                );
              })()}
            </g>
          );
        })}
        {connecting && (() => {
          const fromP = getNoteDotPos(connecting.fromNoteId);
          if (!fromP) return null;
          let toX = mouseRef.current.x;
          let toY = mouseRef.current.y;
          if (hoverDot) {
            if (hoverDot.startsWith('note:')) {
              const nid = hoverDot.slice(5);
              const np = getNoteDotPos(nid);
              if (np) { toX = np.x; toY = np.y; }
            } else {
              const fp = getFoundationDotPos(hoverDot);
              if (fp) { toX = fp.x; toY = fp.y; }
            }
          }
          return (
            <path d={arrowPath(fromP.x, fromP.y, toX, toY)}
              fill="none" stroke={hoverDot ? '#3b82f6' : '#94a3b8'} strokeWidth={2.5} strokeDasharray="4,4"
            />
          );
        })()}
      </svg>

      {/* Foundations — individually fixed-positioned, freely draggable */}
      {showFoundations && FOUNDATIONS.map(f => {
        const raw = foundationPositions[f.id] || { x: Math.max(300, (typeof window !== 'undefined' ? window.innerWidth : 1400) - 200), y: 130 + FOUNDATIONS.indexOf(f) * 150 };
        const pos = {
          x: Math.max(8, Math.min(raw.x, window.innerWidth - 160)),
          y: Math.max(76, Math.min(raw.y, window.innerHeight - 110))
        };
        return (
          <div key={f.id}
            className="fixed z-30 flex items-center gap-0 pointer-events-auto"
            style={{ left: pos.x, top: pos.y }}
          >
            <div data-fid={f.id}
              className={`foundation-dot w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150 -ml-2 mr-2 z-10 cursor-crosshair
                ${lockedFoundations.includes(f.id) ? 'border-slate-200 bg-slate-50 opacity-40' : ''}
                ${hoverDot === f.id ? 'scale-150 border-blue-500 bg-blue-100 shadow-lg shadow-blue-300' : (!lockedFoundations.includes(f.id) ? 'border-slate-300 bg-white hover:border-slate-400' : '')}`}
              style={{ borderColor: lockedFoundations.includes(f.id) ? '#e2e8f0' : (hoverDot === f.id ? '#3b82f6' : f.color + '80') }}
            >
              <div className={`w-2 h-2 rounded-full transition-all duration-150 ${hoverDot === f.id ? 'bg-blue-500' : (lockedFoundations.includes(f.id) ? 'bg-slate-200' : '')}`}
                style={{ backgroundColor: lockedFoundations.includes(f.id) ? '#cbd5e1' : (hoverDot === f.id ? '#3b82f6' : f.color) }}
              />
            </div>
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                setFoundationDrag({ fid: f.id, offsetX: e.clientX - pos.x, offsetY: e.clientY - pos.y });
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const t = e.touches[0];
                setFoundationDrag({ fid: f.id, offsetX: t.clientX - pos.x, offsetY: t.clientY - pos.y });
              }}
              className={`w-36 rounded-2xl border-2 flex flex-col items-center select-none cursor-grab active:cursor-grabbing shadow-sm px-3 py-2.5 transition-all duration-150 ${lockedFoundations.includes(f.id) ? 'bg-white/40 opacity-50 border-slate-200 shadow-none' : 'bg-white/90 shadow-sm'} ${hoverDot === f.id ? 'shadow-md shadow-blue-200/50' : ''}`}
              style={{ borderColor: lockedFoundations.includes(f.id) ? '#e2e8f0' : (hoverDot === f.id ? '#3b82f6' : f.color + '60'), touchAction: 'none' }}
            >
              <div className="flex items-center gap-1.5 w-full">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[7px] font-bold text-white"
                  style={{ backgroundColor: lockedFoundations.includes(f.id) ? '#cbd5e1' : f.color }}>{f.rank}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${lockedFoundations.includes(f.id) ? 'text-slate-300' : ''}`}
                  style={{ color: lockedFoundations.includes(f.id) ? undefined : f.color }}>{f.label}</span>
                <button onClick={(e) => { e.stopPropagation(); setLockedFoundations(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id]); }}
                  className={`ml-1 text-[11px] transition-colors w-5 h-5 rounded-full inline-flex items-center justify-center ${lockedFoundations.includes(f.id) ? 'bg-red-100 text-red-500 hover:bg-red-200' : 'text-slate-300 hover:text-slate-500'}`}
                >{lockedFoundations.includes(f.id) ? '🔒' : '🔓'}</button>
                <button onClick={(e) => { e.stopPropagation(); setExpandedFoundation(prev => prev === f.id ? null : f.id); }}
                  className="ml-auto text-[13px] text-slate-300 hover:text-slate-500 transition-colors w-6 h-6 rounded-full inline-flex items-center justify-center"
                >{expandedFoundation === f.id ? '▾' : '▸'}</button>
              </div>
              <span className={`text-[8px] mt-0.5 text-center leading-tight ${lockedFoundations.includes(f.id) ? 'text-slate-300' : 'text-slate-400'}`}>{f.desc}</span>
              {expandedFoundation === f.id && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-100 w-full">
                  {FOUNDATION_ACTIONS[f.id]?.map((line, i) => (
                    <div key={i} className="text-[6px] text-slate-500 leading-relaxed flex gap-1">
                      <span className="text-slate-300 mt-0.5">•</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Scrollable canvas — provides scroll behavior */}
      <div ref={scrollRef} className="flex-1 overflow-auto"
        onMouseLeave={() => { if (!dragging && !connecting) { setHoverDot(null); } }}
      >
        <div className="min-h-[150vh] min-w-[1200px] relative">
          {/* Notes — inside scroll container so they scroll with canvas */}
          {notes.map(note => {
            const posStyle: React.CSSProperties = { left: note.x, top: note.y };
            const linkedFoundations = FOUNDATIONS.filter(f =>
              arrows.some(a => a.fromNoteId === note.id && a.toFoundation === f.id && a.color === 'confirmed')
            );
            return (
              <div key={note.id}
                ref={el => { if (el) noteElsRef.current.set(note.id, el); else noteElsRef.current.delete(note.id); }}
                className={`absolute z-40 bg-white rounded-xl shadow-lg border select-none ${note.locked ? 'border-slate-200 opacity-70 cursor-default' : note.starred ? 'border-amber-300 ring-2 ring-amber-200/60 cursor-grab active:cursor-grabbing' : 'border-slate-300 cursor-grab active:cursor-grabbing'}`}
                style={posStyle}
                onMouseDown={(e) => startDrag(note.id, e)}
                onTouchStart={(e) => { const t = e.target as HTMLElement; if (t.closest('[data-drag-handle]')) startDragTouch(note.id, e); }}
              >
                {linkedFoundations.length > 0 && (
                  <div className="h-1 rounded-t-xl overflow-hidden flex">
                    {linkedFoundations.map(f => (
                      <div key={f.id} className="h-full flex-1" style={{ backgroundColor: f.color }} />
                    ))}
                  </div>
                )}
                <div className="px-2.5 py-1.5">
                  {/* Drag handle — only touch target on mobile for dragging */}
                  <div data-drag-handle
                    className="flex items-center justify-center gap-0.5 mb-1 cursor-grab active:cursor-grabbing select-none -mt-0.5"
                    onMouseDown={(e) => { e.stopPropagation(); startDrag(note.id, e); }}
                  >
                    <span className="text-[6px] text-slate-200 tracking-[4px] select-none">∙∙∙</span>
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    <button onClick={(e) => { e.stopPropagation(); setShowTagPicker(p => p === note.id ? null : note.id); }}
                      onMouseDown={e => e.stopPropagation()}
                      className={`text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded border transition-colors ${note.tag ? 'bg-slate-100 text-slate-600 border-slate-200' : 'text-slate-300 border-dashed border-slate-200 hover:text-slate-400'}`}
                    >{note.tag || '+ tag'}</button>
                    {note.tag && (
                      <button onClick={(e) => { e.stopPropagation(); setSelectedArrow(prev => prev === note.id ? null : note.id); }}
                        onMouseDown={e => e.stopPropagation()}
                        className={`w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[8px] transition-colors ${selectedArrow === note.id ? 'bg-amber-200 text-amber-700' : 'bg-slate-100 text-slate-300 hover:bg-amber-100 hover:text-amber-500'}`}
                        title="Show reasoning"
                      >💡</button>
                    )}
                    {note.tag && (
                      <div className="flex gap-0.5 ml-1" onMouseDown={e => e.stopPropagation()}>
                        <button onClick={() => updateNote(note.id, { direction: 'under' })}
                          className={`text-[7px] px-1 py-0.5 rounded leading-none ${note.direction === 'under' ? 'bg-green-200 text-green-800 font-bold' : 'bg-slate-50 text-slate-300 hover:text-green-600'}`}
                        >↑</button>
                        <button onClick={() => updateNote(note.id, { direction: 'over' })}
                          className={`text-[7px] px-1 py-0.5 rounded leading-none ${note.direction === 'over' ? 'bg-red-200 text-red-800 font-bold' : 'bg-slate-50 text-slate-300 hover:text-red-600'}`}
                        >↓</button>
                      </div>
                    )}
                  </div>
                  {/* Recipe input — only when a recipe tag is selected */}
                  {RECIPE_TAGS.includes(note.tag) && (
                  <div className="flex items-center gap-1 mb-1.5 px-1 py-1 bg-slate-50 border border-slate-200 rounded" onMouseDown={e => e.stopPropagation()}>
                    {note.tag === 'time' && <>
                      <span className="text-[9px] text-slate-500 font-medium">⏱</span>
                      <input type="number" min={0} max={59} value={note.timeM ?? 0}
                        onChange={e => updateNote(note.id, { timeM: Math.min(59, Math.max(0, +e.target.value || 0)) })}
                        className="w-6 px-0.5 py-0 text-[10px] text-center border border-slate-200 rounded text-slate-700 outline-none focus:border-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      /><span className="text-[9px] text-slate-400">:</span>
                      <input type="number" min={0} max={59} value={note.timeS ?? 0}
                        onChange={e => updateNote(note.id, { timeS: Math.min(59, Math.max(0, +e.target.value || 0)) })}
                        className="w-6 px-0.5 py-0 text-[10px] text-center border border-slate-200 rounded text-slate-700 outline-none focus:border-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[8px] text-slate-400 ml-auto italic">MM:SS</span>
                    </>}
                    {note.tag === 'temp' && <>
                      <span className="text-[9px] text-slate-500 font-medium">🌡</span>
                      <input type="number" value={note.temp}
                        onChange={e => updateNote(note.id, { temp: +e.target.value || 0 })}
                        className="w-12 px-1 py-0 text-[10px] text-center border border-slate-200 rounded text-slate-700 outline-none focus:border-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[8px] text-slate-400">°C</span>
                    </>}
                    {note.tag === 'grindsize' && <>
                      <div className="flex flex-col items-center gap-0.5 w-full">
                        <svg width="76" height="76" viewBox="0 0 100 100" className="cursor-pointer"
                          onMouseDown={e => {
                            e.preventDefault();
                            grindDragRef.current = note.id;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const cx = rect.left + rect.width / 2;
                            const cy = rect.top + rect.height / 2;
                            let angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
                            if (angle < 0) angle += 360;
                            const val = Math.round((angle / 360) * 30);
                            updateNote(note.id, { grind: Math.min(30, Math.max(0, val)) });
                          }}
                          onMouseMove={e => {
                            if (e.buttons === 1 && grindDragRef.current === note.id) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const cx = rect.left + rect.width / 2;
                              const cy = rect.top + rect.height / 2;
                              let angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
                              if (angle < 0) angle += 360;
                              const val = Math.round((angle / 360) * 30);
                              updateNote(note.id, { grind: Math.min(30, Math.max(0, val)) });
                            }
                          }}
                          onMouseUp={() => { grindDragRef.current = null; }}
                          onMouseLeave={() => { if (grindDragRef.current === note.id) grindDragRef.current = null; }}
                        >
                          {/* Background ring */}
                          <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                          {/* Light green fill zone */}
                          {(note.grindLow ?? 0) > 0 && (note.grindHigh ?? 0) > (note.grindLow ?? 0) && (() => {
                            const low = note.grindLow ?? 0;
                            const high = note.grindHigh ?? 0;
                            const a1 = ((low / 30) * 360 - 90) * Math.PI / 180;
                            const a2 = ((high / 30) * 360 - 90) * Math.PI / 180;
                            const x1 = 50 + 42 * Math.cos(a1), y1 = 50 + 42 * Math.sin(a1);
                            const x2 = 50 + 42 * Math.cos(a2), y2 = 50 + 42 * Math.sin(a2);
                            const large = high - low > 15 ? 1 : 0;
                            return <path d={`M 50 50 L ${x1} ${y1} A 42 42 0 ${large} 1 ${x2} ${y2} Z`} fill="#86efac" fillOpacity="0.35" />;
                          })()}
                          {/* Tick marks — every 5 with label */}
                          {[0,5,10,15,20,25,30].map(v => {
                            const a = ((v / 30) * 360 - 90) * Math.PI / 180;
                            const cos = Math.cos(a), sin = Math.sin(a);
                            return (
                              <g key={v}>
                                <line x1={50 + 42 * cos} y1={50 + 42 * sin} x2={50 + 37 * cos} y2={50 + 37 * sin}
                                  stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
                                <text x={50 + 49 * cos} y={50 + 49 * sin} textAnchor="middle" dominantBaseline="central"
                                  className="text-[6px]" fill="#94a3b8">{v}</text>
                              </g>
                            );
                          })}
                          {/* Needle */}
                          {(() => {
                            const g = note.grind ?? 0;
                            const a = ((g / 30) * 360 - 90) * Math.PI / 180;
                            const cos = Math.cos(a), sin = Math.sin(a);
                            return (
                              <>
                                <line x1="50" y1="50" x2={50 + 38 * cos} y2={50 + 38 * sin}
                                  stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
                                <circle cx={50 + 42 * cos} cy={50 + 42 * sin} r="3" fill="#22c55e" />
                              </>
                            );
                          })()}
                          {/* Center dot */}
                          <circle cx="50" cy="50" r="3" fill="#475569" />
                        </svg>
                        <div className="flex items-center gap-1 text-[7px] text-slate-400">
                          <span>zone</span>
                          <input type="number" min={0} max={30} value={note.grindLow ?? 0}
                            onChange={e => updateNote(note.id, { grindLow: Math.min(30, Math.max(0, +e.target.value || 0)) })}
                            className="w-5 px-0.5 py-0 text-[7px] text-center border border-slate-200 rounded text-slate-600 outline-none focus:border-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span>—</span>
                          <input type="number" min={0} max={30} value={note.grindHigh ?? 0}
                            onChange={e => updateNote(note.id, { grindHigh: Math.min(30, Math.max(0, +e.target.value || 0)) })}
                            className="w-5 px-0.5 py-0 text-[7px] text-center border border-slate-200 rounded text-slate-600 outline-none focus:border-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="font-medium ml-1" style={{ color: '#22c55e' }}>#{(note.grind ?? 0)}</span>
                        </div>
                      </div>
                    </>}
                    {note.tag === 'ratio' && <>
                      <span className="text-[9px] text-slate-500 font-medium">÷</span>
                      <input type="number" step={0.1} min={0} value={note.ratio}
                        onChange={e => updateNote(note.id, { ratio: +e.target.value || 0 })}
                        className="w-12 px-1 py-0 text-[10px] text-center border border-slate-200 rounded text-slate-700 outline-none focus:border-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[8px] text-slate-400">:1</span>
                    </>}
                    {note.tag === 'turbulence' && <>
                      <span className="text-[9px] text-slate-500 font-medium">🌊</span>
                      <input type="number" min={1} max={10} step={1} value={note.turbulence}
                        onChange={e => updateNote(note.id, { turbulence: Math.min(10, Math.max(1, +e.target.value || 1)) })}
                        className="w-8 px-1 py-0 text-[10px] text-center border border-slate-200 rounded text-slate-700 outline-none focus:border-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[8px] text-slate-400">/10</span>
                    </>}
                  </div>
                  )}
                  {UTILITY_TAGS.includes(note.tag) && (
                    <div className="flex items-center gap-1 mb-1.5 px-1 py-1 bg-slate-50 border border-slate-200 rounded" onMouseDown={e => e.stopPropagation()}>
                    {note.tag === 'counter' && <>
                      <span className="text-[9px] text-slate-500 font-medium">#</span>
                      <input type="text" value={note.counterLabel ?? ''}
                        onChange={e => updateNote(note.id, { counterLabel: e.target.value })}
                        placeholder="label..."
                        className="w-14 px-0.5 py-0 text-[8px] border border-slate-200 rounded text-slate-600 outline-none focus:border-slate-400 bg-white"
                      />
                      <button onClick={() => updateNote(note.id, { counter: Math.max(0, (note.counter ?? 1) - 1) })}
                        className="px-1 py-0 text-[10px] font-bold text-slate-500 border border-slate-200 rounded hover:bg-slate-100"
                      >−</button>
                      <span className="text-[11px] font-semibold text-slate-700 min-w-[20px] text-center">{note.counter ?? 1}</span>
                      <button onClick={() => updateNote(note.id, { counter: (note.counter ?? 1) + 1 })}
                        className="px-1 py-0 text-[10px] font-bold text-slate-500 border border-slate-200 rounded hover:bg-slate-100"
                      >+</button>
                    </>}
                    {note.tag === 'pct' && <>
                      <span className="text-[9px] text-slate-500 font-medium">%</span>
                      <input type="range" min={0} max={100} value={note.pct ?? 50}
                        onChange={e => updateNote(note.id, { pct: +e.target.value })}
                        className="w-20 h-1 accent-slate-500"
                      />
                      <span className="text-[10px] font-semibold text-slate-700 min-w-[32px] text-right">{note.pct ?? 50}%</span>
                    </>}
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-1">
                    <textarea
                      value={note.text}
                      onChange={(e) => {
                        if (note.locked) return;
                        updateNote(note.id, { text: e.target.value });
                        e.currentTarget.style.height = 'auto';
                        e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                      }}
                      onClick={(e) => { if (note.locked) e.stopPropagation(); else e.stopPropagation(); }}
                      onMouseDown={(e) => { if (note.locked) e.stopPropagation(); else e.stopPropagation(); }}
                      onTouchStart={(e) => { e.stopPropagation(); }}
                      readOnly={note.locked}
                      className={`w-full text-[11px] bg-transparent border-none outline-none resize-none leading-tight font-sans overflow-hidden ${note.locked ? 'text-slate-400 italic' : 'text-slate-700'}`}
                      rows={1}
                      ref={el => { if (el && !el.dataset.autosized) { el.dataset.autosized = 'true'; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                    />
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <div
                        className="w-3.5 h-3.5 rounded-full bg-slate-200 hover:bg-slate-400 cursor-crosshair inline-flex items-center justify-center text-[7px] text-white font-bold transition-colors border border-slate-300 hover:border-slate-500 note-connect-dot"
                        data-noteid={note.id}
                        title="Drag to connect to a foundation or another note"
                        onMouseDown={(e) => { e.stopPropagation(); startConnect(note.id, e); }}
                        onTouchStart={(e) => { e.stopPropagation(); setConnecting({ fromNoteId: note.id }); setHoverDot(null); }}
                      >◉</div>
                      <button onClick={(e) => { e.stopPropagation(); updateNote(note.id, { starred: !note.starred }); }}
                        className={`w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[8px] transition-colors ${note.starred ? 'text-amber-400' : 'text-slate-200 hover:text-amber-300'}`}
                      >{note.starred ? '⭐' : '☆'}</button>
                      <button onClick={(e) => { e.stopPropagation(); updateNote(note.id, { locked: !note.locked }); }}
                        className={`w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[7px] font-bold transition-colors ${note.locked ? 'bg-amber-200 text-amber-700' : 'bg-slate-200 text-slate-400 hover:text-amber-600'}`}
                      >{note.locked ? '🔒' : '🔓'}</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                        className="w-3.5 h-3.5 rounded-full bg-slate-200 hover:bg-red-300 inline-flex items-center justify-center text-[7px] text-slate-400 hover:text-white font-bold leading-none transition-colors"
                      >×</button>
                    </div>
                  </div>
                </div>

                {/* Connection list — arrows from/to this note */}
                {(() => {
                  const outArrows = arrows.filter(a => a.fromNoteId === note.id);
                  const inArrows = arrows.filter(a => a.toNoteId === note.id);
                  if (outArrows.length === 0 && inArrows.length === 0) return null;
                  return (
                    <div className="px-2.5 pb-1.5 flex flex-wrap gap-1" onMouseDown={e => e.stopPropagation()}>
                      {outArrows.map(a => {
                        const f = FOUNDATIONS.find(ff => ff.id === a.toFoundation);
                        const label = f ? f.label : a.toNoteId ? (notes.find(n => n.id === a.toNoteId)?.tag || 'note') : '?';
                        const bg = a.color === 'confirmed'
                          ? (f ? `${f.color}20 text-slate-700` : 'bg-green-100 text-green-700')
                          : a.color === 'wrong' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500';
                        const dotColor = a.color === 'confirmed' && f ? f.color : undefined;
                        return (
                          <span key={a.id} className={`inline-flex items-center gap-0.5 text-[6px] px-1 py-0.5 rounded ${bg}`}>
                            {dotColor && <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: dotColor }} />}
                            <span>→ {label}</span>
                            <button onClick={(e) => { e.stopPropagation(); deleteArrow(a.id); }}
                              className="hover:text-red-600 font-bold leading-none ml-0.5"
                            >✕</button>
                          </span>
                        );
                      })}
                      {inArrows.map(a => {
                        const fromNote = notes.find(n => n.id === a.fromNoteId);
                        const label = fromNote?.tag || 'note';
                        return (
                          <span key={a.id} className="inline-flex items-center gap-0.5 text-[6px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">
                            <span>← {label}</span>
                            <button onClick={(e) => { e.stopPropagation(); deleteArrow(a.id); }}
                              className="hover:text-red-600 font-bold leading-none ml-0.5"
                            >✕</button>
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Inline reasoning card */}
                {selectedArrow === note.id && note.tag && (() => {
                  const dir = note.direction ? EXTRACTION_DIRECTIONS[note.direction] : null;
                  const mech = MECHANISM_KNOWLEDGE[note.tag];
                  return (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 w-56 px-2 pb-2" onMouseDown={e => e.stopPropagation()}>
                      {dir ? (
                        <div className="mb-1.5 pb-1.5 border-b border-slate-100">
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-[13px] font-bold leading-none" style={{ color: dir.color }}>{dir.arrow}</span>
                            <span className="text-[8px] font-bold" style={{ color: dir.color }}>{dir.label}</span>
                            <span className="text-[6px] text-slate-300 ml-auto italic">{note.tag}</span>
                          </div>
                          <p className="text-[7px] text-slate-400 leading-relaxed mb-1">{dir.desc}</p>
                          <div className="flex items-center gap-0.5 flex-wrap">
                            <span className="text-[6px] text-slate-400 uppercase mr-0.5">Adjust:</span>
                            {dir.priority.map((fid, i) => {
                              const f = FOUNDATIONS.find(ff => ff.id === fid);
                              const link = dir.foundations[fid];
                              if (!f) return null;
                              return (
                                <span key={fid} className="inline-flex items-center gap-0.5 text-[7px] font-semibold px-1 py-0.5 rounded-sm"
                                  style={{ backgroundColor: f.color + '20', color: f.color }} title={link?.impactDesc}
                                >
                                  <span>{i === 0 ? '① ' : i === 1 ? '② ' : i === 2 ? '③ ' : '④ '}{f.label} {link?.action}</span>
                                  {link?.impact != null && (
                                    <span className="opacity-60">{'●'.repeat(link.impact)}{'○'.repeat(5 - link.impact)}</span>
                                  )}
                                </span>
                              );
      })}

      {/* Floating tag picker — positioned by the target note */}
      {showTagPicker && (() => {
        const el = noteElsRef.current.get(showTagPicker);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const px = Math.min(r.right + 8, window.innerWidth - 260);
        const py = Math.max(4, r.top);
        return (
          <div className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-xl px-2 py-1.5"
            style={{ left: px, top: py }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="grid grid-cols-2 gap-1 mb-1">
              {TAG_GROUPS.slice(0, 2).map(g => (
                <div key={g.name}>
                  <div className="text-[6px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: g.name.startsWith('↑') ? '#16a34a' : '#dc2626' }}>{g.name}</div>
                  <div className="flex flex-wrap gap-0.5">
                    {g.tags.map(t => (
                      <button key={t} onClick={() => { const n = notes.find(x => x.id === showTagPicker); if (!n) return; updateNote(showTagPicker, { tag: t, direction: g.name.startsWith('↑') ? 'under' as const : 'over' as const }); setShowTagPicker(null); }}
                        className={`px-0.5 py-0 text-[7px] rounded border transition-colors ${notes.find(x => x.id === showTagPicker)?.tag === t ? g.active : `${g.base} ${g.hover}`}`}
                      >{t.length > 7 ? t.slice(0, 6) + '…' : t}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1 mb-1">
              {TAG_GROUPS.slice(2, 6).map(g => (
                <div key={g.name}>
                  <div className="text-[5px] font-semibold uppercase tracking-wider mb-0.5 text-slate-400">{g.name}</div>
                  <div className="flex flex-wrap gap-0.5">
                    {g.tags.map(t => (
                      <button key={t} onClick={() => { updateNote(showTagPicker, { tag: t }); setShowTagPicker(null); }}
                        className={`px-0.5 py-0 text-[7px] rounded border transition-colors ${notes.find(x => x.id === showTagPicker)?.tag === t ? g.active : `${g.base} ${g.hover}`}`}
                      >{t === 'counter' ? '# ctr' : t === 'water ppm' ? 'ppm' : t === 'dripper flowrate' ? 'flow' : t.length > 6 ? t.slice(0, 5) + '…' : t}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[6px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">🔄</span>
              <div className="flex flex-wrap gap-0.5">
                {TAG_GROUPS[6].tags.map(t => (
                  <button key={t} onClick={() => { updateNote(showTagPicker, { tag: t }); setShowTagPicker(null); }}
                    className={`px-0.5 py-0 text-[7px] rounded border transition-colors ${notes.find(x => x.id === showTagPicker)?.tag === t ? TAG_GROUPS[6].active : `${TAG_GROUPS[6].base} ${TAG_GROUPS[6].hover}`}`}
                  >{t.length > 7 ? t.slice(0, 6) + '…' : t}</button>
                ))}
              </div>
              <input type="text" placeholder="+custom"
                onMouseDown={e => e.stopPropagation()}
                onKeyDown={e => { if (e.key === 'Enter') { const val = (e.target as HTMLInputElement).value.trim(); if (val) { const d = TAG_DIRECTION[val] ?? ''; updateNote(showTagPicker, { tag: val, direction: notes.find(x => x.id === showTagPicker)?.direction || d }); setShowTagPicker(null); } } }}
                className="w-12 px-0.5 py-0 text-[7px] border border-slate-200 rounded text-slate-600 outline-none focus:border-slate-400"
              />
              <button onClick={() => setShowTagPicker(null)}
                className="px-0.5 py-0 text-[7px] rounded border border-slate-200 text-slate-400 hover:bg-slate-100"
              >✕</button>
            </div>
          </div>
        );
      })()}
                          </div>
                          <div className="text-[5px] text-slate-300 mt-0.5 leading-none">
                            <span className="mr-1">●●●●● = BIG rock (adjust tiny)</span>
                            <span>●○○○○ = small rock (adjust more)</span>
                          </div>
                        </div>
                      ) : null}

                      {DEFECT_KNOWLEDGE[note.tag] && (
                        <div className="mb-1.5 pb-1.5 border-b border-slate-100">
                          <div onClick={() => setDefectOpen(v => !v)}
                            className="flex items-center gap-1 cursor-pointer select-none hover:bg-amber-50 rounded px-1 py-0.5 transition-colors"
                          >
                            <span className="text-[9px]">⚠️</span>
                            <span className="text-[7px] font-medium text-amber-700">Could be bean defect?</span>
                            <span className="text-[8px] text-amber-400 ml-auto">{defectOpen ? '▾' : '▸'}</span>
                          </div>
                          {defectOpen && (() => {
                            const d = DEFECT_KNOWLEDGE[note.tag];
                            return (
                              <div className="mt-1 px-1.5 py-1 bg-amber-50 border border-amber-200 rounded text-[7px]">
                                <div className="font-semibold text-amber-800 mb-0.5">{d.defect}</div>
                                <p className="text-amber-700 leading-relaxed mb-0.5">{d.desc}</p>
                                <div className="text-amber-600 mb-0.5">
                                  <span className="font-medium">🔍 Check:</span> {d.signs}
                                </div>
                                <div className="text-amber-700 font-medium">
                                  <span className="font-medium">✅ Fix:</span> {d.fix}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {mech ? (
                        <>
                          <div className="text-[8px] font-semibold text-slate-500 mb-0.5">{mech.mechanism}</div>
                          <p className="text-[7px] text-slate-400 leading-relaxed mb-1">{mech.summary}</p>
                          {mech.priority.map((fid, i) => {
                            const f = FOUNDATIONS.find(ff => ff.id === fid);
                            const link = mech.foundations[fid];
                            if (!f || !link) return null;
                            const key = `${note.id}:${fid}`;
                            const open = expandedChain === key;
                            const dirLink = dir?.foundations[fid];
                            return (
                              <div key={fid} className="mb-0.5 rounded overflow-hidden border border-transparent"
                                style={{ borderColor: open ? f.color + '30' : 'transparent', backgroundColor: open ? f.color + '06' : 'transparent' }}
                              >
                                <div onClick={() => setExpandedChain(open ? null : key)}
                                  className="flex items-center gap-1 px-1.5 py-1 cursor-pointer select-none hover:bg-slate-50 rounded transition-colors"
                                >
                                  <span className="text-[9px] font-bold shrink-0" style={{ color: f.color }}>
                                    {i === 0 ? '①' : i === 1 ? '②' : i === 2 ? '③' : '④'}
                                  </span>
                                  <span className="text-[7px] font-semibold text-slate-600">{f.label}</span>
                                  {dirLink?.action && (
                                    <span className="text-[7px] text-slate-400 font-mono">{dirLink.action}</span>
                                  )}
                                  {dirLink?.impact != null && (
                                    <span className="text-[6px] opacity-40 ml-auto" title={dirLink.impactDesc}>
                                      {'●'.repeat(dirLink.impact)}{'○'.repeat(5 - dirLink.impact)}
                                    </span>
                                  )}
                                  <span className="text-[8px] text-slate-300 ml-1 shrink-0">{open ? '▾' : '▸'}</span>
                                </div>
                                {open && (
                                  <div className="px-2.5 pb-2 pt-0.5">
                                    <div className="text-[6px] text-slate-400 mb-0.5">
                                      <span className="font-medium">sub:</span> {link.subTopic ?? '—'}
                                    </div>
                                    {link.causalChain && (
                                      <div className="flex flex-col items-center gap-0 my-1">
                                        {link.causalChain.split('→').map((step, si) => (
                                          <span key={si} className="flex flex-col items-center">
                                            {si > 0 && <span className="text-slate-300 text-[9px] leading-none">↓</span>}
                                            <span className="text-[7px] text-center px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600 leading-snug">{step.trim()}</span>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    <div className="text-[7px] text-slate-500 italic mt-0.5">
                                      <span className="font-medium">Try:</span> {link.experiment}
                                    </div>
                                    {link.tell && (
                                      <div className="text-[6px] text-amber-600 font-medium mt-0.5">⚡ {link.tell}</div>
                                    )}
                                    {link.whyNot && (
                                      <div className="text-[6px] text-slate-400 italic mt-0.5">↳ {link.whyNot}</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div>
                          <div className="text-[8px] font-semibold text-slate-500 mb-0.5">Exploring "{note.tag}"</div>
                          <p className="text-[7px] text-slate-400 leading-relaxed mb-1">No mechanism data yet. Investigate which foundation this symptom connects to.</p>
                          {!dir && (
                            <div className="flex items-center gap-0.5 mb-1 flex-wrap">
                              <span className="text-[6px] text-slate-400 uppercase mr-0.5">Check each:</span>
                              {FOUNDATIONS.map((f, i) => (
                                <span key={f.id} className="text-[7px] font-semibold px-1 py-0.5 rounded-sm"
                                  style={{ backgroundColor: f.color + '15', color: f.color }}
                                >{i + 1}. {f.label}</span>
                              ))}
                            </div>
                          )}
                          <div className="bg-slate-50 border border-slate-100 rounded px-1.5 py-1 mb-1">
                            <p className="text-[7px] text-slate-500 leading-relaxed"><span className="font-medium">Set direction ↑ or ↓</span> on the note — then the priority chain appears here based on whether you need more or less extraction.</p>
                          </div>
                        </div>
                      )}
                      <div className="text-[6px] text-slate-300 italic mt-0.5 leading-tight">
                        {dir ? '↑↓ toggle direction · drag ◉ to foundation · click arrow to confirm/wrong' : 'Drag ◉ to the foundation you suspect · click arrow to confirm/wrong'}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {/* Empty state */}
          {notes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-3xl mb-2">☯</div>
                <p className="text-[11px] text-slate-400">Click <span className="font-semibold text-slate-500">+ Add Note</span> to start mapping your brew</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-slate-200 bg-white/70 shrink-0">
        <button onClick={addNote}
          className="px-4 py-1.5 text-[11px] font-semibold border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100 hover:border-slate-400 transition-colors"
        >+ Add Note</button>
        <span className="text-[10px] text-slate-400">{notes.length} note{notes.length !== 1 ? 's' : ''} · {arrows.length} connection{arrows.length !== 1 ? 's' : ''}</span>
        {alignment.under !== null && (
          <span className="text-[10px] text-emerald-600 font-medium whitespace-nowrap">
            ↑ {alignment.under}%
          </span>
        )}
        {alignment.over !== null && (
          <span className="text-[10px] text-red-500 font-medium whitespace-nowrap">
            ↓ {alignment.over}%
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto text-[10px] text-slate-400">
          <span className="inline-block w-2 h-0.5 bg-slate-400" style={{ borderTop: '2px dashed #94a3b8', height: 0, width: 12 }} /> hypothesis
          <span className="inline-block w-3 h-0.5 bg-green-500" /> confirmed
          <span className="inline-block w-3 h-0.5 bg-red-500" /> wrong
        </div>
      </div>
    </div>
  );
}
