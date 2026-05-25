import { useCallback, useEffect, useRef, useState } from 'react';

interface ZenNote {
  id: string;
  text: string;
  tag: string;
  direction: 'under' | 'over' | '';
  x: number;
  y: number;
}

interface ZenArrow {
  id: string;
  fromNoteId: string;
  toFoundation: string;
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
// ── Extraction Direction ─────────────────────────────────────
// Every coffee problem is either under-extraction or over-extraction.
// First answer: do I need ↑ more or ↓ less extraction?

const TAG_DIRECTION: Record<string, 'under' | 'over' | ''> = {
  sour: 'under', weak: 'under', hollow: 'under', flat: 'under', sharp: 'under',
  bitter: 'over', dry: 'over', astringent: 'over', muddy: 'over', creamy: 'over',
  intensity: '', body: '', acidity: '', sweetness: '', balance: '',
};

const UNDER_TAGS = Object.entries(TAG_DIRECTION).filter(([, d]) => d === 'under').map(([t]) => t);
const OVER_TAGS = Object.entries(TAG_DIRECTION).filter(([, d]) => d === 'over').map(([t]) => t);
const NEUTRAL_TAGS = Object.entries(TAG_DIRECTION).filter(([, d]) => d === '').map(([t]) => t);

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
        explanation: 'Too fine or poor grind uniformity produces excess fines',
        evidence: 'Drawdown time significantly longer than expected', whyNot: '',
        tell: 'Very slow drawdown, bed looks like sludge, fines migration visible',
      },
      turbulence: {
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
        explanation: 'Finer grind produces more fines that pass through the filter, increasing body',
        evidence: 'Muddier bed, longer drawdown', whyNot: '',
        tell: 'Finer = more body. If body is lacking but flavor is OK, go finer',
      },
      turbulence: {
        explanation: 'More agitation pushes fines and oils through the filter bed into the cup',
        evidence: 'Higher turbidity in the cup, sediment visible', whyNot: '',
        tell: 'More agitation = more body. If body is thin, pour more aggressively',
      },
      ratio: {
        explanation: 'Higher ratio (less water) concentrates everything including body-forming compounds',
        evidence: 'Smaller volume, thicker mouthfeel',
        whyNot: 'Ratio affects body mostly through concentration — the actual body-forming compounds come from fines.',
        tell: 'More coffee = more body. Last resort — changes strength too',
      },
      'temp-time': {
        explanation: 'Higher temp extracts more oils and colloids, but the effect on body is secondary',
        evidence: 'Slightly fuller feel at higher temps', whyNot: '',
        tell: 'More time = more body. If body is thin, extend contact time',
      },
    },
  },
};

function loadState() {
  try {
    const raw = localStorage.getItem(ZEN_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { notes: [], arrows: [] };
}

function saveState(state: { notes: ZenNote[]; arrows: ZenArrow[] }) {
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
  const [connecting, setConnecting] = useState<{ fromNoteId: string } | null>(null);
  const [hoverDot, setHoverDot] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<TagKnowledge>(() => loadKnowledge());
  const scrollRef = useRef<HTMLDivElement>(null);
  const noteElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [showTagPicker, setShowTagPicker] = useState<string | null>(null);
  const [selectedArrow, setSelectedArrow] = useState<string | null>(null);
  const [, setScrollTick] = useState(0);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Re-render on scroll so fixed SVG arrows track DOM positions
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTick(t => t + 1);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    saveState({ notes, arrows });
  }, [notes, arrows]);

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
      x: 60 + (noteCounter % 5) * 40,
      y: 100 + (noteCounter % 4) * 80,
    };
    setNotes(prev => [...prev, note]);
    setSelectedArrow(null);
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    setArrows(prev => prev.filter(a => a.fromNoteId !== id));
    setSelectedArrow(prev => prev === id ? null : prev);
  }, []);

  const updateNote = useCallback((id: string, patch: Partial<ZenNote>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
  }, []);

  const startDrag = useCallback((noteId: string, e: React.MouseEvent) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const scroll = scrollRef.current;
    const sx = scroll ? scroll.scrollLeft : 0;
    const sy = scroll ? scroll.scrollTop : 0;
    setDragging({ noteId, offsetX: e.clientX - note.x + sx, offsetY: e.clientY - note.y + sy });
  }, [notes]);

  const startConnect = useCallback((noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConnecting({ fromNoteId: noteId });
    setHoverDot(null);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
    const scroll = scrollRef.current;
    const sx = scroll ? scroll.scrollLeft : 0;
    const sy = scroll ? scroll.scrollTop : 0;
    if (dragging) {
      setNotes(prev => prev.map(n =>
        n.id === dragging.noteId ? { ...n, x: e.clientX - dragging.offsetX + sx, y: e.clientY - dragging.offsetY + sy } : n
      ));
    }
    if (connecting) {
      // Check proximity to foundation dots using elementsFromPoint
      const dot = document.querySelector('.foundation-dot:hover, .foundation-dot.hover');
      if (dot) {
        const fid = dot.getAttribute('data-fid');
        setHoverDot(fid);
      } else {
        // Manual proximity check
        const cx = e.clientX;
        const cy = e.clientY;
        let closest: string | null = null;
        let closestDist = 28;
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
        setHoverDot(closest);
      }
    }
  }, [dragging, connecting]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (connecting) {
      const cx = e.clientX;
      const cy = e.clientY;
      let hitFid: string | null = null;
      document.querySelectorAll('.foundation-dot').forEach(el => {
        const r = el.getBoundingClientRect();
        const ddx = r.left + r.width / 2;
        const ddy = r.top + r.height / 2;
        const dist = Math.sqrt((cx - ddx) ** 2 + (cy - ddy) ** 2);
        if (dist < 30) hitFid = el.getAttribute('data-fid');
      });
      if (hitFid) {
        const note = notes.find(n => n.id === connecting.fromNoteId);
        const tag = note?.tag || 'untagged';
        setArrows(prev => {
          const exists = prev.some(a => a.fromNoteId === connecting.fromNoteId && a.toFoundation === hitFid);
          if (exists) return prev;
          const arrow = { id: `arrow-${Date.now()}`, fromNoteId: connecting.fromNoteId, toFoundation: hitFid!, color: 'hypothesis' as const, tag };
          return [...prev, arrow];
        });
        if (tag && tag !== 'untagged') {
          setKnowledge(prev => {
            const next = { ...prev };
            if (!next[tag]) next[tag] = { connections: [] };
            const conns = next[tag].connections;
            const existing = conns.find(c => c.to === hitFid);
            if (existing) { existing.count++; }
            else { conns.push({ to: hitFid!, count: 1, confirmed: 0, wrong: 0 }); }
            return next;
          });
        }
      }
    }
    if (dragging || connecting) {
      setDragging(null);
      setConnecting(null);
      setHoverDot(null);
    }
  }, [connecting, dragging, notes]);

  const cycleArrowColor = useCallback((arrowId: string) => {
    setArrows(prev => prev.map(a => {
      if (a.id !== arrowId) return a;
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

  const arrowColor = (color: string) => {
    switch (color) {
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
    <div className="fixed inset-0 z-50 bg-[#f8f6f0] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white/70 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700 uppercase tracking-widest">☯ Zen</span>
          <span className="text-[10px] text-slate-400 italic">connect your taste to the fundamentals</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { saveState({ notes, arrows }); }}
            className="px-3 py-1 text-[11px] font-semibold border border-slate-300 rounded-md text-slate-600 hover:bg-slate-100"
          >Save</button>
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

      {/* Scrollable canvas */}
      <div ref={scrollRef} className="flex-1 overflow-auto"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setDragging(null); setConnecting(null); setHoverDot(null); }}
      >
        <div className="relative min-h-[150vh] w-full">
          {/* SVG layer — fixed to viewport so arrow coordinates always match DOM positions */}
          <svg className="fixed inset-0 w-full h-full pointer-events-none z-30">
            {arrows.map(a => {
              const fromP = getNoteDotPos(a.fromNoteId);
              const toP = getFoundationDotPos(a.toFoundation);
              if (!fromP || !toP) return null;
              return (
                <g key={a.id} className="pointer-events-auto cursor-pointer"
                  onClick={() => cycleArrowColor(a.id)}
                  onContextMenu={(e) => { e.preventDefault(); deleteArrow(a.id); }}
                >
                  {/* Selected glow */}
                  {selectedArrow === a.id && (
                    <path d={arrowPath(fromP.x, fromP.y, toP.x, toP.y)}
                      fill="none" stroke="#3b82f6" strokeWidth={6} strokeDasharray={arrowStyle(a.color)} opacity={0.2}
                    />
                  )}
                  <path d={arrowPath(fromP.x, fromP.y, toP.x, toP.y)}
                    fill="none" stroke={arrowColor(a.color)} strokeWidth={2.5} strokeDasharray={arrowStyle(a.color)}
                  />
                  <circle cx={toP.x} cy={toP.y} r={4} fill={arrowColor(a.color)} />
                  <path d={arrowPath(fromP.x, fromP.y, toP.x, toP.y)}
                    fill="none" stroke="transparent" strokeWidth={16}
                  />
                  {/* Mechanism label on arrow */}
                  {(a.tag && a.tag !== 'untagged') && (() => {
                    const mech = MECHANISM_KNOWLEDGE[a.tag];
                    const mechanismName = mech ? mech.mechanism : a.tag;
                    return (
                      <text x={(fromP.x + toP.x) / 2} y={(fromP.y + toP.y) / 2 - 8}
                        textAnchor="middle" fontSize="6" fill={arrowColor(a.color)} className="pointer-events-none select-none font-semibold"
                      >{mechanismName}</text>
                    );
                  })()}
                </g>
              );
            })}
            {/* Active connection rubber band */}
            {connecting && (() => {
              const fromP = getNoteDotPos(connecting.fromNoteId);
              if (!fromP) return null;
              const targetP = hoverDot ? getFoundationDotPos(hoverDot) : null;
              const toX = targetP ? targetP.x : mouseRef.current.x;
              const toY = targetP ? targetP.y : mouseRef.current.y;
              return (
                <path d={arrowPath(fromP.x, fromP.y, toX, toY)}
                  fill="none" stroke={hoverDot ? '#3b82f6' : '#94a3b8'} strokeWidth={2.5} strokeDasharray="4,4"
                />
              );
            })()}
          </svg>

          {/* Foundations column */}
          <div className="absolute top-8 right-8 flex flex-col gap-5 z-10">
            {FOUNDATIONS.map(f => (
              <div key={f.id} className="flex items-center gap-0">
                {/* Connection dot */}
                <div data-fid={f.id}
                  className={`foundation-dot w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150 -ml-2 mr-2 z-10 cursor-crosshair
                    ${hoverDot === f.id ? 'scale-150 border-blue-500 bg-blue-100 shadow-lg shadow-blue-300' : 'border-slate-300 bg-white hover:border-slate-400'}`}
                  style={{ borderColor: hoverDot === f.id ? '#3b82f6' : f.color + '80' }}
                >
                  <div className={`w-2 h-2 rounded-full transition-all duration-150 ${hoverDot === f.id ? 'bg-blue-500' : ''}`}
                    style={{ backgroundColor: hoverDot === f.id ? '#3b82f6' : f.color }}
                  />
                </div>
                {/* Card */}
                <div className={`w-36 rounded-2xl border-2 flex flex-col items-center justify-center select-none cursor-default shadow-sm bg-white/90 px-3 py-2.5 transition-shadow duration-150 ${hoverDot === f.id ? 'shadow-md shadow-blue-200/50' : ''}`}
                  style={{ borderColor: hoverDot === f.id ? '#3b82f6' : f.color + '60' }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[7px] font-bold text-white"
                      style={{ backgroundColor: f.color }}>{f.rank}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: f.color }}>{f.label}</span>
                  </div>
                  <span className="text-[8px] text-slate-400 mt-0.5 text-center leading-tight">{f.desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          {notes.map(note => (
            <div key={note.id}
              ref={el => { if (el) noteElsRef.current.set(note.id, el); else noteElsRef.current.delete(note.id); }}
              className="absolute z-20 bg-white rounded-xl shadow-md border border-slate-200 cursor-grab active:cursor-grabbing select-none"
              style={{ left: note.x, top: note.y }}
              onMouseDown={(e) => startDrag(note.id, e)}
            >
              <div className="px-2.5 py-1.5">
                {/* Tag row */}
                <div className="flex items-center gap-1 mb-1">
                  {showTagPicker === note.id ? (
                    <div className="flex flex-wrap gap-0.5" onMouseDown={e => e.stopPropagation()}>
                      <div className="w-full text-[6px] font-semibold text-green-600 uppercase tracking-wider mb-0.5">↑ Under-extraction</div>
                      {UNDER_TAGS.map(t => (
                        <button key={t} onClick={() => { updateNote(note.id, { tag: t, direction: 'under' }); setShowTagPicker(null); }}
                          className={`px-1 py-0.5 text-[8px] rounded border transition-colors ${note.tag === t ? 'bg-green-700 text-white border-green-700' : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'}`}
                        >{t}</button>
                      ))}
                      <div className="w-full text-[6px] font-semibold text-red-600 uppercase tracking-wider mt-1 mb-0.5">↓ Over-extraction</div>
                      {OVER_TAGS.map(t => (
                        <button key={t} onClick={() => { updateNote(note.id, { tag: t, direction: 'over' }); setShowTagPicker(null); }}
                          className={`px-1 py-0.5 text-[8px] rounded border transition-colors ${note.tag === t ? 'bg-red-700 text-white border-red-700' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
                        >{t}</button>
                      ))}
                      {NEUTRAL_TAGS.length > 0 && (
                        <>
                          <div className="w-full text-[6px] font-semibold text-slate-400 uppercase tracking-wider mt-1 mb-0.5">You decide</div>
                          {NEUTRAL_TAGS.map(t => (
                            <button key={t} onClick={() => { updateNote(note.id, { tag: t }); setShowTagPicker(null); }}
                              className={`px-1 py-0.5 text-[8px] rounded border transition-colors ${note.tag === t ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                            >{t}</button>
                          ))}
                        </>
                      )}
                      <input type="text" placeholder="custom tag..."
                        onMouseDown={e => e.stopPropagation()}
                        onKeyDown={e => { if (e.key === 'Enter') { const val = (e.target as HTMLInputElement).value.trim(); if (val) { const d = TAG_DIRECTION[val] ?? ''; updateNote(note.id, { tag: val, direction: note.direction || d }); setShowTagPicker(null); } } }}
                        className="w-16 px-1 py-0.5 text-[8px] border border-slate-200 rounded text-slate-600 outline-none focus:border-slate-400"
                      />
                      <button onClick={() => setShowTagPicker(null)}
                        className="px-1 py-0.5 text-[8px] rounded border border-slate-200 text-slate-400 hover:bg-slate-100"
                      >✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
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
                      {/* Direction toggle — only shown when tag is set */}
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
                  )}
                </div>
                {/* Note text + actions */}
                <div className="flex items-start justify-between gap-1">
                  <textarea
                    value={note.text}
                    onChange={(e) => updateNote(note.id, { text: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-full text-[11px] text-slate-700 bg-transparent border-none outline-none resize-none leading-tight min-h-[20px] font-sans"
                    rows={1}
                  />
                  <div className="flex items-center gap-0.5 shrink-0">
                    <div
                      className="w-3.5 h-3.5 rounded-full bg-slate-200 hover:bg-slate-400 cursor-crosshair inline-flex items-center justify-center text-[7px] text-white font-bold transition-colors border border-slate-300 hover:border-slate-500"
                      title="Drag to connect to a foundation"
                      onMouseDown={(e) => { e.stopPropagation(); startConnect(note.id, e); }}
                    >◉</div>
                    <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                      className="w-3.5 h-3.5 rounded-full bg-slate-200 hover:bg-red-300 inline-flex items-center justify-center text-[7px] text-slate-400 hover:text-white font-bold leading-none transition-colors"
                    >×</button>
                  </div>
                </div>

                {/* Inline reasoning card */}
                {selectedArrow === note.id && note.tag && (() => {
                  const dir = note.direction ? EXTRACTION_DIRECTIONS[note.direction] : null;
                  const mech = MECHANISM_KNOWLEDGE[note.tag];
                  return (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 w-56" onMouseDown={e => e.stopPropagation()}>
                      {/* Direction-first banner */}
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
                          </div>
                          {/* Impact legend */}
                          <div className="text-[5px] text-slate-300 mt-0.5 leading-none">
                            <span className="mr-1">●●●●● = BIG rock (adjust tiny)</span>
                            <span>●○○○○ = small rock (adjust more)</span>
                          </div>
                        </div>
                      ) : null}

                      {/* Mechanism knowledge details */}
                      {mech ? (() => {
                        const primary = mech.priority[0];
                        const primaryF = FOUNDATIONS.find(f => f.id === primary);
                        const primaryLink = primary ? mech.foundations[primary] : null;
                        return (
                          <>
                            <div className="text-[8px] font-semibold text-slate-500 mb-0.5">{mech.mechanism}</div>
                            <p className="text-[7px] text-slate-400 leading-relaxed mb-1">{mech.summary}</p>
                            {/* Priority chain */}
                            {!dir && (
                              <div className="flex items-center gap-0.5 mb-1 flex-wrap">
                                <span className="text-[6px] text-slate-400 uppercase mr-0.5">Check:</span>
                                {mech.priority.map((fid, i) => {
                                  const f = FOUNDATIONS.find(ff => ff.id === fid);
                                  if (!f) return null;
                                  return (
                                    <span key={fid} className="text-[7px] font-semibold px-1 py-0.5 rounded-sm"
                                      style={{ backgroundColor: f.color + '15', color: f.color }}
                                    >{i === 0 ? '① ' : i === 1 ? '② ' : i === 2 ? '③ ' : '④ '}{f.label}</span>
                                  );
                                })}
                              </div>
                            )}
                            {/* Primary recommendation with causal chain */}
                            {primaryF && primaryLink && (
                              <div className="bg-blue-50 border border-blue-100 rounded px-1.5 py-1 mb-1">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <span className="text-[7px] font-bold text-blue-700">① {primaryF.label}</span>
                                  <span className="text-[6px] text-blue-500 font-medium">sub: {primaryLink.subTopic ?? primaryLink.explanation.split(' ').slice(0, 3).join(' ') + '...'}</span>
                                </div>
                                <div className="text-[7px] text-blue-600 leading-relaxed mb-0.5">
                                  <span className="font-medium">Chain</span>
                                  <div className="mt-0.5">
                                    {primaryLink.causalChain?.split('→').map((step, si) => (
                                      <span key={si}>
                                        {si > 0 && <span className="block text-center text-blue-300 leading-none">↓</span>}
                                        <span className="block">{step.trim()}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="text-[7px] text-blue-500 italic">
                                  <span className="font-medium">Try:</span> {primaryLink.experiment}
                                </div>
                                {primaryLink.whyNot && (
                                  <p className="text-[6px] text-blue-400 italic mt-0.5">↳ {primaryLink.whyNot}</p>
                                )}
                                {primaryLink.tell && (
                                  <p className="text-[6px] text-amber-600 mt-0.5 font-medium">⚡ {primaryLink.tell}</p>
                                )}
                              </div>
                            )}
                            {/* Quick secondary chain hints */}
                            {mech.priority.slice(1, 3).map((fid, i) => {
                              const f = FOUNDATIONS.find(ff => ff.id === fid);
                              const link = mech.foundations[fid];
                              if (!f || !link) return null;
                              return (
                                <div key={fid} className="flex items-start gap-1 mb-0.5">
                                  <span className="text-[7px] font-semibold shrink-0 mt-0.5" style={{ color: f.color }}>{i === 0 ? '②' : '③'}</span>
                                  <div className="text-[7px] text-slate-500 leading-tight">
                                    <span className="font-medium">{f.label}</span>
                                    <span className="text-slate-400"> · sub: {link.subTopic ?? '—'}</span>
                                    <br />
                                    <span className="text-slate-400 italic">
                                      {link.causalChain ? (() => {
                                        const steps = link.causalChain.split('→');
                                        return steps.slice(0, 2).map((step, si) => (
                                          <span key={si}>
                                            {si > 0 && <span className="text-slate-300"> ↓ </span>}
                                            {step.trim()}
                                          </span>
                                        ));
                                      })() : link.explanation}
                                      {link.causalChain && link.causalChain.split('→').length > 2 && <span className="text-slate-300"> ↓ ...</span>}
                                    </span>
                                    {link.tell && <><br /><span className="text-amber-500 text-[6px]">⚡ {link.tell}</span></>}
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        );
                      })() : (
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
            </div>
          ))}

          {/* Empty state */}
          {notes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-sm text-slate-300 font-medium">Your canvas is empty</p>
                <p className="text-[11px] text-slate-200 mt-1">Click "Add Note" to start connecting your taste to the 4 foundations</p>
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
        <div className="flex items-center gap-2 ml-auto text-[10px] text-slate-400">
          <span className="inline-block w-2 h-0.5 bg-slate-400" style={{ borderTop: '2px dashed #94a3b8', height: 0, width: 12 }} /> hypothesis
          <span className="inline-block w-3 h-0.5 bg-green-500" /> confirmed
          <span className="inline-block w-3 h-0.5 bg-red-500" /> wrong
        </div>
      </div>
    </div>
  );
}
