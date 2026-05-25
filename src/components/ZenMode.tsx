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
  { id: 'grind', label: 'Grind', color: '#3b82f6' },
  { id: 'ratio', label: 'Ratio', color: '#22c55e' },
  { id: 'turbulence', label: 'Turbulence', color: '#f59e0b' },
  { id: 'time', label: 'Time', color: '#ef4444' },
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
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState({ left: 0, top: 0, width: 800, height: 600 });

  useEffect(() => {
    saveState({ notes, arrows });
  }, [notes, arrows]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setCanvasRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const addNote = useCallback(() => {
    noteCounter++;
    const note: ZenNote = {
      id: `note-${Date.now()}-${noteCounter}`,
      text: 'my symptom...',
      x: 40 + (noteCounter % 5) * 30,
      y: 80 + (noteCounter % 4) * 60,
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
    setDragging({ noteId, offsetX: e.clientX - note.x, offsetY: e.clientY - note.y });
  }, [notes]);

  const startConnect = useCallback((noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConnecting({ fromNoteId: noteId, mouseX: e.clientX, mouseY: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      setNotes(prev => prev.map(n =>
        n.id === dragging.noteId ? { ...n, x: e.clientX - dragging.offsetX, y: e.clientY - dragging.offsetY } : n
      ));
    }
    if (connecting) {
      setConnecting(prev => prev ? { ...prev, mouseX: e.clientX, mouseY: e.clientY } : null);
    }
  }, [dragging, connecting]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (connecting) {
      const foundationEls = document.querySelectorAll('[data-foundation-id]');
      let hit = false;
      foundationEls.forEach(el => {
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const fid = el.getAttribute('data-foundation-id');
          if (fid) {
            setArrows(prev => {
              const exists = prev.some(a => a.fromNoteId === connecting.fromNoteId && a.toFoundation === fid);
              if (exists) return prev;
              return [...prev, { id: `arrow-${Date.now()}`, fromNoteId: connecting.fromNoteId, toFoundation: fid, color: 'hypothesis' }];
            });
            hit = true;
          }
        }
      });
      if (!hit) {
        // if released on a note, delete it
        const noteEls = document.querySelectorAll('[data-note-id]');
        noteEls.forEach(el => {
          const r = el.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            const nid = el.getAttribute('data-note-id');
            if (nid && nid !== connecting.fromNoteId) {
              setArrows(prev => prev.filter(a => a.id !== nid));
            }
          }
        });
      }
    }
    setDragging(null);
    setConnecting(null);
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

  const notePos = (id: string) => {
    const n = notes.find(n => n.id === id);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  };

  const foundationPos = (id: string) => {
    const idx = FOUNDATIONS.findIndex(f => f.id === id);
    const fw = 130;
    const gap = 24;
    const totalH = FOUNDATIONS.length * fw + (FOUNDATIONS.length - 1) * gap;
    const startY = (canvasRect.height - totalH) / 2 + 60;
    return {
      x: canvasRect.width - 170,
      y: startY + idx * (fw + gap) + fw / 2,
    };
  };

  const arrowPath = (fromX: number, fromY: number, toX: number, toY: number) => {
    const dx = toX - fromX;
    const cp = dx * 0.5;
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
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white/70">
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
      <div className="px-4 py-1.5 text-[10px] text-slate-400 italic border-b border-slate-100 bg-[#f8f6f0] select-none">
        Drag notes to position · <span className="font-medium text-slate-500">Drag the dot ·</span> from a note to a foundation to connect · Click an arrow to cycle: dashed (hypothesis) → green (confirmed) → red (wrong)
      </div>

      {/* Canvas */}
      <div ref={canvasRef} className="flex-1 relative overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setDragging(null); setConnecting(null); }}
      >
        {/* SVG layer for arrows */}
        <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none z-0">
          {arrows.map(a => {
            const from = notePos(a.fromNoteId);
            const to = foundationPos(a.toFoundation);
            return (
              <g key={a.id} className="pointer-events-auto cursor-pointer"
                onClick={() => cycleArrowColor(a.id)}
                onContextMenu={(e) => { e.preventDefault(); deleteArrow(a.id); }}
              >
                <path d={arrowPath(from.x + 180, from.y + 14, to.x - 65, to.y)}
                  fill="none" stroke={arrowColor(a.color)} strokeWidth={2} strokeDasharray={arrowStyle(a.color)}
                />
                <circle cx={to.x - 65} cy={to.y} r={4} fill={arrowColor(a.color)} />
                {/* Invisible wider path for easier clicking */}
                <path d={arrowPath(from.x + 180, from.y + 14, to.x - 65, to.y)}
                  fill="none" stroke="transparent" strokeWidth={14}
                />
              </g>
            );
          })}
          {/* Active connection line */}
          {connecting && (() => {
            const from = notePos(connecting.fromNoteId);
            const toX = connecting.mouseX - canvasRect.left;
            const toY = connecting.mouseY - canvasRect.top;
            return (
              <path d={arrowPath(from.x + 180, from.y + 14, toX, toY)}
                fill="none" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4,4"
              />
            );
          })()}
        </svg>

        {/* Foundations (right side) */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col gap-6 z-10">
          {FOUNDATIONS.map(f => (
            <div key={f.id} data-foundation-id={f.id}
              className="w-28 h-28 rounded-2xl border-2 flex flex-col items-center justify-center select-none cursor-default shadow-sm bg-white/80"
              style={{ borderColor: f.color + '60' }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: f.color }}>{f.label}</span>
              <span className="text-[9px] text-slate-400 mt-0.5 text-center px-1 leading-tight">
                {f.id === 'grind' ? 'surface area' :
                 f.id === 'ratio' ? 'strength' :
                 f.id === 'turbulence' ? 'agitation' : 'contact'}
              </span>
            </div>
          ))}
        </div>

        {/* Notes */}
        {notes.map(note => (
          <div key={note.id} data-note-id={note.id}
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
                <div
                  className="w-3 h-3 rounded-full bg-slate-300 hover:bg-slate-400 cursor-crosshair inline-flex items-center justify-center text-[7px] text-white font-bold"
                  title="Drag to connect to a foundation"
                  onMouseDown={(e) => { e.stopPropagation(); startConnect(note.id, e); }}
                >·</div>
                <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                  className="w-3 h-3 rounded-full bg-slate-200 hover:bg-red-300 inline-flex items-center justify-center text-[7px] text-slate-400 hover:text-white font-bold leading-none"
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

      {/* Bottom bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-slate-200 bg-white/70">
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
