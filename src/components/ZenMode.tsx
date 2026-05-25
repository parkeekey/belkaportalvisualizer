import { useCallback, useEffect, useRef, useState } from 'react';

interface ZenNote {
  id: string;
  text: string;
  tag: string;
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
const COMMON_TAGS = ['bitter', 'sour', 'dry', 'astringent', 'weak', 'muddy', 'hollow', 'flat', 'sharp', 'creamy'];

// ── Mechanism Knowledge Base ────────────────────────────────
// Links taste symptoms (tags) through secondary physical concepts
// to the 4 foundations. This is the "why" behind each connection.

const MECHANISM_KNOWLEDGE: Record<string, {
  mechanism: string;
  summary: string;
  priority: string[]; // foundation IDs from most → least likely
  foundations: Record<string, { explanation: string; evidence: string; whyNot?: string }>;
}> = {
  bitter: {
    mechanism: 'Over-extraction of late solubles',
    summary: 'Tannins dissolve after desirable compounds are gone. Your bed gave too much contact.',
    priority: ['temp-time', 'grind', 'turbulence', 'ratio'],
    foundations: {
      grind: { explanation: 'Finer = more surface area = faster extraction of bitter fractions at the end', evidence: 'Peak EC too high, early peak, steep decline', whyNot: 'If your peak EC is normal but the tail is long, grind is probably fine — suspect time instead' },
      ratio: { explanation: 'More water = more solvent = pulls deeper into the solubility curve', evidence: 'EC stays elevated well past peak, long flat decline', whyNot: 'Bitter from ratio is rare unless you\'re below 1:14. Check time and grind first.' },
      turbulence: { explanation: 'Channeling over-extracts some pockets while others stall', evidence: 'Sudden EC spikes then rapid collapse', whyNot: 'Turbulence-related bitter usually comes with dryness. If the cup is just bitter but not dry, rule out channeling.' },
      'temp-time': { explanation: 'Longer time lets tannins dissolve after good extraction finishes', evidence: 'Long declining tail after peak, extended extraction phase', whyNot: '' },
    },
  },
  sour: {
    mechanism: 'Under-extraction of sugars',
    summary: 'Acids extract first, sugars need more time. Sour means the brew stopped too early for sweetness.',
    priority: ['grind', 'temp-time', 'turbulence', 'ratio'],
    foundations: {
      grind: { explanation: 'Too coarse = insufficient surface area for sugar dissolution', evidence: 'EC peaks low, short extraction window', whyNot: '' },
      ratio: { explanation: 'Too little water = not enough solvent to reach sugars deep in particles', evidence: 'EC curve truncated, never reaches expected peak', whyNot: 'Sour from ratio usually comes with low body. If body is OK, suspect grind or time.' },
      turbulence: { explanation: 'Too little agitation = water sits stagnant, sugars don\'t diffuse out', evidence: 'Slow EC rise, shallow slope, low peak', whyNot: 'Low turbulence sour usually tastes "flat" rather than sharp. Sharp sour is grind or time.' },
      'temp-time': { explanation: 'Too short or too cool = insufficient energy for sugar dissolution', evidence: 'EC drops while still rising, cut before peak', whyNot: '' },
    },
  },
  dry: {
    mechanism: 'Fines migration & channeling',
    summary: 'Dry/astringent means micro-particles clogged the filter, creating uneven flow.',
    priority: ['turbulence', 'grind', 'temp-time'],
    foundations: {
      grind: { explanation: 'Too fine creates excess fines that migrate to the filter', evidence: 'Irregular phase pattern, then sudden collapse', whyNot: '' },
      turbulence: { explanation: 'Aggressive pour dislodges fines from particles into the filter', evidence: 'Bed Integrity drops sharply at turbulence step', whyNot: '' },
      'temp-time': { explanation: 'Long drawdown from clogged filter prolongs contact with exhausted bed', evidence: 'Extended declining phase, very long tail', whyNot: 'Temp & Time alone doesn\'t cause dryness — it amplifies the effect of fines. Fix the source first.' },
    },
  },
  weak: {
    mechanism: 'Insufficient total dissolved solids',
    summary: 'Not enough coffee solids made it into the cup. The brew left flavor behind.',
    priority: ['grind', 'temp-time', 'turbulence', 'ratio'],
    foundations: {
      grind: { explanation: 'Too coarse = particles too large, water can\'t penetrate fast enough', evidence: 'EC never rises to expected peak, low amplitude', whyNot: '' },
      ratio: { explanation: 'Too much water relative to coffee = dilution exceeds extraction', evidence: 'EC curve low but shape is normal, just compressed', whyNot: 'Weak from ratio is the most obvious — if your ratio is 1:17+, that\'s probably it. Below 1:16, check grind.' },
      turbulence: { explanation: 'Too fast a pour = water passes through without sufficient contact', evidence: 'EC slope too shallow, peak too early', whyNot: '' },
      'temp-time': { explanation: 'Too short brew time = extraction stops before peak', evidence: 'EC still rising when brew ends', whyNot: '' },
    },
  },
  muddy: {
    mechanism: 'Fines overload in the bed',
    summary: 'Excessive fines create a slurry that clogs the filter and stalls the brew.',
    priority: ['grind', 'turbulence'],
    foundations: {
      grind: { explanation: 'Too fine or poor grind uniformity produces excess fines', evidence: 'Drawdown time significantly longer than expected', whyNot: '' },
      turbulence: { explanation: 'High agitation pushes fines downward into the filter, accelerating clog', evidence: 'Bed Integrity drops early, collapse during main pour', whyNot: '' },
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
                      {COMMON_TAGS.map(t => (
                        <button key={t} onClick={() => { updateNote(note.id, { tag: t }); setShowTagPicker(null); }}
                          className={`px-1 py-0.5 text-[8px] rounded border transition-colors ${note.tag === t ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                        >{t}</button>
                      ))}
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
                      {note.tag && MECHANISM_KNOWLEDGE[note.tag] && (
                        <button onClick={(e) => { e.stopPropagation(); setSelectedArrow(prev => prev === note.id ? null : note.id); }}
                          onMouseDown={e => e.stopPropagation()}
                          className={`w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[8px] transition-colors ${selectedArrow === note.id ? 'bg-amber-200 text-amber-700' : 'bg-slate-100 text-slate-300 hover:bg-amber-100 hover:text-amber-500'}`}
                          title="Show reasoning"
                        >💡</button>
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
                {selectedArrow === note.id && note.tag && MECHANISM_KNOWLEDGE[note.tag] && (() => {
                  const mech = MECHANISM_KNOWLEDGE[note.tag];
                  const primary = mech.priority[0];
                  const primaryF = FOUNDATIONS.find(f => f.id === primary);
                  const primaryLink = primary ? mech.foundations[primary] : null;
                  return (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 w-56" onMouseDown={e => e.stopPropagation()}>
                      <div className="text-[8px] font-semibold text-slate-500 mb-0.5">{mech.mechanism}</div>
                      <p className="text-[7px] text-slate-400 leading-relaxed mb-1">{mech.summary}</p>
                      {/* Priority chain */}
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
                      {/* Primary recommendation */}
                      {primaryF && primaryLink && (
                        <div className="bg-blue-50 border border-blue-100 rounded px-1.5 py-1 mb-1">
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-[7px] font-bold text-blue-700">Most likely: {primaryF.label}</span>
                          </div>
                          <p className="text-[7px] text-blue-600 leading-relaxed">{primaryLink.explanation}</p>
                          {primaryLink.whyNot && (
                            <p className="text-[6px] text-blue-400 italic mt-0.5">↳ {primaryLink.whyNot}</p>
                          )}
                        </div>
                      )}
                      {/* Quick why-not for second priority */}
                      {mech.priority.length > 1 && (() => {
                        const second = mech.priority[1];
                        const secondF = FOUNDATIONS.find(f => f.id === second);
                        const secondLink = second ? mech.foundations[second] : null;
                        if (!secondF || !secondLink || !secondLink.whyNot) return null;
                        return (
                          <div className="text-[7px] text-slate-400 mb-0.5">
                            Not ② {secondF.label}? {secondLink.whyNot}
                          </div>
                        );
                      })()}
                      <div className="text-[6px] text-slate-300 italic mt-0.5 leading-tight">
                        Drag ◉ to the foundation you suspect · click arrow to confirm/wrong
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
