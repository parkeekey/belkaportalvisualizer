import { useState, useMemo, useRef, useEffect } from 'react';
import { getReferenceTDS, getReferenceTDSRange } from '../utils/tdsReference';
import shadowJudgeData from '../data/shadowJudge';
import { SENSORY_VOCAB, POLARITY_COLORS } from '../data/sensoryVocab';
import TDSHUD from './TDSHUD';

type Score = number;

interface Profile {
  acidity: Score;
  sweetness: Score;
  flavor: Score;
  mouthfeel: Score;
  aftertaste: Score;
  overall: Score;
}

interface SnapshotData {
  profile: Profile;
  name: string;
  time: Date;
}

interface CompSnapshot {
  name: string;
  rating: number;
  date: Date;
  composition: Record<string, number>;
  vocabCats: Record<string, Record<string, string>>;
  notedDescriptors: Record<string, string | null>;
  profile: Profile;
  ci: number;
  balance: number;
}

interface Equipment {
  dripper: string;
  paper: string;
  mod: string;
  burrType: string;
  burrSize: string;
  finesFeel: number;
  grindEffort: number;
  grindSetting: number;
  dose: number;
  ratio: string;
  planTime: string;
  timeFinished: string;
}

interface DripperDef {
  name: string;
  shape: string;
  resistance: number;
  mods?: { name: string; resMod: number; desc: string }[];
}

interface PaperDef {
  name: string;
  material: string;
  resistance: number;
}

const DRIPPERS: DripperDef[] = [
  { name: 'Kalita Wave', shape: 'flat', resistance: 1 },
  { name: 'Orea V4', shape: 'flat', resistance: 1, mods: [{ name: 'Fast Flow Base', resMod: 0, desc: 'Already fast — keeps flow open' }] },
  { name: 'Origami', shape: 'cone', resistance: 1 },
  { name: 'Bee House', shape: 'flat', resistance: 1 },
  { name: 'V60', shape: 'cone', resistance: 2 },
  { name: 'Fellow Stagg', shape: 'cone', resistance: 2 },
  { name: 'Chemex', shape: 'cone', resistance: 2 },
  { name: 'Tricolate', shape: 'other', resistance: 3 },
  { name: 'Aeropress', shape: 'aeropress', resistance: 3 },
  { name: 'French Press', shape: 'flat', resistance: 3 },
  { name: 'Hario Switch', shape: 'cone', resistance: 2, mods: [{ name: 'Immersion Mode', resMod: 1, desc: 'Closed valve adds steep — raises resistance' }] },
];

interface ResistanceProfile {
  totalScore: number;
  rating: string;
  feedback: string;
  dripperRes: number;
  paperRes: number;
  grindRes: number;
}

const PAPERS: PaperDef[] = [
  { name: 'Abaca', material: 'Abaca', resistance: 1 },
  { name: 'Meteor (Abaca+PLA)', material: 'Abaca+PLA', resistance: 1 },
  { name: 'Metal', material: 'Metal', resistance: 1 },
  { name: 'Paper Bleached', material: 'Cellulose', resistance: 2 },
  { name: 'Cloth', material: 'Cloth', resistance: 2 },
  { name: 'Paper + Metal', material: 'Cellulose+Metal', resistance: 2 },
  { name: 'Paper Unbleached', material: 'Cellulose', resistance: 3 },
];

function computeResistance(eq: Equipment): ResistanceProfile | null {
  if (!eq.dripper || !eq.paper) return null;
  const dripper = DRIPPERS.find(d => d.name === eq.dripper);
  const paper = PAPERS.find(p => p.name === eq.paper);
  if (!dripper || !paper) return null;

  let dripperRes = dripper.resistance;
  const mod = dripper.mods?.find(m => m.name === eq.mod);
  if (mod) dripperRes += (mod.resMod ?? 0);
  dripperRes = Math.max(1, Math.min(3, dripperRes));

  const paperRes = paper.resistance;

  const grindRes = eq.grindSetting <= 3 ? 1 : eq.grindSetting <= 6 ? 2 : 3;

  const totalScore = dripperRes + paperRes + grindRes;

  let rating: string, feedback: string;
  if (totalScore <= 4) {
    rating = 'Low Resistance';
    feedback = 'Fast flow. High risk of under-extraction. Consider a slower pour or finer grind to build extraction.';
  } else if (totalScore <= 7) {
    rating = 'Medium Resistance';
    feedback = 'Balanced flow. Standard brewing sweet spot. Highly forgiving setup — focus on technique.';
  } else {
    rating = 'High Resistance';
    feedback = 'Slow flow. High risk of clogging/stalling. Pour gently and avoid aggressive stirring.';
  }

  return { totalScore, rating, feedback, dripperRes, paperRes, grindRes };
}

interface HiddenVar {
  name: string;
  summary: string;
  symptomPattern: (p: Profile) => number;
  observable: string;
  foundation: string;
  direction: string;
  relatedAxes: string[];
}

interface BrewFactor {
  name: string;
  summary: string;
  observable: string;
  affectedAxes: string[];
  foundation: string;
  direction: string;
  matchPattern: (p: Profile) => number;
}

const HIDDEN_VARS: HiddenVar[] = [
  {
    name: 'Thermal recovery gap',
    summary: 'Water cools >2°C across pour, stalling sugar development',
    symptomPattern: p => { let s = 0; if (p.sweetness <= 4) s += 2; if (p.acidity <= 3) s += 2; if (p.overall <= 5) s += 1; return s; },
    observable: 'Kettle reads lower temp mid-pour; sweetness flat',
    foundation: 'Temp / Time', direction: 'Increase water temp or reduce pause between pours',
    relatedAxes: ['sweetness', 'acidity'],
  },
  {
    name: 'Micro-fine clogging',
    summary: 'Fines migrate to paper pores, stalling drawdown, muting mouthfeel',
    symptomPattern: p => { let s = 0; if (p.mouthfeel <= 4) s += 2; if (p.flavor <= 4) s += 1; if (p.overall <= 4) s += 1; return s; },
    observable: 'Drawdown stalls or extends >30s past target; muddy bed',
    foundation: 'Grind', direction: 'Grind coarser or sift fines',
    relatedAxes: ['mouthfeel', 'flavor'],
  },
  {
    name: 'Resistance system imbalance',
    summary: 'Uneven water flow through puck causes channeling, bitter + weak',
    symptomPattern: p => { let s = 0; if (p.flavor <= 3) s += 2; if (p.mouthfeel >= 6 && p.acidity <= 3) s += 2; return s; },
    observable: 'Channeling marks in bed; TDS variance across pours',
    foundation: 'Turbulence', direction: 'Adjust pour height, flow rate, or WDT distribution',
    relatedAxes: ['flavor', 'mouthfeel', 'acidity'],
  },
  {
    name: 'Filter media adsorption',
    summary: 'Paper type absorbs oils and fines, stripping body and clarity',
    symptomPattern: p => { let s = 0; if (p.mouthfeel <= 3) s += 2; if (p.flavor <= 4) s += 1; if (p.acidity >= 7 && p.mouthfeel <= 3) s += 1; return s; },
    observable: 'Clean cup but hollow body; paper type changed recently',
    foundation: 'Ratio', direction: 'Increase dose or switch filter paper',
    relatedAxes: ['mouthfeel', 'flavor'],
  },
  {
    name: 'Grind distribution spread',
    summary: 'Wide particle distribution creates simultaneous under + over extraction',
    symptomPattern: p => { let s = 0; if (p.acidity <= 3 && p.flavor >= 6) s += 2; if (p.sweetness <= 4) s += 1; if (p.mouthfeel >= 6) s += 1; return s; },
    observable: 'Bitter finish + sour start; wide boulders/fines ratio',
    foundation: 'Grind', direction: 'Use tighter burr alignment or higher uniformity burrs',
    relatedAxes: ['acidity', 'flavor', 'sweetness'],
  },
  {
    name: 'Prestat / bloom CO₂ release',
    summary: 'Insufficient bloom or wetting traps CO₂, causing uneven extraction',
    symptomPattern: p => { let s = 0; if (p.sweetness <= 3 && p.acidity <= 4) s += 2; if (p.flavor <= 4) s += 1; return s; },
    observable: 'Blooming less than 2x dose weight; early drain uneven',
    foundation: 'Turbulence', direction: 'Extend bloom time or increase bloom water volume',
    relatedAxes: ['sweetness', 'acidity', 'flavor'],
  },
  {
    name: 'Tempurator insulation loss',
    summary: 'Heat escapes from brewer body, dropping slurry temp mid-brew',
    symptomPattern: p => { let s = 0; if (p.sweetness <= 4 && p.overall <= 5) s += 2; if (p.aftertaste <= 3) s += 1; return s; },
    observable: 'Brewer body feels cool to touch during pour; heat loss visible',
    foundation: 'Temp / Time', direction: 'Preheat brewer thoroughly or use insulated brewer',
    relatedAxes: ['sweetness', 'aftertaste'],
  },
];

const BREW_FACTORS: BrewFactor[] = [
  {
    name: 'Contact time',
    summary: 'Total brew time controls how much solubles dissolve — too short leaves sugars behind, too long pulls tannins',
    observable: 'Finish time vs target: >30s off; drain rate changes mid-pour',
    affectedAxes: ['acidity', 'sweetness', 'overall'],
    foundation: 'Temp / Time',
    direction: 'Adjust grind size or pour structure to hit target time',
    matchPattern: p => { let s = 0; if (p.sweetness <= 4 && p.acidity <= 4) s += 3; if (p.overall <= 4) s += 1; return s; },
  },
  {
    name: 'Fines clogging filter',
    summary: 'Excess fine particles block paper pores, stalling drawdown and muting mouthfeel',
    observable: 'Drawdown extends 20s+ past target; slow final drip; muddy bed surface',
    affectedAxes: ['mouthfeel', 'flavor', 'overall'],
    foundation: 'Grind',
    direction: 'Coarsen grind, sift fines, or use faster filter paper',
    matchPattern: p => { let s = 0; if (p.mouthfeel <= 4) s += 2; if (p.flavor <= 4) s += 1; if (p.overall <= 4) s += 1; return s; },
  },
  {
    name: 'Filter paper speed rating',
    summary: 'Paper porosity determines flow resistance — slow paper exaggerates clogging, fast paper reduces body',
    observable: 'Identical grind behaves differently with different paper; drain time inconsistent',
    affectedAxes: ['mouthfeel', 'flavor'],
    foundation: 'Ratio',
    direction: 'Match paper speed to grind size: fast paper for fines, slow paper for coarse',
    matchPattern: p => { let s = 0; if (p.mouthfeel <= 3) s += 2; if (p.flavor <= 4) s += 1; return s; },
  },
  {
    name: 'Kettle pour rate',
    summary: 'Pour speed and height control bed agitation — too aggressive causes channeling, too gentle stalls extraction',
    observable: 'Splashing or eroding bed surface; uneven saturation during pour',
    affectedAxes: ['flavor', 'mouthfeel', 'overall'],
    foundation: 'Turbulence',
    direction: 'Adjust pour height and flow rate for even bed agitation',
    matchPattern: p => { let s = 0; if (p.flavor <= 3) s += 2; if (p.mouthfeel >= 5 && p.acidity <= 4) s += 2; return s; },
  },
  {
    name: 'Bean density & roast level',
    summary: 'Dense light roasts need more thermal energy and finer grind; dark roasts extract faster and clog less',
    observable: 'Same recipe performs differently across bean lots; roast date matters',
    affectedAxes: ['acidity', 'sweetness', 'aftertaste'],
    foundation: 'Grind',
    direction: 'Adjust grind and temp based on density: finer + hotter for light, coarser + cooler for dark',
    matchPattern: p => { let s = 0; if (p.acidity <= 3 && p.sweetness <= 4) s += 2; if (p.aftertaste <= 3) s += 1; return s; },
  },
  {
    name: 'Water distribution / wetting',
    summary: 'Uneven initial saturation creates dry pockets that extract late, causing mixed under + over',
    observable: 'Dry spots visible on bed after first pour; uneven darkening during bloom',
    affectedAxes: ['acidity', 'flavor', 'mouthfeel'],
    foundation: 'Turbulence',
    direction: 'Improve WDT, center pour, or extend bloom agitation',
    matchPattern: p => { let s = 0; if (p.acidity <= 4 && p.flavor <= 4) s += 2; if (p.mouthfeel >= 6) s += 1; return s; },
  },
];

const AXES = ['acidity', 'sweetness', 'flavor', 'mouthfeel', 'aftertaste', 'overall'] as const;
const AXIS_LABELS: Record<string, string> = { acidity: 'Acidity', sweetness: 'Sweetness', flavor: 'Flavor', mouthfeel: 'Mouthfeel', aftertaste: 'Aftertaste', overall: 'Overall' };

const AXIS_CHIPS: Record<string, { primary: { label: string; score: number }[]; reasons: string[] }> = {
  acidity: {
    primary: [
      { label: 'Sour / Sharp', score: 2 },
      { label: 'Bright / Lively', score: 7 },
      { label: 'Winey / Tart', score: 6 },
      { label: 'Mellow / Smooth', score: 5 },
      { label: 'Round / Balanced', score: 6 },
      { label: 'Mild / Gentle', score: 4 },
      { label: 'Flat / Dull', score: 3 },
    ],
    reasons: ['Citrus', 'Berry', 'Green Apple', 'Lemon', 'Vinegary', 'Soft', 'Brief'],
  },
  sweetness: {
    primary: [
      { label: 'Caramel / Rich', score: 7 },
      { label: 'Honeyed', score: 6 },
      { label: 'Fruity Sweet', score: 6 },
      { label: 'Brown Sugar', score: 5 },
      { label: 'Cereal / Grain', score: 4 },
      { label: 'Dry / Tart', score: 3 },
      { label: 'Bitter Sweet', score: 2 },
    ],
    reasons: ['Vanilla', 'Maple', 'Molasses', 'Stone Fruit', 'Floral', 'Raw Sugar', 'Clean'],
  },
  flavor: {
    primary: [
      { label: 'Fruity / Berry', score: 7 },
      { label: 'Floral / Tea', score: 6 },
      { label: 'Chocolate / Cocoa', score: 7 },
      { label: 'Nutty / Toast', score: 6 },
      { label: 'Spicy / Herbal', score: 5 },
      { label: 'Grainy / Cereal', score: 4 },
      { label: 'Rubbery / Smoky', score: 3 },
      { label: 'Musty / Dirty', score: 2 },
    ],
    reasons: ['Winey', 'Earthy', 'Tobacco', 'Cedar', 'Cinnamon', 'Baker\'s Chocolate', 'Tea-like'],
  },
  mouthfeel: {
    primary: [
      { label: 'Silky / Smooth', score: 7 },
      { label: 'Creamy / Buttery', score: 7 },
      { label: 'Syrupy / Heavy', score: 8 },
      { label: 'Full / Round', score: 6 },
      { label: 'Medium / Clean', score: 5 },
      { label: 'Light / Tea-like', score: 4 },
      { label: 'Watery / Thin', score: 3 },
    ],
    reasons: ['Juicy', 'Velvety', 'Sharp', 'Drying', 'Puckering', 'Greasy', 'Metallic'],
  },
  aftertaste: {
    primary: [
      { label: 'Long / Lingering', score: 7 },
      { label: 'Clean / Sweet', score: 6 },
      { label: 'Pleasant Finish', score: 6 },
      { label: 'Short / Quick', score: 4 },
      { label: 'Bitter Finish', score: 3 },
      { label: 'Astringent / Dry', score: 2 },
    ],
    reasons: ['Chocolatey', 'Smoky', 'Floral', 'Crisp', 'Dull', 'Harsh', 'Metallic'],
  },
  overall: {
    primary: [
      { label: 'Excellent', score: 8 },
      { label: 'Very Good', score: 7 },
      { label: 'Good', score: 6 },
      { label: 'Fair', score: 5 },
      { label: 'Poor', score: 3 },
    ],
    reasons: ['Balanced', 'Complex', 'Clean', 'Wrong', 'Flat', 'Muddy', 'Astringent'],
  },
};

interface Symptom {
  name: string;
  desc: string;
  likelyExtraction: 'under' | 'over' | 'both' | 'defect';
  relatedHiddenVars: string[];
  relatedFoundation: string;
  fixes: string[];
}

const SYMPTOMS: Symptom[] = [
  { name: 'Sour / Sharp', desc: 'Pungent acidity, mouth-puckering', likelyExtraction: 'under', relatedHiddenVars: ['Thermal recovery gap', 'Prestat / bloom CO₂ release'], relatedFoundation: 'Temp / Time', fixes: ['Increase water temp', 'Extend contact time', 'Grind finer'] },
  { name: 'Bitter', desc: 'Harsh, lingering bitter finish', likelyExtraction: 'over', relatedHiddenVars: ['Grind distribution spread', 'Resistance system imbalance'], relatedFoundation: 'Grind', fixes: ['Grind coarser', 'Lower water temp', 'Shorten contact time'] },
  { name: 'Hollow / Thin', desc: 'Lacks body, empty mid-palate', likelyExtraction: 'under', relatedHiddenVars: ['Micro-fine clogging', 'Filter media adsorption'], relatedFoundation: 'Grind', fixes: ['Grind finer', 'Increase dose', 'Check paper type'] },
  { name: 'Astringent / Drying', desc: 'Dry, rough mouthfeel like tea tannins', likelyExtraction: 'over', relatedHiddenVars: ['Grind distribution spread', 'Resistance system imbalance'], relatedFoundation: 'Turbulence', fixes: ['Reduce agitation', 'Grind coarser', 'Check water hardness'] },
  { name: 'Grassy / Veggy', desc: 'Unripe, green, vegetal flavors', likelyExtraction: 'under', relatedHiddenVars: ['Prestat / bloom CO₂ release', 'Thermal recovery gap'], relatedFoundation: 'Temp / Time', fixes: ['Extend bloom', 'Increase temp', 'Check bean freshness'] },
  { name: 'Muddy / Dull', desc: 'Cloudy, heavy, lifeless cup', likelyExtraction: 'over', relatedHiddenVars: ['Micro-fine clogging', 'Grind distribution spread'], relatedFoundation: 'Grind', fixes: ['Sift fines', 'Use faster paper', 'Grind coarser'] },
  { name: 'Weak Body', desc: 'Watery texture, no weight', likelyExtraction: 'under', relatedHiddenVars: ['Filter media adsorption', 'Micro-fine clogging'], relatedFoundation: 'Ratio', fixes: ['Increase dose', 'Grind finer', 'Switch paper'] },
  { name: 'Metallic', desc: 'Iron or metal taste', likelyExtraction: 'defect', relatedHiddenVars: [], relatedFoundation: 'Ratio', fixes: ['Check water quality', 'Rinse filter thoroughly', 'Check kettle material'] },
  { name: 'Burnt / Smoky', desc: 'Over-roasted, char flavor', likelyExtraction: 'over', relatedHiddenVars: ['Tempurator insulation loss'], relatedFoundation: 'Temp / Time', fixes: ['Lower water temp', 'Check roast level', 'Coarsen grind'] },
  { name: 'Flat / Lifeless', desc: 'No vibrancy, stale impression', likelyExtraction: 'both', relatedHiddenVars: ['Prestat / bloom CO₂ release', 'Bean density & roast level'], relatedFoundation: 'Grind', fixes: ['Fresher beans', 'Adjust grind', 'Check water freshness'] },
];

const FOUNDATION_ICONS: Record<string, string> = { Grind: '⚙', 'Temp / Time': '🌡', Turbulence: '🌊', Ratio: '⚖' };

function scoreContext(s: Score): { label: string; color: string } {
  if (s <= 3) return { label: 'Low', color: '#ef4444' };
  if (s <= 5) return { label: 'OK', color: '#f59e0b' };
  if (s <= 6) return { label: 'Good', color: '#22c55e' };
  return { label: 'Great', color: '#16a34a' };
}

function RadarChart({ profile, onChange }: { profile: Profile; onChange: (k: string, v: number) => void }) {
  const size = 220, cx = size / 2, cy = size / 2, radius = 90;
  const angles = AXES.map((_, i) => (i / AXES.length) * Math.PI * 2 - Math.PI / 2);
  const scale = (v: number) => (v / 9) * radius;
  const pts = AXES.map((k, i) => { const r = scale(profile[k]); return { x: cx + r * Math.cos(angles[i]), y: cy + r * Math.sin(angles[i]) }; });
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" data-radar>
      {[0,1,2,3,4,5,6,7,8,9].map(v => { const r = scale(v); const ring = angles.map(a => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`).join(' '); return <polygon key={v} points={ring} fill="none" stroke="#e2e8f0" strokeWidth={0.5} />; })}
      {angles.map((a, i) => <line key={i} x1={cx} y1={cy} x2={cx + radius * Math.cos(a)} y2={cy + radius * Math.sin(a)} stroke="#e2e8f0" strokeWidth={0.5} />)}
      <polygon points={poly} fill="rgba(251,191,36,0.15)" stroke="#f59e0b" strokeWidth={1.5} />
      {AXES.map((k, i) => {
        const angle = angles[i];
        const r = scale(profile[k]), x = cx + r * Math.cos(angle), y = cy + r * Math.sin(angle);
        const lx = cx + (radius + 16) * Math.cos(angle), ly = cy + (radius + 16) * Math.sin(angle);
        const ctx = scoreContext(profile[k]);
        const axisUnit = { x: Math.cos(angle), y: Math.sin(angle) };
        const startDrag = () => {
          const svg = document.querySelector(`[data-radar]`) as SVGElement;
          if (!svg) return;
          const rect = svg.getBoundingClientRect();
          const onMove = (ev: MouseEvent | TouchEvent) => {
            ev.preventDefault();
            const pt = 'touches' in ev ? ev.touches[0] : ev;
            const dx = pt.clientX - rect.left - cx, dy = pt.clientY - rect.top - cy;
            const proj = dx * axisUnit.x + dy * axisUnit.y;
            onChange(k, Math.max(0, Math.min(9, Math.round((proj / radius) * 9))));
          };
          const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp); };
          document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchend', onUp);
        };
        return (
          <g key={k}>
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#64748b" fontWeight={600}>{AXIS_LABELS[k]}</text>
            <line x1={cx} y1={cy} x2={cx + radius * Math.cos(angle)} y2={cy + radius * Math.sin(angle)} stroke="transparent" strokeWidth={20} className="cursor-pointer"
              onMouseDown={() => startDrag()}
              onTouchStart={e => { e.preventDefault(); startDrag(); }}
            />
            <circle cx={x} cy={y} r={6} fill="white" stroke={ctx.color} strokeWidth={2} className="cursor-pointer"
              onMouseDown={() => startDrag()}
              onTouchStart={e => { e.preventDefault(); startDrag(); }}
            />
            <text x={x} y={y - 10} textAnchor="middle" fontSize={8} fill={ctx.color} fontWeight={700}>{profile[k]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function MiniRadar({ profile, label }: { profile: Profile; label?: string }) {
  const size = 100, cx = size / 2, cy = size / 2, radius = 40;
  const angles = AXES.map((_, i) => (i / AXES.length) * Math.PI * 2 - Math.PI / 2);
  const scale = (v: number) => (v / 9) * radius;
  const pts = AXES.map((k, i) => { const r = scale(profile[k]); return { x: cx + r * Math.cos(angles[i]), y: cy + r * Math.sin(angles[i]) }; });
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0,3,6,9].map(v => { const r = scale(v); const ring = angles.map(a => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`).join(' '); return <polygon key={v} points={ring} fill="none" stroke="#e2e8f0" strokeWidth={0.5} />; })}
      {angles.map((a, i) => <line key={i} x1={cx} y1={cy} x2={cx + radius * Math.cos(a)} y2={cy + radius * Math.sin(a)} stroke="#e2e8f0" strokeWidth={0.5} />)}
      {AXES.map((k, i) => {
        const lx = cx + (radius + 12) * Math.cos(angles[i]), ly = cy + (radius + 12) * Math.sin(angles[i]);
        const abbr = AXIS_LABELS[k].slice(0, 4);
        return <text key={k} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={4.5} fill="#94a3b8">{abbr}</text>;
      })}
      <polygon points={poly} fill="rgba(251,191,36,0.15)" stroke="#f59e0b" strokeWidth={1} />
      {AXES.map((k, i) => {
        const r = scale(profile[k]), x = cx + r * Math.cos(angles[i]), y = cy + r * Math.sin(angles[i]);
        const ctx = scoreContext(profile[k]);
        return <circle key={k} cx={x} cy={y} r={2.5} fill={ctx.color} stroke="white" strokeWidth={1} />;
      })}
      {AXES.map((k, i) => {
        const r = scale(profile[k]), x = cx + r * Math.cos(angles[i]), y = cy + r * Math.sin(angles[i]);
        return <text key={k} x={x} y={y - 6} textAnchor="middle" fontSize={5} fill="#475569" fontWeight={700}>{profile[k]}</text>;
      })}
      {label && <text x={cx} y={size - 3} textAnchor="middle" fontSize={5} fill="#94a3b8">{label}</text>}
    </svg>
  );
}

export default function Diagnostic({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const ratioDraft = useRef('');
  const [profile, setProfile] = useState<Profile>({ acidity: 5, sweetness: 5, flavor: 5, mouthfeel: 5, aftertaste: 5, overall: 5 });
  const [expandedIntegrity, setExpandedIntegrity] = useState<string | null>(null);
  const [improveTo, setImproveTo] = useState(5);
  const [profileMode, setProfileMode] = useState<'slider' | 'chip'>('slider');
  const [judgeSummoned, setJudgeSummoned] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const voiceSetRef = useRef(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [chipReasons, setChipReasons] = useState<Record<string, string[]>>({});
  const [chipAwards, setChipAwards] = useState<Record<string, boolean>>({});
  const [notedDescriptors, setNotedDescriptors] = useState<Record<string, string | null>>({});
  const [tab, setTab] = useState<'profile' | 'composition' | 'extraction' | 'internal' | 'timing' | 'hidden' | 'external' | 'symptoms'>('profile');
  const [focusAxes, setFocusAxes] = useState<string[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [composition, setComposition] = useState<Record<string, number>>({ acidity: 0, sweetness: 0, flavor: 0, mouthfeel: 0, aftertaste: 0, overall: 0 });
  const [axisPresent, setAxisPresent] = useState<Record<string, boolean>>({ acidity: true, sweetness: true, flavor: true, mouthfeel: true, aftertaste: true, overall: true });
  const [vocabCats, setVocabCats] = useState<Record<string, Record<string, string>>>({});
  const [autoComp, setAutoComp] = useState<Record<string, boolean>>({ acidity: true, sweetness: true, flavor: true, mouthfeel: true, aftertaste: true, overall: true });
  const [flavorNotes, setFlavorNotes] = useState<Record<string, string[]>>({});
  const [showSummary, setShowSummary] = useState(true);
  const [showVocabChips, setShowVocabChips] = useState(true);
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [snapName, setSnapName] = useState('');
  const [snapRating, setSnapRating] = useState(3);
  const [compSnapshots, setCompSnapshots] = useState<CompSnapshot[]>(() => { try { return JSON.parse(localStorage.getItem('comp-snapshots-belka') || '[]'); } catch { return []; } });
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(true);
  const [equipment, setEquipment] = useState<Equipment>({ dripper: '', paper: '', mod: '', burrType: '', burrSize: '', finesFeel: 5, grindEffort: 5, grindSetting: 5, dose: 18, ratio: '1:16', planTime: '', timeFinished: '' });
  const [showEquipment, setShowEquipment] = useState(false);
  const [tds, setTds] = useState('1.35');
  const [brewYield, setBrewYield] = useState('');
  const [bloomTime, setBloomTime] = useState('');
  const [mainPourTime, setMainPourTime] = useState('');
  const [drawdownTime, setDrawdownTime] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [extractionDose, setExtractionDose] = useState('18');
  const [extractionRatio, setExtractionRatio] = useState('1:16');
  const [tdsGoal, setTdsGoal] = useState('1.35');
  const [eyGoal, setEyGoal] = useState('20');
  const [eyMin, setEyMin] = useState('18');
  const [eyMax, setEyMax] = useState('22');
  const [yieldOut, setYieldOut] = useState('');
  const ratioInputRef = useRef<HTMLInputElement>(null);

  const ratioNum = useMemo(() => {
    const m = extractionRatio.match(/:(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }, [extractionRatio]);

  const ext = useMemo(() => {
    const tdsNum = parseFloat(tds) || 0;
    const doseNum = parseFloat(extractionDose) || 0;
    const eyMinNum = parseFloat(eyMin) || 18;
    const eyMaxNum = parseFloat(eyMax) || 22;
    const eyTarget = (eyMinNum + eyMaxNum) / 2;
    const waterIn = doseNum * ratioNum;
    const yieldOutNum = parseFloat(yieldOut) || 0;
    const waterOut = yieldOutNum > 0 ? yieldOutNum : Math.max(0, waterIn - doseNum * 2);
    const ey = tdsNum > 0 && doseNum > 0 && waterOut > 0 ? tdsNum * waterOut / doseNum : 0;
    const validRatio = ratioNum >= 10 && ratioNum <= 30;
    const scaRange = validRatio ? getReferenceTDSRange(ratioNum, 18, 22) : null;
    const scaLo = scaRange?.tdsMin ?? 0;
    const scaHi = scaRange?.tdsMax ?? 0;
    const tdsInSCA = tdsNum > 0 && scaLo > 0 && tdsNum >= scaLo && tdsNum <= scaHi;
    const tdsUnderSCA = tdsNum > 0 && scaLo > 0 && tdsNum < scaLo;
    const tdsOverSCA = tdsNum > 0 && scaHi > 0 && tdsNum > scaHi;
    const eyUnder = ey > 0 && ey < eyMinNum;
    const eyOver = ey > eyMaxNum;

    const lowScores: Array<keyof Profile> = [];
    for (const k of AXES) { if (profile[k] < improveTo) lowScores.push(k); }
    const hasLowScores = lowScores.length > 0;

    const beforeAfterNote = hasLowScores && tdsNum > 0 && ey >= eyMinNum && ey <= eyMaxNum
      ? 'Sensory scores are low but extraction measures on target. Before/after gap — the issue may be post-extraction (bypass, cooling, staling) or pre-extraction (green quality, roast). Check Foundations for hidden variables.'
      : null;

    const extractionStatus = ey > 0 && eyMinNum > 0 && eyMaxNum > 0
      ? ey < eyMinNum ? 'under' : ey > eyMaxNum ? 'over' : 'ideal'
      : null;

    const useScaForTds = ratioNum >= 14 && ratioNum <= 22;
    const tdsRefLo = useScaForTds ? scaLo : (validRatio ? getReferenceTDS(ratioNum, eyMinNum) : 0);
    const tdsRefHi = useScaForTds ? scaHi : (validRatio ? getReferenceTDS(ratioNum, eyMaxNum) : 0);
    const tdsStrength = tdsNum > 0 && tdsRefLo > 0
      ? tdsNum < tdsRefLo ? 'weak' : tdsNum > tdsRefHi ? 'strong' : 'ideal'
      : null;

    const selectedSymptomData = selectedSymptoms.map(sn => SYMPTOMS.find(s => s.name === sn)).filter(Boolean) as Symptom[];
    const underSymptoms = selectedSymptomData.filter(s => s.likelyExtraction === 'under' || s.likelyExtraction === 'both');
    const overSymptoms = selectedSymptomData.filter(s => s.likelyExtraction === 'over' || s.likelyExtraction === 'both');

    const diagnosis = (() => {
      if (!extractionStatus || !tdsStrength || !validRatio) return null;
      const statusMap: Record<string, string> = { under: 'Underextracted', over: 'Overextracted', ideal: 'Ideal' };
      const strengthMap: Record<string, string> = { weak: 'Weak', strong: 'Strong', ideal: 'Balanced' };
      const s = extractionStatus;
      const t = tdsStrength;
      const hasUnderSx = underSymptoms.length > 0;
      const hasOverSx = overSymptoms.length > 0;
      const sx = hasUnderSx ? underSymptoms.map(s => s.name).join(', ') : hasOverSx ? overSymptoms.map(s => s.name).join(', ') : '';
      let narrative = '';
      let badgeColor = '#22c55e';

      if (s === 'under' && t === 'strong') {
        badgeColor = '#f59e0b';
        narrative = `Strong TDS but low EY — the brew is concentrated from a tight ratio, not from dissolving coffee solids effectively.`;
        if (hasUnderSx) narrative += ` Selected under-extraction symptoms (${sx}) match this pattern.`;
        if (lowScores.includes('acidity')) narrative += ` Low acidity score fits — tight ratio brews often mute bright notes.`;
        narrative += ` Widen the ratio (more water) to improve extraction yield while keeping body.`;
      } else if (s === 'under' && t === 'weak') {
        badgeColor = '#ef4444';
        narrative = `Both TDS and EY are low — the brew is weak and underextracted.`;
        if (hasUnderSx) narrative += ` Under-extraction symptoms (${sx}) confirm the direction.`;
        narrative += ` Grind finer, increase contact time, or raise temperature to dissolve more solids.`;
      } else if (s === 'under' && t === 'ideal') {
        badgeColor = '#f59e0b';
        narrative = `TDS is in range but EY is low — the ratio may be too tight, limiting how much coffee dissolves relative to water.`;
        if (hasUnderSx) narrative += ` Symptoms suggest under-extraction (${sx}).`;
        narrative += ` Widen the ratio slightly or increase extraction time.`;
      } else if (s === 'over' && t === 'strong') {
        badgeColor = '#ef4444';
        narrative = `Both TDS and EY are high — over-extracting coffee solids.`;
        if (hasOverSx) narrative += ` Over-extraction symptoms (${sx}) are consistent.`;
        narrative += ` Grind coarser or shorten contact time to reduce extraction.`;
      } else if (s === 'over' && t === 'weak') {
        badgeColor = '#f59e0b';
        narrative = `EY is high but TDS is low — dilution from too wide a ratio inflates yield while weakening strength.`;
        if (hasOverSx) narrative += ` Over-extraction symptoms (${sx}) support this.`;
        narrative += ` Tighten the ratio (less water) to increase concentration.`;
      } else if (s === 'over' && t === 'ideal') {
        badgeColor = '#f59e0b';
        narrative = `TDS is in range but EY is high — slightly over-extracting.`;
        if (hasOverSx) narrative += ` Symptoms (${sx}) align.`;
        narrative += ` Reduce contact time or grind slightly coarser.`;
      } else if (s === 'ideal' && t !== 'ideal') {
        badgeColor = '#f59e0b';
        narrative = `EY is on target but TDS is ${t === 'weak' ? 'low' : 'high'} — adjust ratio to dial in strength.`;
        narrative += t === 'weak' ? ' Tighten the ratio.' : ' Widen the ratio.';
      } else if (s === 'ideal' && t === 'ideal') {
        badgeColor = '#22c55e';
        narrative = `Extraction measures are balanced.`;
        if (hasLowScores) narrative += ` Sensory issues may be from pre/post-extraction factors (green quality, roast, bypass, staling).`;
        else narrative += ` The brew should taste well-extracted.`;
      }
      const label = `${strengthMap[t]} · ${statusMap[s]}`;
      return { label, badge: statusMap[s], badgeColor, narrative };
    })();

    // Sensory direction from symptoms + low scores
    const underSxCount = selectedSymptomData.filter(s => s.likelyExtraction === 'under' || s.likelyExtraction === 'both').length;
    const overSxCount = selectedSymptomData.filter(s => s.likelyExtraction === 'over' || s.likelyExtraction === 'both').length;
    const lowAcidity = lowScores.includes('acidity');
    const lowFlavor = lowScores.includes('flavor');
    let direction = 'stay';
    if (selectedSymptomData.length > 0) {
      if (underSxCount > overSxCount) direction = 'increase';
      else if (overSxCount > underSxCount) direction = 'decrease';
    } else if (lowAcidity && lowFlavor) {
      direction = 'increase';
    }

    return {
      tdsNum, doseNum, ratioNum, eyTarget, eyMinNum, eyMaxNum, waterIn, waterOut, ey,
      validRatio, scaLo, scaHi, tdsInSCA, tdsUnderSCA, tdsOverSCA,
      eyUnder, eyOver, lowScores, hasLowScores, beforeAfterNote,
      extractionStatus, useScaForTds, tdsStrength, selectedSymptomData, diagnosis, direction,
    };
  }, [tds, extractionDose, extractionRatio, eyMin, eyMax, yieldOut, ratioNum, selectedSymptoms, profile, improveTo]);

  useEffect(() => {
    const ey = parseFloat(eyGoal) || 20;
    if (ratioNum > 0) {
      const t = getReferenceTDS(ratioNum, ey);
      setTdsGoal(t.toFixed(2));
    }
  }, [eyGoal, ratioNum]);

  // Persist extraction inputs across page loads
  const STORAGE_KEY = 'diagnostic-extraction';
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.extractionDose !== undefined) setExtractionDose(d.extractionDose);
        if (d.extractionRatio !== undefined) setExtractionRatio(d.extractionRatio);
        if (d.tds !== undefined) setTds(d.tds);
        if (d.eyMin !== undefined) setEyMin(d.eyMin);
        if (d.eyMax !== undefined) setEyMax(d.eyMax);
        if (d.yieldOut !== undefined) setYieldOut(d.yieldOut);
      }
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      extractionDose, extractionRatio, tds, eyMin, eyMax, yieldOut
    }));
  }, [extractionDose, extractionRatio, tds, eyMin, eyMax, yieldOut]);
  useEffect(() => {
    const awarded = Object.entries(chipAwards).filter(([_, v]) => v).map(([k]) => k);
    if (awarded.length > 0) {
      setProfile(p => {
        const next = { ...p };
        for (const k of awarded) next[k as keyof Profile] = improveTo;
        return next;
      });
    }
  }, [improveTo]);

  // Load browser voices, exclude David
  useEffect(() => {
    let attempts = 0;
    const load = () => {
      const all = window.speechSynthesis.getVoices().filter((v: SpeechSynthesisVoice) => !/david/i.test(v.name));
      if (all.length === 0 && attempts < 5) { attempts++; setTimeout(load, 300); return; }
      setVoices(all);
      if (!voiceSetRef.current && all.length > 0) {
        const prefer = all.find(v => /zira|mark|natural|neural/i.test(v.name));
        setSelectedVoice(prefer ? prefer.name : all[0].name);
        voiceSetRef.current = true;
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  useEffect(() => { localStorage.setItem('comp-snapshots-belka', JSON.stringify(compSnapshots)); }, [compSnapshots]);

  const playTranscript = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = voices.find(v => v.name === selectedVoice);
    if (voice) u.voice = voice;
    u.rate = 0.85;
    u.pitch = /zira/i.test(selectedVoice) ? 1.2 : 0.7;
    u.onstart = () => setIsSpeaking(true);
    u.onend = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const stopTranscript = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const handleSave = () => {
    const data = { profile, improveTo, focusAxes, selectedSymptoms, snapshots, equipment, tds, brewYield, bloomTime, mainPourTime, drawdownTime, deliveryTime, extractionDose, extractionRatio, tdsGoal, eyGoal, eyMin, eyMax, yieldOut };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `diagnostic-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result as string);
        if (d.profile) setProfile(d.profile);
        if (d.improveTo) setImproveTo(d.improveTo);
        if (d.focusAxes) setFocusAxes(d.focusAxes);
        if (d.selectedSymptoms) setSelectedSymptoms(d.selectedSymptoms);
        if (d.snapshots) setSnapshots(d.snapshots.map((s: any) => ({ ...s, time: new Date(s.time) })));
        if (d.equipment) setEquipment(d.equipment);
        if (d.tds !== undefined) setTds(d.tds);
        if (d.brewYield !== undefined) setBrewYield(d.brewYield);
        if (d.bloomTime !== undefined) setBloomTime(d.bloomTime);
        if (d.mainPourTime !== undefined) setMainPourTime(d.mainPourTime);
        if (d.drawdownTime !== undefined) setDrawdownTime(d.drawdownTime);
        if (d.deliveryTime !== undefined) setDeliveryTime(d.deliveryTime);
        if (d.extractionDose !== undefined) setExtractionDose(d.extractionDose);
        if (d.extractionRatio !== undefined) setExtractionRatio(d.extractionRatio);
        if (d.tdsGoal !== undefined) setTdsGoal(d.tdsGoal);
        if (d.eyGoal !== undefined) setEyGoal(d.eyGoal);
        if (d.eyMin !== undefined) setEyMin(d.eyMin);
        if (d.eyMax !== undefined) setEyMax(d.eyMax);
        if (d.yieldOut !== undefined) setYieldOut(d.yieldOut);
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const setScore = (key: keyof Profile, val: number) => setProfile(p => ({ ...p, [key]: Math.max(1, Math.min(9, val)) }));
  const toggleReason = (axis: string, reason: string) => {
    setChipReasons(prev => {
      const current = prev[axis] || [];
      return { ...prev, [axis]: current.includes(reason) ? current.filter(r => r !== reason) : [...current, reason] };
    });
  };
  const toggleAward = (axis: string) => {
    setChipAwards(prev => {
      const awarded = !prev[axis];
      setScore(axis as keyof Profile, awarded ? improveTo : 1);
      return { ...prev, [axis]: awarded };
    });
  };

  const shadowJudge = useMemo(() => {
    const p = profile;
    const lines: { axis: string; score: number; text: string; tone: 'cheer' | 'neutral' | 'pressure' }[] = [];
    const notes: string[] = [];

    for (const k of AXES) {
      const axisData = shadowJudgeData.axes[k];
      if (!axisData) continue;
      const s = p[k];
      const desc = axisData.descriptions.find(d => s >= d.scoreMin && s <= d.scoreMax);
      if (desc) lines.push({ axis: k, score: s, text: desc.text, tone: desc.tone });
    }

    for (const pat of shadowJudgeData.patterns) {
      try {
        const fn = new Function('p', 'return ' + pat.condition);
        if (fn(p)) notes.push(pat.text);
      } catch {}
    }

    const hasFlags = notes.some(o => o.startsWith('⚠'));
    const cheerCount = lines.filter(l => l.tone === 'cheer').length;
    const pressureCount = lines.filter(l => l.tone === 'pressure').length;
    let verdict = shadowJudgeData.verdicts.find(v =>
      cheerCount >= v.cheerMin &&
      pressureCount >= v.pressureMin &&
      (v.hasFlags === 'any' || v.hasFlags === hasFlags)
    )?.text || 'Solid and balanced. Reliable work. Now push one axis to great.';

    const axisTips: Record<string, string> = {
      acidity: 'adjust your ratio or water temp to shift brightness.',
      sweetness: 'this is mostly bean-origin and roast — try a different coffee or push development.',
      flavor: 'check your dose and contact time — more extraction = more flavour.',
      mouthfeel: 'grind finer or increase dose for more body; go coarser if it\'s too heavy.',
      aftertaste: 'extend contact time or raise temp to develop the finish.',
      overall: 'focus on the lowest attribute — everything else follows.',
    };
    const planAxes = [...AXES]
      .map(k => ({ axis: k, score: p[k], label: AXIS_LABELS[k], tip: axisTips[k] || 'review your process.' }))
      .filter(a => a.score < Math.min(improveTo, 6))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
    const plan: { axis: string; label: string; tip: string }[] = planAxes.length > 0 ? planAxes : [];

    const opener = shadowJudgeData.transcript.openers[Math.floor(Math.random() * shadowJudgeData.transcript.openers.length)];
    const closer = shadowJudgeData.transcript.closers[Math.floor(Math.random() * shadowJudgeData.transcript.closers.length)];
    const segments: { text: string; tone: string }[] = [{ text: opener, tone: 'opener' }];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const label = AXIS_LABELS[l.axis];
      const desc = notedDescriptors[l.axis];
      segments.push({ text: `${label}${desc ? ` — ${desc.toLowerCase()}` : ''}: ${l.text}`, tone: l.tone });
    }
    segments.push({ text: closer, tone: 'closer' });

    const drinkRule = [...shadowJudgeData.drinkability].sort((a, b) => b.scoreMin - a.scoreMin).find(r => p.overall >= r.scoreMin);
    const drinkability = drinkRule || { text: '', icon: '' };

    return { lines, notes, verdict, segments, drinkability, plan };
  }, [profile, notedDescriptors]);

  const integrityCheck = useMemo(() => {
    const entries: { key: string; label: string; score: number; context: string }[] = [];
    for (const k of AXES) {
      const s = profile[k];
      if (s < improveTo) {
        const ctx = s <= 3 ? 'Needs work' : 'Room to grow';
        entries.push({ key: k, label: AXIS_LABELS[k], score: s, context: ctx });
      }
    }
    const lowest = { axis: '', score: 9 };
    for (const k of AXES) { if (profile[k] < lowest.score) { lowest.axis = k; lowest.score = profile[k]; } }
    let direction = '';
    if (lowest.axis && lowest.score < improveTo) {
      if (['acidity', 'sweetness'].includes(lowest.axis)) direction = 'Under-extracted ↑ — increase extraction (grind finer / longer contact / higher temp)';
      else if (lowest.axis === 'mouthfeel') direction = 'Over-extracted ↓ — decrease extraction (grind coarser / shorter contact / lower temp)';
      else direction = 'Check extraction balance — review grind + contact time first';
    }
    return { entries, lowest, direction };
  }, [profile, improveTo]);

  const extractionStatus = useMemo(() => {
    const underScore = (9 - profile.acidity) + (9 - profile.sweetness);
    const overScore = (9 - profile.mouthfeel) + (profile.flavor >= 7 && profile.acidity <= 3 ? 3 : 0);
    const maxScore = 18;
    const net = underScore - overScore;
    const absNet = Math.abs(net);
    let label: string, directive: string, color: string, major: boolean;
    if (absNet <= 2) { label = 'Stay'; directive = 'Refine precision — focus on hidden variable tuning'; color = '#22c55e'; major = false; }
    else if (net > 0) { label = 'Increase extraction'; directive = 'Finer grind / longer contact / higher temp'; color = '#3b82f6'; major = absNet >= 8; }
    else { label = 'Decrease extraction'; directive = 'Coarser grind / shorter contact / lower temp'; color = '#ef4444'; major = absNet >= 8; }
    return { label, directive, color, major, barPos: ((net + maxScore) / (maxScore * 2)) * 100, underScore, overScore };
  }, [profile]);

  const total = useMemo(() => Math.round((AXES.reduce((acc, k) => acc + profile[k], 0) / AXES.length) * 10) / 10, [profile]);

  const resistanceProfile = useMemo(() => computeResistance(equipment), [equipment]);
  const planSec = useMemo(() => {
    const computedSec = !resistanceProfile ? 150 : resistanceProfile.totalScore <= 4 ? 105 : resistanceProfile.totalScore <= 7 ? 150 : 210;
    if (!equipment.planTime) return computedSec;
    const m = /^\d{1,2}:\d{2}$/.test(equipment.planTime);
    if (!m) return computedSec;
    const [mn, s] = equipment.planTime.split(':').map(Number);
    return mn * 60 + s;
  }, [equipment.planTime, resistanceProfile]);
  const actualSec = useMemo(() => {
    if (!/^\d{1,2}:\d{2}$/.test(equipment.timeFinished)) return null;
    const [m, s] = equipment.timeFinished.split(':').map(Number);
    return m * 60 + s;
  }, [equipment.timeFinished]);
  const timeDelta = actualSec !== null ? actualSec - planSec : null;
  const timeStatus = timeDelta === null ? null : timeDelta <= -20 ? 'Too Fast' : timeDelta <= -5 ? 'Fast' : timeDelta <= 15 ? 'On Track' : timeDelta <= 40 ? 'Slow' : 'Stalled';

  const equipmentBias = useMemo(() => {
    const bias: Record<string, number> = {};
    if (!equipment.dripper) return bias;
    const r = resistanceProfile;
    if (!r) return bias;
    const isFast = r.totalScore <= 4;
    bias['Channeling'] = (isFast && timeStatus === 'Too Fast') ? 3 : isFast ? 1 : 0;
    bias['Micro-fine clogging'] = (timeStatus === 'Stalled' || (r.grindRes === 3 && r.paperRes === 3)) ? 3 : ((r.grindRes === 3 || r.paperRes === 3) && timeStatus === 'Slow') ? 2 : 0;
    bias['Bypass ratio imbalance'] = (r.dripperRes === 2 && r.paperRes === 1) ? 2 : 0;
    bias['Thermal recovery gap'] = equipment.dose >= 22 ? 1 : 0;
    bias['Burr alignment shadow'] = equipment.finesFeel >= 7 ? 2 : equipment.finesFeel >= 5 ? 1 : 0;
    bias['Gas bloom stall'] = (equipment.dose >= 20 && r.grindRes === 3) ? 2 : 0;
    return bias;
  }, [equipment, resistanceProfile, timeStatus]);

  const tracedVars = useMemo(() => {
    return HIDDEN_VARS.map(h => ({ ...h, match: h.symptomPattern(profile) + (equipmentBias[h.name] || 0) }));
  }, [profile, equipmentBias]);

  const traces = useMemo(() => tracedVars.filter(h => h.match > 0).sort((a, b) => b.match - a.match), [tracedVars]);

  const foundationPlan = useMemo(() => {
    const all = tracedVars.filter(h => h.match > 0);
    const grouped: Record<string, { name: string; totalMatch: number; vars: typeof all }> = {};
    for (const h of all) {
      if (!grouped[h.foundation]) grouped[h.foundation] = { name: h.foundation, totalMatch: 0, vars: [] };
      grouped[h.foundation].totalMatch += h.match;
      grouped[h.foundation].vars.push(h);
    }
    return Object.values(grouped).sort((a, b) => b.totalMatch - a.totalMatch);
  }, [tracedVars]);

  const filteredTraces = useMemo(() => {
    if (!expandedIntegrity) return [];
    const axisKey = AXES.find(k => AXIS_LABELS[k] === expandedIntegrity);
    if (!axisKey) return [];
    return tracedVars.filter(h => h.match > 0 && h.relatedAxes.includes(axisKey)).sort((a, b) => b.match - a.match).slice(0, 3);
  }, [tracedVars, expandedIntegrity]);

  const brewAnalysis = useMemo(() => {
    return BREW_FACTORS.map(f => ({ ...f, match: f.matchPattern(profile) })).filter(f => f.match > 0).sort((a, b) => b.match - a.match);
  }, [profile]);

  return (
    <div className="min-h-screen bg-[#f8f6f0] flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">🔍 Diagnostic</h1>
          <div className="flex items-center gap-1.5">
            <input ref={fileRef} type="file" accept=".json" onChange={handleLoad} className="hidden" />
            <button onClick={handleSave} className="px-2 py-1 text-[10px] font-semibold border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100">Save</button>
            <button onClick={() => fileRef.current?.click()} className="px-2 py-1 text-[10px] font-semibold border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100">Load</button>
            <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100">✕ Close</button>
          </div>
        </div>
        {/* Hierarchy bar — 5-layer workflow model */}
        <div className="max-w-4xl mx-auto px-4 pb-1.5">
          <div className="flex items-center gap-0.5 text-[8px] font-semibold">
            {[
              { id: 'profile', label: 'Sensory', icon: '📊' },
              { id: 'extraction', label: 'Extraction', icon: '📐' },
              { id: 'internal', label: 'Foundations', icon: '🧠' },
              { id: 'timing', label: 'Timing', icon: '⏱' },
              { id: 'hidden', label: 'Hidden Physics', icon: '👁' },
            ].map((layer, i) => (
              <button key={layer.id} onClick={() => setTab(layer.id as typeof tab)}
                className={`flex items-center gap-0.5 px-1.5 py-1 rounded transition-colors ${
                  tab === layer.id ? 'bg-amber-100 text-amber-800' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <span>{layer.icon}</span>
                <span>{layer.label}</span>
                {i < 4 && <span className="text-slate-300 mx-0.5">→</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 flex gap-1 flex-wrap">
          <button onClick={() => setTab('profile')} className={`px-3 py-1.5 text-[10px] font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'profile' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>📊 Sensory</button>
          <button onClick={() => setTab('composition')} className={`px-3 py-1.5 text-[10px] font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'composition' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>🥪 Composition</button>
          <button onClick={() => setTab('extraction')} className={`px-3 py-1.5 text-[10px] font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'extraction' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>📐 Extraction</button>
          <button onClick={() => setTab('internal')} className={`px-3 py-1.5 text-[10px] font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'internal' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>🧠 Foundations</button>
          <button onClick={() => setTab('timing')} className={`px-3 py-1.5 text-[10px] font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'timing' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>⏱ Timing</button>
          <button onClick={() => setTab('hidden')} className={`px-3 py-1.5 text-[10px] font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'hidden' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>👁 Hidden Physics</button>
          <button onClick={() => setTab('external')} className={`px-3 py-1.5 text-[10px] font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'external' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>🌍 External</button>
          <button onClick={() => setTab('symptoms')} className={`px-3 py-1.5 text-[10px] font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'symptoms' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>☣ Symptoms</button>
        </div>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 space-y-4 pb-20">
        {tab === 'profile' && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-700">Score Profile</h2>
                <div className="flex items-center gap-1">
                  <button onClick={() => setProfileMode('slider')}
                    className={`px-2 py-0.5 text-[9px] font-semibold rounded transition-colors ${profileMode === 'slider' ? 'bg-amber-600 text-white' : 'bg-white border border-slate-200 text-slate-400 hover:text-slate-600'}`}
                  >🎚 Sliders</button>
                  <button onClick={() => setProfileMode('chip')}
                    className={`px-2 py-0.5 text-[9px] font-semibold rounded transition-colors ${profileMode === 'chip' ? 'bg-amber-600 text-white' : 'bg-white border border-slate-200 text-slate-400 hover:text-slate-600'}`}
                  >🏷 Chips</button>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-3 p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-xs font-semibold text-slate-600">🎯 Aim for</span>
                <div className="flex items-center gap-1">
                  {[5, 6, 7, 8, 9].map(v => (
                    <button key={v} onClick={() => setImproveTo(v)}
                      className={`px-2 py-0.5 text-xs font-bold rounded transition-colors ${improveTo === v ? 'bg-amber-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >{v}</button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-400 ml-auto">
                  {improveTo === 5 ? 'Baseline — start here' : improveTo === 6 ? 'Good — solid starting point' : improveTo === 7 ? 'Great — one step at a time' : 'Ambitious — take it slow'}
                </span>
              </div>
              <div className="mb-3 text-[9px] text-slate-400 italic leading-relaxed bg-amber-50/50 border border-amber-100 rounded-lg p-2">
                You don't have to fix everything at once. The system shows <strong>one starting point</strong> below. Pick what feels right and ignore the rest for now.
              </div>
              <div className="flex flex-col md:flex-row items-start gap-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <RadarChart profile={profile} onChange={(k, v) => setScore(k as keyof Profile, v)} />
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSnapshots(prev => [...prev, { profile: { ...profile }, name: `S${prev.length + 1}`, time: new Date() }])}
                        className="text-[8px] font-semibold border border-dashed border-slate-200 text-slate-400 hover:text-slate-600 px-2 py-0.5 rounded"
                      >📸 Snapshot</button>
                      {snapshots.length > 0 && (
                        <button onClick={() => setShowSnapshots(prev => !prev)}
                          className={`text-[8px] font-semibold px-2 py-0.5 rounded border transition-colors ${showSnapshots ? 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200' : 'bg-white border-dashed border-slate-200 text-slate-400 hover:text-slate-600'}`}
                        >{showSnapshots ? '🙈 Hide' : `👁 ${snapshots.length}`}</button>
                      )}
                    </div>
                  </div>
                  {showSnapshots && snapshots.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1 max-w-[324px]">
                      {snapshots.map((s, i) => (
                        <div key={i} className="flex flex-col items-center gap-0.5 bg-slate-50 rounded-lg p-1.5 border border-slate-100 shrink-0 w-[104px] cursor-pointer hover:border-slate-300 transition-colors"
                          onClick={() => setProfile({ ...s.profile })}
                        >
                          <MiniRadar profile={s.profile} label={s.name} />
                          <div className="w-full text-[6px] text-slate-500 leading-tight">
                            {AXES.map(k => (
                              <div key={k} className="flex justify-between gap-1">
                                <span style={{ color: scoreContext(s.profile[k]).color }} className="truncate">{AXIS_LABELS[k]}</span>
                                <span className="font-bold" style={{ color: scoreContext(s.profile[k]).color }}>{s.profile[k]}</span>
                              </div>
                            ))}
                          </div>
                          <span className="text-[5px] text-slate-300">{s.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <button onClick={e => { e.stopPropagation(); setSnapshots(prev => prev.filter((_, j) => j !== i)); }}
                            className="text-[7px] text-slate-300 hover:text-red-400 font-semibold w-full text-right -mt-0.5"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {profileMode === 'chip' ? (
                  <div className="flex flex-wrap gap-3">
                    {AXES.map(k => {
                      const chips = AXIS_CHIPS[k];
                      const selectedReasons = chipReasons[k] || [];
                      return (
                        <div key={k} className="flex flex-col items-center gap-1.5">
                          <button onClick={() => toggleAward(k)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border-2 transition-all ${chipAwards[k] ? 'bg-amber-100 border-amber-500 text-amber-800 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'}`}
                          >{AXIS_LABELS[k]}{k === 'overall' && <span className="ml-1 text-[8px] font-normal text-slate-400">|</span>}{k === 'overall' && <button onClick={e => { e.stopPropagation(); setProfile(p => ({ ...p, overall: Math.round((p.acidity + p.sweetness + p.flavor + p.mouthfeel + p.aftertaste) / 5) })); }} className="ml-0.5 text-[8px] text-slate-400 hover:text-amber-600" title="Set as mean of all scores">∑</button>}</button>
                          {chipAwards[k] && (
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1.5 w-28">
                                <span className="text-[7px] text-slate-400 font-mono w-2 text-right">0</span>
                                <input type="range" min={0} max={9} value={profile[k as keyof Profile]} onChange={e => setScore(k as keyof Profile, parseInt(e.target.value))}
                                  className="flex-1 h-1 appearance-none rounded-full bg-slate-200 accent-amber-600 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-600 [&::-webkit-slider-thumb]:shadow-sm"
                                />
                                <span className="text-[7px] text-slate-400 font-mono w-2">9</span>
                              </div>
                              {chips && chips.reasons.length > 0 && (
                                <div className="flex flex-wrap gap-1 justify-center max-w-[140px]">
                                  {chips.reasons.map(reason => (
                                    <button key={reason} onClick={() => toggleReason(k, reason)}
                                      className={`px-1.5 py-0.5 text-[8px] font-medium rounded transition-colors ${selectedReasons.includes(reason) ? 'bg-slate-200 text-slate-700' : 'bg-white border border-dashed border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                    >{reason}</button>
                                  ))}
                                </div>
                              )}
                              {SENSORY_VOCAB[k] && (
                                <div className="flex flex-wrap gap-1 justify-center mt-0.5 max-w-[200px]">
                                  {SENSORY_VOCAB[k].categories.map((cat, catIdx) => (
                                    <div key={cat.name} className={`flex flex-wrap gap-0.5 items-baseline w-full ${catIdx === 0 ? 'bg-amber-50/50 rounded p-1 mb-0.5 border border-amber-200/30' : ''}`}>
                            <span className={`text-[6px] font-semibold uppercase tracking-wider ${POLARITY_COLORS[cat.polarity] || 'text-slate-400'}`}>{catIdx === 0 && '⚙️ '}{cat.name}{cat.acidType && cat.words.some(w => w.label === notedDescriptors[k]) && <span className="ml-1 text-[5px] text-slate-400 font-normal">({cat.acidType})</span>}</span>
                                        {cat.words.map(w => (
                                          <button key={w.label} onClick={() => {
                                            setNotedDescriptors(prev => {
                                              const next = prev[k] === w.label ? null : w.label;
                                              setVocabCats(vp => {
                                                const axisV = { ...(vp[k] || {}) };
                                                if (next === null) { delete axisV[cat.name]; } else { axisV[cat.name] = w.label; }
                                                return { ...vp, [k]: axisV };
                                              });
                                              return { ...prev, [k]: next };
                                            });
                                          }}
                                          className={`px-1 py-0.5 text-[7px] font-medium rounded-full border transition-colors ${notedDescriptors[k] === w.label ? 'bg-amber-100 border-amber-500 text-amber-800 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:border-slate-300'}`}
                                        >{w.emoji} {w.label}{notedDescriptors[k] === w.label ? ' ✓' : ''}</button>
                                      ))}
                                    </div>
                                  ))}
                </div>
                )}
              </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 w-full space-y-2.5">
                    {AXES.map(k => {
                      const chips = AXIS_CHIPS[k];
                      const selectedReasons = chipReasons[k] || [];
                      return (
                        <div key={k}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-semibold text-slate-600 capitalize">{AXIS_LABELS[k]}</span>
                            <span className="flex items-center gap-1"><span className="text-[11px] font-bold" style={{ color: scoreContext(profile[k]).color }}>{profile[k]} <span className="font-normal text-slate-400 text-[10px]">({scoreContext(profile[k]).label})</span></span>{k === 'overall' && <button onClick={() => setProfile(p => ({ ...p, overall: Math.round((p.acidity + p.sweetness + p.flavor + p.mouthfeel + p.aftertaste) / 5) }))} className="text-[8px] text-slate-400 hover:text-amber-600 border border-slate-200 hover:border-amber-400 rounded px-1 py-0.5" title="Set as mean of all scores">∑</button>}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-slate-400 font-mono w-3 text-right">0</span>
                            <input type="range" min={0} max={9} value={profile[k]} onChange={e => setScore(k, parseInt(e.target.value))}
                              className="flex-1 h-1.5 appearance-none rounded-full bg-slate-200 accent-amber-600 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
                            />
                            <span className="text-[9px] text-slate-400 font-mono w-3">9</span>
                          </div>
                          {chips && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {SENSORY_VOCAB[k] ? (
                                  SENSORY_VOCAB[k].categories.map((cat, catIdx) => (
                                    <div key={cat.name} className={`flex flex-wrap gap-0.5 items-baseline w-full ${catIdx === 0 ? 'bg-amber-50/50 rounded p-1 mb-0.5 border border-amber-200/30' : ''}`}>
                                       <span className={`text-[7px] font-semibold mr-0.5 ${POLARITY_COLORS[cat.polarity] || 'text-slate-400'}`}>{catIdx === 0 && '⚙️ '}{cat.name}{cat.acidType && cat.words.some(w => w.label === notedDescriptors[k]) && <span className="ml-1 text-[5px] text-slate-400 font-normal">({cat.acidType})</span>}</span>
                                      {cat.words.map(w => (
                                        <button key={w.label} onClick={() => setNotedDescriptors(prev => ({ ...prev, [k]: prev[k] === w.label ? null : w.label }))}
                                          className={`px-1.5 py-0.5 text-[8px] font-medium rounded-full border transition-colors ${notedDescriptors[k] === w.label ? 'bg-amber-100 border-amber-500 text-amber-800 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'}`}
                                        >{w.emoji} {w.label}{notedDescriptors[k] === w.label ? ' ✓' : ''}</button>
                                      ))}
                                    </div>
                                  ))
                                ) : (
                                  chips.primary.map(chip => (
                                    <button key={chip.label} onClick={() => {
                                      setNotedDescriptors(prev => ({ ...prev, [k]: prev[k] === chip.label ? null : chip.label }));
                                    }}
                                      className={`px-2 py-0.5 text-[9px] font-medium rounded-full border transition-colors ${notedDescriptors[k] === chip.label ? 'bg-amber-100 border-amber-500 text-amber-800 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'}`}
                                    >{chip.label}{notedDescriptors[k] === chip.label ? ' ✓' : ''}</button>
                                  ))
                                )}
                                {chips.reasons.length > 0 && <span className="text-[8px] text-slate-400 font-medium mt-0.5 mx-0.5">·</span>}
                                {chips.reasons.map(reason => (
                                  <button key={reason} onClick={() => toggleReason(k, reason)}
                                    className={`px-1.5 py-0.5 text-[8px] font-medium rounded transition-colors ${selectedReasons.includes(reason) ? 'bg-slate-200 text-slate-700' : 'bg-white border border-dashed border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                  >{reason}</button>
                                ))}
                </div>
                )}
              </div>
                      );
                    })}
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Mean Score</span>
                        <span className="text-lg font-bold text-slate-700">{total.toFixed(1)} <span className="text-xs font-normal text-slate-400">/ 9</span></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mt-3">
                <div className="text-[10px] font-bold text-slate-500 mb-1.5">🎭 Shadow Judge</div>
                {!judgeSummoned ? (
                  <button onClick={() => setJudgeSummoned(true)}
                    className="text-[9px] text-slate-500 hover:text-amber-700 bg-white border border-dashed border-slate-300 hover:border-amber-400 rounded-lg px-3 py-2 w-full transition-colors"
                  >🔮 Summon Shadow Judge</button>
                ) : (
                  <>
                {shadowJudge.lines.length > 0 && (
                  <div className="space-y-0.5 mb-2">
                    {shadowJudge.lines.map((l, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[9px]">
                        <span className="font-semibold text-slate-500 shrink-0 w-14">{AXIS_LABELS[l.axis]}</span>
                        <span className={`${l.tone === 'cheer' ? 'text-emerald-700' : l.tone === 'pressure' ? 'text-red-600' : 'text-amber-600'}`}>{l.tone === 'cheer' ? '🟢 ' : l.tone === 'pressure' ? '🔴 ' : '🟡 '}{l.score} — {l.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                {shadowJudge.notes.length > 0 && (
                  <div className="space-y-0.5 mb-2 pt-1.5 border-t border-slate-200">
                    {shadowJudge.notes.map((n, i) => (
                      <div key={i} className={`text-[9px] ${n.startsWith('⚠') ? 'text-amber-700' : 'text-slate-600'}`}>{n}</div>
                    ))}
                  </div>
                )}
                {shadowJudge.drinkability.text && (
                  <div className="text-[9px] text-slate-600 pt-1.5 border-t border-slate-200 mb-1.5">
                    <span className="mr-1">{shadowJudge.drinkability.icon}</span>
                    {shadowJudge.drinkability.text}
                  </div>
                )}
                <div className={`text-[9px] font-semibold pt-1.5 border-t border-slate-200 ${shadowJudge.verdict.includes('Solid work') || shadowJudge.verdict.includes('Strong profile') ? 'text-emerald-600' : shadowJudge.verdict.includes('too many weak') ? 'text-red-600' : 'text-amber-600'}`}>{shadowJudge.verdict}</div>
                <div className="pt-1.5 border-t border-slate-200 space-y-1">
                  <div className="text-[8px] text-slate-400 font-medium">Adjustment Advice</div>
                  {shadowJudge.plan.length > 0 ? shadowJudge.plan.map((step, i) => (
                    <div key={step.axis} className="text-[9px] text-slate-600">{i + 1}. <span className="font-medium">{step.label}</span> — {step.tip}</div>
                  )) : (
                    <div className="text-[9px] text-slate-500 italic">Everything's in a good place. Pick one area and push it further — you're on the right track.</div>
                  )}
                </div>
                <div className="pt-1 border-t border-slate-200">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShowTranscript(p => !p)} className="text-[10px] text-slate-400 hover:text-slate-600 mr-1">{showTranscript ? '▼' : '▶'} 📜 Transcript</button>
                    {showTranscript && (<>
                    <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)}
                      className="text-[8px] border border-slate-200 rounded px-1 py-0.5 text-slate-500 max-w-[120px]"
                    >{voices.map(v => (
                      <option key={v.name} value={v.name}>{v.name.replace(/Microsoft|Desktop|Online|\(Natural\)|\(Neural\)/g,'').trim()}</option>
                    ))}</select>
                    <button onClick={() => {
                      const txt = shadowJudge.segments.map(s => s.text).join(' ');
                      isSpeaking ? stopTranscript() : playTranscript(txt);
                    }} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-400"
                    >{isSpeaking ? '⏹' : '▶'}</button>
                    </>)}
                  </div>
                  {showTranscript && (
                  <p className="text-[8px] italic leading-relaxed mt-1">
                    <span className="text-[8px] text-slate-400 font-medium mr-1">📜</span>
                    {shadowJudge.segments.map((s, i) => (
                      <span key={i} className={
                        s.tone === 'cheer' ? 'text-emerald-600' :
                        s.tone === 'pressure' ? 'text-red-600' :
                        s.tone === 'opener' || s.tone === 'closer' ? 'text-slate-400' :
                        'text-amber-600'
                      }>{s.tone === 'cheer' ? '🟢 ' : s.tone === 'pressure' ? '🔴 ' : s.tone === 'neutral' ? '🟡 ' : ''}{s.text}{i < shadowJudge.segments.length - 1 ? ' ' : ''}</span>
                    ))}
                  </p>
                  )}
                </div>
                  </>
                )}
              </div>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <button onClick={() => setShowEquipment(prev => !prev)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600"
                >{showEquipment ? '▼' : '▶'} Equipment {equipment.dripper || equipment.paper || equipment.burrType ? '⚙' : '(optional)'}</button>
                {showEquipment && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[8px] font-semibold text-slate-500 block mb-0.5">Dripper</span>
                        <select value={equipment.dripper} onChange={e => setEquipment(prev => ({ ...prev, dripper: e.target.value, mod: '' }))}
                          className="w-full text-[9px] border border-slate-200 rounded px-1 py-0.5 text-slate-600"
                        ><option value="">—</option>{DRIPPERS.map(d => <option key={d.name} value={d.name}>{d.name} ({d.shape})</option>)}</select>
                      </div>
                      <div>
                        <span className="text-[8px] font-semibold text-slate-500 block mb-0.5">Paper</span>
                        <select value={equipment.paper} onChange={e => setEquipment(prev => ({ ...prev, paper: e.target.value }))}
                          className="w-full text-[9px] border border-slate-200 rounded px-1 py-0.5 text-slate-600"
                        ><option value="">—</option>{PAPERS.map(p => <option key={p.name} value={p.name}>{p.name} ({p.resistance}/3)</option>)}</select>
                      </div>
                      <div>
                        <span className="text-[8px] font-semibold text-slate-500 block mb-0.5">Burr Type</span>
                        <select value={equipment.burrType} onChange={e => setEquipment(prev => ({ ...prev, burrType: e.target.value }))}
                          className="w-full text-[9px] border border-slate-200 rounded px-1 py-0.5 text-slate-600"
                        ><option value="">—</option><option value="Cone">Cone</option><option value="Flat">Flat</option><option value="Other">Other</option></select>
                      </div>
                    </div>
                    {equipment.burrType && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[8px] font-semibold text-slate-500 block mb-0.5">Burr Size</span>
                          <select value={equipment.burrSize} onChange={e => setEquipment(prev => ({ ...prev, burrSize: e.target.value }))}
                            className="w-full text-[9px] border border-slate-200 rounded px-1 py-0.5 text-slate-600"
                          ><option value="">—</option>{['38mm','40mm','48mm','50mm','54mm','58mm','64mm','71mm','80mm','83mm','98mm'].map(s => <option key={s} value={s}>{s}</option>)}</select>
                        </div>
                        <div>
                          <span className="text-[8px] font-semibold text-slate-500 block mb-0.5">Fines you see: {equipment.finesFeel} <span className="font-normal text-slate-400">(few → many)</span></span>
                          <input type="range" min={0} max={9} value={equipment.finesFeel} onChange={e => setEquipment(prev => ({ ...prev, finesFeel: parseInt(e.target.value) }))}
                            className="w-full h-1 appearance-none rounded-full bg-slate-200 accent-amber-600 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
                          />
                        </div>
                      </div>
                    )}
                    {equipment.burrType && (
                      <div>
                        <span className="text-[8px] font-semibold text-slate-500 block mb-0.5">Grind effort (hand): {equipment.grindEffort} <span className="font-normal text-slate-400">(easy → hard)</span></span>
                        <input type="range" min={0} max={9} value={equipment.grindEffort} onChange={e => setEquipment(prev => ({ ...prev, grindEffort: parseInt(e.target.value) }))}
                          className="w-full h-1 appearance-none rounded-full bg-slate-200 accent-amber-600 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
                        />
                      </div>
                    )}
                    {equipment.burrType && (
                      <div>
                        <span className="text-[8px] font-semibold text-slate-500 block mb-0.5">Grind: {['X-Coarse','Very Coarse','Coarse','Med-Coarse','Medium','Med-Fine','Fine','Very Fine','X-Fine','Ultra-Fine'][equipment.grindSetting]} ({equipment.grindSetting}/9)</span>
                        <input type="range" min={0} max={9} value={equipment.grindSetting} onChange={e => setEquipment(prev => ({ ...prev, grindSetting: parseInt(e.target.value) }))}
                          className="w-full h-1 appearance-none rounded-full bg-slate-200 accent-amber-600 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
                        />
                      </div>
                    )}
                    {equipment.burrType && (
                      <div className="flex gap-3 items-end">
                        <div className="flex-1">
                          <span className="text-[8px] font-semibold text-slate-500 block mb-0.5">Dose: {equipment.dose}g</span>
                          <input type="range" min={8} max={30} value={equipment.dose} onChange={e => setEquipment(prev => ({ ...prev, dose: parseInt(e.target.value) }))}
                            className="w-full h-1 appearance-none rounded-full bg-slate-200 accent-amber-600 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
                          />
                        </div>
                        <div className="w-20">
                          <span className="text-[8px] font-semibold text-slate-500 block mb-0.5">Ratio</span>
                          <select value={equipment.ratio} onChange={e => setEquipment(prev => ({ ...prev, ratio: e.target.value }))}
                            className="w-full text-[9px] border border-slate-200 rounded px-1 py-0.5 text-slate-600"
                          >{['1:8','1:9','1:10','1:11','1:12','1:13','1:14','1:15','1:16','1:17','1:18','1:19','1:20'].map(r => <option key={r} value={r}>{r}</option>)}</select>
                        </div>
                      </div>
                    )}
                    {(() => {
                      const d = DRIPPERS.find(d => d.name === equipment.dripper);
                      if (d?.mods?.length) return (
                        <div>
                          <span className="text-[8px] font-semibold text-slate-500 block mb-0.5">Accessory / Mod</span>
                          <div className="flex gap-1 flex-wrap">
                            <button onClick={() => setEquipment(prev => ({ ...prev, mod: '' }))}
                              className={`text-[7px] px-1.5 py-0.5 rounded border transition-colors ${!equipment.mod ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                            >None</button>
                            {d.mods.map(m => (
                              <button key={m.name} onClick={() => setEquipment(prev => ({ ...prev, mod: m.name }))}
                                className={`text-[7px] px-1.5 py-0.5 rounded border transition-colors ${equipment.mod === m.name ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                title={m.desc}
                              >{m.name}</button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {(() => {
                      const noEq = !equipment.dripper && !equipment.paper;
                      if (noEq) return null;
                      const hasResistance = !!(equipment.dripper && equipment.paper);
                      const r = hasResistance ? computeResistance(equipment) : null;
                      const barColor = r ? (r.totalScore <= 4 ? '#3b82f6' : r.totalScore <= 7 ? '#22c55e' : '#ef4444') : '#94a3b8';
                      return (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-slate-600">Flow Resistance</span>
                            {r ? <span className="text-[8px] font-semibold" style={{ color: barColor }}>{r.rating} ({r.totalScore}/9)</span>
                            : <span className="text-[7px] text-slate-400 italic">fill dripper + paper</span>}
                          </div>
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: r ? `${(r.totalScore / 9) * 100}%` : '0%', backgroundColor: barColor }} />
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-[7px] text-slate-500">
                            <div>☕ Dripper {r ? `${r.dripperRes}/3` : '—'}</div>
                            <div>🧻 Paper {r ? `${r.paperRes}/3` : '—'}</div>
                            <div>⚙️ Grind {r ? `${r.grindRes}/3` : '—'}</div>
                          </div>
                          <div className="text-[6px] text-slate-400 font-mono">∑ = {r ? `${r.dripperRes} + ${r.paperRes} + ${r.grindRes} = ${r.totalScore}/9` : '—'}</div>
                          {r && (() => {
                            const computedSec = r.totalScore <= 4 ? 105 : r.totalScore <= 7 ? 150 : 210;
                            const planSec = (() => {
                              if (!equipment.planTime) return computedSec;
                              const m = /^\d{1,2}:\d{2}$/.test(equipment.planTime);
                              if (!m) return computedSec;
                              const [mn, s] = equipment.planTime.split(':').map(Number);
                              return mn * 60 + s;
                            })();
                            const planMin = Math.floor(planSec / 60), planRem = planSec % 60;
                            const planLabel = `${planMin}:${planRem.toString().padStart(2, '0')}`;
                            const actual = equipment.timeFinished;
                            const actualSec = /^\d{1,2}:\d{2}$/.test(actual) ? (() => { const [m, s] = actual.split(':').map(Number); return m * 60 + s; })() : null;
                            const timeDelta = actualSec !== null ? actualSec - planSec : null;
                            const timeStatus = timeDelta === null ? null : timeDelta <= -20 ? 'Too Fast' : timeDelta <= -5 ? 'Fast' : timeDelta <= 15 ? 'On Track' : timeDelta <= 40 ? 'Slow' : 'Stalled';
                            const timeColor = timeStatus === 'Too Fast' ? '#3b82f6' : timeStatus === 'Fast' ? '#22c55e' : timeStatus === 'On Track' ? '#22c55e' : timeStatus === 'Slow' ? '#f59e0b' : '#ef4444';
                            const timeInsight = timeStatus === 'Too Fast' ? 'Much faster than planned — likely channeling or grind too coarse' : timeStatus === 'Fast' ? 'Slightly fast — good flow, may benefit from finer grind' : timeStatus === 'On Track' ? 'On target — nice execution' : timeStatus === 'Slow' ? 'Slower than planned — possible fines migration or slight clog' : timeStatus === 'Stalled' ? 'Stalled — bed clogged, grind too fine or paper too dense' : null;
                            return (
                              <div className="border-t border-slate-200 pt-1.5 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[7px] font-semibold text-slate-500">Plan</span>
                                  <input value={equipment.planTime} onChange={e => setEquipment(prev => ({ ...prev, planTime: e.target.value }))}
                                    placeholder={planLabel}
                                    className="w-11 text-[8px] border border-slate-200 rounded px-0.5 py-0.5 text-slate-600 bg-white text-center"
                                  />
                                  <span className="text-[7px] text-slate-400">·</span>
                                  <span className="text-[7px] font-semibold text-slate-500">Actual</span>
                                  <input value={equipment.timeFinished} onChange={e => setEquipment(prev => ({ ...prev, timeFinished: e.target.value }))}
                                    placeholder="m:ss"
                                    className="w-11 text-[8px] border border-slate-200 rounded px-0.5 py-0.5 text-slate-600 bg-white text-center"
                                  />
                                  {timeStatus && <span className="text-[7px] font-semibold px-1 py-0.5 rounded" style={{ color: timeColor, backgroundColor: timeColor + '15' }}>{timeStatus}</span>}
                                </div>
                                {timeInsight && <p className="text-[7px] text-slate-500 italic">{timeInsight}</p>}
                              </div>
                            );
                          })()}
                          {r && <p className="text-[7px] text-slate-500 italic border-t border-slate-200 pt-1">{r.feedback}</p>}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Optimization Plan */}
            {focusAxes.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-700">🎯 Optimization Plan</h2>
                  <span className="text-[9px] text-slate-400">{focusAxes.length} priorit{focusAxes.length > 1 ? 'ies' : 'y'}</span>
                </div>
                <div className="space-y-1.5">
                  {focusAxes.map((axis, idx) => {
                    const label = AXIS_LABELS[axis];
                    const score = profile[axis as keyof Profile];
                    const gap = improveTo - score;
                    const isWinnable = score >= 3;
                    const relatedHidden = HIDDEN_VARS
                      .map(h => ({ ...h, match: h.symptomPattern(profile) }))
                      .filter(h => h.match > 0 && h.relatedAxes.includes(axis))
                      .sort((a, b) => b.match - a.match);
                    const topFoundation = relatedHidden.length > 0
                      ? [...new Set(relatedHidden.map(h => h.foundation))].sort((a, b) => {
                          const aScore = relatedHidden.filter(h => h.foundation === a).reduce((s, h) => s + h.match, 0);
                          const bScore = relatedHidden.filter(h => h.foundation === b).reduce((s, h) => s + h.match, 0);
                          return bScore - aScore;
                        })[0]
                      : integrityCheck.direction?.includes('Under') ? 'Grind'
                      : integrityCheck.direction?.includes('Over') ? 'Temp / Time'
                      : 'Grind';
                    return (
                      <div key={axis} className={`flex items-center gap-2 p-2 rounded-lg ${idx === 0 ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-slate-100'}`}>
                        <span className="text-[9px] font-bold text-slate-400 w-4 shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-slate-700 capitalize">{label}</span>
                            <span className="text-[9px] font-mono text-slate-500">{score} → {improveTo}</span>
                            <span className="text-[8px] font-medium text-amber-600">+{gap}</span>
                            {!isWinnable && <span className="text-[7px] text-slate-400 bg-slate-100 px-1 rounded">tough</span>}
                          </div>
                          <div className="flex items-center gap-1 text-[8px] text-slate-500 mt-0.5">
                            <span>Adjust <span className="font-mono">{FOUNDATION_ICONS[topFoundation] || '■'} {topFoundation}</span></span>
                            {relatedHidden.length > 0 && (
                              <span className="text-emerald-600">· {relatedHidden.length} variable{relatedHidden.length > 1 ? 's' : ''}</span>
                            )}
                            {idx === 0 && <span className="text-amber-600 font-semibold ml-auto">★ Priority</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Strategy — Choose Your Fight */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-bold text-slate-700 mb-2">⚔ Your Focus</h2>
              <p className="text-[10px] text-slate-500 mb-2">Pick one to start. Or pick several — the system suggests where to begin. <strong>You're not required to fix everything.</strong></p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {integrityCheck.entries.length > 0 ? integrityCheck.entries.map(e => {
                  const isPrimary = focusAxes[0] === e.key;
                  const isSelected = focusAxes.includes(e.key);
                  const isAuto = focusAxes.length === 0 && e.key === integrityCheck.lowest.axis;
                  return (
                    <button key={e.key} onClick={() => {
                      setFocusAxes(prev => {
                        if (prev.includes(e.key)) return prev.filter(k => k !== e.key);
                        if (prev.length === 0 && e.key === integrityCheck.lowest.axis) return [e.key];
                        return [...prev, e.key];
                      });
                    }}
                      className={`px-2 py-1 text-[9px] font-semibold rounded-lg border transition-colors ${
                        isPrimary || isAuto ? 'bg-amber-600 text-white border-amber-600' 
                        : isSelected ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {e.label} ({e.score}/9)
                      {(isPrimary || isAuto) && <span className="ml-1 text-[8px] opacity-80">★</span>}
                    </button>
                  );
                }) : (
                  <p className="text-[10px] text-emerald-600 font-medium">All scores at or above target — no fight needed ✓</p>
                )}
              </div>
              {focusAxes.length > 0 && (
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-slate-600">
                      <span className="font-bold">{focusAxes.length} selected.</span> Start with <span className="font-semibold capitalize">{AXIS_LABELS[focusAxes[0]]}</span>, then address the others.
                    </p>
                    <button onClick={() => setFocusAxes([])} className="text-[8px] text-slate-400 hover:text-slate-600 font-semibold">Clear all</button>
                  </div>
                  {focusAxes.length > 1 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      Priority: {focusAxes.map((k, i) => (
                        <span key={k} className="text-[8px] text-slate-500">{i + 1}. {AXIS_LABELS[k]}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {focusAxes.length === 0 && integrityCheck.entries.length > 0 && (
                <p className="text-[9px] text-slate-400 italic">★ <strong>{AXIS_LABELS[integrityCheck.lowest.axis]}</strong> suggested as starting point. Click to confirm or pick your own.</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-slate-700">Extraction Status</h2>
                <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full ${extractionStatus.label === 'Increase extraction' ? 'bg-blue-100 text-blue-700' : extractionStatus.label === 'Decrease extraction' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{extractionStatus.label === 'Increase extraction' ? '↑ Increase extraction' : extractionStatus.label === 'Decrease extraction' ? '↓ Decrease extraction' : 'Stay'}</span>
              </div>
              <div className="relative h-5 bg-gradient-to-r from-blue-100 via-emerald-100 to-red-100 rounded-full overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-between px-2 text-[8px] text-slate-400 font-medium"><span>Decrease</span><span>Stay</span><span>Increase</span></div>
                <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-sm rounded-full transition-all duration-200" style={{ left: `${extractionStatus.barPos}%` }} />
                <div className="absolute top-0.5 bottom-0.5 w-1.5 rounded-full bg-white border-2 shadow-sm transition-all duration-200" style={{ left: `calc(${extractionStatus.barPos}% - 3px)`, borderColor: extractionStatus.color }} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={`text-xs font-semibold ${extractionStatus.major ? 'text-red-600' : 'text-slate-600'}`}>{extractionStatus.directive}</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-bold text-slate-700 mb-2">Foundation Impact</h2>
              <div className="space-y-2">
                {foundationPlan.map(f => {
                  const impact = f.totalMatch <= 3 ? 'Misadjustment' : f.totalMatch <= 6 ? 'Tuning' : 'Rework';
                  const impactColor = f.totalMatch <= 3 ? '#22c55e' : f.totalMatch <= 6 ? '#f59e0b' : '#ef4444';
                  const impactW = Math.min(100, (f.totalMatch / 12) * 100);
                  return (
                    <div key={f.name}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-600">{FOUNDATION_ICONS[f.name] || '■'} {f.name}</span>
                          <span className="text-[10px] text-slate-400">×{f.vars.length}</span>
                        </div>
                        <span className="text-[9px] font-semibold" style={{ color: impactColor }}>{impact}</span>
                      </div>
                      <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-200" style={{ width: `${impactW}%`, backgroundColor: impactColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {foundationPlan.length === 0 && <p className="text-[10px] text-slate-400 italic">No foundations impacted.</p>}
            </div>
            {ext.diagnosis && (
              <div className="p-3 rounded-lg border" style={{ backgroundColor: ext.diagnosis.badgeColor + '12', borderColor: ext.diagnosis.badgeColor + '30' }}>
                {ext.validRatio && ext.eyMinNum > 0 && ext.eyMaxNum > 0 && (
                  <div className="text-[9px] text-slate-400 text-center mb-2">
                    EY {ext.eyMinNum}–{ext.eyMaxNum}% at 1:{ext.ratioNum} → TDS{' '}
                    <span className="font-bold text-emerald-700">{getReferenceTDS(ext.ratioNum, ext.eyMinNum).toFixed(2)}–{getReferenceTDS(ext.ratioNum, ext.eyMaxNum).toFixed(2)}%</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  {ext.direction !== 'stay' && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: ext.direction === 'increase' ? '#0ea5e9' : '#ef4444' }}>
                      {ext.direction === 'increase' ? '↑ Increase extraction' : '↓ Decrease extraction'}
                    </span>
                  )}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: ext.diagnosis.badgeColor }}>{ext.diagnosis.label}</span>
                  <span className="text-[8px] text-slate-400">from Extraction tab</span>
                </div>
                <p className="text-[9px]" style={{ color: ext.diagnosis.badgeColor }}>{ext.diagnosis.narrative}</p>
                {ext.lowScores.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className="text-[7px] font-semibold text-slate-400 uppercase">Low Scores:</span>
                    {ext.lowScores.map(k => (
                      <span key={k} className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">{AXIS_LABELS[k]} {profile[k]}</span>
                    ))}
                  </div>
                )}
                {ext.selectedSymptomData.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-[7px] font-semibold text-slate-400 uppercase">Symptoms:</span>
                    {ext.selectedSymptomData.map(s => (
                      <span key={s.name} className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${s.likelyExtraction === 'under' ? 'bg-blue-100 text-blue-700' : s.likelyExtraction === 'over' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{s.name}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {ext.tdsNum > 0 && ext.doseNum > 0 && ext.ratioNum > 0 && ext.validRatio && (
              <div className="bg-white rounded-lg border border-slate-200 p-2">
                <div className="text-[8px] font-semibold text-slate-400 uppercase text-center mb-1.5">Ratio 1:{ext.ratioNum} — EY {ext.eyMinNum}–{ext.eyMaxNum}%</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* EY → TDS reference */}
                  <div>
                    <div className="flex flex-col gap-px bg-slate-200 rounded overflow-hidden text-[8px]">
                      {(() => {
                        const rows: { ey: number; tds: number }[] = [];
                        for (let ey = ext.eyMinNum; ey <= ext.eyMaxNum; ey++) {
                          rows.push({ ey, tds: getReferenceTDS(ext.ratioNum, ey) });
                        }
                        return rows.map(r => {
                          const closeToCurrent = Math.abs(ext.tdsNum - r.tds) < 0.01;
                          return (
                            <div key={r.ey} className={`flex items-center justify-between px-2 py-1 ${closeToCurrent ? 'bg-emerald-100 font-bold text-emerald-800' : 'bg-white text-slate-600'}`}>
                              <span className="font-mono">EY {r.ey}%</span>
                              <span className="font-mono">→ TDS {r.tds.toFixed(2)}%</span>
                              {closeToCurrent && <span className="text-[7px] text-emerald-600 ml-1">← your TDS</span>}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  {/* 3×3 TDS × EY grid */}
                  <div>
                    <div className="grid grid-cols-4 gap-px bg-slate-200 text-[8px]">
                      <div className="bg-slate-50 p-1 text-center text-slate-400 font-semibold"></div>
                      <div className="bg-slate-50 p-1 text-center text-blue-600 font-semibold">Under<br /><span className="text-[7px] font-normal">&lt;{ext.eyMinNum}%</span></div>
                      <div className="bg-slate-50 p-1 text-center text-emerald-600 font-semibold">Ideal<br /><span className="text-[7px] font-normal">{ext.eyMinNum}–{ext.eyMaxNum}%</span></div>
                      <div className="bg-slate-50 p-1 text-center text-red-600 font-semibold">Over<br /><span className="text-[7px] font-normal">&gt;{ext.eyMaxNum}%</span></div>
                      {(['weak', 'balanced', 'strong'] as const).map(tdsCat => {
                        const refMin = getReferenceTDS(ext.ratioNum, ext.eyMinNum);
                        const refMax = getReferenceTDS(ext.ratioNum, ext.eyMaxNum);
                        const tdsRange = tdsCat === 'weak' ? `<${refMin.toFixed(2)}` : tdsCat === 'balanced' ? `${refMin.toFixed(2)}–${refMax.toFixed(2)}` : `>${refMax.toFixed(2)}`;
                        const tdsLabel = tdsCat === 'weak' ? 'Weak' : tdsCat === 'balanced' ? 'Balanced' : 'Strong';
                        const eyLabelMap: Record<string, string> = { under: 'Under EY', ideal: 'Ideal EY', over: 'Over EY' };
                        return (
                          <div key={tdsCat} className="contents">
                            <div className="bg-slate-50 p-1 text-center text-slate-400 font-semibold flex items-center justify-center text-[7px] leading-tight">
                              {tdsLabel}<br />{tdsRange}%
                            </div>
                            {(['under', 'ideal', 'over'] as const).map(eyCat => {
                              const isCurrentTds = (tdsCat === 'weak' && ext.tdsUnderSCA) || (tdsCat === 'balanced' && !ext.tdsUnderSCA && !ext.tdsOverSCA) || (tdsCat === 'strong' && ext.tdsOverSCA);
                              const isCurrentEy = (eyCat === 'under' && ext.eyUnder) || (eyCat === 'ideal' && !ext.eyUnder && !ext.eyOver) || (eyCat === 'over' && ext.eyOver);
                              const highlighted = isCurrentTds && isCurrentEy;
                              const colorMap: Record<string, string> = { weak: '#0ea5e9', balanced: '#22c55e', strong: '#ef4444' };
                              const action = eyCat === 'under' ? `→ ${ext.eyMinNum}%+` : eyCat === 'ideal' ? '✓' : `→ ≤${ext.eyMaxNum}%`;
                              return (
                                <div key={`${tdsCat}-${eyCat}`} className={`p-1 text-center bg-white ${highlighted ? 'font-bold' : ''}`} style={highlighted ? { backgroundColor: colorMap[tdsCat] + '20', color: colorMap[tdsCat] } : {}}>
                                  <div className="text-[6px] leading-tight">{tdsLabel} · {eyLabelMap[eyCat]}</div>
                                  <div className="text-[7px] leading-tight font-mono">TDS {tdsRange}%</div>
                                  <div className="text-[6px] leading-tight" style={{ color: eyCat === 'ideal' ? '#16a34a' : '#ef4444' }}>{action}</div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="text-[7px] text-slate-400 text-center mt-1">
                  Current: TDS {ext.tdsNum.toFixed(2)}% · EY {ext.ey.toFixed(1)}%
                  {ext.eyUnder && <span className="text-blue-500"> — below range</span>}
                  {ext.eyOver && <span className="text-red-500"> — above range</span>}
                  {!ext.eyUnder && !ext.eyOver && <span className="text-emerald-600"> — in range</span>}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'composition' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🥪</span>
              <div>
                <h2 className="text-sm font-bold text-slate-700">Composition</h2>
                <p className="text-[8px] text-slate-400">Adjust each layer by how much you feel it needs — independent of your sensory score</p>
              </div>
            </div>
            {(() => {
              const R = 5;
              const flavorFamilies: { emoji: string; name: string; axes: string[] }[] = [
                { emoji: '🌸', name: 'Herb & Flowery', axes: ['flavor', 'aftertaste'] },
                { emoji: '🍋', name: 'Citrus Fruits', axes: ['acidity'] },
                { emoji: '🥭', name: 'Tropical Fruits', axes: ['acidity', 'sweetness', 'flavor'] },
                { emoji: '🍑', name: 'Stonefruits', axes: ['acidity', 'sweetness'] },
                { emoji: '🍓', name: 'Berry-like', axes: ['acidity', 'flavor'] },
                { emoji: '🌾', name: 'Cereal & Nuts', axes: ['sweetness', 'aftertaste'] },
                { emoji: '🍫', name: 'Caramel & Chocolate', axes: ['sweetness', 'aftertaste'] },
                { emoji: '🌶️', name: 'Spices & Other', axes: ['sweetness', 'flavor', 'aftertaste'] },
                { emoji: '🥦', name: 'Vegetable', axes: ['acidity'] },
                { emoji: '🧄', name: 'Savory', axes: ['flavor'] },
                { emoji: '🌀', name: 'Others', axes: ['flavor'] },
              ];
              const layers = [
                { key: 'mouthfeel', emoji: '🥖', label: 'Body', neg: 'Light', pos: 'Heavy' },
                { key: 'acidity', emoji: '🍅', label: 'Acidity', neg: 'Flat', pos: 'Sharp' },
                { key: 'sweetness', emoji: '🧀', label: 'Sweetness', neg: 'Little', pos: 'Bitter' },
                { key: 'flavor', emoji: '🥩', label: 'Flavor', neg: 'Muted', pos: 'Intense' },
                { key: 'aftertaste', emoji: '🌿', label: 'Aftertaste', neg: 'Short', pos: 'Long' },
                { key: 'overall', emoji: '🥗', label: 'Overall', neg: 'Under', pos: 'Built ✦', oneWay: true },
              ];
              const netBalance = AXES.reduce((sum, k) => sum + (composition[k] || 0), 0);
              const balancePct = ((netBalance / (R * AXES.length)) + 1) / 2 * 100;
              return (<>
              {/* Summary section */}
              <div className="mb-3">
                <button onClick={() => setShowSummary(p => !p)} className="flex items-center gap-1 text-[8px] font-semibold text-slate-500 mb-1">
                  <span className="text-[6px]">{showSummary ? '▼' : '▶'}</span>
                  Summary
                </button>
                {showSummary && (<>
                <div className="relative h-5 rounded-full overflow-hidden bg-gradient-to-r from-blue-100 via-slate-100 to-orange-100 mb-2">
                  {/* Zone markers: | at 0 (center), | at ±1 (has/hasn't), | at ±3 (careful adjustment) */}
                  <div className="absolute top-0 bottom-0 w-px bg-slate-400/50 z-10" style={{ left: '50%' }} />
                  <div className="absolute top-0 bottom-0 w-px bg-slate-300/30 z-10" style={{ left: `${50 - 100/30}%` }} />
                  <div className="absolute top-0 bottom-0 w-px bg-slate-300/30 z-10" style={{ left: `${50 + 100/30}%` }} />
                  <div className="absolute top-0 bottom-0 w-px bg-amber-400/40 z-10" style={{ left: `${50 - 300/30}%` }} />
                  <div className="absolute top-0 bottom-0 w-px bg-amber-400/40 z-10" style={{ left: `${50 + 300/30}%` }} />
                  <div className="absolute inset-0 flex items-center justify-between px-2 text-[7px] text-slate-500 font-medium">
                    <span className={netBalance < 0 ? 'text-blue-700 font-semibold' : ''}>Missing</span>
                    <span className={netBalance === 0 ? 'text-slate-700 font-semibold' : ''}>Balanced</span>
                    <span className={netBalance > 0 ? 'text-orange-700 font-semibold' : ''}>Too much</span>
                  </div>
                  {netBalance !== 0 && (
                    <div className="absolute top-0 bottom-0 rounded-full bg-white/60 shadow-inner transition-all duration-200" style={{
                      left: netBalance < 0 ? `${balancePct}%` : '50%',
                      right: netBalance > 0 ? `${100 - balancePct}%` : '50%',
                    }} />
                  )}
                  <div className="absolute top-0.5 h-4 w-4 rounded-full bg-white border-[3px] shadow-md transition-all duration-200" style={{
                    left: `calc(${balancePct}% - 8px)`,
                    borderColor: netBalance === 0 ? '#94a3b8' : netBalance < 0 ? '#3b82f6' : '#f97316'
                  }} />
                </div>
                <div className="flex items-center justify-center gap-2 text-[6px] text-slate-300 mb-1">
                  <span className="text-slate-400">|</span>
                  <span>0</span>
                  <span className="text-slate-300">|</span>
                  <span>±1 has/hasn't</span>
                  <span className="text-amber-400">|</span>
                  <span className="text-amber-500">±3 careful</span>
                </div>
                <div className="flex justify-between items-center mb-2 mt-1">
                  <div>
                    <span className="text-[9px] text-slate-400">Composition Index of this cup: </span>
                    <span className="text-[11px] font-bold text-slate-600">{AXES.reduce((s, k) => s + Math.abs(composition[k] || 0), 0)}</span>
                    <span className="text-[7px] text-slate-300 ml-1">/30</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-slate-400">Balance Index of this cup: </span>
                    <span className={`text-[11px] font-bold ${netBalance === 0 ? 'text-slate-600' : netBalance < 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                      {netBalance > 0 ? '+' : ''}{netBalance}
                    </span>
                    <span className="text-[7px] text-slate-300 ml-1">/±30</span>
                  </div>
                </div>
                {(() => {
                  const avgScore = AXES.reduce((s, k) => s + (profile[k as keyof Profile] || 0), 0) / AXES.length;
                  return <div className={`mb-1.5 text-[7px] ${avgScore >= 7 ? 'text-emerald-600' : avgScore >= 5 ? 'text-amber-600' : 'text-red-500'}`}>
                    <span className="font-semibold">Quality: </span>
                    {avgScore >= 7 ? 'Good' : avgScore >= 5 ? 'Average' : 'Low'}
                    <span className="text-slate-300 mx-0.5">·</span>
                    Avg {avgScore.toFixed(1)}/9
                    {avgScore < 6 && <span className="text-red-400 ml-1">← composition doesn't fix low sensory scores</span>}
                  </div>;
                })()}
                <div className="mb-1.5">
                  <button onClick={() => setShowGuide(p => !p)} className="flex items-center gap-1 text-[7px] text-slate-400 hover:text-slate-600">
                    <span className={`w-3 h-3 rounded-full border border-current flex items-center justify-center text-[6px] font-bold`}>i</span>
                    CI &amp; BI Guide
                  </button>
                  {showGuide && <div className="text-[7px] text-slate-500 mt-1 space-y-0.5 bg-slate-50 rounded border border-slate-100 p-1.5">
                    <div className="font-semibold text-slate-600">Composition Index (0–30):</div>
                    <div className="flex gap-1 items-baseline"><span className="text-emerald-600 font-bold">0–5</span> <span className="text-slate-400">=</span> <span className="text-slate-600">tight, precise brew — everything close to zero</span></div>
                    <div className="flex gap-1 items-baseline"><span className="text-amber-600 font-bold">6–14</span> <span className="text-slate-400">=</span> <span className="text-slate-600">moderate — some movement but coherent</span></div>
                    <div className="flex gap-1 items-baseline"><span className="text-red-500 font-bold">15+</span> <span className="text-slate-400">=</span> <span className="text-slate-600">wide — lots of adjustment needed, likely uneven extraction</span></div>
                    <div className="font-semibold text-slate-600 mt-1">Balance Index (–30 to +30):</div>
                    <div className="flex gap-1 items-baseline"><span className="text-slate-600 font-bold">±0–7</span> <span className="text-slate-400">=</span> <span className="text-slate-600">neutral — cup is balanced directionally</span></div>
                    <div className="flex gap-1 items-baseline"><span className="text-blue-600 font-bold">±8+</span> <span className="text-slate-400">=</span> <span className="text-slate-600">leaning clearly underbuilt or overbuilt — recipe change needed</span></div>
                  </div>}
                </div>
                <div className="flex items-center gap-2 text-[6px] text-slate-300 mb-1.5 justify-center">
                  <span className="text-slate-400">|</span>
                  <span>±0</span>
                  <span className="text-slate-300">|</span>
                  <span>±1 has/hasn't</span>
                  <span className="text-amber-400">|</span>
                  <span className="text-amber-500">±3 careful</span>
                </div>
                <div className="flex flex-col gap-1.5">
                {layers.map(l => {
                  const v = composition[l.key] || 0;
                  const pct = l.oneWay ? (v / 5) * 100 : ((v + 5) / 10) * 100;
                  const activeCats = vocabCats[l.key] || {};
                  const selLabel = Object.values(activeCats)[0] || '';
                  return (
                    <div key={l.key} className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-500 w-14 shrink-0 text-right">{l.label}</span>
                      <div className="flex-1 relative h-4 rounded-full overflow-hidden bg-slate-100">
                        {/* Zone markers: 0 (center), ±1, ±3 */}
                        <div className="absolute top-0 bottom-0 w-px bg-slate-400/40 z-10" style={{ left: '50%' }} />
                        <div className="absolute top-0 bottom-0 w-px bg-slate-300/20 z-10" style={{ left: '40%' }} />
                        <div className="absolute top-0 bottom-0 w-px bg-slate-300/20 z-10" style={{ left: '60%' }} />
                        <div className="absolute top-0 bottom-0 w-px bg-amber-400/30 z-10" style={{ left: '20%' }} />
                        <div className="absolute top-0 bottom-0 w-px bg-amber-400/30 z-10" style={{ left: '80%' }} />
                        <div className={`absolute inset-y-0 rounded-full transition-all duration-200 ${v === 0 ? '' : v < 0 ? 'bg-blue-300' : 'bg-orange-300'}`}
                          style={v === 0 ? {} : { width: `${Math.abs(pct - 50)}%`, left: v < 0 ? `${pct}%` : '50%' }}
                        />
                        <div className="absolute top-0.5 h-3 w-3 rounded-full bg-white border-[3px] shadow-sm transition-all duration-200" style={{
                          left: `calc(${pct}% - 6px)`,
                          borderColor: v === 0 ? '#94a3b8' : v < 0 ? '#3b82f6' : '#f97316'
                        }} />
                      </div>
                      <span className={`text-[10px] font-bold w-5 text-center ${v === 0 ? 'text-slate-300' : v < 0 ? 'text-blue-600' : 'text-orange-600'}`}>{v > 0 ? '+' : ''}{v}</span>
                      <span className={`text-[6px] font-semibold ${v === 0 ? 'text-slate-300' : v < 0 ? 'text-blue-500' : 'text-orange-500'}`}>{v === 0 ? '—' : Math.abs(v) <= 2 ? 'slight' : Math.abs(v) <= 4 ? 'intense' : 'extreme'}</span>
                      {selLabel && <span className="text-[8px] text-slate-400 truncate max-w-16">{selLabel}</span>}
                    </div>
                  );
                })}
                </div>
                </>)}
              </div>

              {/* Save/Load */}
              <div className="mb-2">
                <button onClick={() => setShowSaveLoad(p => !p)} className="flex items-center gap-1 text-[8px] font-semibold text-slate-500 mb-1">
                  <span className="text-[6px]">{showSaveLoad ? '▼' : '▶'}</span>
                  Save / Load
                </button>
                {showSaveLoad && (<div className="bg-slate-50 rounded-lg border border-slate-100 p-2 space-y-2">
                  {/* Save form */}
                  <div className="flex items-center gap-1.5">
                    <input value={snapName} onChange={e => setSnapName(e.target.value)} placeholder="Cup name..."
                      className="flex-1 text-[8px] px-1.5 py-1 rounded border border-slate-200 bg-white outline-none focus:border-amber-300" />
                    <div className="flex gap-0.5">{[1,2,3,4,5].map(r => (
                      <button key={r} onClick={() => setSnapRating(r)}
                        className={`text-[10px] ${r <= snapRating ? 'text-amber-400' : 'text-slate-200'}`}>{r <= snapRating ? '★' : '☆'}</button>
                    ))}</div>
                    <button onClick={() => {
                      if (!snapName.trim()) return;
                      const s: CompSnapshot = {
                        name: snapName.trim(), rating: snapRating, date: new Date(),
                        composition: {...composition}, vocabCats: JSON.parse(JSON.stringify(vocabCats)),
                        notedDescriptors: {...notedDescriptors}, profile: {...profile},
                        ci: AXES.reduce((sum, k) => sum + Math.abs(composition[k] || 0), 0),
                        balance: AXES.reduce((sum, k) => sum + (composition[k] || 0), 0),
                      };
                      setCompSnapshots(prev => [s, ...prev]);
                      setSnapName(''); setSnapRating(3);
                    }}
                      className="text-[8px] font-semibold px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200"
                    >Save</button>
                  </div>
                  {/* Saved list */}
                  {compSnapshots.length > 0 && <div className="space-y-1 max-h-40 overflow-y-auto">
                    {compSnapshots.map((s, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[7px] bg-white rounded border border-slate-100 px-1.5 py-1">
                        <span className="font-semibold text-slate-600 w-16 truncate">{s.name}</span>
                        <span className="text-amber-400">{'★'.repeat(s.rating)}{'☆'.repeat(5 - s.rating)}</span>
                        <span className="text-slate-300 ml-auto">CI {s.ci}  {s.balance >= 0 ? '+' : ''}{s.balance}</span>
                        <button onClick={() => {
                          setComposition(s.composition);
                          setVocabCats(JSON.parse(JSON.stringify(s.vocabCats)));
                          setNotedDescriptors(s.notedDescriptors);
                          setProfile(s.profile);
                        }}
                          className="text-[7px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold"
                        >Load</button>
                        <button onClick={() => { if (confirm('Delete ' + s.name + '?')) setCompSnapshots(prev => prev.filter((_, j) => j !== i)); }}
                          className="text-[7px] px-1 py-0.5 rounded text-slate-400 hover:text-red-500"
                        >✕</button>
                      </div>
                    ))}
                  </div>}
                </div>)}
              </div>

              {/* Adjustment section */}
              <div className="text-[8px] font-semibold text-slate-500 mb-2 pb-1 border-b border-slate-100">Adjustment</div>
              {layers.map(layer => {
                const sensoryScore = profile[layer.key as keyof Profile];
                const adj = composition[layer.key] || 0;
                const range = R;
                const min = layer.oneWay ? 0 : -range;
                const adjPct = layer.oneWay ? (adj / range) * 100 : ((adj + range) / (range * 2)) * 100;
                const activeCats = vocabCats[layer.key] || {};
                let posCnt = 0, negCnt = 0;
                const vocab = SENSORY_VOCAB[layer.key];
                if (vocab) {
                  for (const [cn, label] of Object.entries(activeCats)) {
                    const cat = vocab.categories.find(c => c.name === cn);
                    if (cat) { const w = cat.words.find(x => x.label === label); if (w) { const p = w.polarity ?? cat.polarity; p === 'positive' ? posCnt++ : p === 'negative' ? negCnt++ : 0; } }
                  }
                }
                return (
                  <div key={layer.key} className="mb-2 pb-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-semibold text-slate-600">{layer.emoji} {AXIS_LABELS[layer.key]}<span className="font-normal text-slate-400"> : Quality</span> <span className={`font-bold`} style={{ color: scoreContext(sensoryScore).color }}>{axisPresent[layer.key] ? sensoryScore : '—'}<span className="font-normal text-slate-400">/9</span></span>{(posCnt > 0 || negCnt > 0) && <><span className="text-[8px] text-emerald-500 ml-1">✅{posCnt}</span><span className="text-[8px] text-red-400 ml-0.5">⚠️{negCnt}</span></>}</span>
                      <div className="flex items-center gap-1">
                      {SENSORY_VOCAB[layer.key] && <div className="flex rounded overflow-hidden border border-slate-200 text-[8px] font-semibold">
                        <button onClick={() => setAutoComp(p => ({ ...p, [layer.key]: true }))}
                          className={`px-1.5 py-0.5 transition-colors ${autoComp[layer.key] ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-400'}`}
                        >🔄</button>
                        <span className="w-px bg-slate-200" />
                        <button onClick={() => setAutoComp(p => ({ ...p, [layer.key]: false }))}
                          className={`px-1.5 py-0.5 transition-colors ${!autoComp[layer.key] ? 'bg-slate-200 text-slate-600' : 'bg-white text-slate-400'}`}
                        >✋</button>
                      </div>}
                      {SENSORY_VOCAB[layer.key] && <button onClick={() => setShowVocabChips(p => !p)}
                        className={`text-[6px] px-1 py-0.5 rounded font-semibold ${showVocabChips ? 'bg-slate-100 text-slate-500' : 'bg-white text-slate-300 border border-slate-200'}`}
                      >Chips</button>}
                      <button onClick={() => setAxisPresent(p => {
                          const next = { ...p, [layer.key]: !p[layer.key] };
                          setComposition(c => ({ ...c, [layer.key]: next[layer.key] ? 0 : layer.oneWay ? 0 : 3 }));
                          return next;
                        })}
                          className={`text-[7px] font-bold px-1.5 py-1 rounded transition-colors ${axisPresent[layer.key] ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}
                        >{axisPresent[layer.key] ? '👁' : '✖'}</button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-[7px] w-8 text-right shrink-0 ${!axisPresent[layer.key] ? 'text-slate-300' : layer.oneWay ? 'text-blue-600 font-semibold' : adj < 0 ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>{axisPresent[layer.key] ? (layer.oneWay ? `0 ${layer.neg}` : adj < 0 ? `${adj} ${layer.neg}` : layer.neg) : '—'}</span>
                      <div className="flex-1 relative h-6 mx-3">
                        <div className="absolute inset-0 bg-slate-100 rounded-full overflow-hidden">
                          {!layer.oneWay && <div className="absolute top-0 bottom-0 left-0 rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-200" style={{ width: adj < 0 ? `${(-adj / range) * 50}%` : '0%', opacity: adj < 0 ? 0.85 : 0 }} />}
                          {layer.oneWay ? (
                            <div className="absolute top-0 bottom-0 left-0 rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-200" style={{ width: adj > 0 ? `${(adj / range) * 100}%` : '0%', opacity: adj > 0 ? 0.85 : 0 }} />
                          ) : (
                            <div className="absolute top-0 bottom-0 right-0 rounded-full bg-gradient-to-l from-orange-400 to-orange-500 transition-all duration-200" style={{ width: adj > 0 ? `${(adj / range) * 50}%` : '0%', opacity: adj > 0 ? 0.85 : 0 }} />
                          )}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-[10px] font-bold drop-shadow-sm" style={{ color: !axisPresent[layer.key] ? '#cbd5e1' : layer.oneWay ? (adj <= 2 ? '#1e40af' : '#c2410c') : adj === 0 ? '#64748b' : adj < 0 ? '#1e40af' : '#c2410c' }}>{axisPresent[layer.key] ? (adj > 0 ? '+' : '') + adj : '—'}</span>
                        </div>
                        <div className="absolute top-0.5 h-5 w-5 rounded-full bg-white border-[3px] shadow-md transition-all duration-200 z-10 pointer-events-none" style={{
                          left: `calc(${adjPct}% - 10px)`,
                          borderColor: !axisPresent[layer.key] ? '#cbd5e1' : layer.oneWay ? (adj <= 2 ? '#3b82f6' : '#f97316') : adj === 0 ? '#94a3b8' : adj < 0 ? '#3b82f6' : '#f97316'
                        }} />
                        <input type="range" min={min} max={range} step={1} value={adj} onChange={e => { setComposition(p => ({ ...p, [layer.key]: parseInt(e.target.value) })); if (SENSORY_VOCAB[layer.key] && autoComp[layer.key]) { setVocabCats(p => { const n = { ...p }; delete n[layer.key]; return n; }); setNotedDescriptors(p => ({ ...p, [layer.key]: null })); } }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                        />
                      </div>
                      <span className={`text-[7px] w-8 shrink-0 ${!axisPresent[layer.key] ? 'text-slate-300' : adj > 0 ? 'text-orange-600 font-semibold' : 'text-slate-400'}`}>{axisPresent[layer.key] ? (adj > 0 ? `+${adj} ${layer.pos}` : layer.pos) : '—'}</span>
                    </div>
                    {adj !== 0 && (
                      <div className="mt-0.5">
                        <div className={`text-[7px] italic text-center ${!axisPresent[layer.key] ? 'text-slate-400' : posCnt > negCnt ? 'text-emerald-600' : negCnt > posCnt ? 'text-red-500' : 'text-slate-400'}`}>{axisPresent[layer.key] ? (layer.oneWay ? (adj <= 2 ? 'Needs more structure — feels underbuilt' : posCnt > negCnt ? `✅ ${vocab?.posLabel || 'Positive'} dominates — ${vocab?.posVerdict || 'this works'} (sensory: ${sensoryScore}/9)` : negCnt > posCnt ? `⚠️ ${vocab?.negLabel || 'Negative'} dominates — ${vocab?.negVerdict || 'dial it back'} (sensory: ${sensoryScore}/9)` : 'Overbuilt — the composition is too heavy (sensory: ' + sensoryScore + '/9)') : posCnt > negCnt ? `✅ ${vocab?.posLabel || 'Positive'} dominates — ${vocab?.posVerdict || 'this works'} (sensory: ${sensoryScore}/9)` : negCnt > posCnt ? `⚠️ ${vocab?.negLabel || 'Negative'} dominates — ${vocab?.negVerdict || 'dial it back'} (sensory: ${sensoryScore}/9)` : `Feels structurally ${adj > 0 ? 'overbuilt — dial it back' : 'underbuilt — give it more'} (sensory: ${sensoryScore}/9)`) : 'Not perceived — structurally missing from the cup'}</div>
                        {axisPresent[layer.key] && adj !== 0 && (() => {
                          const guides: Record<string, { over: string[]; under: string[] }> = {
                            mouthfeel: { over: ['Switch to paper filter (absorbs oils)', 'Lower water hardness (softer water)', 'Coarsen grind'], under: ['Switch to metal/cloth filter', 'Increase water hardness (add minerals)', 'Finer grind for more body'] },
                            acidity: { over: ['Raise water temp (fully extracts acids)', 'Finer grind (more surface area)', 'Darker roast (breaks down acids)'], under: ['Lower water temp (preserves brightness)', 'Coarser grind', 'Lighter roast (retains acidity)'] },
                            sweetness: { over: ['Lower water temp (reduces Maillard)', 'Coarser grind (less extraction of bitter compounds)', 'Shorten contact time'], under: ['Raise water temp', 'Finer grind for more extraction', 'Check water chemistry (add Ca/Mg for sweetness)', 'Longer contact time'] },
                            flavor: { over: ['Reduce dose slightly', 'Coarser grind', 'Lower water temp', 'Less agitation (gentler pour)'], under: ['Increase dose', 'Finer grind', 'Higher water temp', 'More agitation (stir/bloom)'] },
                            aftertaste: { over: [], under: ['Raise water temp for longer finish', 'Finer grind extends aftertaste', 'Longer drawdown time', 'Use paper filter (cleaner finish)'] },
                            overall: { over: ['Dial back every variable — grind coarser, lower temp, shorter contact'], under: ['Push one variable at a time — start with grind, then temp, then ratio'] },
                          };
                          const g = guides[layer.key];
                          if (!g) return null;
                          const tips = adj > 0 ? g.over : g.under;
                          if (tips.length === 0) return null;
                          return (
                            <div className="text-[7px] text-slate-400 text-center mt-0.5 space-y-0.5">
                              {tips.map((t, i) => <div key={i} className="text-[6px]">→ {t}</div>)}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {axisPresent[layer.key] && (
                      <div className="flex flex-wrap gap-1 justify-center mt-1">
                        {SENSORY_VOCAB[layer.key] ? (<>
                          {SENSORY_VOCAB[layer.key].categories.map((cat, catIdx) => (
                            <div key={cat.name} className={`flex flex-wrap gap-0.5 items-baseline w-full ${catIdx === 0 ? 'bg-amber-50/50 rounded p-1 mb-0.5 border border-amber-200/30' : ''}`}
                              style={{ display: catIdx === 0 || showVocabChips ? '' : 'none' }}
                            >
                              <span className={`text-[6px] font-semibold uppercase tracking-wider ${POLARITY_COLORS[cat.polarity] || 'text-slate-400'}`}>{catIdx === 0 && '⚙️ '}{cat.name}{cat.acidType && vocabCats[layer.key]?.[cat.name] && <span className="ml-1 text-[5px] text-slate-400 font-normal">({cat.acidType})</span>}</span>
                              <div className="flex flex-wrap gap-1">
                                {cat.words.map(w => {
                                  const catSel = vocabCats[layer.key] || {};
                                  const isActive = catSel[cat.name] === w.label;
                                  return (
                                    <button key={w.label} onClick={() => {
                                      setVocabCats(prev => {
                                        const axisCats = { ...(prev[layer.key] || {}) };
                                        if (axisCats[cat.name] === w.label) {
                                          delete axisCats[cat.name];
                                        } else {
                                          axisCats[cat.name] = w.label;
                                        }
                                        const next = { ...prev, [layer.key]: axisCats };
                                        if (Object.keys(axisCats).length === 0) {
                                          setNotedDescriptors(p => ({ ...p, [layer.key]: null }));
                                        } else {
                                          setNotedDescriptors(p => ({ ...p, [layer.key]: w.label }));
                                        }
                                        const vocab = SENSORY_VOCAB[layer.key];
                                        if (vocab && autoComp[layer.key]) {
                                          const entries = Object.entries(axisCats);
                                          if (entries.length === 0) {
                                            setComposition(p => ({ ...p, [layer.key]: 0 }));
                                          } else {
                                            let sum = 0;
                                            for (const [, label] of entries) {
                                              for (const c of vocab.categories) {
                                                const found = c.words.find(w2 => w2.label === label);
                                                if (found) { sum += found.weight; break; }
                                              }
                                            }
                                            setComposition(p => ({ ...p, [layer.key]: Math.round(sum / entries.length) }));
                                          }
                                        }
                                        return next;
                                      });
                                    }}
                                      className={`text-[7px] px-1.5 py-0.5 rounded-full border transition-colors ${isActive ? 'bg-amber-50 border-amber-300 text-amber-700 font-semibold' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                                    >{w.emoji} {w.label} <span className="text-[6px] opacity-60">{w.weight > 0 ? '+' : ''}{w.weight}</span></button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          {(posCnt + negCnt > 0) && (() => {
                            const pl = vocab?.posLabel || 'Pos';
                            const nl = vocab?.negLabel || 'Neg';
                            return (
                            <div className="w-full mt-0.5 px-2 space-y-0.5">
                              <div className="flex items-center gap-1">
                                {negCnt > 0 && <span className="text-[6px] text-red-400 font-semibold shrink-0">⚠️ {nl} {negCnt}</span>}
                                {posCnt > 0 && <span className="text-[6px] text-emerald-500 font-semibold shrink-0">✅ {pl} {posCnt}</span>}
                                {posCnt > 0 && negCnt > 0 && <span className="text-[5px] text-slate-300 ml-auto">{posCnt > negCnt ? pl + ' wins' : nl + ' wins'}</span>}
                              </div>
                              <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100">
                                {negCnt > 0 && <div className="h-full bg-gradient-to-r from-red-300 to-red-400" style={{ width: (negCnt / (posCnt + negCnt)) * 100 + '%' }} />}
                                {posCnt > 0 && <div className="h-full bg-gradient-to-r from-emerald-300 to-emerald-400" style={{ width: (posCnt / (posCnt + negCnt)) * 100 + '%' }} />}
                              </div>
                              <div className="text-[6px] text-slate-400 font-medium">{posCnt >= negCnt ? '✓ ' + pl + ' — ' + (vocab?.posVerdict || 'good') : '✗ ' + nl + ' — ' + (vocab?.negVerdict || 'adjust')}</div>
                            </div>
                            );
                          })()}
                        </>) : (
                          flavorFamilies.filter(f => f.axes.includes(layer.key)).map(f => {
                            const active = (flavorNotes[layer.key] || []).includes(f.name);
                            return (
                              <button key={f.name} onClick={() => setFlavorNotes(p => {
                                const curr = p[layer.key] || [];
                                const next = curr.includes(f.name) ? curr.filter(x => x !== f.name) : [...curr, f.name];
                                return { ...p, [layer.key]: next };
                              })}
                                className={`text-[7px] px-1.5 py-0.5 rounded-full border transition-colors ${active ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                              >{f.emoji} {f.name}</button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              </>);
            })()}
          </div>
        )}

        {tab === 'extraction' && (() => {
          const {
            tdsNum, doseNum, eyTarget, eyMinNum, eyMaxNum, waterIn, waterOut, ey,
            validRatio, scaLo, scaHi, tdsInSCA, tdsUnderSCA, tdsOverSCA,
            eyUnder, eyOver, lowScores, beforeAfterNote,
            useScaForTds, selectedSymptomData, diagnosis, direction,
          } = ext;
          const yieldOutNum = parseFloat(yieldOut) || 0;
          const scaRange = validRatio ? { tdsMin: scaLo, tdsMax: scaHi } : null;

          let foundationTip = '';
          let foundationColor = '#94a3b8';
          if (tdsNum > 0 && doseNum > 0 && validRatio) {
            if (eyUnder && tdsUnderSCA) { foundationTip = 'Grind finer — increase surface area to raise both TDS and EY'; foundationColor = '#ef4444'; }
            else if (eyUnder && tdsOverSCA) { foundationTip = 'Widen ratio (more water) — TDS is high because water volume is low relative to dose'; foundationColor = '#f59e0b'; }
            else if (eyUnder) { foundationTip = 'Increase extraction — grind finer, longer contact, or higher temp'; foundationColor = '#f59e0b'; }
            else if (eyOver && tdsUnderSCA) { foundationTip = 'Tighten ratio (less water) — EY is inflated by dilution'; foundationColor = '#f59e0b'; }
            else if (eyOver && tdsOverSCA) { foundationTip = 'Grind coarser or reduce contact time — both EY and TDS are high'; foundationColor = '#ef4444'; }
            else if (tdsUnderSCA) { foundationTip = 'Tighten ratio or increase dose — TDS is below SCA zone for this ratio'; foundationColor = '#f59e0b'; }
            else if (tdsOverSCA) { foundationTip = 'Widen ratio — TDS is above SCA zone for this ratio'; foundationColor = '#f59e0b'; }
            else { foundationTip = 'On target — fine-tune by taste'; foundationColor = '#22c55e'; }
          }

          return (
            <div className="space-y-3">
              {/* TDSHUD slider — always visible */}
              <TDSHUD
                tdsMin={scaLo || 1.15}
                tdsMax={scaHi || 1.55}
                currentTDS={tdsNum || 1.35}
                eyTarget={ey || eyTarget}
                onTDSChange={(v) => setTds(String(v))}
                scaTdsMin={scaLo || undefined}
                scaTdsMax={scaHi || undefined}
              />
              {/* Compact input row */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-700">📐 Extraction Theory</h2>
                </div>
                <div className="flex items-end gap-1.5 mb-3">
                  <div className="flex-1">
                    <label className="text-[8px] font-semibold text-slate-500 block mb-0.5">Dose (g)</label>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => { const v = parseFloat(extractionDose) || 0; if (v > 0) setExtractionDose(Math.max(0, v - 0.5).toFixed(1)); }} className="w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600">−</button>
                      <input type="text" inputMode="decimal" value={extractionDose} onChange={e => setExtractionDose(e.target.value)} placeholder="18" className="w-full text-[10px] border border-slate-200 rounded px-1 py-1.5 text-slate-700 bg-white font-mono text-center" />
                      <button onClick={() => { const v = parseFloat(extractionDose) || 0; setExtractionDose((v + 0.5).toFixed(1)); }} className="w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600">+</button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-[8px] font-semibold text-slate-500 block mb-0.5">Ratio</label>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => { const v = ratioNum || 0; if (v > 5) setExtractionRatio(`1:${Math.max(5, v - 0.5)}`); }} className="w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600">−</button>
                      <span className="text-[10px] text-slate-400 font-mono">1:</span>
                      <input ref={ratioInputRef} type="text" inputMode="decimal" key={extractionRatio}
                        defaultValue={extractionRatio.split(':')[1] || ''}
                        onFocus={(e) => { ratioDraft.current = e.target.value; }}
                        onChange={(e) => { ratioDraft.current = e.target.value; }}
                        onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 5) { setExtractionRatio(`1:${Math.min(30, v)}`); } else { e.target.value = extractionRatio.split(':')[1] || ''; } } }
                        placeholder="16"
                        className="w-full text-[10px] border border-sky-300 rounded px-1 py-1.5 text-sky-800 bg-white font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-sky-400" />
                      <button onClick={() => { const v = ratioNum || 0; setExtractionRatio(`1:${Math.min(30, v + 0.5)}`); }} className="w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600">+</button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-[8px] font-semibold text-slate-500 block mb-0.5">TDS (%)</label>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => { const v = parseFloat(tds) || 0; if (v > 0) setTds(Math.max(0, v - 0.05).toFixed(2)); }} className="w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600">−</button>
                      <input type="text" inputMode="decimal" value={tds} onChange={e => setTds(e.target.value)} placeholder="1.35" className="w-full text-[10px] border border-slate-200 rounded px-1 py-1.5 text-slate-700 bg-white font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
                      <button onClick={() => { const v = parseFloat(tds) || 0; setTds((v + 0.05).toFixed(2)); }} className="w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600">+</button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-[8px] font-semibold text-slate-500 block mb-0.5">EY Range (%)</label>
                    <div className="flex items-center gap-0.5">
                      <input type="text" inputMode="decimal" value={eyMin} onChange={e => setEyMin(e.target.value)} placeholder="18" className="w-full text-[10px] border border-amber-300 rounded px-1 py-1.5 text-amber-800 bg-white font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
                      <span className="text-[8px] text-slate-400 shrink-0">–</span>
                      <input type="text" inputMode="decimal" value={eyMax} onChange={e => setEyMax(e.target.value)} placeholder="22" className="w-full text-[10px] border border-amber-300 rounded px-1 py-1.5 text-amber-800 bg-white font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                  </div>
                  {doseNum > 0 && ratioNum > 0 && (
                    <div className="text-[8px] text-slate-400 text-center pb-0.5 shrink-0">
                      <span className="block">Water In</span>
                      <span className="font-mono font-bold text-slate-600">{waterIn.toFixed(0)}g</span>
                      <span className="block mt-0.5 text-slate-300">Out</span>
                      <div className="relative">
                        <input type="text" inputMode="decimal" value={yieldOut} onChange={e => setYieldOut(e.target.value)} placeholder={`≈${waterOut.toFixed(0)}`}
                          className="w-full text-[10px] border border-dashed border-slate-200 rounded px-1 py-0.5 text-emerald-600 bg-white font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                        {yieldOutNum > 0 && (
                          <button onClick={() => setYieldOut('')} className="absolute -top-1 -right-1 w-3 h-3 flex items-center justify-center rounded-full text-[7px] bg-slate-200 text-slate-500 hover:bg-red-200 hover:text-red-600" title="Clear">✕</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Integrated diagnosis card */}
                {tdsNum > 0 && doseNum > 0 && ratioNum > 0 && diagnosis && (
                  <div className="p-3 rounded-lg border" style={{ backgroundColor: diagnosis.badgeColor + '12', borderColor: diagnosis.badgeColor + '30' }}>
                    {validRatio && eyMinNum > 0 && eyMaxNum > 0 && (
                      <div className="text-[9px] text-slate-400 text-center mb-2">
                        EY {eyMinNum}–{eyMaxNum}% at 1:{ratioNum} → TDS{' '}
                        <span className="font-bold text-emerald-700">{getReferenceTDS(ratioNum, eyMinNum).toFixed(2)}–{getReferenceTDS(ratioNum, eyMaxNum).toFixed(2)}%</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      {direction !== 'stay' && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: direction === 'increase' ? '#0ea5e9' : '#ef4444' }}>
                          {direction === 'increase' ? '↑ Increase extraction' : '↓ Decrease extraction'}
                        </span>
                      )}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: diagnosis.badgeColor }}>{diagnosis.label}</span>
                      {useScaForTds ? (
                        <span className="text-[8px] text-slate-400">SCA zone reference</span>
                      ) : (
                        <span className="text-[8px] text-slate-400">Calculated reference ({ratioNum < 14 ? 'tight' : 'wide'} ratio)</span>
                      )}
                    </div>
                    <p className="text-[9px]" style={{ color: diagnosis.badgeColor }}>{diagnosis.narrative}</p>
                    {lowScores.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <span className="text-[7px] font-semibold text-slate-400 uppercase">Low Scores:</span>
                        {lowScores.map(k => (
                          <span key={k} className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">{AXIS_LABELS[k]} {profile[k]}</span>
                        ))}
                      </div>
                    )}
                    {selectedSymptoms.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="text-[7px] font-semibold text-slate-400 uppercase">Symptoms:</span>
                        {selectedSymptomData.map(s => (
                          <span key={s.name} className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${s.likelyExtraction === 'under' ? 'bg-blue-100 text-blue-700' : s.likelyExtraction === 'over' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{s.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* EY → TDS reference + 3×3 grid */}
                {tdsNum > 0 && doseNum > 0 && ratioNum > 0 && validRatio && (
                  <div className="bg-white rounded-lg border border-slate-200 p-2">
                    <div className="text-[8px] font-semibold text-slate-400 uppercase text-center mb-1.5">Ratio 1:{ratioNum} — EY {eyMinNum}–{eyMaxNum}%</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* EY → TDS reference */}
                      <div>
                        <div className="flex flex-col gap-px bg-slate-200 rounded overflow-hidden text-[8px]">
                          {(() => {
                            const rows: { ey: number; tds: number }[] = [];
                            for (let ey = eyMinNum; ey <= eyMaxNum; ey++) {
                              rows.push({ ey, tds: getReferenceTDS(ratioNum, ey) });
                            }
                            return rows.map(r => {
                              const closeToCurrent = Math.abs(tdsNum - r.tds) < 0.01;
                              return (
                                <div key={r.ey} className={`flex items-center justify-between px-2 py-1 ${closeToCurrent ? 'bg-emerald-100 font-bold text-emerald-800' : 'bg-white text-slate-600'}`}>
                                  <span className="font-mono">EY {r.ey}%</span>
                                  <span className="font-mono">→ TDS {r.tds.toFixed(2)}%</span>
                                  {closeToCurrent && <span className="text-[7px] text-emerald-600 ml-1">← your TDS</span>}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                      {/* 3×3 TDS × EY grid */}
                      <div>
                        <div className="grid grid-cols-4 gap-px bg-slate-200 text-[8px]">
                          <div className="bg-slate-50 p-1 text-center text-slate-400 font-semibold"></div>
                          <div className="bg-slate-50 p-1 text-center text-blue-600 font-semibold">Under<br /><span className="text-[7px] font-normal">&lt;{eyMinNum}%</span></div>
                          <div className="bg-slate-50 p-1 text-center text-emerald-600 font-semibold">Ideal<br /><span className="text-[7px] font-normal">{eyMinNum}–{eyMaxNum}%</span></div>
                          <div className="bg-slate-50 p-1 text-center text-red-600 font-semibold">Over<br /><span className="text-[7px] font-normal">&gt;{eyMaxNum}%</span></div>
                          {(['weak', 'balanced', 'strong'] as const).map(tdsCat => {
                            const refMin = getReferenceTDS(ratioNum, eyMinNum);
                            const refMax = getReferenceTDS(ratioNum, eyMaxNum);
                            const tdsRange = tdsCat === 'weak' ? `<${refMin.toFixed(2)}` : tdsCat === 'balanced' ? `${refMin.toFixed(2)}–${refMax.toFixed(2)}` : `>${refMax.toFixed(2)}`;
                            const tdsLabel = tdsCat === 'weak' ? 'Weak' : tdsCat === 'balanced' ? 'Balanced' : 'Strong';
                            const eyLabelMap: Record<string, string> = { under: 'Under EY', ideal: 'Ideal EY', over: 'Over EY' };
                            return (
                              <div key={tdsCat} className="contents">
                                <div className="bg-slate-50 p-1 text-center text-slate-400 font-semibold flex items-center justify-center text-[7px] leading-tight">
                                  {tdsLabel}<br />{tdsRange}%
                                </div>
                                {(['under', 'ideal', 'over'] as const).map(eyCat => {
                                  const isCurrentTds = (tdsCat === 'weak' && tdsUnderSCA) || (tdsCat === 'balanced' && !tdsUnderSCA && !tdsOverSCA) || (tdsCat === 'strong' && tdsOverSCA);
                                  const isCurrentEy = (eyCat === 'under' && eyUnder) || (eyCat === 'ideal' && !eyUnder && !eyOver) || (eyCat === 'over' && eyOver);
                                  const highlighted = isCurrentTds && isCurrentEy;
                                  const colorMap: Record<string, string> = { weak: '#0ea5e9', balanced: '#22c55e', strong: '#ef4444' };
                                  const action = eyCat === 'under' ? `→ ${eyMinNum}%+` : eyCat === 'ideal' ? '✓' : `→ ≤${eyMaxNum}%`;
                                  return (
                                    <div key={`${tdsCat}-${eyCat}`} className={`p-1 text-center bg-white ${highlighted ? 'font-bold' : ''}`} style={highlighted ? { backgroundColor: colorMap[tdsCat] + '20', color: colorMap[tdsCat] } : {}}>
                                      <div className="text-[6px] leading-tight">{tdsLabel} · {eyLabelMap[eyCat]}</div>
                                      <div className="text-[7px] leading-tight font-mono">TDS {tdsRange}%</div>
                                      <div className="text-[6px] leading-tight" style={{ color: eyCat === 'ideal' ? '#16a34a' : '#ef4444' }}>{action}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="text-[7px] text-slate-400 text-center mt-1">
                      Current: TDS {tdsNum.toFixed(2)}% · EY {ey.toFixed(1)}%
                      {eyUnder && <span className="text-blue-500"> — below range</span>}
                      {eyOver && <span className="text-red-500"> — above range</span>}
                      {!eyUnder && !eyOver && <span className="text-emerald-600"> — in range</span>}
                    </div>
                  </div>
                )}

                {/* Results — compact dual status */}
                {tdsNum > 0 && doseNum > 0 && ratioNum > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`p-2.5 rounded-lg border ${!eyUnder && !eyOver ? 'bg-emerald-50 border-emerald-200' : eyUnder ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[8px] font-semibold text-slate-500 uppercase">EY</span>
                            <span className="text-xs font-bold font-mono" style={{ color: !eyUnder && !eyOver ? '#16a34a' : eyUnder ? '#0284c7' : '#dc2626' }}>
                              {ey.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (ey / 30) * 100)}%`, backgroundColor: !eyUnder && !eyOver ? '#22c55e' : eyUnder ? '#0ea5e9' : '#ef4444' }} />
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[8px] text-slate-400">Range {eyMinNum}–{eyMaxNum}%</span>
                            <span className={`text-[8px] font-semibold ${!eyUnder && !eyOver ? 'text-emerald-600' : eyUnder ? 'text-blue-600' : 'text-red-600'}`}>
                              {!eyUnder && !eyOver ? '✓ In range' : eyUnder ? `↓ ${(eyMinNum - ey).toFixed(1)}% low` : `↑ ${(ey - eyMaxNum).toFixed(1)}% high`}
                            </span>
                          </div>
                        </div>
                        <div className={`p-2.5 rounded-lg border ${tdsInSCA ? 'bg-emerald-50 border-emerald-200' : tdsUnderSCA ? 'bg-blue-50 border-blue-200' : tdsOverSCA ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[8px] font-semibold text-slate-500 uppercase">TDS</span>
                            <span className="text-xs font-bold font-mono" style={{ color: tdsInSCA ? '#16a34a' : tdsUnderSCA ? '#0284c7' : tdsOverSCA ? '#dc2626' : '#94a3b8' }}>
                              {tdsNum.toFixed(2)}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (tdsNum / 2) * 100)}%`, backgroundColor: tdsInSCA ? '#22c55e' : tdsUnderSCA ? '#0ea5e9' : tdsOverSCA ? '#ef4444' : '#94a3b8' }} />
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[8px] text-slate-400">SCA {scaRange && `${scaLo.toFixed(2)}–${scaHi.toFixed(2)}%`}</span>
                            <span className={`text-[8px] font-semibold ${tdsInSCA ? 'text-emerald-600' : tdsUnderSCA ? 'text-blue-600' : tdsOverSCA ? 'text-red-600' : 'text-slate-400'}`}>
                              {tdsInSCA ? '✓ In zone' : tdsUnderSCA ? `↓ ${(scaLo - tdsNum).toFixed(2)}` : tdsOverSCA ? `↑ ${(tdsNum - scaHi).toFixed(2)}` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Summary line */}
                      <div className="flex items-center justify-center gap-3 text-[8px] text-slate-400 font-mono bg-slate-50 rounded-lg px-2.5 py-2">
                        <span>{doseNum.toFixed(1)}g × 1:{ratioNum} = {waterIn.toFixed(0)}g water in → ~{waterOut.toFixed(0)}g out</span>
                        <span className="text-slate-300">|</span>
                        <span>TDS {tdsNum.toFixed(2)}% × {waterOut.toFixed(0)}g ÷ {doseNum.toFixed(1)}g = EY {ey.toFixed(1)}%</span>
                      </div>

                      {/* Foundation advice */}
                      <div className="p-2.5 rounded-lg border flex items-center gap-2" style={{ backgroundColor: foundationColor + '15', borderColor: foundationColor + '40' }}>
                        <span className="text-[8px] font-semibold uppercase tracking-wider shrink-0" style={{ color: foundationColor }}>Adjust</span>
                        <span className="text-[10px]" style={{ color: foundationColor }}>{foundationTip} → see <strong>Foundations</strong> tab</span>
                      </div>

                      {/* Before/after context */}
                      {beforeAfterNote && (
                        <div className="p-2.5 rounded-lg border border-purple-200 bg-purple-50">
                          <div className="flex items-start gap-1.5">
                            <span className="text-[9px] mt-0.5">🔁</span>
                            <div>
                              <span className="text-[8px] font-bold text-purple-700 uppercase">Before vs After</span>
                              <p className="text-[8px] text-purple-600 mt-0.5">{beforeAfterNote}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 italic text-center">Enter dose, ratio, and TDS above to check extraction status.</p>
                  )}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-[9px] text-amber-800 font-semibold">↓ Goes into <strong>Foundations</strong></p>
                <p className="text-[8px] text-amber-700 mt-0.5">Extraction Theory tells you <em>how much</em> to extract. Foundations (grind, ratio, temp, agitation) is where you make the change.</p>
              </div>
            </div>
          );
        })()}

        {tab === 'timing' && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-bold text-slate-700 mb-3">⏱ Timing & Decision</h2>
              <p className="text-[10px] text-slate-500 mb-3">Time is the variable that determines <strong>which hidden physics</strong> occur. Each phase controls different extraction mechanisms.</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {[
                  { key: 'bloom', label: 'Bloom', desc: 'CO₂ release, first wetting — determines even extraction start', val: bloomTime, set: setBloomTime, placeholder: '0:30' },
                  { key: 'main', label: 'Main Pour', desc: 'Bulk extraction — controls turbulence & contact', val: mainPourTime, set: setMainPourTime, placeholder: '1:00' },
                  { key: 'drawdown', label: 'Drawdown', desc: 'Fines migration, bed settling — determines clarity', val: drawdownTime, set: setDrawdownTime, placeholder: '1:00' },
                  { key: 'delivery', label: 'Delivery', desc: 'Pre-wet to first drip — affects bypass', val: deliveryTime, set: setDeliveryTime, placeholder: '0:10' },
                ].map(phase => (
                  <div key={phase.key} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <label className="text-[8px] font-semibold text-slate-500 block">{phase.label}</label>
                    <input type="text" value={phase.val} onChange={e => phase.set(e.target.value)} placeholder={phase.placeholder} className="w-full text-[10px] border border-slate-200 rounded px-1.5 py-1 text-slate-700 bg-white mt-0.5 font-mono" />
                    <p className="text-[7px] text-slate-400 mt-0.5">{phase.desc}</p>
                  </div>
                ))}
              </div>
              {(() => {
                const toSec = (v: string) => /^\d{1,2}:\d{2}$/.test(v) ? (([m, s]) => m * 60 + s)(v.split(':').map(Number)) : null;
                const bloom = toSec(bloomTime);
                const main = toSec(mainPourTime);
                const drawdown = toSec(drawdownTime);
                const total = (bloom ?? 0) + (main ?? 0) + (drawdown ?? 0);
                if (bloom !== null && main !== null && drawdown !== null) {
                  return (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-semibold text-slate-600">Total Contact Time:</span>
                        <span className="text-sm font-bold text-slate-700 font-mono">{Math.floor(total / 60)}:{String(total % 60).padStart(2, '0')}</span>
                        <span className="text-[8px] text-slate-400">({bloom}s bloom + {main}s main + {drawdown}s drawdown)</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg mb-3">
                    <p className="text-[9px] text-slate-400 italic">Enter bloom, main pour, and drawdown times (m:ss) to see total contact time.</p>
                  </div>
                );
              })()}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-[8px] font-semibold text-slate-500 mb-1">Plan vs Actual (from Equipment tab)</p>
                <div className="flex items-center gap-2 text-[9px] text-slate-600">
                  <span>Plan: {equipment.planTime || '—'}</span>
                  <span>Actual: {equipment.timeFinished || '—'}</span>
                  {timeStatus && <span className="text-[8px] font-semibold px-1 py-0.5 rounded" style={{ color: timeDelta! <= -20 ? '#3b82f6' : timeDelta! <= -5 ? '#22c55e' : timeDelta! <= 15 ? '#22c55e' : timeDelta! <= 40 ? '#f59e0b' : '#ef4444', backgroundColor: (timeDelta! <= -20 ? '#3b82f6' : timeDelta! <= -5 ? '#22c55e' : timeDelta! <= 15 ? '#22c55e' : timeDelta! <= 40 ? '#f59e0b' : '#ef4444') + '15' }}>{timeStatus}</span>}
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h3 className="text-[11px] font-bold text-slate-700 mb-2">What Each Phase Controls</h3>
              <div className="space-y-2">
                <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-[8px] font-bold text-blue-700">Bloom</span>
                  <p className="text-[7px] text-blue-600 mt-0.5">Short bloom (&lt;20s) → Channeling risk, uneven extraction. Long bloom (&gt;60s) → Temperature drop, stalled degassing.</p>
                </div>
                <div className="p-2 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-[8px] font-bold text-green-700">Main Pour</span>
                  <p className="text-[7px] text-green-600 mt-0.5">Pour speed & height determine turbulence. Aggressive → agitation extraction + fines migration. Gentle → lower extraction, clearer bed.</p>
                </div>
                <div className="p-2 bg-purple-50 border border-purple-200 rounded-lg">
                  <span className="text-[8px] font-bold text-purple-700">Drawdown</span>
                  <p className="text-[7px] text-purple-600 mt-0.5">Fast (&lt;60s) → Bypass, weak body. Slow (&gt;120s) → Fines clogging, over-extraction, astringency. Stalled → Total clog, stalled extraction.</p>
                </div>
                <div className="p-2 bg-orange-50 border border-orange-200 rounded-lg">
                  <span className="text-[8px] font-bold text-orange-700">Delivery Time</span>
                  <p className="text-[7px] text-orange-600 mt-0.5">Fast first drip (&lt;5s) → Channeling/bed gap. Slow (&gt;15s) → Paper resistance, grind too fine.</p>
                </div>
              </div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <p className="text-[9px] text-indigo-800 font-semibold">↓ Goes into <strong>Hidden Physics</strong></p>
              <p className="text-[8px] text-indigo-700 mt-0.5">Your timing decisions determine which hidden physics (channeling, clogging, bypass, etc.) occur during the brew.</p>
            </div>
          </>
        )}

        {tab === 'internal' && (
          <>
            {resistanceProfile && equipment.dripper && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2">
                <span className="text-[7px] font-semibold text-indigo-600 block">Equipment Context</span>
                <p className="text-[7px] text-indigo-500 mt-0.5">{resistanceProfile.feedback}</p>
                {timeStatus && timeStatus !== 'On Track' && (
                  <p className="text-[7px] text-amber-600 mt-0.5">Brew time {timeStatus.toLowerCase()} — your {resistanceProfile.rating.toLowerCase()} setup may be amplifying this.</p>
                )}
              </div>
            )}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-bold text-slate-700 mb-2">The Four Foundations</h2>
              <p className="text-[10px] text-slate-500 mb-3">Internal factors you control directly. Each foundation has a primary adjustment direction based on your score profile.</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[ 
                  { icon: '⚙', name: 'Grind', desc: 'Particle size & distribution', dir: extractionStatus.label === 'Increase extraction' ? 'Finer' : extractionStatus.label === 'Decrease extraction' ? 'Coarser' : 'Check uniformity' },
                  { icon: '🌡', name: 'Temp / Time', desc: 'Water temp & contact duration', dir: extractionStatus.label === 'Increase extraction' ? '↑ Temp or ↑ Time' : extractionStatus.label === 'Decrease extraction' ? '↓ Temp or ↓ Time' : 'Verify stability' },
                  { icon: '🌊', name: 'Turbulence', desc: 'Pour flow, height & bed agitation', dir: 'Adjust pour + WDT' },
                  { icon: '⚖', name: 'Ratio', desc: 'Coffee dose to water ratio', dir: profile.mouthfeel <= 4 ? '↑ Dose for body' : 'Check filter media' },
                ].map(f => (
                  <div key={f.name} className="p-2 bg-slate-50 border border-slate-100 rounded-lg">
                    <div className="text-xs font-bold text-slate-700">{f.icon} {f.name}</div>
                    <div className="text-[8px] text-slate-400">{f.desc}</div>
                    <div className="text-[8px] text-amber-600 font-semibold mt-0.5">{f.dir}</div>
                  </div>
                ))}
              </div>
              <details className="text-[10px] text-slate-500">
                <summary className="cursor-pointer text-slate-600 font-semibold text-[10px]">How to think about adjustments</summary>
                <div className="mt-1.5 space-y-1 pl-2">
                  <p>• <strong>Start with extraction direction</strong> — is it under or over? That sets the primary arrow.</p>
                  <p>• <strong>One foundation at a time</strong> — change one variable per brew, observe the effect.</p>
                  <p>• <strong>Hidden variables bridge the gap</strong> — what you taste (score) connects to foundations through hidden mechanics.</p>
                  <p>• <strong>External factors are constraints</strong> — environment, bean, and setup limit what foundations can achieve.</p>
                </div>
              </details>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-slate-700">Extraction Status</h2>
                <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full ${extractionStatus.label === 'Increase extraction' ? 'bg-blue-100 text-blue-700' : extractionStatus.label === 'Decrease extraction' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{extractionStatus.label === 'Increase extraction' ? '↑ Increase extraction' : extractionStatus.label === 'Decrease extraction' ? '↓ Decrease extraction' : 'Stay'}</span>
              </div>
              <div className="relative h-5 bg-gradient-to-r from-blue-100 via-emerald-100 to-red-100 rounded-full overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-between px-2 text-[8px] text-slate-400 font-medium"><span>Decrease</span><span>Stay</span><span>Increase</span></div>
                <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-sm rounded-full transition-all duration-200" style={{ left: `${extractionStatus.barPos}%` }} />
                <div className="absolute top-0.5 bottom-0.5 w-1.5 rounded-full bg-white border-2 shadow-sm transition-all duration-200" style={{ left: `calc(${extractionStatus.barPos}% - 3px)`, borderColor: extractionStatus.color }} />
              </div>
              <div className="mt-2 text-xs font-semibold" style={{ color: extractionStatus.color }}>{extractionStatus.directive}</div>
            </div>

            {foundationPlan.map((f, i) => {
              const impact = f.totalMatch <= 3 ? 'Misadjustment' : f.totalMatch <= 6 ? 'Tuning' : 'Rework';
              const impactColor = f.totalMatch <= 3 ? '#22c55e' : f.totalMatch <= 6 ? '#f59e0b' : '#ef4444';
              const impactW = Math.min(100, (f.totalMatch / 12) * 100);
              return (
              <div key={f.name} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-slate-700">
                    <span className="mr-1">{FOUNDATION_ICONS[f.name] || '■'}</span>
                    {f.name}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-medium">Priority #{i + 1}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${f.totalMatch >= 5 ? 'bg-red-100 text-red-700' : f.totalMatch >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{f.totalMatch}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-semibold" style={{ color: impactColor }}>Impact: {impact}</span>
                  <span className="text-[8px] text-slate-400">{impact === 'Rework' ? 'Major change needed' : impact === 'Tuning' ? 'Moderate adjustment' : 'Minor tweak'}</span>
                </div>
                <div className="relative h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-200" style={{ width: `${impactW}%`, backgroundColor: impactColor }} />
                </div>
                <div className="space-y-2">
                  {f.vars.sort((a, b) => b.match - a.match).map(h => (
                    <div key={h.name} className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-slate-700">{h.name}</span>
                        <span className="text-[9px] text-slate-400 font-mono">match {h.match}/6</span>
                      </div>
                      <p className="text-[10px] text-slate-500">{h.summary}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="text-[8px] bg-blue-50 text-blue-700 px-1 py-0.5 rounded font-medium">🔎 {h.observable}</span>
                      </div>
                      <p className="text-[9px] text-slate-600 mt-1">{h.direction}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100">
                  <p className="text-[10px] text-slate-500 italic">
                    {f.name === 'Grind' && (extractionStatus.label === 'Increase extraction' ? '⇒ Grind finer to increase extraction surface area' : extractionStatus.label === 'Decrease extraction' ? '⇒ Grind coarser to reduce extraction surface area' : '⇒ Check particle distribution uniformity')}
                    {f.name === 'Temp / Time' && (extractionStatus.label !== 'Stay' ? `⇒ ${extractionStatus.label === 'Increase extraction' ? 'Increase water temp or extend contact time' : 'Decrease water temp or shorten contact time'}` : '⇒ Verify thermal stability across the brew')}
                    {f.name === 'Turbulence' && '⇒ Adjust pour flow rate, height, or WDT to improve bed uniformity'}
                    {f.name === 'Ratio' && (profile.mouthfeel <= 4 ? '⇒ Increase dose for more body and structure' : '⇒ Check if filter media is stripping oils')}
                  </p>
                </div>
              </div>
            );
            })}

            {foundationPlan.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                <p className="text-sm text-slate-400">No foundation issues detected based on current scores. Try lowering some scores to see recommendations.</p>
              </div>
            )}
          </>
        )}

        {tab === 'hidden' && (
          <>
            {resistanceProfile && equipment.dripper && (() => {
              const biased = Object.entries(equipmentBias).filter(([, v]) => v >= 2);
              if (!biased.length) return null;
              return (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 mb-2">
                  <span className="text-[7px] font-semibold text-indigo-600 block">Equipment-Biased Hidden Variables</span>
                  <p className="text-[7px] text-indigo-500 mt-0.5">Your setup amplifies: <strong>{biased.map(([k]) => k).join(', ')}</strong> — these may rank higher in the trace below.</p>
                </div>
              );
            })()}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-bold text-slate-700 mb-2">Score Gaps <span className="font-normal text-slate-400 text-[10px]">(aiming for ≥ {improveTo})</span></h2>
              {integrityCheck.entries.length === 0 ? (
                <p className="text-xs text-emerald-600 font-medium">All scores ≥ {improveTo} ✓</p>
              ) : (
                <div className="space-y-1.5">
                  {integrityCheck.entries.map(e => (
                    <div key={e.label}>
                      <button onClick={() => setExpandedIntegrity(expandedIntegrity === e.label ? null : e.label)}
                        className={`w-full flex items-center gap-2 text-xs py-1 px-1.5 rounded transition-colors ${expandedIntegrity === e.label ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                      >
                        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${e.context === 'Needs work' ? 'bg-red-400' : 'bg-amber-300'}`} />
                        <span className="font-semibold text-slate-600">{e.label}</span>
                        <span className={`font-bold ${e.context === 'Critical' ? 'text-red-500' : 'text-amber-500'}`}>{e.score}/9</span>
                        <span className="text-slate-400">— {e.context}</span>
                        <span className="ml-auto text-slate-300 text-[10px]">{expandedIntegrity === e.label ? '▲' : '▼'}</span>
                      </button>
                      {expandedIntegrity === e.label && (
                        <div className="ml-4 mt-1.5 space-y-1.5 pb-1.5">
                          {filteredTraces.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">No matching hidden variables for this axis yet.</p>
                          ) : filteredTraces.map(t => (
                            <div key={t.name} className="p-2 bg-slate-50 border border-slate-100 rounded text-[10px]">
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-bold text-slate-700">{t.name}</span>
                                <span className={`text-[8px] font-semibold px-1 py-0.5 rounded shrink-0 ${t.match >= 3 ? 'bg-red-100 text-red-700' : t.match >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{t.match}/6</span>
                              </div>
                              <p className="text-slate-500 mt-0.5">{t.summary}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {t.relatedAxes.map(a => {
                                  const ctx = scoreContext(profile[a as keyof Profile]);
                                  return <span key={a} className="text-[6px] font-medium px-1 py-0.5 rounded bg-white border border-slate-100" style={{ color: ctx.color }}>{AXIS_LABELS[a]}: {profile[a as keyof Profile]}/9</span>;
                                })}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <span className="text-[8px] bg-blue-50 text-blue-700 px-1 py-0.5 rounded font-medium">🔎 {t.observable}</span>
                                <span className="text-[8px] bg-amber-50 text-amber-700 px-1 py-0.5 rounded font-medium">⚙ {t.foundation}</span>
                              </div>
                              <p className="text-slate-500 mt-0.5 italic">{t.direction}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {integrityCheck.direction && (
                <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-semibold text-amber-800">Largest gap: <span className="capitalize">{integrityCheck.lowest.axis}</span> ({integrityCheck.lowest.score}/9 — needs ≥ {improveTo})</p>
                  <p className="text-xs text-amber-700 mt-0.5">{integrityCheck.direction}</p>
                </div>
              )}
            </div>

            {traces.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <h2 className="text-sm font-bold text-slate-700 mb-2">Hidden Variable Trace</h2>
                <p className="text-[10px] text-slate-500 mb-3">These are the bridge between what you taste and which foundation to adjust. Click any integrity item above to filter, or browse all below.</p>
                <div className="space-y-2">
                  {traces.map(t => (
                    <div key={t.name} className="p-2.5 border border-slate-100 rounded-lg bg-slate-50/50">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700">{t.name}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${t.match >= 3 ? 'bg-red-100 text-red-700' : t.match >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>Match {t.match}/6</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{t.summary}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {t.relatedAxes.map(a => {
                          const ctx = scoreContext(profile[a as keyof Profile]);
                          return <span key={a} className="text-[7px] font-medium px-1 py-0.5 rounded bg-white border border-slate-100" style={{ color: ctx.color }}>{AXIS_LABELS[a]}: {profile[a as keyof Profile]}/9</span>;
                        })}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">🔎 {t.observable}</span>
                        <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium">⚙ {t.foundation}</span>
                      </div>
                      <p className="text-[9px] text-slate-500 mt-1 italic">{t.direction}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'external' && (
          <>
            {resistanceProfile && equipment.dripper && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 mb-2">
                <span className="text-[7px] font-semibold text-indigo-600 block">Equipment Context</span>
                <p className="text-[7px] text-indigo-500 mt-0.5">{resistanceProfile.rating} ({resistanceProfile.totalScore}/9) — {resistanceProfile.feedback}</p>
              </div>
            )}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-bold text-slate-700 mb-2">Brew Execution Analysis</h2>
              <p className="text-[10px] text-slate-500 mb-3">These factors affect how your recipe translates from paper to cup. Each traces back to a foundation.</p>
              <div className="space-y-2">
                {brewAnalysis.map(f => (
                  <div key={f.name} className="p-3 border border-slate-100 rounded-lg bg-slate-50/50">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <span className="text-xs font-bold text-slate-700">{f.name}</span>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${f.match >= 4 ? 'bg-red-100 text-red-700' : f.match >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>Match {f.match}/5</span>
                    </div>
                    <p className="text-[10px] text-slate-500">{f.summary}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="text-[8px] bg-blue-50 text-blue-700 px-1 py-0.5 rounded font-medium">🔎 {f.observable}</span>
                      <span className="text-[8px] bg-amber-50 text-amber-700 px-1 py-0.5 rounded font-medium">⚙ {f.foundation}</span>
                    </div>
                    <p className="text-[9px] text-slate-600 mt-1.5">{f.direction}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {f.affectedAxes.map(a => {
                        const ctx = scoreContext(profile[a as keyof Profile]);
                        return <span key={a} className="text-[7px] font-medium px-1 py-0.5 rounded bg-white border border-slate-100" style={{ color: ctx.color }}>{AXIS_LABELS[a]}: {profile[a as keyof Profile]}/9</span>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {brewAnalysis.length === 0 && (
                <p className="text-[10px] text-slate-400 italic text-center py-4">No brew factors detected. Lower some scores to see analysis.</p>
              )}
            </div>

            {brewAnalysis.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <h2 className="text-sm font-bold text-slate-700 mb-2">Brew Factor → Foundation Map</h2>
                <div className="space-y-1.5">
                  {[...new Set(brewAnalysis.map(f => f.foundation))].map(fnd => {
                    const factors = brewAnalysis.filter(f => f.foundation === fnd);
                    return (
                      <div key={fnd} className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-600 w-20">{FOUNDATION_ICONS[fnd] || '■'} {fnd}</span>
                        <div className="flex flex-wrap gap-1">
                          {factors.map(f => (
                            <span key={f.name} className="text-[8px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{f.name}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 text-[9px] text-slate-500 italic">
                  Adjust the foundation (not the symptom) to fix brew execution issues.
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'symptoms' && (
          <>
            {resistanceProfile && equipment.dripper && timeStatus && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 mb-2">
                <span className="text-[7px] font-semibold text-indigo-600 block">Equipment Context</span>
                <p className="text-[7px] text-indigo-500 mt-0.5">
                  Your setup runs <strong>{resistanceProfile.rating.toLowerCase()} ({resistanceProfile.totalScore}/9)</strong> and the brew was <strong>{timeStatus.toLowerCase()}</strong>.
                  {resistanceProfile.totalScore <= 4 && timeStatus === 'Too Fast' ? ' Fast + too fast → check Sour, Hollow, Weak Body symptoms for under-extraction.' : ''}
                  {resistanceProfile.totalScore >= 8 && timeStatus === 'Stalled' ? ' Slow + stalled → check Bitter, Astringent, Muddy for over-extraction.' : ''}
                  {resistanceProfile.totalScore <= 4 && timeStatus !== 'Too Fast' ? ' Fast setup — under-extraction symptoms (Sour, Hollow, Grassy) are more likely.' : ''}
                  {resistanceProfile.totalScore >= 8 && timeStatus !== 'Stalled' ? ' Slow setup — over-extraction symptoms (Bitter, Astringent, Metallic) are more likely.' : ''}
                </p>
              </div>
            )}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-bold text-slate-700 mb-2">☣ Taste Symptoms</h2>
              <p className="text-[10px] text-slate-500 mb-3">Select symptoms you tasted in the cup. These link to hidden variables and foundations.</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {SYMPTOMS.map(s => {
                  const isSelected = selectedSymptoms.includes(s.name);
                  const extColor = s.likelyExtraction === 'under' ? 'border-blue-300 bg-blue-50 text-blue-700' : s.likelyExtraction === 'over' ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-300 bg-slate-50 text-slate-600';
                  return (
                    <button key={s.name} onClick={() => setSelectedSymptoms(prev => prev.includes(s.name) ? prev.filter(x => x !== s.name) : [...prev, s.name])}
                      className={`px-2 py-1 text-[9px] font-semibold rounded-lg border transition-colors ${isSelected ? `${extColor} border-2` : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      title={s.desc}
                    >
                      {s.name}
                      {isSelected && <span className="ml-1">✕</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedSymptoms.length > 0 && (
              <div className="space-y-2">
                {selectedSymptoms.map(sName => {
                  const s = SYMPTOMS.find(x => x.name === sName)!;
                  return (
                    <div key={sName} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-xs font-bold text-slate-700">{s.name}</h3>
                        <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded ${s.likelyExtraction === 'under' ? 'bg-blue-100 text-blue-700' : s.likelyExtraction === 'over' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{s.likelyExtraction}</span>
                      </div>
                      <p className="text-[9px] text-slate-500 mb-1.5">{s.desc}</p>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {s.fixes.map(fix => <span key={fix} className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">{fix}</span>)}
                      </div>
                      <div className="flex items-center gap-2 text-[9px]">
                        <span className="font-semibold text-slate-600">⚙ {s.relatedFoundation}</span>
                        {s.relatedHiddenVars.length > 0 && (
                          <span className="text-slate-400">→ {s.relatedHiddenVars.join(', ')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedSymptoms.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                <p className="text-sm text-slate-400">Tap symptoms above to see their analysis.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
