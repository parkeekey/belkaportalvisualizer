import { useState } from 'react';

interface Props {
  drainRate: number;
  finesPct: number;
  micronSetting: number;
  grindSetting: number;
  ratio: number;
  waterVol: number;
  dose: number;
  pourHeightCm: number;
  pourRate: number;
  channelRisk: number;
  turbulenceTerm: number;
  waterTempC: number;
}

function pct(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function barColor(v: number) {
  if (v >= 70) return 'bg-emerald-500';
  if (v >= 40) return 'bg-amber-400';
  return 'bg-red-400';
}

function labelColor(v: number) {
  if (v >= 70) return 'text-emerald-700 dark:text-emerald-400 dark:text-emerald-400';
  if (v >= 40) return 'text-amber-700';
  return 'text-red-600';
}

type AdviceKey = 'grind' | 'ratio' | 'turb' | 'temp';

function grindAdvice(drainRate: number, finesPct: number, grindSetting: number): string {
  if (drainRate < 0.4) return `Go coarser 2-3 clicks (#${Math.min(40, grindSetting + 3)}) ΓÇö drain is too slow, fines are clogging the bed`;
  if (drainRate < 0.7) return `Go coarser 1 click (#${Math.min(40, grindSetting + 1)}) ΓÇö drain is sluggish`;
  if (drainRate > 4) return `Go finer 2-3 clicks (#${Math.max(1, grindSetting - 3)}) ΓÇö water is flushing through too quickly`;
  if (drainRate > 2.5) return `Go finer 1 click (#${Math.max(1, grindSetting - 1)}) ΓÇö flow is too fast`;
  if (finesPct > 15) return `Fines are high (${finesPct.toFixed(0)}%) ΓÇö try a cleaner burr profile or tighter distribution`;
  return 'Grind is in the sweet spot for this dose and pour';
}

function ratioAdvice(ratio: number): string {
  if (ratio < 9) return 'Very tight ratio ΓÇö ristretto range, expect high TDS concentration and lower EY';
  if (ratio < 12) return 'Tight ratio ΓÇö increase to 1:14-1:15 for more forgiving TDS/EY balance';
  if (ratio < 14) return 'Consider 1:15-1:16 for a more forgiving TDS/EY balance';
  if (ratio > 19) return 'Decrease ratio to 1:16 ΓÇö dilute brews risk low TDS and weak body';
  if (ratio > 18) return 'Consider 1:16-1:17 for better concentration';
  return 'Ratio is in the balanced pourover range';
}

function turbAdvice(pourRate: number, pourHeightCm: number, channelRisk: number): string {
  if (pourRate < 4.5) return 'Pour faster (5-7 g/s) from 5-8 cm height to agitate the bed for better extraction';
  if (channelRisk > 0.45) return 'Reduce pour height and/or flow rate ΓÇö channel risk is too high, causing uneven extraction';
  if (pourHeightCm < 4) return 'Pour from 5-8 cm height for better bed agitation without channeling';
  if (pourHeightCm > 10) return 'Lower pour height to 5-8 cm ΓÇö high pours increase channel risk';
  return 'Pour rate and height are well balanced for extraction';
}

function tempAdvice(waterTempC: number): string {
  if (waterTempC < 80) return 'Increase water temp to 92-96┬░C ΓÇö solubility is too low for effective extraction';
  if (waterTempC < 88) return 'Bump temp to 93┬░C for better solubility and extraction yield';
  if (waterTempC > 96) return 'Cool water to 93-96┬░C ΓÇö near-boiling risks bitterness and over-extraction';
  return 'Temp is in the ideal solubility range for most coffees';
}

export default function FoundationEfficiency({
  drainRate, finesPct, grindSetting, ratio, pourHeightCm, pourRate, channelRisk, waterTempC,
}: Props) {
  const [expanded, setExpanded] = useState<AdviceKey | null>(null);

  function toggle(k: AdviceKey) {
    setExpanded(prev => prev === k ? null : k);
  }

  const grindScore = pct(clamp(
    100 - Math.abs(drainRate - 1.6) * 35 - (finesPct / 30) * 20,
    0, 100
  ));

  const ratioScore = pct(clamp(100 - Math.abs(ratio - 16) * 7, 0, 100));

  const turbRaw = pourRate >= 4.5
    ? Math.min(100, 50 + (pourRate - 4.5) / 2.5 * 50)
    : (pourRate / 4.5) * 50;
  const heightIdeal = 100 - Math.abs(pourHeightCm - 7) * 7;
  const channelPenalty = channelRisk * 60;
  const turbScore = pct(clamp(turbRaw * 0.6 + heightIdeal * 0.4 - channelPenalty, 0, 100));

  let tempScore: number;
  if (waterTempC < 80) tempScore = (waterTempC - 70) / 10 * 25;
  else if (waterTempC < 88) tempScore = 25 + (waterTempC - 80) / 8 * 45;
  else if (waterTempC <= 96) tempScore = 70 + (waterTempC - 88) / 8 * 30;
  else tempScore = 100 - (waterTempC - 96) / 3 * 40;
  tempScore = pct(clamp(tempScore, 0, 100));

  const composite = Math.round((grindScore + ratioScore + turbScore + tempScore) / 4);

  const bars: { key: AdviceKey; label: string; score: number; desc: string }[] = [
    { key: 'grind', label: 'Grind', score: grindScore, desc: drainRate < 0.4 ? 'Too fine ΓÇö clogging' : drainRate > 2.5 ? 'Too coarse ΓÇö fast flow' : `${drainRate.toFixed(1)} g/s drain` },
    { key: 'ratio', label: 'Ratio', score: ratioScore, desc: ratio < 9 ? 'Very tight ΓÇö ristretto' : ratio < 13 ? 'Concentrated ΓÇö hard to control EY' : ratio > 19 ? 'Dilute ΓÇö low TDS risk' : `${ratio}:1 ΓÇö balanced range` },
    { key: 'turb', label: 'Turbulence', score: turbScore, desc: pourRate < 4.5 ? 'Low agitation ΓÇö weak extraction' : channelRisk > 0.45 ? 'High channel risk ΓÇö too aggressive' : 'Good agitation for extraction' },
    { key: 'temp', label: 'Temp', score: tempScore, desc: waterTempC < 85 ? 'Low solubility ΓÇö under-extraction risk' : waterTempC > 96 ? 'Near boiling ΓÇö bitterness risk' : `${waterTempC}┬░C ΓÇö good solubility` },
  ];

  return (
    <div className="rounded border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-900/50 px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wider">Foundation Efficiency</span>
        <span className={`text-[13px] font-bold ${labelColor(composite)}`}>{composite}%</span>
      </div>
      <div className="space-y-1.5">
        {bars.map(b => (
          <div key={b.key}>
            <div className="flex items-center justify-between text-[7px] mb-0.5 cursor-pointer select-none"
              onClick={() => toggle(b.key)}>
              <span className={`font-semibold ${labelColor(b.score)}`}>{b.label}</span>
              <span className="text-slate-400 dark:text-slate-500 dark:text-slate-500">{b.desc}</span>
              <span className={`font-bold ${labelColor(b.score)}`}>{b.score}%</span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barColor(b.score)}`}
                style={{ width: `${b.score}%` }} />
            </div>
            {expanded === b.key && (
              <div className="text-[7px] text-slate-500 dark:text-slate-400 dark:text-slate-400 mt-1 px-0.5 leading-relaxed">
                {b.key === 'grind' && grindAdvice(drainRate, finesPct, grindSetting)}
                {b.key === 'ratio' && ratioAdvice(ratio)}
                {b.key === 'turb' && turbAdvice(pourRate, pourHeightCm, channelRisk)}
                {b.key === 'temp' && tempAdvice(waterTempC)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
