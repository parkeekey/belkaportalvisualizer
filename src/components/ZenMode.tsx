import { useCallback, useEffect, useRef, useState } from 'react';

interface ZenNote {
  id: string;
  text: string;
  x: number;
  y: number;
}

interface ZenArrow {
  id: string;
  fromNoteId: string;
  toFoundation: string;
  color: 'hypothesis' | 'confirmed' | 'wrong';
}

const FOUNDATIONS = [
  { id: 'grind', label: 'Grindsize', color: '#3b82f6', rank: 1, desc: 'most impact — surface area & extraction' },
  { id: 'ratio', label: 'Ratio', color: '#22c55e', rank: 2, desc: 'strength — water to coffee balance' },
  { id: 'turbulence', label: 'Turbulence', color: '#f59e0b', rank: 3, desc: 'agitation — pour height & flow' },
  { id: 'temp-time', label: 'Temp & Time', color: '#ef4444', rank: 4, desc: 'heat & contact duration' },
];

const ZEN_KEY = 'belka.zenMode';

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

let noteCounter = 0;

export default function ZenMode({ onClose }: { onClose?: () => void }) {
  const [notes, setNotes] = useState<ZenNote[]>(() => loadState().notes);
  const [arrows, setArrows] = useState<ZenArrow[]>(() => loadState().arrows);
  const [dragging, setDragging] = useState<{ noteId: string; offsetX: number; offsetY: number } | null>(null);
  const [connecting, setConnecting] = useState<{ fromNoteId: string; mouseX: number; mouseY: number } | null>(null);
  const [hoverDot, setHoverDot] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const noteElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const foundationElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [, setSvgSize] = useState({ w: 1200, h: 800 });

  useEffect(() => {
    saveState({ notes, arrows });
  }, [notes, arrows]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSvgSize({ w: Math.max(el.scrollWidth, r.width), h: Math.max(el.scrollHeight, r.height) });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, [notes.length]);

  const addNote = useCallback(() => {
    noteCounter++;
    const note: ZenNote = {
      id: `note-${Date.now()}-${noteCounter}`,
      text: 'my symptom...',
      x: 60 + (noteCounter % 5) * 40,
      y: 100 + (noteCounter % 4) * 80,
    };
    setNotes(prev => [...prev, note]);
  }, []);

  const updateNoteText = useCallback((id: string, text: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    setArrows(prev => prev.filter(a => a.fromNoteId !== id));
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
    const scroll = scrollRef.current;
    const sx = scroll ? scroll.scrollLeft : 0;
    const sy = scroll ? scroll.scrollTop : 0;
    setConnecting({ fromNoteId: noteId, mouseX: e.clientX + sx, mouseY: e.clientY + sy });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const scroll = scrollRef.current;
    const sx = scroll ? scroll.scrollLeft : 0;
    const sy = scroll ? scroll.scrollTop : 0;
    if (dragging) {
      setNotes(prev => prev.map(n =>
        n.id === dragging.noteId ? { ...n, x: e.clientX - dragging.offsetX + sx, y: e.clientY - dragging.offsetY + sy } : n
      ));
    }
    if (connecting) {
      setConnecting(prev => prev ? { ...prev, mouseX: e.clientX + sx, mouseY: e.clientY + sy } : null);
      // Check proximity to foundation dots
      const cx = e.clientX + sx;
      const cy = e.clientY + sy;
      let closest: string | null = null;
      let closestDist = 30;
      foundationElsRef.current.forEach((el, fid) => {
        const r = el.getBoundingClientRect();
        const scroll = scrollRef.current;
        const ssx = scroll ? scroll.scrollLeft : 0;
        const ssy = scroll ? scroll.scrollTop : 0;
        const dotX = r.left + ssx;
        const dotY = r.top + r.height / 2 + ssy;
        const dist = Math.sqrt((cx - dotX) ** 2 + (cy - dotY) ** 2);
        if (dist < closestDist) {
          closestDist = dist;
          closest = fid;
        }
      });
      setHoverDot(closest);
    }
  }, [dragging, connecting]);

  const getDotPos = (foundationId: string) => {
    const el = foundationElsRef.current.get(foundationId);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const scroll = scrollRef.current;
    const sx = scroll ? scroll.scrollLeft : 0;
    const sy = scroll ? scroll.scrollTop : 0;
    return { x: r.left + sx, y: r.top + r.height / 2 + sy };
  };

  const getNoteDotPos = (noteId: string) => {
    const el = noteElsRef.current.get(noteId);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const scroll = scrollRef.current;
    const sx = scroll ? scroll.scrollLeft : 0;
    const sy = scroll ? scroll.scrollTop : 0;
    return { x: r.left + r.width + sx, y: r.top + r.height / 2 + sy };
  };

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (connecting) {
      const scroll = scrollRef.current;
      const sx = scroll ? scroll.scrollLeft : 0;
      const sy = scroll ? scroll.scrollTop : 0;
      const cx = e.clientX + sx;
      const cy = e.clientY + sy;
      foundationElsRef.current.forEach((el, fid) => {
        const r = el.getBoundingClientRect();
        const dotX = r.left + sx;
        const dotY = r.top + r.height / 2 + sy;
        const dist = Math.sqrt((cx - dotX) ** 2 + (cy - dotY) ** 2);
          if (dist < 35) {
          setArrows(prev => {
            const exists = prev.some(a => a.fromNoteId === connecting.fromNoteId && a.toFoundation === fid);
            if (exists) return prev;
            return [...prev, { id: `arrow-${Date.now()}`, fromNoteId: connecting.fromNoteId, toFoundation: fid, color: 'hypothesis' }];
          });
        }
      });
    }
    setDragging(null);
    setConnecting(null);
    setHoverDot(null);
  }, [connecting]);

  const cycleArrowColor = useCallback((arrowId: string) => {
    setArrows(prev => prev.map(a => {
      if (a.id !== arrowId) return a;
      const next: Record<string, 'confirmed' | 'wrong' | 'hypothesis'> = {
        hypothesis: 'confirmed',
        confirmed: 'wrong',
        wrong: 'hypothesis',
      };
      return { ...a, color: next[a.color] };
    }));
  }, []);

  const deleteArrow = useCallback((arrowId: string) => {
    setArrows(prev => prev.filter(a => a.id !== arrowId));
  }, []);

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
        Drag notes to position · <span className="font-medium text-slate-500">Drag the dot ·</span> from a note toward a foundation's <span className="font-medium text-slate-500">○ dot</span> to connect · Click arrow: dashed (hypothesis) → green (confirmed) → red (wrong) · Right-click to delete
      </div>

      {/* Scrollable canvas */}
      <div ref={scrollRef} className="flex-1 overflow-auto"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setDragging(null); setConnecting(null); setHoverDot(null); }}
      >
        <div className="relative min-h-[1200px] w-full" style={{ minHeight: '150vh' }}>
          {/* SVG layer for arrows */}
          <svg ref={svgRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-0"
            style={{ minHeight: '150vh' }}
          >
            {arrows.map(a => {
              const fromP = getNoteDotPos(a.fromNoteId);
              const toP = getDotPos(a.toFoundation);
              if (!fromP || !toP) return null;
              return (
                <g key={a.id} className="pointer-events-auto cursor-pointer"
                  onClick={() => cycleArrowColor(a.id)}
                  onContextMenu={(e) => { e.preventDefault(); deleteArrow(a.id); }}
                >
                  <path d={arrowPath(fromP.x, fromP.y, toP.x, toP.y)}
                    fill="none" stroke={arrowColor(a.color)} strokeWidth={2.5} strokeDasharray={arrowStyle(a.color)}
                  />
                  <circle cx={toP.x} cy={toP.y} r={4} fill={arrowColor(a.color)} />
                  <path d={arrowPath(fromP.x, fromP.y, toP.x, toP.y)}
                    fill="none" stroke="transparent" strokeWidth={16}
                  />
                </g>
              );
            })}
            {/* Active connection line */}
            {connecting && (() => {
              const fromP = getNoteDotPos(connecting.fromNoteId);
              if (!fromP) return null;
              const targetP = hoverDot ? getDotPos(hoverDot) : null;
              const toX = targetP ? targetP.x : connecting.mouseX;
              const toY = targetP ? targetP.y : connecting.mouseY;
              return (
                <path d={arrowPath(fromP.x, fromP.y, toX, toY)}
                  fill="none" stroke={hoverDot ? '#3b82f6' : '#94a3b8'} strokeWidth={2.5} strokeDasharray="4,4"
                />
              );
            })()}
          </svg>

          {/* Foundations column — sticky on right */}
          <div className="absolute top-8 right-8 flex flex-col gap-5 z-10">
            {FOUNDATIONS.map(f => (
              <div key={f.id}
                ref={el => { if (el) foundationElsRef.current.set(f.id, el); else foundationElsRef.current.delete(f.id); }}
                data-foundation-id={f.id}
                className="flex items-center gap-0"
              >
                {/* Connection dot */}
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-150 -ml-2 mr-1.5 z-10
                    ${hoverDot === f.id ? 'scale-150 border-blue-500 bg-blue-100 shadow-lg shadow-blue-200' : 'border-slate-300 bg-white'}`}
                  style={{ borderColor: hoverDot === f.id ? '#3b82f6' : f.color + '80' }}
                >
                  <div className={`w-1.5 h-1.5 rounded-full transition-all duration-150
                    ${hoverDot === f.id ? 'bg-blue-500' : ''}`}
                    style={{ backgroundColor: hoverDot === f.id ? '#3b82f6' : f.color }}
                  />
                </div>
                {/* Card */}
                <div
                  className={`w-36 rounded-2xl border-2 flex flex-col items-center justify-center select-none cursor-default shadow-sm bg-white/90 px-3 py-2.5 transition-shadow duration-150
                    ${hoverDot === f.id ? 'shadow-md shadow-blue-200/50' : ''}`}
                  style={{ borderColor: hoverDot === f.id ? '#3b82f6' : f.color + '60' }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[7px] font-bold text-white"
                      style={{ backgroundColor: f.color }}
                    >{f.rank}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: f.color }}>{f.label}</span>
                  </div>
                  <span className="text-[8px] text-slate-400 mt-0.5 text-center leading-tight">{f.desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          {notes.map(note => (
            <div key={note.id} data-note-id={note.id}
              ref={el => { if (el) noteElsRef.current.set(note.id, el); else noteElsRef.current.delete(note.id); }}
              className="absolute z-20 bg-white rounded-xl shadow-md border border-slate-200 px-3 py-2 min-w-[160px] max-w-[220px] cursor-grab active:cursor-grabbing select-none"
              style={{ left: note.x, top: note.y }}
              onMouseDown={(e) => startDrag(note.id, e)}
            >
              <div className="flex items-start justify-between gap-1">
                <textarea
                  value={note.text}
                  onChange={(e) => updateNoteText(note.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-full text-[11px] text-slate-700 bg-transparent border-none outline-none resize-none leading-tight min-h-[20px] font-sans"
                  rows={1}
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  {/* Output connection dot */}
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
