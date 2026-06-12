import { useState } from 'react';

export default function TurbulenceModel({ targetBrewTimeSec = 180, brewerType = 'V60', onBrewerChange, doseWeight = 18, grindSetting = 50 }: { targetBrewTimeSec?: number; brewerType?: string; onBrewerChange?: (v: string) => void; doseWeight?: number; grindSetting?: number }) {
  const [pourHeight, setPourHeight] = useState(10);
  const [pourRate, setPourRate] = useState(5);
  const [spoutType, setSpoutType] = useState<'narrow' | 'medium' | 'wide'>('medium');
  const [pattern, setPattern] = useState<'spiral' | 'center-pulse' | 'single-point'>('spiral');
  const [bloomTime, setBloomTime] = useState(30);
  const [bloomStyle, setBloomStyle] = useState<'gentle' | 'normal' | 'aggressive'>('normal');
  const [activeTactic, setActiveTactic] = useState<string | null>(null);
  const [activeSymptom, setActiveSymptom] = useState<string | null>(null);

  // --- Forchheimer velocity model ---
  const heightVel = (pourHeight - 4) / (20 - 4);
  const spoutVel = spoutType === 'narrow' ? 1 : spoutType === 'medium' ? 0.55 : 0.15;
  const patternVel = pattern === 'single-point' ? 1 : pattern === 'center-pulse' ? 0.6 : 0.3;
  const rateVel = (pourRate - 2) / (10 - 2);
  const rawV = 0.35 * heightVel + 0.3 * spoutVel + 0.2 * patternVel + 0.15 * rateVel;

  // Brewer geometry multiplier
  const brewerMultiplier =
    brewerType === 'Kalita Wave' ? 0.66 :
    brewerType === 'Chemex' ? 0.59 :
    brewerType === 'Aeropress' ? 1.73 :
    brewerType === 'French Press' ? 0.70 :
    1.0;

  // Bloom stability modifier
  const bloomStability = Math.min(0.7, (bloomTime / 60) * 0.5 + (bloomStyle === 'gentle' ? 0.2 : bloomStyle === 'aggressive' ? -0.2 : 0));
  const v = rawV * brewerMultiplier * (1 - bloomStability * 0.35);

  // Grind permeability factor — finer = less permeable, higher resistance
  const grindNorm = Math.max(0, Math.min(100, grindSetting)) / 100;
  const grindCoeff = 1 - grindNorm; // 0 at coarsest, 1 at finest
  const permFactor = 1 + grindCoeff * 0.8; // 1.0× at coarsest, 1.8× at finest

  // Forchheimer: ΔP/L = (μ/k)v + βρv²
  const darcyTerm = v * permFactor;
  const forchheimerTerm = v * v * 2.5 * permFactor * permFactor;
  const totalResistance = darcyTerm + forchheimerTerm;
  const turbDominance = totalResistance > 0 ? (forchheimerTerm / totalResistance) * 100 : 0;

  // Derived risks
  const clogRisk = Math.min(100, Math.round(v * v * 140 * permFactor));
  const clogLevel: 'Minimal' | 'Moderate' | 'High' | 'Critical' = clogRisk < 20 ? 'Minimal' : clogRisk < 45 ? 'Moderate' : clogRisk < 70 ? 'High' : 'Critical';
  const boundaryStrip = Math.round((v * (1 - v * v)) * 100);
  const sweetSpotCenter = 0.55 - (targetBrewTimeSec - 180) / 600 + (doseWeight - 18) / 36;
  const sweetSpotMin = Math.max(0.15, sweetSpotCenter - 0.2);
  const sweetSpotMax = Math.min(0.85, sweetSpotCenter + 0.25);
  const sweetSpot = v > sweetSpotMin && v < sweetSpotMax;

  const bedRiskLevel: 'Low' | 'Moderate' | 'High' | 'Critical' = turbDominance < 30 ? 'Low' : turbDominance < 55 ? 'Moderate' : turbDominance < 75 ? 'High' : 'Critical';

  const scoreColor = turbDominance < 30 ? '#22c55e' : turbDominance < 55 ? '#eab308' : turbDominance < 75 ? '#f97316' : '#ef4444';
  const clogColor = clogRisk < 20 ? '#22c55e' : clogRisk < 45 ? '#eab308' : clogRisk < 70 ? '#f97316' : '#ef4444';

  const contactTimeShift = Math.round((0.5 - v) * 30);

  const tactics = [
    { id: 'even-extraction', label: 'Even Extraction', desc: 'Wide spout + spiral pattern + moderate height', apply: () => { setSpoutType('wide'); setPattern('spiral'); setPourHeight(10); setPourRate(5); setActiveTactic('even-extraction'); } },
    { id: 'channel-reduction', label: 'Channeling Reduction', desc: 'Medium spout + spiral + low height', apply: () => { setSpoutType('medium'); setPattern('spiral'); setPourHeight(6); setPourRate(4); setActiveTactic('channel-reduction'); } },
    { id: 'no-agitation', label: 'No Agitation Pouring', desc: 'Wide spout + center-pulse + lowest height', apply: () => { setSpoutType('wide'); setPattern('center-pulse'); setPourHeight(4); setPourRate(3); setActiveTactic('no-agitation'); } },
    { id: 'bed-height', label: 'Bed Stabilization', desc: 'Wide spout + spiral + slow pour', apply: () => { setSpoutType('wide'); setPattern('spiral'); setPourHeight(6); setPourRate(3); setActiveTactic('bed-height'); } },
    { id: 'reduce-turb', label: 'Reduce Turbulence', desc: 'Medium spout + center-pulse + low height + slow', apply: () => { setSpoutType('medium'); setPattern('center-pulse'); setPourHeight(5); setPourRate(3); setActiveTactic('reduce-turb'); } },
  ];

  const tacticHints: Record<string, string> = {
    'even-extraction': 'Distributes water evenly across the bed. Best for washed and light roasts.',
    'channel-reduction': 'Minimises jet force to prevent channel formation. Use for naturals and dense beans.',
    'no-agitation': 'Pure gentle wetting — ideal for fragile or fermented processes that break apart easily.',
    'bed-height': 'Slows drawdown and keeps the bed structure intact. Good for high-altitude dense coffee.',
    'reduce-turbulence': 'General-purpose low-agitation approach. Default for unknown beans or troubleshooting.',
  };

  interface FixStep { action: string; detail: string; }
  interface Symptom { id: string; label: string; icon: string; diagnosis: string; steps: FixStep[]; apply: () => void; }

  const symptoms: Symptom[] = [
    {
      id: 'bitter',
      label: 'Bitter / Dry Finish',
      icon: '😖',
      diagnosis: 'Over-extraction — turbulence pushing fines through, causing channeling.',
      steps: [
        { action: '➊ Reduce pour height', detail: `Lower from ${pourHeight}cm → 5–6cm — less jet force` },
        { action: '➋ Switch to wide spout', detail: 'Spreads the stream, reduces bed penetration' },
        { action: '➌ Coarsen grind', detail: '1–2 steps coarser to slow extraction (switch to Grinder Setup)' },
        { action: '➍ Lower water temp', detail: 'Drop 1–2°C as last resort (switch to Brew Temperature)' },
      ],
      apply: () => { setSpoutType('wide'); setPattern('spiral'); setPourHeight(6); setPourRate(4); setActiveTactic('channel-reduction'); setActiveSymptom('bitter'); },
    },
    {
      id: 'hollow',
      label: 'Hollow / Weak Body',
      icon: '🫗',
      diagnosis: 'Under-extraction — turbulence too gentle, water bypasses the coffee.',
      steps: [
        { action: '➊ Raise pour height', detail: `Increase from ${pourHeight}cm → 12–14cm — more energy into bed` },
        { action: '➋ Switch to medium spout', detail: 'Narrower stream for deeper penetration' },
        { action: '➌ Grind finer', detail: '1–2 steps finer to increase contact time (switch to Grinder Setup)' },
        { action: '➍ Raise water temp', detail: 'Increase 1–2°C for more extraction power (switch to Brew Temperature)' },
      ],
      apply: () => { setSpoutType('medium'); setPattern('spiral'); setPourHeight(13); setPourRate(6); setActiveTactic(null); setActiveSymptom('hollow'); },
    },
    {
      id: 'astringent',
      label: 'Astringent / Tannic',
      icon: '🧃',
      diagnosis: 'Fines migration — jet force breaking particle structure, bed compaction.',
      steps: [
        { action: '➊ Lowest pour height', detail: `Drop to 4–5cm — minimal agitation` },
        { action: '➋ Widest spout + center-pulse', detail: 'Avoids digging into the bed' },
        { action: '➌ Coarsen grind', detail: 'Reduces fines generation (switch to Grinder Setup)' },
        { action: '➍ Use drip assist', detail: 'Removes pour technique from the equation entirely' },
      ],
      apply: () => { setSpoutType('wide'); setPattern('center-pulse'); setPourHeight(4); setPourRate(3); setActiveTactic('no-agitation'); setActiveSymptom('astringent'); },
    },
    {
      id: 'uneven',
      label: 'Uneven (Sour + Bitter)',
      icon: '🔀',
      diagnosis: 'Channeling — water found a fast path instead of extracting evenly.',
      steps: [
        { action: '➊ Full spiral pattern', detail: 'Distributes water across the whole bed' },
        { action: '➋ Lower pour height', detail: `Reduce from ${pourHeight}cm → 6–8cm — less jet channeling` },
        { action: '➌ Medium spout', detail: 'Balanced stream, not too narrow' },
        { action: '➍ Check grind consistency', detail: 'Burr alignment or fines might be the root cause' },
      ],
      apply: () => { setSpoutType('medium'); setPattern('spiral'); setPourHeight(7); setPourRate(4); setActiveTactic('even-extraction'); setActiveSymptom('uneven'); },
    },
    {
      id: 'sour',
      label: 'Sour / Under-ripe',
      icon: '🍋',
      diagnosis: 'Not enough energy — turbulence too low to extract solubles efficiently.',
      steps: [
        { action: '➊ Raise pour height', detail: `Increase to 14–16cm — more jet force` },
        { action: '➋ Switch to narrow spout', detail: 'Concentrated stream for deeper extraction' },
        { action: '➌ Grind finer', detail: 'Increases surface area and contact time (switch to Grinder Setup)' },
        { action: '➍ Raise water temp', detail: '3–4°C higher as final resort (switch to Brew Temperature)' },
      ],
      apply: () => { setSpoutType('narrow'); setPattern('spiral'); setPourHeight(15); setPourRate(7); setActiveTactic(null); setActiveSymptom('sour'); },
    },
  ];

  return (
    <div className="space-y-3">
      {/* Bed visualization — side + top view */}
      <div className="flex gap-2">
        <div className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 overflow-hidden">
          <svg viewBox="0 0 200 160" className="w-full h-32">
          {(() => {
            const BED_Y = 90;
            const bedHeight = Math.max(15, Math.min(70, Math.round(40 * doseWeight / 18)));
            const BED_BOT = BED_Y + bedHeight;
            const BRIM = BED_BOT + 10;

            interface BrShape { tlX: number; trX: number; blX: number; brX: number; }
            const br: BrShape =
              brewerType === 'Flat Bottom' ? { tlX: 35, trX: 165, blX: 65, brX: 135 } :
              brewerType === 'Kalita Wave' ? { tlX: 30, trX: 170, blX: 60, brX: 140 } :
              brewerType === 'Chemex' ? { tlX: 55, trX: 145, blX: 82, brX: 118 } :
              brewerType === 'Aeropress' ? { tlX: 72, trX: 128, blX: 72, brX: 128 } :
              brewerType === 'French Press' ? { tlX: 20, trX: 180, blX: 20, brX: 180 } :
              { tlX: 40, trX: 160, blX: 97, brX: 103 }; // V60 / Other

            const wallX = (y: number) => ({
              l: br.tlX + (br.blX - br.tlX) * (y - 10) / (BRIM - 10),
              r: br.trX + (br.brX - br.trX) * (y - 10) / (BRIM - 10),
            });

            const waterTopY = 20 + (1 - v) * 20;
            const wt = wallX(waterTopY);
            const wBot = wallX(BED_Y);

            return (
              <g>
                {/* Brewer outline */}
                <path d={`M${br.tlX} 10 L${br.trX} 10 L${br.brX} ${BRIM} L${br.blX} ${BRIM} Z`} fill="none" stroke="#475569" strokeWidth="1" opacity="0.4" />

                {/* Water body (follows walls) */}
                <polygon points={`${wt.l + 2},${waterTopY} ${wt.r - 2},${waterTopY} ${wBot.r - 2},${BED_Y} ${wBot.l + 2},${BED_Y}`} fill="rgba(56,189,248,0.15)" />

                {/* Coffee bed (trapezoid matching cone walls) */}
                {(() => {
                  const bt = wallX(BED_Y);
                  const bb = wallX(BED_BOT);
                  return (
                    <polygon points={`${bt.l + 3},${BED_Y} ${bt.r - 3},${BED_Y} ${bb.r - 3},${BED_BOT + 5} ${bb.l + 3},${BED_BOT + 5}`} fill="url(#bedGrad)" />
                  );
                })()}
                <defs>
                  <linearGradient id="bedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5E3C" />
                    <stop offset="40%" stopColor="#6B3A2A" />
                    <stop offset="100%" stopColor="#4A2518" />
                  </linearGradient>
                </defs>

                {/* Clog layer at bottom of bed */}
                {clogLevel !== 'Minimal' && (() => {
                  const bb = wallX(BED_BOT);
                  const bm = wallX(BED_BOT - 10);
                  return (
                    <polygon points={`${bm.l + 3},${BED_BOT - 10} ${bm.r - 3},${BED_BOT - 10} ${bb.r - 3},${BED_BOT + 5} ${bb.l + 3},${BED_BOT + 5}`} fill={clogLevel === 'Moderate' ? '#d97706' : clogLevel === 'High' ? '#ea580c' : '#dc2626'} opacity={clogRisk / 140} />
                  );
                })()}

                {/* Boundary layer stripping glow */}
                {v > 0.15 && (() => {
                  const bt = wallX(BED_Y);
                  const bs = wallX(BED_Y + 6);
                  return (
                    <polygon points={`${bt.l + 3},${BED_Y} ${bt.r - 3},${BED_Y} ${bs.r - 3},${BED_Y + 6} ${bs.l + 3},${BED_Y + 6}`} fill="#22d65e" opacity={boundaryStrip / 200} />
                  );
                })()}

                {/* Bed surface irregularity based on turbulence */}
                {(() => {
                  const bt = wallX(BED_Y);
                  const bb = wallX(BED_BOT);
                  const surf = [];
                  for (let x = bt.l + 4; x < bt.r - 4; x += 4) {
                    const wave = Math.sin(x * 0.2 + v * 10) * (v * 4);
                    surf.push({ x, y: BED_Y + (wave < 0 ? wave : 0) });
                  }
                  return (
                    <path d={surf.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ') + ` L${bb.r - 3} ${BED_BOT + 5} L${bb.l + 3} ${BED_BOT + 5} Z`} fill="rgba(239,68,68,0.15)" opacity={v > 0.5 ? 0.6 : 0} />
                  );
                })()}

                {/* Forchheimer turbulence visualization */}
                {turbDominance > 40 && (
                  (() => {
                    const count = Math.floor(turbDominance / 20);
                    const paths = [];
                    for (let i = 0; i < count; i++) {
                      const x = br.blX + 10 + i * 12 + Math.sin(i * 2 + v * 5) * 8;
                      paths.push(
                        <path key={i} d={`M${x} ${BED_Y - 2} Q${x + 8} ${BED_Y + 10} ${x - 4} ${BED_Y + 20} T${x + 2} ${BED_Y + 35}`} fill="none" stroke={scoreColor} strokeWidth={0.5 + i * 0.2} opacity={0.3 + i * 0.08} strokeDasharray="2 3" />
                      );
                    }
                    return paths;
                  })()
                )}

                {/* Jet stream */}
                {(() => {
                  const jetY = 12;
                  const tipY = 45 + (1 - heightVel) * 38;
                  const jetWidth = spoutType === 'narrow' ? 3 : spoutType === 'medium' ? 7 : 12;
                  const clr = spoutType === 'narrow' ? '#60a5fa' : spoutType === 'medium' ? '#38bdf8' : '#22d3ee';
                  return <line x1={100} y1={jetY} x2={100} y2={tipY} stroke={clr} strokeWidth={jetWidth} strokeLinecap="round" opacity={0.5} />;
                })()}

                {/* Brewer-specific extras */}
                {brewerType === 'Kalita Wave' && (
                  <>
                    <circle cx={br.blX + (br.brX - br.blX) * 0.25} cy={BRIM + 2} r={2} fill="#475569" opacity={0.6} />
                    <circle cx={(br.blX + br.brX) / 2} cy={BRIM + 2} r={2} fill="#475569" opacity={0.6} />
                    <circle cx={br.brX - (br.brX - br.blX) * 0.25} cy={BRIM + 2} r={2} fill="#475569" opacity={0.6} />
                  </>
                )}
                {brewerType === 'Chemex' && (
                  <>
                    <path d={`M${br.blX - 2} ${BED_BOT + 2} L${br.brX + 2} ${BED_BOT + 2}`} stroke="#64748b" strokeWidth="3" opacity={0.5} strokeLinecap="round" />
                    <path d={`M${br.blX - 2} ${BED_BOT + 5} L${br.brX + 2} ${BED_BOT + 5}`} stroke="#64748b" strokeWidth="1" opacity={0.3} strokeLinecap="round" />
                  </>
                )}
                {brewerType === 'Aeropress' && (
                  <>
                    <line x1={br.tlX - 2} y1={10} x2={br.trX + 2} y2={10} stroke="#64748b" strokeWidth="2" opacity={0.6} strokeLinecap="round" />
                    <line x1={100} y1={10} x2={100} y2={25} stroke="#94a3b8" strokeWidth="2" opacity={0.4} strokeLinecap="round" />
                    <rect x={br.blX - 2} y={BED_BOT - 5} width={br.brX - br.blX + 4} height={6} rx={1} fill="none" stroke="#64748b" strokeWidth="1" opacity={0.5} />
                  </>
                )}
                {brewerType === 'French Press' && (
                  <>
                    <line x1={100} y1={10} x2={100} y2={BED_Y + 5} stroke="#94a3b8" strokeWidth="1.5" opacity={0.35} strokeLinecap="round" />
                    <line x1={br.tlX + 8} y1={BED_Y + 5} x2={br.trX - 8} y2={BED_Y + 5} stroke="#64748b" strokeWidth="1" opacity={0.4} strokeLinecap="round" />
                    <line x1={br.tlX + 8} y1={BED_Y + 8} x2={br.trX - 8} y2={BED_Y + 8} stroke="#64748b" strokeWidth="1" opacity={0.3} strokeLinecap="round" strokeDasharray="1 2" />
                  </>
                )}
                {brewerType === 'Flat Bottom' && (
                  <line x1={br.blX + 5} y1={BRIM - 2} x2={br.brX - 5} y2={BRIM - 2} stroke="#475569" strokeWidth="1.5" opacity={0.5} strokeLinecap="round" />
                )}
                {/* Labels */}
                <text x={100} y={5} textAnchor="middle" fill="#94a3b8" fontSize="7" fontFamily="monospace">⏱ {contactTimeShift >= 0 ? `+${contactTimeShift}s` : `${contactTimeShift}s`}</text>
                <text x={195} y={BED_Y + 10} textAnchor="end" fill="#94a3b8" fontSize="6" fontFamily="monospace">{bedRiskLevel === 'Low' ? 'laminar' : bedRiskLevel === 'Moderate' ? 'mixed' : bedRiskLevel === 'High' ? 'turb' : '⛔'}</text>
                <text x={100} y={BRIM + 15} textAnchor="middle" fill="#64748b" fontSize="6" fontFamily="monospace">Forchheimer: v·{darcyTerm.toFixed(2)} + v²·{forchheimerTerm.toFixed(2)}</text>
                {/* Bed depth label */}
                <line x1={br.brX + 4} y1={BED_Y} x2={br.brX + 4} y2={BED_BOT} stroke="#64748b" strokeWidth="1" opacity={0.5} />
                <line x1={br.brX + 2} y1={BED_Y} x2={br.brX + 7} y2={BED_Y} stroke="#64748b" strokeWidth="1" opacity={0.5} />
                <line x1={br.brX + 2} y1={BED_BOT} x2={br.brX + 7} y2={BED_BOT} stroke="#64748b" strokeWidth="1" opacity={0.5} />
                <text x={br.brX + 12} y={(BED_Y + BED_BOT) / 2 + 2} textAnchor="start" fill="#94a3b8" fontSize="6" fontFamily="monospace">{doseWeight}g / {((BED_BOT - BED_Y) / 40 * 2).toFixed(1)}cm</text>
              </g>
            );
          })()}
        </svg>
      </div>
      <div className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 overflow-hidden">
        <svg viewBox="0 0 200 160" className="w-full h-32">
          <circle cx={100} cy={80} r={65} fill="none" stroke="#475569" strokeWidth="1" opacity="0.4" />
          <circle cx={100} cy={80} r={50} fill="none" stroke="#475569" strokeWidth="0.5" opacity="0.2" strokeDasharray="2 3" />
          <circle cx={100} cy={80} r={35} fill="none" stroke="#475569" strokeWidth="0.5" opacity="0.2" strokeDasharray="2 3" />
          <circle cx={100} cy={80} r={20} fill="none" stroke="#475569" strokeWidth="0.5" opacity="0.2" strokeDasharray="2 3" />
          {pattern === 'spiral' && (() => {
            const pts = [];
            for (let t = 0; t < 40; t++) {
              const angle = t * 0.6;
              const r = 8 + t * 1.5;
              pts.push({ x: 100 + r * Math.cos(angle), y: 80 + r * Math.sin(angle) });
            }
            const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
            return <path d={d} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" opacity={0.8} />;
          })()}
          {pattern === 'center-pulse' && (
            (() => {
              const rings = [];
              for (let i = 0; i < 5; i++) {
                const r = 12 + i * 12;
                rings.push(<circle key={i} cx={100} cy={80} r={r} fill="none" stroke="#38bdf8" strokeWidth={2 - i * 0.3} opacity={0.7 - i * 0.1} strokeDasharray={i % 2 === 0 ? '4 3' : 'none'} />);
              }
              return rings;
            })()
          )}
          {pattern === 'single-point' && (
            <>
              <circle cx={100} cy={80} r={4} fill="#38bdf8" opacity={0.9} />
              <circle cx={100} cy={80} r={12} fill="none" stroke="#38bdf8" strokeWidth="1.5" opacity={0.4} strokeDasharray="2 3" />
              <line x1={100} y1={80} x2={100} y2={60} stroke="#38bdf8" strokeWidth="1" opacity={0.3} strokeDasharray="2 2" />
              <line x1={100} y1={80} x2={100} y2={100} stroke="#38bdf8" strokeWidth="1" opacity={0.3} strokeDasharray="2 2" />
              <line x1={100} y1={80} x2={80} y2={80} stroke="#38bdf8" strokeWidth="1" opacity={0.3} strokeDasharray="2 2" />
              <line x1={100} y1={80} x2={120} y2={80} stroke="#38bdf8" strokeWidth="1" opacity={0.3} strokeDasharray="2 2" />
            </>
          )}
          <text x={100} y={155} textAnchor="middle" fill="#64748b" fontSize="7" fontFamily="monospace">{pattern === 'spiral' ? 'spiral distributes' : pattern === 'center-pulse' ? 'center-pulse penetrates' : 'single-point digs'}</text>
          <text x={100} y={5} textAnchor="middle" fill="#94a3b8" fontSize="7" fontFamily="monospace">spout: {spoutType}</text>
        </svg>
      </div>
      </div>

      {/* Brewer selector */}
      {onBrewerChange && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-400">Brewer</label>
          <select value={brewerType} onChange={(e) => onBrewerChange(e.target.value)} className="text-[11px] px-2 py-1 border border-slate-300 dark:border-slate-600 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="V60">V60</option>
            <option value="Chemex">Chemex</option>
            <option value="Kalita Wave">Kalita Wave</option>
            <option value="Flat Bottom">Flat Bottom</option>
            <option value="Aeropress">Aeropress</option>
            <option value="French Press">French Press</option>
            <option value="Other">Other</option>
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-400">Pour Height</label>
          <div className="flex items-center gap-1">
            <input type="range" min={4} max={20} step={0.5} value={pourHeight} onChange={(e) => setPourHeight(parseFloat(e.target.value))} className="flex-1 accent-orange-500" />
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 tabular-nums w-8 text-right">{pourHeight}cm</span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-400">Pour Rate</label>
          <div className="flex items-center gap-1">
            <input type="range" min={2} max={10} step={0.5} value={pourRate} onChange={(e) => setPourRate(parseFloat(e.target.value))} className="flex-1 accent-orange-500" />
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 tabular-nums w-10 text-right">{pourRate}ml/s</span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-400">Spout Type</label>
          <div className="flex gap-1">
            {(['narrow', 'medium', 'wide'] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSpoutType(s)} className={`text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors capitalize ${spoutType === s ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-400 border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-400">Pour Pattern</label>
          <div className="flex gap-1">
            {(['spiral', 'center-pulse', 'single-point'] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPattern(p)} className={`text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors capitalize ${pattern === p ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-400 border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}>{p === 'center-pulse' ? 'Center' : p === 'single-point' ? 'Single' : 'Spiral'}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Bloom / Pre-infusion */}
      <div className="bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg p-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider">🌱 Bloom / Pre-infusion</span>
          {bloomStability > 0.3 && <span className="text-[8px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 dark:border-emerald-800 rounded-md px-1 py-0.5">Stabilizing</span>}
          {bloomStability < 0 && <span className="text-[8px] font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 dark:bg-red-900/20 border border-red-200 rounded-md px-1 py-0.5">Destabilizing</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-medium">Bloom Time</label>
            <div className="flex items-center gap-1">
              <input type="range" min={0} max={60} step={5} value={bloomTime} onChange={(e) => setBloomTime(parseInt(e.target.value))} className="flex-1 accent-sky-500" />
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300 tabular-nums w-8 text-right">{bloomTime}s</span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-slate-400 dark:text-slate-500 dark:text-slate-500 font-medium">Bloom Pour</label>
            <div className="flex gap-1">
              {(['gentle', 'normal', 'aggressive'] as const).map((b) => (
                <button key={b} type="button" onClick={() => setBloomStyle(b)} className={`text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors capitalize ${bloomStyle === b ? 'bg-sky-100 text-sky-700 border-sky-300' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-400 border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}>{b}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="text-[9px] text-slate-500 dark:text-slate-400 dark:text-slate-400 mt-1 leading-tight">
          {bloomTime === 0 ? 'No bloom — bed is dry when main pour starts, highest channeling risk' :
           bloomTime < 20 ? `Short bloom (${bloomTime}s) — partial saturation, moderate stability gain` :
           bloomTime < 40 ? `Standard bloom (${bloomTime}s) — bed well saturated, good stability` :
           `Long bloom (${bloomTime}s) — deep saturation, max stability`}
          {bloomStyle !== 'normal' && ` · ${bloomStyle === 'gentle' ? 'Gentle pour preserves bed structure' : 'Aggressive pour risks bed damage during bloom'}`}
          {bloomStability > 0 && ` · Effective v reduced by ${Math.round(bloomStability * 35)}%`}
        </div>
      </div>

      {/* Grind Adjustment plan */}
      <div className="bg-amber-50 dark:bg-amber-900/20 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 dark:border-amber-800 rounded-lg p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-amber-800 dark:text-amber-200 dark:text-amber-200 uppercase tracking-wider">Grind</span>
            <span className="text-[11px] font-mono text-amber-900">{grindSetting < 33 ? 'Finer' : grindSetting < 66 ? 'Neutral' : 'Coarser'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-amber-700 font-mono">perm ×{permFactor.toFixed(2)}</span>
            <span className="text-[9px] text-slate-500 dark:text-slate-400 dark:text-slate-400 font-mono">{grindNorm < 0.3 ? 'fine' : grindNorm < 0.7 ? 'medium' : 'coarse'}</span>
          </div>
        </div>
        <div className="mt-1 h-1.5 bg-amber-200 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(1 - grindCoeff) * 100}%`, background: 'linear-gradient(to right, #78716c, #d97706)' }} />
        </div>
        <div className="flex justify-between text-[8px] text-amber-600 dark:text-amber-400 dark:text-amber-400 mt-0.5">
          <span>Fine</span>
          <span>Coarse</span>
        </div>
      </div>

      {/* Forchheimer meter — Darcy vs Turbulence split */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 dark:text-slate-500 uppercase tracking-wider">Forchheimer Balance</span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-500 dark:text-slate-400 dark:text-slate-400 font-mono">v = {v.toFixed(2)}</span>
            {brewerMultiplier !== 1.0 && <span className="text-[8px] text-sky-400 font-mono">×{brewerMultiplier.toFixed(2)} ({brewerType})</span>}
            {bloomStability > 0 && <span className="text-[8px] text-sky-400 font-mono">raw {rawV.toFixed(2)}</span>}
            {grindCoeff > 0 && <span className="text-[8px] text-amber-400 font-mono">perm ×{permFactor.toFixed(2)}</span>}
          </div>
        </div>
        <div className="relative h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
          <div className="absolute inset-0 flex">
            <div className="h-full transition-all duration-300" style={{ width: `${(darcyTerm / totalResistance) * 100}%`, background: 'linear-gradient(to right, #3b82f6, #60a5fa)' }} />
            <div className="h-full transition-all duration-300" style={{ width: `${(forchheimerTerm / totalResistance) * 100}%`, background: 'linear-gradient(to right, #f97316, #ef4444)' }} />
          </div>
        </div>
        <div className="flex justify-between text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-400 mt-0.5 font-mono">
          <span>Darcy (laminar) <span className="text-blue-400">{Math.round((darcyTerm / totalResistance) * 100)}%</span></span>
          <span>Forchheimer (turbulent) <span className="text-orange-400">{Math.round((forchheimerTerm / totalResistance) * 100)}%</span></span>
        </div>
        <button type="button" onClick={() => {
          const targetV = 0.55 - (targetBrewTimeSec - 180) / 600;
          const clampedV = Math.max(0.2, Math.min(0.8, targetV));
          const neededHeightVel = (clampedV - 0.3 * 0.55 - 0.2 * 0.3 - 0.15 * 0.375) / 0.35;
          const h = Math.round(Math.max(4, Math.min(20, 4 + neededHeightVel * 16)) * 2) / 2;
          setPourHeight(h);
          setSpoutType('medium');
          setPattern('spiral');
          setPourRate(5);
          setBloomTime(Math.min(45, Math.max(15, Math.round(targetBrewTimeSec / 6))));
          setBloomStyle('gentle');
        }} className="mt-1.5 w-full text-[10px] font-bold text-emerald-400 bg-emerald-900/30 hover:bg-emerald-800/40 border border-emerald-700/50 rounded-md px-2 py-1 transition-colors">
          🎯 Sweet Spot for {Math.floor(targetBrewTimeSec / 60)}:{String(targetBrewTimeSec % 60).padStart(2, '0')} brew
        </button>
      </div>

      {/* Triple metrics: Strip benefit · Clog risk · Bed state */}
      <div className="flex items-stretch gap-2">
        <div className={`flex-1 rounded-lg border p-2 ${sweetSpot ? 'bg-emerald-50 dark:bg-emerald-900/20 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 dark:border-emerald-800' : boundaryStrip > 25 ? 'bg-amber-50 dark:bg-amber-900/20 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 dark:border-amber-800' : 'bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 dark:border-slate-700'}`}>
          <span className="text-[9px] uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400 dark:text-slate-400">Boundary Strip</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="flex-1 h-2 bg-white dark:bg-slate-800 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 dark:border-slate-700">
              <div className="h-full rounded-full bg-emerald-400 transition-all duration-300" style={{ width: `${Math.min(100, boundaryStrip)}%` }} />
            </div>
            <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-300 dark:text-slate-300">{boundaryStrip}%</span>
          </div>
          {sweetSpot && <div className="text-[8px] text-emerald-600 font-semibold mt-0.5">✦ Sweet spot for {Math.floor(targetBrewTimeSec / 60)}:{String(targetBrewTimeSec % 60).padStart(2, '0')} brew</div>}
        </div>
        <div className={`flex-1 rounded-lg border p-2 ${clogLevel === 'Minimal' ? 'bg-emerald-50 dark:bg-emerald-900/20 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 dark:border-emerald-800' : clogLevel === 'Moderate' ? 'bg-amber-50 dark:bg-amber-900/20 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 dark:border-amber-800' : clogLevel === 'High' ? 'bg-orange-50 border-orange-200' : 'bg-red-50 dark:bg-red-900/20 dark:bg-red-900/20 border-red-200'}`}>
          <span className="text-[9px] uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400 dark:text-slate-400">Clog Risk (v²·k⁻¹)</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="flex-1 h-2 bg-white dark:bg-slate-800 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 dark:border-slate-700">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${clogRisk}%`, background: clogColor }} />
            </div>
            <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-300 dark:text-slate-300">{clogRisk}%</span>
          </div>
          <div className="text-[8px] text-slate-500 dark:text-slate-400 dark:text-slate-400 mt-0.5">{clogLevel === 'Minimal' ? 'Permeability stable' : clogLevel === 'Moderate' ? 'Fines starting to pack' : clogLevel === 'High' ? 'Permeability dropping — brew may stall' : 'Critical — bed is sealing shut'}</div>
        </div>
      </div>

      <div className="flex items-stretch gap-2">
        <div className={`flex-1 rounded-lg border p-2 ${bedRiskLevel === 'Low' ? 'bg-emerald-50 dark:bg-emerald-900/20 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 dark:border-emerald-800' : bedRiskLevel === 'Moderate' ? 'bg-amber-50 dark:bg-amber-900/20 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 dark:border-amber-800' : bedRiskLevel === 'High' ? 'bg-orange-50 border-orange-200' : 'bg-red-50 dark:bg-red-900/20 dark:bg-red-900/20 border-red-200'}`}>
          <span className="text-[9px] uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400 dark:text-slate-400">Turbulence Dominance</span>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 h-2 bg-white dark:bg-slate-800 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 dark:border-slate-700">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${turbDominance}%`, background: scoreColor }} />
            </div>
            <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-300 dark:text-slate-300">{Math.round(turbDominance)}%</span>
          </div>
        </div>
        <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg p-2">
          <span className="text-[9px] uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400 dark:text-slate-400">Flow Regime</span>
          <div className="text-sm font-bold mt-0.5" style={{ color: turbDominance < 30 ? '#16a34a' : turbDominance < 55 ? '#d97706' : turbDominance < 75 ? '#ea580c' : '#dc2626' }}>
            {turbDominance < 30 ? 'Laminar (Darcy)' : turbDominance < 55 ? 'Transitional' : turbDominance < 75 ? 'Turbulent (Forchheimer)' : 'Chaotic'}
          </div>
        </div>
      </div>

      <div className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg p-2 flex items-center gap-2">
        <span className="font-semibold">Contact Time:</span>
        <span className={`font-bold ${contactTimeShift >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {contactTimeShift >= 0 ? `+${contactTimeShift}s` : `${contactTimeShift}s`}
        </span>
        <span className="text-slate-300 dark:text-slate-600 dark:text-slate-600">|</span>
        <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">
          {(() => {
            const brewMin = Math.floor(targetBrewTimeSec / 60);
            const brewSec = targetBrewTimeSec % 60;
            const brewStr = `${brewMin}:${String(brewSec).padStart(2, '0')}`;
            if (sweetSpot) return `✦ Ideal for ${brewStr} — boundary stripped, bed intact`;
            if (v < sweetSpotMin) return `Turbulence too gentle for ${brewStr} brew — raise pour height`;
            if (clogRisk > 60) return `Clog risk high for ${brewStr} — fines packing the filter`;
            return `Turbulence too aggressive for ${brewStr} — reduce pour height or widen spout`;
          })()}
        </span>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-400 mb-1 block">Fix by Tactic</label>
        <div className="flex flex-wrap gap-1.5">
          {tactics.map((t) => (
            <button key={t.id} type="button" onClick={() => { if (activeTactic === t.id) { setActiveTactic(null); } else { t.apply(); } }} className={`text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors ${activeTactic === t.id ? 'bg-orange-100 text-orange-700 border-orange-300 shadow-sm' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-400 border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800 dark:bg-slate-900/50'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {activeTactic && tacticHints[activeTactic] && (
          <div className="mt-1.5 text-[10px] text-orange-600 bg-orange-50 border border-orange-200 rounded-lg p-2 leading-relaxed">
            {tacticHints[activeTactic]}
          </div>
        )}
      </div>

      <div>
        <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-400 mb-1 block">Fix by Taste</label>
        <div className="flex flex-wrap gap-1.5">
          {symptoms.map((s) => (
            <button key={s.id} type="button" onClick={() => { if (activeSymptom === s.id) { setActiveSymptom(null); } else { s.apply(); } }} className={`text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors ${activeSymptom === s.id ? 'bg-red-100 text-red-700 border-red-300 shadow-sm' : 'bg-white dark:bg-slate-800 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-400 border-slate-200 dark:border-slate-700 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 dark:bg-red-900/20 dark:hover:bg-red-900/20 dark:bg-red-900/20'}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        {activeSymptom && (() => {
          const s = symptoms.find(x => x.id === activeSymptom);
          if (!s) return null;
          return (
            <div className="mt-1.5 space-y-1">
              <div className="text-[10px] text-red-700 bg-red-50 dark:bg-red-900/20 dark:bg-red-900/20 border border-red-200 rounded-lg p-2 leading-relaxed">
                <span className="font-bold">{s.diagnosis}</span>
              </div>
              <div className="bg-white dark:bg-slate-800 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:border-slate-700 rounded-lg p-2 space-y-0.5">
                {s.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[10px]">
                    <span className={`font-bold shrink-0 ${i === 0 ? 'text-emerald-600' : 'text-slate-400 dark:text-slate-500 dark:text-slate-500'}`}>{step.action}</span>
                    <span className="text-slate-500 dark:text-slate-400 dark:text-slate-400">{step.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Turbulence Plan Summary */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 dark:border-emerald-800 rounded-lg p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 dark:text-emerald-400 uppercase tracking-wider">📋 Turbulence Plan</span>
          <button type="button" onClick={() => {
            const plan = {
              pourHeight, pourRate, spoutType, pattern,
              bloomTime, bloomStyle,
              v: parseFloat(v.toFixed(3)),
              rawV: parseFloat(rawV.toFixed(3)),
              turbDominance: Math.round(turbDominance),
              clogRisk,
              boundaryStrip,
              flowRegime: turbDominance < 30 ? 'Laminar (Darcy)' : turbDominance < 55 ? 'Transitional' : turbDominance < 75 ? 'Turbulent (Forchheimer)' : 'Chaotic',
              sweetSpot,
              bedRiskLevel,
              targetBrewTimeSec,
            };
            localStorage.setItem('belkaTurbulencePlan', JSON.stringify(plan));
            alert('✅ Turbulence plan imported to Recipe & Pour Planning');
          }} className="text-[9px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:bg-emerald-900/30 hover:bg-emerald-200 border border-emerald-300 dark:border-emerald-700 dark:border-emerald-700 rounded-md px-2 py-0.5 transition-colors">⬆ Import to Recipe</button>
        </div>
        <div className="grid grid-cols-3 gap-1 text-[9px] text-slate-600 dark:text-slate-400 dark:text-slate-400">
          <div><span className="font-semibold">Pour:</span> {pourHeight}cm · {pourRate}ml/s · {spoutType} · {pattern}</div>
          <div><span className="font-semibold">Bloom:</span> {bloomTime}s · {bloomStyle}</div>
          <div><span className="font-semibold">v:</span> {v.toFixed(2)} <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">(raw {rawV.toFixed(2)})</span></div>
          <div><span className="font-semibold">Turb:</span> {Math.round(turbDominance)}% · {turbDominance < 30 ? 'Laminar' : turbDominance < 55 ? 'Transitional' : turbDominance < 75 ? 'Turbulent' : 'Chaotic'}</div>
          <div><span className="font-semibold">Bed:</span> {bedRiskLevel} · Clog {clogRisk}%</div>
          <div><span className="font-semibold">Strip:</span> {boundaryStrip}% {sweetSpot ? '✦ Sweet spot' : ''}</div>
        </div>
      </div>
    </div>
  );
}
