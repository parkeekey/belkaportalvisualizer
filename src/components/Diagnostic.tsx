import { useState, useMemo } from 'react';

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
  const [profile, setProfile] = useState<Profile>({ acidity: 5, sweetness: 5, flavor: 5, mouthfeel: 5, aftertaste: 5, overall: 5 });
  const [expandedIntegrity, setExpandedIntegrity] = useState<string | null>(null);
  const [improveTo, setImproveTo] = useState(5);
  const [tab, setTab] = useState<'profile' | 'internal' | 'hidden' | 'external' | 'symptoms'>('profile');
  const [focusAxes, setFocusAxes] = useState<string[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(true);
  const [equipment, setEquipment] = useState<Equipment>({ dripper: '', paper: '', mod: '', burrType: '', burrSize: '', finesFeel: 5, grindEffort: 5, grindSetting: 5, dose: 18, ratio: '1:16', planTime: '', timeFinished: '' });
  const [showEquipment, setShowEquipment] = useState(false);

  const setScore = (key: keyof Profile, val: number) => setProfile(p => ({ ...p, [key]: Math.max(1, Math.min(9, val)) }));

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
    if (absNet <= 2) { label = 'Extraction Balanced'; directive = 'Refine precision — focus on hidden variable tuning'; color = '#22c55e'; major = false; }
    else if (net > 0) { label = 'Under-extracted'; directive = '↑ Increase extraction — finer grind / longer contact / higher temp'; color = '#3b82f6'; major = absNet >= 8; }
    else { label = 'Over-extracted'; directive = '↓ Decrease extraction — coarser grind / shorter contact / lower temp'; color = '#ef4444'; major = absNet >= 8; }
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
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100">✕ Close</button>
        </div>
        <div className="max-w-4xl mx-auto px-4 flex gap-1">
          <button onClick={() => setTab('profile')} className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'profile' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>📊 Profile</button>
          <button onClick={() => setTab('internal')} className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'internal' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>🧠 Internal</button>
          <button onClick={() => setTab('hidden')} className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'hidden' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>👁 Hidden</button>
          <button onClick={() => setTab('external')} className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'external' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>🌍 External</button>
          <button onClick={() => setTab('symptoms')} className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-t border-l border-r transition-colors ${tab === 'symptoms' ? 'bg-white border-slate-200 text-slate-800 -mb-px' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>☣ Symptoms</button>
        </div>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 space-y-4 pb-20">
        {tab === 'profile' && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-bold text-slate-700 mb-3">Score Profile</h2>
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
                <div className="flex-1 w-full space-y-2.5">
                  {AXES.map(k => {
                    const ctx = scoreContext(profile[k]);
                    return (
                      <div key={k}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-semibold text-slate-600 capitalize">{AXIS_LABELS[k]}</span>
                          <span className="text-[11px] font-bold" style={{ color: ctx.color }}>{profile[k]} <span className="font-normal text-slate-400 text-[10px]">({ctx.label})</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-slate-400 font-mono w-3 text-right">0</span>
                          <input type="range" min={0} max={9} value={profile[k]} onChange={e => setScore(k, parseInt(e.target.value))}
                            className="flex-1 h-1.5 appearance-none rounded-full bg-slate-200 accent-amber-600 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
                          />
                          <span className="text-[9px] text-slate-400 font-mono w-3">9</span>
                        </div>
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
            {(integrityCheck.lowest.axis || focusAxes.length > 0) && (() => {
              const primaryAxis = focusAxes.length > 0 ? focusAxes[0] : integrityCheck.lowest.axis;
              const primaryLabel = AXIS_LABELS[primaryAxis];
              const primaryScore = profile[primaryAxis as keyof Profile];
              const gap = improveTo - primaryScore;
              const isWinnable = primaryScore >= 3;
              const relatedHidden = HIDDEN_VARS
                .map(h => ({ ...h, match: h.symptomPattern(profile) }))
                .filter(h => h.match > 0 && h.relatedAxes.includes(primaryAxis))
                .sort((a, b) => b.match - a.match);
              const topFoundation = relatedHidden.length > 0
                ? [...new Set(relatedHidden.map(h => h.foundation))].sort((a, b) => {
                    const aScore = relatedHidden.filter(h => h.foundation === a).reduce((s, h) => s + h.match, 0);
                    const bScore = relatedHidden.filter(h => h.foundation === b).reduce((s, h) => s + h.match, 0);
                    return bScore - aScore;
                  })[0]
                : integrityCheck.direction.includes('Under') ? 'Grind'
                : integrityCheck.direction.includes('Over') ? 'Temp / Time'
                : 'Grind';
              return (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-slate-700">🎯 Optimization Plan</h2>
                  <span className="text-[9px] text-amber-600 font-semibold">Start here → {primaryLabel}</span>
                </div>
                <div className="space-y-2">
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-bold text-amber-800">WHAT — Improve <span className="capitalize">{primaryLabel}</span> from {primaryScore} → {improveTo}</p>
                    <p className="text-[10px] text-amber-700 mt-0.5">Gap: {gap} point{gap !== 1 ? 's' : ''} below target</p>
                  </div>
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs font-bold text-blue-800">WHY — <span className="capitalize">{primaryLabel}</span> is the primary gap</p>
                    <p className="text-[10px] text-blue-700 mt-0.5">{integrityCheck.direction || 'Affects overall cup quality and balance'}</p>
                  </div>
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <p className="text-xs font-bold text-emerald-800">HOW — Adjust <span className="font-mono">{FOUNDATION_ICONS[topFoundation] || '■'} {topFoundation}</span></p>
                    <p className="text-[10px] text-emerald-700 mt-0.5">
                      {topFoundation === 'Grind' && (extractionStatus.label === 'Under-extracted' ? 'Grind finer for more surface area and extraction' : extractionStatus.label === 'Over-extracted' ? 'Grind coarser to reduce extraction rate' : 'Check particle distribution')}
                      {topFoundation === 'Temp / Time' && (extractionStatus.label === 'Under-extracted' ? 'Increase water temp or extend contact time' : extractionStatus.label === 'Over-extracted' ? 'Decrease water temp or shorten contact time' : 'Verify thermal stability')}
                      {topFoundation === 'Turbulence' && 'Adjust pour height, flow rate, or WDT for even bed agitation'}
                      {topFoundation === 'Ratio' && (profile.mouthfeel <= 4 ? 'Increase dose for more body and structure' : 'Check if filter media is stripping oils')}
                      {!['Grind', 'Temp / Time', 'Turbulence', 'Ratio'].includes(topFoundation) && 'Review hidden variables for targeted adjustment'}
                    </p>
                    {relatedHidden.length > 0 && (
                      <p className="text-[9px] text-emerald-600 mt-1">↙ See Hidden tab for {relatedHidden.length} related variable{relatedHidden.length > 1 ? 's' : ''}</p>
                    )}
                  </div>
                </div>
                {!isWinnable && (
                  <div className="mt-2 p-2 bg-slate-100 rounded-lg">
                    <p className="text-[9px] text-slate-600 font-semibold">This one is tough. That's okay.</p>
                    <p className="text-[8px] text-slate-500 mt-0.5">Some gaps need equipment changes. For now, focus on a different aspect — progress over perfection.</p>
                  </div>
                )}
                {focusAxes.length > 1 && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[9px] text-slate-500 font-semibold">Also selected ({focusAxes.length - 1} more):</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {focusAxes.slice(1).map(ax => (
                        <span key={ax} className="text-[8px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{AXIS_LABELS[ax]}</span>
                      ))}
                    </div>
                    <p className="text-[8px] text-slate-400 mt-1">Tackle these after the primary focus shows improvement.</p>
                  </div>
                )}
              </div>
              );
            })()}

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
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${extractionStatus.major ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`} style={{ color: extractionStatus.color }}>{extractionStatus.label}</span>
              </div>
              <div className="relative h-5 bg-gradient-to-r from-blue-100 via-emerald-100 to-red-100 rounded-full overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-between px-2 text-[8px] text-slate-400 font-medium"><span>Under</span><span>Balanced</span><span>Over</span></div>
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
                  { icon: '⚙', name: 'Grind', desc: 'Particle size & distribution', dir: extractionStatus.label === 'Under-extracted' ? 'Finer' : extractionStatus.label === 'Over-extracted' ? 'Coarser' : 'Check uniformity' },
                  { icon: '🌡', name: 'Temp / Time', desc: 'Water temp & contact duration', dir: extractionStatus.label === 'Under-extracted' ? '↑ Temp or ↑ Time' : extractionStatus.label === 'Over-extracted' ? '↓ Temp or ↓ Time' : 'Verify stability' },
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
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${extractionStatus.major ? 'bg-red-100' : 'bg-slate-100'}`} style={{ color: extractionStatus.color }}>{extractionStatus.label}</span>
              </div>
              <div className="relative h-5 bg-gradient-to-r from-blue-100 via-emerald-100 to-red-100 rounded-full overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-between px-2 text-[8px] text-slate-400 font-medium"><span>Under</span><span>Balanced</span><span>Over</span></div>
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
                    {f.name === 'Grind' && (extractionStatus.label === 'Under-extracted' ? '⇒ Grind finer to increase extraction surface area' : extractionStatus.label === 'Over-extracted' ? '⇒ Grind coarser to reduce extraction surface area' : '⇒ Check particle distribution uniformity')}
                    {f.name === 'Temp / Time' && (extractionStatus.label !== 'Extraction Balanced' ? `⇒ ${extractionStatus.label === 'Under-extracted' ? 'Increase water temp or extend contact time' : 'Decrease water temp or shorten contact time'}` : '⇒ Verify thermal stability across the brew')}
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
