import { useCallback, useEffect, useRef, useState } from 'react';
import FoundationEfficiency from './FoundationEfficiency';

type Roast = 'light' | 'medium' | 'dark';
type Process = 'washed' | 'natural' | 'anaerobic' | 'honey';
type BurrProfileName = 'mazzer' | 'comandante' | 'commercial' | 'budget' | 'standard';

interface Props {
  dose: number;
  grindSetting: number;
  micronSetting: number;
  finesPct: number;
  surfaceArea: number;
  roast: Roast;
  process: Process;
  humidity: number;
  waterTempC: number;
  burrProfileName: BurrProfileName;
  grindDistribution: number[];
}

type PourPattern = 'single' | 'circle' | 'even';
type EcCalibrationProfile = 'default' | 'soft-water' | 'hard-water';

const SEGMENTS = 24;
const EC_POINTS_MAX = 150;

const EC_CALIBRATION: Record<EcCalibrationProfile, { label: string; tdsFactor: number; lagSec: number; noiseAmp: number }> = {
  default: { label: 'Default Meter', tdsFactor: 0.085, lagSec: 0.45, noiseAmp: 0.05 },
  'soft-water': { label: 'Soft Water', tdsFactor: 0.078, lagSec: 0.55, noiseAmp: 0.07 },
  'hard-water': { label: 'Hard Water', tdsFactor: 0.092, lagSec: 0.35, noiseAmp: 0.04 },
};

const PROFILE_LABELS: Record<BurrProfileName, string> = {
  mazzer: 'Mazzer Precision',
  comandante: 'Comandante',
  commercial: 'Commercial Flat',
  budget: 'Budget Conical',
  standard: 'Standard Conical',
};

function computeKValue(r: Roast, p: Process) {
  const base = r === 'light' ? 80 : r === 'medium' ? 50 : 25;
  const mod = p === 'washed' ? 5 : p === 'honey' ? 0 : p === 'natural' ? -5 : -10;
  return Math.max(10, Math.min(100, base + mod));
}

function waterViscosityPaS(tempC: number) {
  const t = Math.max(1, Math.min(100, tempC));
  const tk = t + 273.15;
  return 2.414e-5 * Math.pow(10, 247.8 / (tk - 140));
}

function solubilityFactor(tempC: number) {
  return Math.max(0.7, Math.min(1.15, 0.72 + (tempC - 75) * 0.017));
}

export default function Brew({
  dose: initialDose, grindSetting, micronSetting, finesPct, surfaceArea,
  roast, process, humidity, waterTempC, burrProfileName, grindDistribution,
}: Props) {
  const [dose, setDose] = useState(initialDose);
  const [ratio, setRatio] = useState(16);
  const [waterVol, setWaterVol] = useState(Math.round(dose * ratio));
  const [poured, setPoured] = useState(0);
  const [drained, setDrained] = useState(0);
  const [isPouring, setIsPouring] = useState(false);
  const [pourPoints, setPourPoints] = useState<{ x: number; y: number }[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [tds, setTds] = useState(0);
  const [ey, setEy] = useState(0);
  const [served, setServed] = useState(false);
  const [bedProfile, setBedProfile] = useState<number[]>(() => Array(SEGMENTS).fill(1));
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [ecPoints, setEcPoints] = useState<{ t: number; ecSlurry: number; ecOut: number; integrity: number }[]>([]);
  const [flowPoints, setFlowPoints] = useState<{ t: number; pour: number; drain: number; inDripper: number; extracted: number; cumDrained: number }[]>([]);
  const [ecZoom, setEcZoom] = useState(1);
  const [pourRate, setPourRate] = useState(0);
  const [pourFlowTrim, setPourFlowTrim] = useState(0);
  const [pourHeightCm, setPourHeightCm] = useState(5);
  const [filterCakeLoad, setFilterCakeLoad] = useState(0);
  const [channelMemory, setChannelMemory] = useState(0);
  const [ecCalibrationProfile, setEcCalibrationProfile] = useState<EcCalibrationProfile>('default');
  const [eyTargetMode, setEyTargetMode] = useState<'range' | 'single'>('range');
  const [eyTargetMin, setEyTargetMin] = useState(18.5);
  const [eyTargetMax, setEyTargetMax] = useState(20.5);
  const [eyTargetSingle, setEyTargetSingle] = useState(19.5);
  const [tdsTargetMode, setTdsTargetMode] = useState<'range' | 'single'>('range');
  const [tdsTargetMin, setTdsTargetMin] = useState(1.20);
  const [tdsTargetMax, setTdsTargetMax] = useState(1.45);
  const [tdsTargetSingle, setTdsTargetSingle] = useState(1.32);
  const [targetFinishSec, setTargetFinishSec] = useState(180);
  const [targetFinishText, setTargetFinishText] = useState('03:00');
  const [waterEffectiveness, setWaterEffectiveness] = useState(1);
  const [avgWaterContactSec, setAvgWaterContactSec] = useState(0);
  const [coffeeAgeDays, setCoffeeAgeDays] = useState(10);
  const [bedMoisture, setBedMoisture] = useState(0);
  const [bedIntegrity, setBedIntegrity] = useState(1);
  const [maxPourRate, setMaxPourRate] = useState(10);
  const [v60Size, setV60Size] = useState<'01' | '02' | '03'>('02');
  const [dripperProfile, setDripperProfile] = useState<'classic' | 'neo2026' | 'coneOther'>('neo2026');
  const [paperProfile, setPaperProfile] = useState<'normal' | 'fast' | 'veryfast'>('fast');
  const [showLabels, setShowLabels] = useState(false);
  const [showPourTrace, setShowPourTrace] = useState(true);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [showTdsReport, setShowTdsReport] = useState(false);
  const [showFoundationEff, setShowFoundationEff] = useState(true);
  const [immersionGrindUm, setImmersionGrindUm] = useState(micronSetting);
  const [wetRipples, setWetRipples] = useState<{ x: number; y: number; birth: number; strength: number }[]>([]);
  const [showSalami, setShowSalami] = useState(false);
  const [salamiSlices, setSalamiSlices] = useState<{ slice: number; drainStart: number; drainEnd: number; timeSec: number; tds: number; compound: string }[]>([]);
  const [extractionDepthPct, setExtractionDepthPct] = useState(0);
  const [extractionWarning, setExtractionWarning] = useState<'none' | 'exhausting' | 'tannin' | 'over'>('none');

  const pouredRef = useRef(0);
  const drainedRef = useRef(0);
  const elapsedRef = useRef(0);
  const bedRef = useRef<number[]>(Array(SEGMENTS).fill(1));
  const animRef = useRef<number>(0);
  const bedElRef = useRef<HTMLDivElement>(null);
  const pourPointsRef = useRef<{ x: number; y: number }[]>([]);
  const ecRef = useRef<{ t: number; ecSlurry: number; ecOut: number; integrity: number }[]>([]);
  const flowRef = useRef<{ t: number; pour: number; drain: number; inDripper: number; extracted: number; cumDrained: number }[]>([]);
  const lastEcLogRef = useRef(0);
  const holdStartRef = useRef(0);
  const pourRateRef = useRef(0);
  const lastFrameRef = useRef(0);
  const bedMoistureRef = useRef(0);
  const bedIntegrityRef = useRef(1);
  const wetContactRef = useRef(0);
  const agitationRef = useRef(0);
  const extractedRef = useRef(0);
  const tdsBreakdownRef = useRef({ extracted: 0, waterMass: 0, accessibleFrac: 0, lambdaEff: 0, maxExtractable: 0, effectiveTau: 0, fastDrainDil: 0, bypassDil: 0, lowContactDil: 0, cupDilution: 1, rawTds: 0, floor: 0.9, ceil: 3.2, finalTds: 0, tds: 0, ey: 0, tdsSlurry: 0, fAbs: 0.3 });
  const ecSlurryRef = useRef(0);
  const ecOutTrueRef = useRef(0);
  const ecOutRef = useRef(0);
  const filterCakeRef = useRef(0);
  const channelMemoryRef = useRef(0);
  const pourSectorHitsRef = useRef<number[]>(Array(SEGMENTS).fill(0));
  const avgWaterContactAgeRef = useRef(0);
  const wetRipplesRef = useRef<{ x: number; y: number; birth: number; strength: number }[]>([]);
  const lastRippleStampRef = useRef(0);
  const pourBarRef = useRef<HTMLDivElement>(null);
  const pourPctRef = useRef<HTMLSpanElement>(null);

  const kValue = computeKValue(roast, process);

  const inDripper = Math.max(0, poured - drained);
  const remaining = Math.max(0, waterVol - poured);
  const drainPct = waterVol > 0 ? (drained / waterVol) * 100 : 0;

  // V60 dimensions (real mm)
  const V60_SPECS = {
    '01': { top: 98, bottom: 42, height: 87, holdMax: 360 },
    '02': { top: 116, bottom: 49.5, height: 102, holdMax: 600 },
    '03': { top: 134, bottom: 57, height: 118, holdMax: 1000 },
  } as const;
  const DRIPPER_META = {
    classic: { label: 'V60 Classic', ribCount: 24, ribWidthMm: 1.7, drainGain: 1.0, pourRampSec: 3.0 },
    neo2026: { label: 'V60 Neo 2026', ribCount: 72, ribWidthMm: 0.9, drainGain: 1.28, pourRampSec: 9.0 },
    coneOther: { label: 'Other Cone', ribCount: 36, ribWidthMm: 1.5, drainGain: 1.08, pourRampSec: 6.0 },
  } as const;
  const PAPER_META = {
    normal: { label: 'V60 Paper (Normal)', permScale: 1.0, finesLoad: 1.6 },
    fast: { label: 'Fast Flow Paper', permScale: 1.35, finesLoad: 1.3 },
    veryfast: { label: 'Very Fast Paper', permScale: 1.75, finesLoad: 1.0 },
  } as const;
  const dripperMeta = DRIPPER_META[dripperProfile];
  const paperMeta = PAPER_META[paperProfile];
  const ecCalibration = EC_CALIBRATION[ecCalibrationProfile];
  const spec = V60_SPECS[v60Size];
  const topRim = 60;
  const viewScale = topRim / spec.top;
  const V60_HEIGHT = spec.height * viewScale;
  const V60_TOP_Y = 5;
  const V60_BOT_Y = V60_TOP_Y + V60_HEIGHT;
  const V60_SLOPE = (30 - (spec.bottom * viewScale) / 2) / V60_HEIGHT;
  const V60_LX = (y: number) => 20 + (y - V60_TOP_Y) * V60_SLOPE;
  const V60_RX = (y: number) => 80 - (y - V60_TOP_Y) * V60_SLOPE;
  const BED_TOP_Y = V60_TOP_Y + V60_HEIGHT * (1 - Math.min(0.85, dose * 0.02));
  const BED_BOT_Y = V60_BOT_Y;

  // Darcy + Carman-Kozeny + V60 rib-corrected paper filter model
  const rho = 1000; // kg/m^3
  const g = 9.81;
  const mu = waterViscosityPaS(waterTempC);
  const tempSolubility = solubilityFactor(waterTempC);
  const roastFactor = roast === 'dark' ? 1.4 : roast === 'medium' ? 1.0 : 0.7;
  const phiS = 0.75;
  const Dp = Math.max(120e-6, micronSetting * 1e-6);
  const eps = Math.max(0.32, Math.min(0.52, 0.48 - (finesPct / 100) * 0.12 - (1 - bedIntegrity) * 0.06));

  const rTop = (spec.top / 2) / 1000;
  const rBot = (spec.bottom / 2) / 1000;
  const hCone = spec.height / 1000;
  const slant = Math.sqrt(hCone * hCone + (rTop - rBot) * (rTop - rBot));
  const areaTotal = Math.PI * (rTop + rBot) * slant;
  const ribCount = dripperMeta.ribCount;
  const ribWidth = dripperMeta.ribWidthMm / 1000;
  const alphaBase = Math.max(0.15, Math.min(0.25, (ribCount * ribWidth * slant) / Math.max(1e-9, areaTotal)));
  const alpha = Math.max(0.15, Math.min(0.28, alphaBase + Math.min(0.05, inDripper / Math.max(10, waterVol) * 0.08)));

  const kPaper = 2.5e-13 * paperMeta.permScale;
  const lPaper = 1.5e-4;
  const rFilter0 = lPaper / kPaper;
  const throughputKg = drained / 1000;
  const gammaFines = paperMeta.finesLoad;
  const rFilter = rFilter0 * (1 + gammaFines * throughputKg) * (1 + filterCakeLoad * 1.8);
  const rFilterEffective = rFilter / (1 - alpha);

  const bedYNorm = (BED_TOP_Y - V60_TOP_Y) / Math.max(1e-6, V60_HEIGHT);
  const rBedTop = rTop - (rTop - rBot) * bedYNorm;
  const aTop = Math.PI * Math.max(0.0008, rBedTop) * Math.max(0.0008, rBedTop);
  const bulkDensity = 360;
  const bedVolume = (dose / 1000) / bulkDensity;
  const lBed = Math.max(0.005, Math.min(0.04, bedVolume / Math.max(1e-9, aTop)));
  const hHead = Math.max(0, Math.min(0.09, (inDripper / 1000000) / Math.max(1e-9, aTop)));

  const kKozeny = (180 * (1 - eps) * (1 - eps)) / (phiS * phiS * Dp * Dp * eps * eps * eps);
  const rBed = kKozeny * lBed;
  const deltaP = rho * g * hHead;
  const q = deltaP * aTop / (mu * (rBed + rFilterEffective));
  const baseDrainRate = Math.max(0.03, Math.min(7, q * rho * 1000 * dripperMeta.drainGain));

  const groundCompaction = Math.max(0, Math.min(1,
    filterCakeLoad * 0.55
    + bedMoisture * 0.25
    + (finesPct / 100) * 0.22
    + Math.max(0, 0.9 - baseDrainRate) * 0.18,
  ));
  const cakePts = Math.round(Math.max(0, Math.min(35, filterCakeLoad * 35)));
  const moisturePts = Math.round(Math.max(0, Math.min(25, bedMoisture * 25)));
  const finesPts = Math.round(Math.max(0, Math.min(20, (finesPct / 100) * 20)));
  const slowFlowPts = Math.round(Math.max(0, Math.min(20, (Math.max(0, 0.9 - baseDrainRate) / 0.9) * 20)));
  const groundPoints = Math.max(0, Math.min(100, cakePts + moisturePts + finesPts + slowFlowPts));
  const groundStatus = groundCompaction < 0.33 ? 'Loose' : groundCompaction < 0.7 ? 'Muddy' : 'Stuck';
  const drawdownForceFactor = Math.max(0.45, Math.min(1.08, 1.05 - groundCompaction * 0.55));

  const retainedWaterEq = bedMoisture * dose * 0.18;
  const saturationDepth = Math.min(1, Math.max(0, (inDripper + retainedWaterEq) / Math.max(1, dose * 1.05)));
  const bloomTimeSec = 40;
  const bloomWaterTarget = dose * 2.8;
  const bloomProgress = poured <= 0
    ? 0
    : Math.min(1, Math.max(elapsed / bloomTimeSec, poured / Math.max(1, bloomWaterTarget)));
  const inBloom = poured > 0 && bloomProgress < 1;
  const degasLevel = Math.max(8, Math.min(95, Math.round(98 * Math.exp(-coffeeAgeDays / 24))));
  const degasFactor = Math.max(0, Math.min(1, degasLevel / 100));
  const degasAbsorbCapacity = dose * (1.6 + 1.6 * degasFactor);
  const absorbProgress = Math.min(1, poured / Math.max(1, degasAbsorbCapacity));
  const absorbShield = inBloom
    ? degasFactor * (1 - absorbProgress)
    : degasFactor * 0.15 * Math.max(0, 1 - inDripper / Math.max(1, dose * 0.6));
  const heightNorm = Math.max(0, Math.min(1, (pourHeightCm - 1) / 19));
  const dryHitRatio = Math.max(0, Math.min(1, (dose * 0.25 - inDripper) / Math.max(1, dose * 0.25)));
  const dryImpactBoost = isPouring ? 1 + dryHitRatio * 0.95 : 1;
  // Channeling estimate: require multiple stressors before it rises significantly.
  const headRatio = inDripper / Math.max(1, dose * 1.8);
  const headTerm = Math.min(0.32, Math.pow(Math.max(0, headRatio), 1.15) * 0.22);
  const drainDeficit = Math.max(0, 0.55 - baseDrainRate);
  const drainTerm = Math.min(0.28, drainDeficit * 0.55);
  const integrityTerm = (1 - bedIntegrity) * 0.16;
  const finesTerm = (finesPct / 100) * 0.1;
  const turbulenceTerm = isPouring
    ? Math.max(0, (pourRate - 4.5) / 11) * (0.08 + 0.45 * heightNorm) * dryImpactBoost
    : 0;
  const memoryTerm = Math.min(0.26, channelMemory * 0.24);
  const channelRawBase = headTerm + drainTerm + integrityTerm + finesTerm + turbulenceTerm + memoryTerm;
  const channelRaw = channelRawBase * (1 - absorbShield * 0.85);
  const bloomSuppression = inBloom ? (0.08 + bloomProgress * 0.5) : 1;
  const lowHeadRelief = !inBloom && inDripper < dose * 0.15 ? 0.55 : 1;
  const channelRisk = inDripper > 0
    ? Math.min(1, inBloom
      ? Math.min(0.18, channelRaw * bloomSuppression)
      : Math.min(0.65, channelRaw * lowHeadRelief))
    : 0;
  const bypassFlow = channelRisk * 0.4;
  const drainRate = (baseDrainRate + bypassFlow) * drawdownForceFactor;
  const resistanceVal = Math.max(0.2, Math.min(10, (rBed + rFilterEffective) / 1e9));
  const extractionEfficiency = Math.max(0.2, 1 - channelRisk * 0.65);
  const waterHead = Math.max(0.2, inDripper / Math.max(1, dose));
  const effectiveDrainRate = drainRate * waterHead;
  const drainProgress = poured > 0 ? Math.max(0, Math.min(1, drained / Math.max(1, poured))) : 0;
  const topWaterOpacity = inDripper > 0.05
    ? Math.max(0, Math.min(0.58, (inDripper / Math.max(1, dose * 1.45)) * 0.58)) * (1 - drainProgress * 0.82)
    : 0;
  const topPoolScale = Math.max(0, Math.min(1, inDripper / Math.max(1, dose * 1.25)));
  const visualSaturationDepth = Math.min(1, Math.max(0, inDripper / Math.max(1, dose * 0.95)));
  const sideWaterOpacity = inDripper > 0.05
    ? Math.max(0, Math.min(0.62, (inDripper / Math.max(1, dose * 1.6)) * 0.7)) * (1 - drainProgress * 0.9)
    : 0;

  const bedRadius = 0.42;

  function profileFromPours(points: { x: number; y: number }[]) {
    const profile = Array(SEGMENTS).fill(1);
    if (points.length === 0) return profile;
    const softness = (1 - bedIntegrityRef.current) * 1.2 + bedMoistureRef.current * 0.5;
    const recent = points.slice(-16);
    for (let i = 0; i < SEGMENTS; i++) {
      const segPos = i / (SEGMENTS - 1);
      let displacement = 0;
      for (const p of recent) {
        const px = p.x - 0.5;
        const dist = Math.abs(segPos - 0.5 - px * 0.6);
        const influence = Math.max(0, 0.3 - dist * 2.5);
        displacement += influence * (1.2 + softness);
      }
      const centerBias = Math.max(0, 1 - Math.abs(segPos - 0.5) * 2.2);
      const collapse = (1 - bedIntegrityRef.current) * (0.2 + bedMoistureRef.current * 0.8);
      profile[i] = Math.max(0.2, 1 - displacement - collapse * centerBias * 0.7);
    }
    return profile;
  }

  function registerPourImpact(pt: { x: number; y: number }) {
    const dx = pt.x - 0.5;
    const dy = pt.y - 0.5;
    const angle = Math.atan2(dy, dx);
    const sector = Math.max(0, Math.min(SEGMENTS - 1, Math.floor(((angle + Math.PI) / (Math.PI * 2)) * SEGMENTS)));
    const nextHits = [...pourSectorHitsRef.current];
    nextHits[sector] += 1;
    pourSectorHitsRef.current = nextHits;

    const total = nextHits.reduce((acc, v) => acc + v, 0);
    if (total <= 0) return;
    const maxHit = Math.max(...nextHits);
    const concentration = Math.max(0, maxHit / total - 1 / SEGMENTS);
    const targetMemory = Math.min(1, concentration * 3.8);
    channelMemoryRef.current += (targetMemory - channelMemoryRef.current) * 0.12;
  }

  function spawnWetRipple(pt: { x: number; y: number }) {
    const nowT = elapsedRef.current;
    if (nowT - lastRippleStampRef.current < 0.06) return;
    lastRippleStampRef.current = nowT;
    const strength = Math.max(0.35, Math.min(1.2, 0.45 + inDripper / Math.max(1, dose * 1.2)));
    const next = [...wetRipplesRef.current.slice(-24), { x: pt.x, y: pt.y, birth: nowT, strength }];
    wetRipplesRef.current = next;
    setWetRipples(next);
  }

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (served || remaining <= 0) return;
    const el = bedElRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if ((x - 0.5) ** 2 + (y - 0.5) ** 2 > bedRadius ** 2) return;
    setIsPouring(true);
    holdStartRef.current = elapsedRef.current;
    const pt = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    registerPourImpact(pt);
    spawnWetRipple(pt);
    setPourPoints(p => [...p, pt]);
    pourPointsRef.current = [...pourPointsRef.current, pt];
    const np = profileFromPours(pourPointsRef.current);
    bedRef.current = np;
    setBedProfile([...np]);
  }, [served, remaining, inDripper, dose]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const el = bedElRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    setMousePos({ x, y });
    if (!isPouring) return;
    if ((x - 0.5) ** 2 + (y - 0.5) ** 2 > bedRadius ** 2) return;
    const pt = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    registerPourImpact(pt);
    spawnWetRipple(pt);
    setPourPoints(p => [...p, pt]);
    pourPointsRef.current = [...pourPointsRef.current, pt];
  }, [isPouring, inDripper, dose]);

  const handlePointerUp = useCallback(() => { setIsPouring(false); }, []);

  // Animation tick
  useEffect(() => {
    const tick = () => {
      if (served) { animRef.current = requestAnimationFrame(tick); return; }

      // Time step — wall clock delta for real-time simulation
      const now = performance.now();
      const timeStep = lastFrameRef.current > 0 ? (now - lastFrameRef.current) / 1000 : 1 / 60;
      lastFrameRef.current = now;
      let addedFreshThisTick = 0;

      // Dynamic pour: hold duration → 2–max g/s
      if (isPouring && remaining > 0) {
        const targetPour = Math.max(0.2, maxPourRate + pourFlowTrim);
        // Keep low-flow pours responsive; reserve slower ramp feel for high-flow turbulence.
        const responseSec = targetPour <= 6
          ? 0.8
          : Math.max(1.5, dripperMeta.pourRampSec * (targetPour / 10));
        const alpha = 1 - Math.exp(-timeStep / Math.max(0.05, responseSec / 3));
        const rate = pourRateRef.current + (targetPour - pourRateRef.current) * alpha;
        pourRateRef.current = rate;
        setPourRate(rate);
        const add = rate * timeStep;
        const prevPoured = pouredRef.current;
        pouredRef.current = Math.min(waterVol, pouredRef.current + add);
        addedFreshThisTick = Math.max(0, pouredRef.current - prevPoured);
        setPoured(pouredRef.current);
        const np = profileFromPours(pourPointsRef.current);
        bedRef.current = np;
        setBedProfile([...np]);
      } else if (!isPouring && pourRateRef.current > 0) {
        // Fast decay to zero after pour release so display and cumulative flow feel accurate.
        const decayAlpha = 1 - Math.exp(-timeStep / 0.15);
        const rate = Math.max(0, pourRateRef.current * (1 - decayAlpha));
        pourRateRef.current = rate;
        setPourRate(rate);
      }

      // Drain — hydrostatic: rate depends on water column height
      const curInDripNow = Math.max(0, pouredRef.current - drainedRef.current);
      const waterHeadNow = Math.max(0.2, curInDripNow / Math.max(1, dose));
      const effectiveDrainRateNow = drainRate * waterHeadNow;
      if (pouredRef.current > drainedRef.current) {
        const drain = effectiveDrainRateNow * timeStep;
        drainedRef.current = Math.min(pouredRef.current, drainedRef.current + drain);
        setDrained(drainedRef.current);
      }

      // Diffusion + immersion: fresh water extracts best; long contact loses effectiveness.
      const curInDripAfterDrain = Math.max(0, pouredRef.current - drainedRef.current);
      if (curInDripAfterDrain > 0.02) {
        const agedPrev = avgWaterContactAgeRef.current + timeStep;
        const oldWaterMass = Math.max(0, curInDripAfterDrain - addedFreshThisTick);
        const mixedAge = (oldWaterMass * agedPrev) / Math.max(1e-6, curInDripAfterDrain);
        avgWaterContactAgeRef.current = Math.max(0, mixedAge);
      } else {
        avgWaterContactAgeRef.current = 0;
      }
      const freshness = Math.exp(-avgWaterContactAgeRef.current / 45);
      const freshWaterFactor = 0.55 + 0.45 * freshness;
      const diffusionFactor = 0.8 + 0.25 * freshness + (isPouring ? 0.05 : 0);
      const immersionDecay = 1 - Math.min(0.45, avgWaterContactAgeRef.current / 150);
      const waterEffectivenessNow = Math.max(0.45, Math.min(1.2, freshWaterFactor * diffusionFactor * immersionDecay));
      setAvgWaterContactSec(avgWaterContactAgeRef.current);
      setWaterEffectiveness(waterEffectivenessNow);

      // Time
      if (pouredRef.current > 0) {
        elapsedRef.current += timeStep;
        setElapsed(elapsedRef.current);
      }

      if (wetRipplesRef.current.length > 0) {
        const nextRipples = wetRipplesRef.current.filter(r => elapsedRef.current - r.birth < 1.3);
        if (nextRipples.length !== wetRipplesRef.current.length) {
          wetRipplesRef.current = nextRipples;
          setWetRipples(nextRipples);
        }
      }

      // Extraction & TDS — Gagné particle model (BH sifted cupping, fitted to percolation)
      if (pouredRef.current > 0) {
        const MICRON_SIZES = [0, 50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400];
        const LAMBDA_BASE = 35;     // µm — immersion penetration depth (Gagné 2019)
        const TAU_SHELL = 5;         // s — cell layer extraction time (Gagné 2019)
        const Y_MAX = 0.24;          // max yield for accessible material (Gagné 2019)

        // Percolation depth multiplier: fresh water maintains gradient
        const drainForDepth = Math.max(0, effectiveDrainRateNow);
        const percDepthMult = 1 + Math.min(10, drainForDepth * 3);
        const lambdaEff = LAMBDA_BASE * percDepthMult;

        // Weighted accessible fraction across particle distribution
        let accessibleFrac = 0;
        for (let i = 0; i < MICRON_SIZES.length && i < grindDistribution.length; i++) {
          if (MICRON_SIZES[i] === 0) continue;
          const R = MICRON_SIZES[i] / 2;
          if (R <= lambdaEff) {
            accessibleFrac += grindDistribution[i] / 100;
          } else {
            const coreFrac = (R - lambdaEff) / R;
            accessibleFrac += (grindDistribution[i] / 100) * (1 - coreFrac * coreFrac * coreFrac);
          }
        }

        // Percolation τ boost
        const percTauBoost = 1 + Math.min(3, drainForDepth * 0.5);
        const effectiveTau = TAU_SHELL / (percTauBoost * waterEffectivenessNow);

        // Max extractable in V60 timescale
        const maxExtractable = Math.max(0, dose * Y_MAX * accessibleFrac * extractionEfficiency);

        // First-order kinetics with progress stiffness toward accessible pool ceiling
        const remaining = Math.max(0, maxExtractable - extractedRef.current);
        const progress = maxExtractable > 0
          ? Math.min(1, extractedRef.current / maxExtractable)
          : 0;
        const stiffness = 1 + 5 * progress * progress;
        const extractionRate = remaining / (effectiveTau * stiffness);
        extractedRef.current += extractionRate * timeStep;
        const extracted = Math.max(0, extractedRef.current);

        const depthPct = progress * 100;
        let warning: 'none' | 'exhausting' | 'tannin' | 'over' = 'none';
        if (depthPct > 90) warning = 'over';
        else if (depthPct > 80) warning = 'tannin';
        else if (depthPct > 65) warning = 'exhausting';
        setExtractionDepthPct(Math.min(100, depthPct));
        setExtractionWarning(warning);

        // TDS with dilution factors and realistic floor
        const waterMass = drainedRef.current > 0.1 ? drainedRef.current : Math.max(0.1, pouredRef.current);
        const fastDrainDilution = Math.max(0, effectiveDrainRateNow - 1.6) * 0.11;
        const bypassDilution = channelRisk * 0.18;
        const lowContactDilution = Math.max(0, 1 - avgWaterContactAgeRef.current / 35) * 0.14;
        const cupDilutionFactor = Math.max(0.58, Math.min(1, 1 - fastDrainDilution - bypassDilution - lowContactDilution));
        const tdsValRaw = (extracted / waterMass) * 100 * cupDilutionFactor;
        const tdsFloor = (elapsedRef.current > 60 && pouredRef.current > dose * 0.3) ? 1.1 : 0.9;
        const tdsCeil = 3.2;
        const tdsVal = Math.max(tdsFloor, Math.min(tdsCeil, tdsValRaw));

        // Gagné Universal Extraction formula: accounts for both percolation and immersion.
        //   ExtY = 100 × ((TDS_B − TDS_S)/(100 − TDS_S) × m_B/m_D + TDS_S/(100 − TDS_S) × (m_W/m_D − f_abs))
        const tdsSlurry = ecSlurryRef.current * ecCalibration.tdsFactor;
        const brewMass = drainedRef.current;
        const totalWater = pouredRef.current;
        const fAbs = 0.3;
        const tdsDenom = Math.max(0.01, 100 - tdsSlurry);
        const percTerm = (tdsVal - tdsSlurry) / tdsDenom * brewMass / dose;
        const immTerm = Math.max(0, tdsSlurry / tdsDenom * Math.max(0, totalWater / dose - fAbs));
        const eyVal = 100 * (percTerm + immTerm);

        tdsBreakdownRef.current = {
          extracted, waterMass, accessibleFrac, lambdaEff, maxExtractable, effectiveTau,
          fastDrainDil: fastDrainDilution, bypassDil: bypassDilution,
          lowContactDil: lowContactDilution, cupDilution: cupDilutionFactor,
          rawTds: tdsValRaw, floor: tdsFloor, ceil: tdsCeil, finalTds: tdsVal, tds: tdsVal, ey: eyVal,
          tdsSlurry, fAbs,
        };
        setTds(tdsVal);
        setEy(eyVal);
      }

      // EC model: slurry peak during bloom, then washdown slope driven by active delivery + draining.
      if (pouredRef.current > 0) {
        const washIndex = Math.min(1, drainedRef.current / Math.max(1, pouredRef.current));
        const saturationIndex = Math.min(1, curInDripNow / Math.max(1, dose * 1.1));

        // Agitation: spikes on active pour, decays when idle.
        if (isPouring) {
          agitationRef.current = Math.min(1, agitationRef.current + timeStep * 2);
        } else {
          agitationRef.current = Math.max(0, agitationRef.current - timeStep * 0.8);
        }

        const eyProgress = tdsBreakdownRef.current.maxExtractable > 0
          ? Math.min(1, extractedRef.current / tdsBreakdownRef.current.maxExtractable)
          : 0;

        // Bloom concentration spike from bed swelling/gas release. Target ~20-21 in bloom.
        const bloomPeakBase = 16.8
          + bloomProgress * 3.6
          + degasFactor * 1.2
          + (finesPct / 100) * 0.8
          + Math.max(0, tempSolubility - 1) * 1.8;
        const bloomPeak = Math.min(21.2, bloomPeakBase + agitationRef.current * 0.6);

        // Post-bloom concentration drops as fresh water delivery washes the bed.
        const postBase = 11.5 + (1 - washIndex) * 5.2 + eyProgress * 2.4 * Math.max(0.7, waterEffectivenessNow);
        const washDrive = (isPouring ? 1 : 0.05) * (0.7 + saturationIndex * 0.9);
        const washDrop = washIndex * 7.8 * washDrive;

        const targetSlurry = inBloom
          ? bloomPeak
          : Math.max(4.0, Math.min(22, postBase - washDrop));

        // Without active pouring, EC stays mostly stable (very slow drift only).
        const slurryResponse = inBloom ? 3.4 : isPouring ? 1.8 : 0.08;
        const slurryAlpha = 1 - Math.exp(-timeStep * slurryResponse);
        ecSlurryRef.current += (targetSlurry - ecSlurryRef.current) * slurryAlpha;

        // Outflow EC follows slurry with transport loss; drops faster under sustained wash.
        const transfer = Math.max(0.35, Math.min(0.85, 0.52 + saturationIndex * 0.25 - channelRisk * 0.18));
        const targetOut = Math.max(1.5, ecSlurryRef.current * transfer - washIndex * (isPouring ? 3.0 : 0.5));
        const outResponse = isPouring ? 2.4 : 0.1;
        const outAlpha = 1 - Math.exp(-timeStep * outResponse);
        ecOutTrueRef.current += (targetOut - ecOutTrueRef.current) * outAlpha;

        // Sensor realism: response lag + tiny deterministic noise.
        const sensorAlpha = 1 - Math.exp(-timeStep / Math.max(0.08, ecCalibration.lagSec));
        ecOutRef.current += (ecOutTrueRef.current - ecOutRef.current) * sensorAlpha;
        const sensorNoise = ecCalibration.noiseAmp * (0.6 * Math.sin(elapsedRef.current * 2.3) + 0.4 * Math.sin(elapsedRef.current * 5.1));

        const ecSlurryRaw = Math.max(0, Math.min(23, ecSlurryRef.current));
        const ecOutRaw = Math.max(0, Math.min(23, ecOutRef.current + sensorNoise));
        const ecSlurry = Number.isFinite(ecSlurryRaw) ? ecSlurryRaw : 0;
        const ecOut = Number.isFinite(ecOutRaw) ? ecOutRaw : 0;

        if (elapsedRef.current - lastEcLogRef.current > 0.5) {
          lastEcLogRef.current = elapsedRef.current;
          ecRef.current = [...ecRef.current.slice(-EC_POINTS_MAX), {
            t: elapsedRef.current,
            ecSlurry,
            ecOut,
            integrity: bedIntegrityRef.current,
          }];
          setEcPoints([...ecRef.current]);
          flowRef.current = [...flowRef.current.slice(-EC_POINTS_MAX), {
            t: elapsedRef.current,
            pour: isPouring ? pourRateRef.current : 0,
            drain: effectiveDrainRateNow,
            inDripper: Math.max(0, pouredRef.current - drainedRef.current),
            extracted: extractedRef.current,
            cumDrained: drainedRef.current,
          }];
          setFlowPoints([...flowRef.current]);
        }
      }

      // Bed moisture — rises quickly when water contacts bed, falls slowly on drain
      if (pouredRef.current > 0) {
        const curInDrip = Math.max(0, pouredRef.current - drainedRef.current);
        const bloomProgressNow = Math.min(1, Math.max(
          elapsedRef.current / bloomTimeSec,
          pouredRef.current / Math.max(1, dose * 2.8),
        ));
        const inBloomNow = bloomProgressNow < 1;
        const degasNow = Math.max(0, Math.min(1, degasLevel / 100));
        const absorbCapNow = dose * (1.6 + 1.6 * degasNow);
        const absorbShieldNow = inBloomNow
          ? degasNow * (1 - Math.min(1, pouredRef.current / Math.max(1, absorbCapNow)))
          : degasNow * 0.1;

        // Bed integrity decays with sustained water contact and aggressive pouring.
        if (curInDrip > 0.15) wetContactRef.current += timeStep;
        const contactIntensity = Math.min(1, curInDrip / Math.max(8, dose * 0.35));
        const aggression = isPouring ? Math.max(0, (pourRateRef.current - 3) / 8) * (0.3 + 0.9 * heightNorm) : 0;
        const bloomDecayScale = inBloomNow ? (0.08 + bloomProgressNow * 0.2) : 1;
        const degasDecayShield = 1 - absorbShieldNow * 0.75;
        const decayPerSec = (0.003 + contactIntensity * 0.012 + aggression * 0.02 + channelRisk * 0.01) * bloomDecayScale * degasDecayShield;
        const recoverPerSec = curInDrip < 0.2 ? (inBloomNow ? 0.003 : 0.002) : 0;
        bedIntegrityRef.current = Math.max(0.35, Math.min(1, bedIntegrityRef.current - decayPerSec * timeStep + recoverPerSec * timeStep));
        setBedIntegrity(bedIntegrityRef.current);

        // Fines migration and filter-cake buildup.
        const cakeBuild = (finesPct / 100) * (0.006 + contactIntensity * 0.006 + aggression * 0.02) * timeStep;
        const cakeFlush = (!isPouring && effectiveDrainRateNow > 1.2 ? (effectiveDrainRateNow - 1.2) * 0.0012 : 0) * timeStep;
        filterCakeRef.current = Math.max(0, Math.min(1.3, filterCakeRef.current + cakeBuild - cakeFlush));
        setFilterCakeLoad(filterCakeRef.current);

        // Channel memory decays slowly if pouring is distributed and gentle.
        const memoryDecay = (!isPouring ? 0.012 : 0.004) * (1 - aggression * 0.5) * timeStep;
        channelMemoryRef.current = Math.max(0, Math.min(1, channelMemoryRef.current - Math.max(0, memoryDecay)));
        setChannelMemory(channelMemoryRef.current);

        const target = Math.min(1, (curInDrip + dose * 0.06) / (dose * 0.5));
        const smoothing = curInDrip > 0.5 ? 0.06 : 0.004;
        bedMoistureRef.current += (target - bedMoistureRef.current) * smoothing * timeStep * 30;
        bedMoistureRef.current = Math.max(0.04, Math.min(1, bedMoistureRef.current));
        setBedMoisture(bedMoistureRef.current);
      }

      // Update pour bar width directly — no React state lag
      const pct = waterVol > 0 ? (pouredRef.current / waterVol) * 100 : 0;
      if (pourBarRef.current) pourBarRef.current.style.width = `${Math.min(100, pct)}%`;
      if (pourPctRef.current) pourPctRef.current.textContent = `${Math.round(pct)}%`;

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPouring, remaining, waterVol, drainRate, dose, micronSetting, served, roast, maxPourRate, extractionEfficiency, pourFlowTrim, degasLevel, dripperProfile, ecCalibration]);

  function compoundFromTDS(tds: number, timeSec: number): string {
    if (tds > 1.6 && timeSec < 90) return 'Acids (citric/malic) — bright, sharp';
    if (tds > 1.3 && timeSec < 120) return 'Sugars (fructose/sucrose) — sweet, balanced';
    if (tds > 1.0 && timeSec < 150) return 'Mixed (sugars fading, tannins rising) — rounded';
    if (tds > 0.7) return 'Tannins/polyphenols — drying, astringent';
    return 'Chlorogenic acid lactones — bitter, woody';
  }

  const serve = useCallback(() => {
    setServed(true);
    setIsPouring(false);
    const flowData = flowRef.current;
    if (flowData.length < 2) return;
    const totalDrained = drainedRef.current;
    if (totalDrained <= 0) return;
    const SLICE_COUNT = 5;
    const sliceDrainMass = totalDrained / SLICE_COUNT;
    const slices: { slice: number; drainStart: number; drainEnd: number; timeSec: number; tds: number; compound: string }[] = [];
    let sliceIdx = 0;
    let prevPt = flowData[0];
    let sliceStartExtracted = prevPt.extracted;
    let sliceStartDrained = prevPt.cumDrained;
    let sliceStartTime = prevPt.t;
    for (let i = 1; i < flowData.length && sliceIdx < SLICE_COUNT; i++) {
      const pt = flowData[i];
      const sliceEndDrain = (sliceIdx + 1) * sliceDrainMass;
      if (pt.cumDrained >= sliceEndDrain) {
        const span = pt.cumDrained - prevPt.cumDrained;
        const frac = span > 0 ? (sliceEndDrain - prevPt.cumDrained) / span : 1;
        const extractedAtBound = prevPt.extracted + (pt.extracted - prevPt.extracted) * frac;
        const timeAtBound = prevPt.t + (pt.t - prevPt.t) * frac;
        const sliceExtracted = extractedAtBound - sliceStartExtracted;
        const sliceDrained = sliceEndDrain - sliceStartDrained;
        const sliceTds = sliceDrained > 0 ? (sliceExtracted / sliceDrained) * 100 : 0;
        const sliceTime = (sliceStartTime + timeAtBound) / 2;
        slices.push({
          slice: sliceIdx + 1,
          drainStart: sliceStartDrained,
          drainEnd: sliceEndDrain,
          timeSec: sliceTime,
          tds: sliceTds,
          compound: compoundFromTDS(sliceTds, sliceTime),
        });
        sliceIdx++;
        sliceStartExtracted = extractedAtBound;
        sliceStartDrained = sliceEndDrain;
        sliceStartTime = timeAtBound;
        prevPt = { ...pt, extracted: extractedAtBound, cumDrained: sliceEndDrain, t: timeAtBound };
        continue;
      }
      prevPt = pt;
    }
    setSalamiSlices(slices);
  }, []);

  const reset = useCallback(() => {
    pouredRef.current = 0; drainedRef.current = 0; elapsedRef.current = 0;
    pourPointsRef.current = []; bedRef.current = Array(SEGMENTS).fill(1);
    ecRef.current = []; flowRef.current = []; lastEcLogRef.current = 0; holdStartRef.current = 0;
    pourRateRef.current = 0; lastFrameRef.current = 0; bedMoistureRef.current = 0;
    bedIntegrityRef.current = 1; wetContactRef.current = 0;
    agitationRef.current = 0; extractedRef.current = 0;
    ecSlurryRef.current = 0; ecOutTrueRef.current = 0; ecOutRef.current = 0;
    filterCakeRef.current = 0; channelMemoryRef.current = 0; pourSectorHitsRef.current = Array(SEGMENTS).fill(0);
    avgWaterContactAgeRef.current = 0;
    wetRipplesRef.current = []; lastRippleStampRef.current = 0;
    setPoured(0); setDrained(0); setElapsed(0); setTds(0); setEy(0); setFilterCakeLoad(0); setChannelMemory(0); setWaterEffectiveness(1); setAvgWaterContactSec(0);
    setWetRipples([]);
    setPourPoints([]); setBedProfile(Array(SEGMENTS).fill(1));
    setServed(false); setIsPouring(false); setEcPoints([]); setFlowPoints([]); setPourRate(0); setBedMoisture(0); setBedIntegrity(1); setPourFlowTrim(0); setEcZoom(1);
    setExtractionDepthPct(0); setExtractionWarning('none');
    setImmersionGrindUm(micronSetting);
  }, [micronSetting]);

  const patternPour = useCallback((ptn: PourPattern) => {
    if (served || remaining <= 0 || isPouring) return;
    const pts: { x: number; y: number }[] = [];
    if (ptn === 'single') pts.push({ x: 0.5, y: 0.5 });
    else if (ptn === 'circle') {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        pts.push({ x: 0.5 + Math.cos(a) * 0.3, y: 0.5 + Math.sin(a) * 0.3 });
      }
    } else {
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          pts.push({ x: 0.25 + i * 0.25, y: 0.25 + j * 0.25 });
    }
    setPourPoints(p => [...p, ...pts]);
    pourPointsRef.current = [...pourPointsRef.current, ...pts];
    const add = ptn === 'single' ? waterVol * 0.2 : ptn === 'circle' ? waterVol * 0.4 : waterVol * 0.3;
    pouredRef.current = Math.min(waterVol, pouredRef.current + add);
    setPoured(pouredRef.current);
    const np = profileFromPours(pourPointsRef.current);
    bedRef.current = np; setBedProfile([...np]);
  }, [served, remaining, isPouring, waterVol]);

  const chartW = 220; const chartH = 65;
  const ecMax = 30; // degassed ceiling
  const integrityPct = Math.round(bedIntegrity * 100);
  const integrityState = inBloom ? 'Bloom protected' : bedIntegrity > 0.75 ? 'Stable' : bedIntegrity > 0.55 ? 'Weakening' : 'Breaking down';
  const cleanEcPoints = ecPoints.filter(p => Number.isFinite(p.t) && Number.isFinite(p.ecSlurry) && Number.isFinite(p.ecOut));
  const latestEcPoint = cleanEcPoints.length > 0 ? cleanEcPoints[cleanEcPoints.length - 1] : null;
  const liveSlurryEc = latestEcPoint ? latestEcPoint.ecSlurry : Math.max(0, Math.min(23, ecSlurryRef.current));
  const liveOutEc = latestEcPoint ? latestEcPoint.ecOut : Math.max(0, Math.min(23, ecOutRef.current));
  const ecTrendPerSec = cleanEcPoints.length > 4
    ? (cleanEcPoints[cleanEcPoints.length - 1].ecSlurry - cleanEcPoints[Math.max(0, cleanEcPoints.length - 5)].ecSlurry)
      / Math.max(0.5, cleanEcPoints[cleanEcPoints.length - 1].t - cleanEcPoints[Math.max(0, cleanEcPoints.length - 5)].t)
    : 0;
  const ecTrendLabel = ecTrendPerSec > 0.08 ? 'rising' : ecTrendPerSec < -0.08 ? 'falling' : 'flat';
  const ecIntegrityKink = cleanEcPoints.find(p => p.integrity < 0.75);
  const ageBand = coffeeAgeDays <= 7
    ? 'Very fresh'
    : coffeeAgeDays <= 14
      ? 'Fresh'
      : coffeeAgeDays <= 30
        ? 'Settled'
        : 'Fading';
  const turbulencePct = Math.round(Math.min(100, turbulenceTerm * 220));
  const targetEyCenter = Math.max(14, Math.min(23, 19.2 + (ratio - 16) * 0.18));
  const suggestedEyLow = Math.max(13, targetEyCenter - 1.1);
  const suggestedEyHigh = Math.min(23, targetEyCenter + 1.1);
  const eyGoalLow = eyTargetMode === 'single' ? eyTargetSingle : Math.min(eyTargetMin, eyTargetMax);
  const eyGoalHigh = eyTargetMode === 'single' ? eyTargetSingle : Math.max(eyTargetMin, eyTargetMax);
  const targetTdsCenter = Math.max(0.7, Math.min(3.5, 1.42 - (ratio - 16) * 0.08));
  const suggestedTdsLow = Math.max(0.6, targetTdsCenter - 0.16);
  const suggestedTdsHigh = Math.min(4.0, targetTdsCenter + 0.16);
  const tdsGoalLow = tdsTargetMode === 'single' ? tdsTargetSingle : Math.min(tdsTargetMin, tdsTargetMax);
  const tdsGoalHigh = tdsTargetMode === 'single' ? tdsTargetSingle : Math.max(tdsTargetMin, tdsTargetMax);
  const eyCenter = (eyGoalLow + eyGoalHigh) / 2;
  const tdsCenter = (tdsGoalLow + tdsGoalHigh) / 2;
  const recommendedRatioFromTargets = Math.max(5, Math.min(25, 2 + eyCenter / tdsCenter));
  const targetPourRateNow = Math.max(0.2, maxPourRate + pourFlowTrim);
  const remainingToPour = Math.max(0, waterVol - poured);
  const projectedDrainRate = Math.max(0.25, effectiveDrainRate);
  const projectedPourSec = remainingToPour / targetPourRateNow;
  const projectedHeldWater = inDripper + remainingToPour * 0.55;
  const projectedDrawdownSec = projectedHeldWater / projectedDrainRate;
  const expectedFinishSec = elapsed + projectedPourSec + projectedDrawdownSec;
  const finishDeltaSec = expectedFinishSec - targetFinishSec;
  // Immersion baseline: direct physical model, no coupling to V60 distribution
  // τ scales linearly with grind (SA ∝ 1/grind, so τ ∝ grind)
  const IMMERSION_REF_MICRON = 800;
  const IMMERSION_REF_TIMECONST = 150;
  const immersionTimeConst = IMMERSION_REF_TIMECONST * immersionGrindUm / IMMERSION_REF_MICRON / roastFactor / tempSolubility;
  const immersionWaterMass = Math.max(0.1, dose * ratio - 2 * dose);
  const immersionExtractedAt = (t: number) => dose * 0.30 * (1 - Math.exp(-t / immersionTimeConst));
  const immersionTDSAt = (t: number) => (immersionExtractedAt(t) / immersionWaterMass) * 100;
  const immersionAnchors = [60, 120, 180, 240].map(t => ({ sec: t, tds: immersionTDSAt(t) }));
  const currentImmersionTDS = immersionTDSAt(elapsed);
  const tdsDelta = tds - currentImmersionTDS;
  const formatClock = (sec: number) => {
    const s = Math.max(0, Math.round(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const parseMmSs = (text: string) => {
    const clean = text.trim();
    const match = clean.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;
    const mm = Number(match[1]);
    const ss = Number(match[2]);
    if (!Number.isFinite(mm) || !Number.isFinite(ss) || ss > 59) return null;
    return Math.max(60, Math.min(420, mm * 60 + ss));
  };

  return (
    <section className="max-w-4xl mx-auto w-full mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
      <h3 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
        V60 Pour Game
      </h3>
      <button onClick={() => setShowLabels(v => !v)}
        className="text-[7px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400 mb-1 underline decoration-dotted">
        {showLabels ? 'Hide labels' : 'Show labels'}
      </button>
      <button onClick={() => setShowPourTrace(v => !v)}
        className="text-[7px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400 mb-2 underline decoration-dotted ml-2">
        {showPourTrace ? 'Trace pour: On' : 'Trace pour: Off'}
      </button>
      <button onClick={() => setShowAdvancedDetails(v => !v)}
        className="text-[7px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400 mb-2 underline decoration-dotted ml-2">
        {showAdvancedDetails ? 'Hide advanced details' : 'Show advanced details'}
      </button>

      {/* Dose + Ratio + Grind Profile */}
      <div className="flex gap-2 mb-2 items-center text-[8px]">
        <span className="text-slate-400 dark:text-slate-500">Dose</span>
        <input type="number" min={5} max={60} step={0.5} value={dose}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              setDose(v);
              setWaterVol(Math.round(v * ratio));
            }
          }}
          disabled={poured > 0}
          className="w-10 text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5 disabled:opacity-40" />
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <span className="text-slate-400 dark:text-slate-500">Ratio 1:</span>
        <input type="number" min={5} max={25} step={0.5} value={ratio}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) {
              setRatio(v);
              setWaterVol(Math.round(dose * v));
            }
          }}
          disabled={poured > 0}
          className="w-10 text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5 disabled:opacity-40" />
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <span className="text-slate-400 dark:text-slate-500">Size</span>
        <select value={v60Size} onChange={e => setV60Size(e.target.value as '01' | '02' | '03')}
          disabled={poured > 0}
          className="text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5 disabled:opacity-40">
          <option value="01">01</option>
          <option value="02">02</option>
          <option value="03">03</option>
        </select>
        <span className="text-slate-400 dark:text-slate-500">Dripper</span>
        <select value={dripperProfile} onChange={e => setDripperProfile(e.target.value as 'classic' | 'neo2026' | 'coneOther')}
          disabled={poured > 0}
          className="text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5 disabled:opacity-40">
          <option value="classic">Classic</option>
          <option value="neo2026">Neo 2026</option>
          <option value="coneOther">Other Cone</option>
        </select>
        <span className="text-slate-400 dark:text-slate-500">Paper</span>
        <select value={paperProfile} onChange={e => setPaperProfile(e.target.value as 'normal' | 'fast' | 'veryfast')}
          disabled={poured > 0}
          className="text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5 disabled:opacity-40">
          <option value="normal">Normal</option>
          <option value="fast">Fast</option>
          <option value="veryfast">Very Fast</option>
        </select>
        <span className="text-slate-400 dark:text-slate-500">= {waterVol}g</span>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <span className="text-slate-400 dark:text-slate-500">{PROFILE_LABELS[burrProfileName]}</span>
        <span className="text-[6px] text-slate-300 dark:text-slate-600">{roast}/{process}</span>
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded px-3 py-2 mb-2 text-[7px] space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span className="text-slate-500 dark:text-slate-400">Grind <strong className="text-slate-700 dark:text-slate-300">#{Math.round(grindSetting)}</strong> <span className="text-slate-400 dark:text-slate-500">{micronSetting}µm</span></span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-500 dark:text-slate-400">Ratio <strong className="text-slate-700 dark:text-slate-300">1:{ratio.toFixed(1)}</strong> <span className="text-slate-400 dark:text-slate-500">({waterVol}g)</span></span>
          {poured <= 0 && (
            <button type="button" onClick={() => { const r = Number(recommendedRatioFromTargets.toFixed(1)); setRatio(r); setWaterVol(Math.round(dose * r)); }}
              className="text-[6px] text-slate-500 dark:text-slate-400 underline decoration-dotted" title={`from EY/TDS: 1:${recommendedRatioFromTargets.toFixed(1)}`}>
              Apply rec
            </button>
          )}
          {waterVol > spec.holdMax && (
            <span className="text-[6px] text-amber-600 dark:text-amber-400 font-semibold">⚠ {waterVol}g exceeds V60 {v60Size} max ({spec.holdMax}ml)</span>
          )}
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-500 dark:text-slate-400">Temp <strong className="text-slate-700 dark:text-slate-300">{waterTempC}°C</strong></span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-500 dark:text-slate-400">⏱ <strong className="text-slate-700 dark:text-slate-300">{formatClock(expectedFinishSec)}</strong></span>
          <span className={`${Math.abs(finishDeltaSec) < 12 ? 'text-emerald-600' : finishDeltaSec > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600'}`}>
            ({finishDeltaSec > 0 ? `+${Math.round(finishDeltaSec)}s` : `${Math.round(Math.abs(finishDeltaSec))}s`})
          </span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-500 dark:text-slate-400">Turb <strong className="text-slate-700 dark:text-slate-300">{turbulencePct}%</strong></span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span>Ground <strong className={`${groundStatus === 'Stuck' ? 'text-red-600' : groundStatus === 'Muddy' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}`}>{groundStatus}</strong> <span className="text-slate-400 dark:text-slate-500">({groundPoints}pts)</span></span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-500 dark:text-slate-400">Drain <strong className="text-slate-700 dark:text-slate-300">{drainRate.toFixed(1)} g/s</strong></span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-500 dark:text-slate-400">Water <strong className="text-slate-700 dark:text-slate-300">{(waterEffectiveness * 100).toFixed(0)}%</strong></span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-500 dark:text-slate-400">Contact <strong className="text-slate-700 dark:text-slate-300">{avgWaterContactSec.toFixed(0)}s</strong></span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-500 dark:text-slate-400">Cake <strong>{Math.round(filterCakeLoad * 100)}%</strong> · Fines <strong>{finesPct.toFixed(0)}%</strong></span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 border-t border-slate-200 dark:border-slate-700">
          <span className="text-slate-500 dark:text-slate-400 font-semibold">Targets:</span>

          <select value={eyTargetMode} onChange={e => setEyTargetMode(e.target.value as 'range' | 'single')}
            className="text-[7px] font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5">
            <option value="range">EY</option>
            <option value="single">EY</option>
          </select>
          {eyTargetMode === 'range' ? (
            <>
              <input type="number" min={15} max={25} step={0.1} value={eyTargetMin}
                onChange={e => setEyTargetMin(Number(e.target.value))}
                className="w-10 text-[7px] text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5" />
              <span className="text-slate-400 dark:text-slate-500">-</span>
              <input type="number" min={15} max={25} step={0.1} value={eyTargetMax}
                onChange={e => setEyTargetMax(Number(e.target.value))}
                className="w-10 text-[7px] text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5" />
            </>
          ) : (
            <input type="number" min={15} max={25} step={0.1} value={eyTargetSingle}
              onChange={e => setEyTargetSingle(Number(e.target.value))}
              className="w-12 text-[7px] text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5" />
          )}
          <span className="font-bold text-emerald-700 dark:text-emerald-400">{eyGoalLow.toFixed(1)}{eyGoalLow === eyGoalHigh ? '' : `-${eyGoalHigh.toFixed(1)}`}%</span>

          <span className="text-slate-300 dark:text-slate-600">|</span>

          <select value={tdsTargetMode} onChange={e => setTdsTargetMode(e.target.value as 'range' | 'single')}
            className="text-[7px] font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5">
            <option value="range">TDS</option>
            <option value="single">TDS</option>
          </select>
          {tdsTargetMode === 'range' ? (
            <>
              <input type="number" min={0.8} max={2.2} step={0.01} value={tdsTargetMin}
                onChange={e => setTdsTargetMin(Number(e.target.value))}
                className="w-11 text-[7px] text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5" />
              <span className="text-slate-400 dark:text-slate-500">-</span>
              <input type="number" min={0.8} max={2.2} step={0.01} value={tdsTargetMax}
                onChange={e => setTdsTargetMax(Number(e.target.value))}
                className="w-11 text-[7px] text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5" />
            </>
          ) : (
            <input type="number" min={0.8} max={2.2} step={0.01} value={tdsTargetSingle}
              onChange={e => setTdsTargetSingle(Number(e.target.value))}
              className="w-12 text-[7px] text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5" />
          )}
          <span className="font-bold text-blue-700">{tdsGoalLow.toFixed(2)}{tdsGoalLow === tdsGoalHigh ? '' : `-${tdsGoalHigh.toFixed(2)}`}%</span>

          <span className="text-slate-300 dark:text-slate-600">|</span>

          <span className="text-slate-500 dark:text-slate-400">⏱</span>
          <input type="text" inputMode="numeric" value={targetFinishText}
            onChange={e => { setTargetFinishText(e.target.value); const p = parseMmSs(e.target.value); if (p !== null) setTargetFinishSec(p); }}
            onBlur={() => { const p = parseMmSs(targetFinishText); const f = p ?? targetFinishSec; setTargetFinishSec(f); setTargetFinishText(formatClock(f)); }}
            className="w-14 text-[7px] text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5" />
        </div>

        {/* Use suggestion buttons */}
        <div className="flex gap-2">
          <button type="button" onClick={() => { setEyTargetMode('range'); setEyTargetMin(Number(suggestedEyLow.toFixed(1))); setEyTargetMax(Number(suggestedEyHigh.toFixed(1))); }}
            className="text-[6px] text-slate-500 dark:text-slate-400 underline decoration-dotted">
            EY suggestion: {suggestedEyLow.toFixed(1)}-{suggestedEyHigh.toFixed(1)}%
          </button>
          <button type="button" onClick={() => { setTdsTargetMode('range'); setTdsTargetMin(Number(suggestedTdsLow.toFixed(2))); setTdsTargetMax(Number(suggestedTdsHigh.toFixed(2))); }}
            className="text-[6px] text-slate-500 dark:text-slate-400 underline decoration-dotted">
            TDS suggestion: {suggestedTdsLow.toFixed(2)}-{suggestedTdsHigh.toFixed(2)}%
          </button>
        </div>
      </div>

      {/* Immersion baseline — cupping / French press TDS reference (no turbulence, no flow) */}
      {waterVol > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20/40 border border-amber-200 dark:border-amber-800/50 rounded px-3 py-1.5 mb-2 text-[7px]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-amber-700 font-semibold whitespace-nowrap">Immersion baseline</span>
            <span className="text-amber-400">|</span>
            <span className="text-amber-800 dark:text-amber-200/70 whitespace-nowrap">Grind</span>
            <input type="number" step={10} value={immersionGrindUm}
              onChange={e => setImmersionGrindUm(Number(e.target.value))}
              className="w-14 text-center font-bold text-amber-900 bg-amber-100 dark:bg-amber-900/30/60 border border-amber-300/50 rounded py-0.5" />
            <button type="button" onClick={() => setImmersionGrindUm(micronSetting)}
              className="text-amber-500 text-[6px] hover:text-amber-700 underline decoration-dotted whitespace-nowrap cursor-pointer">
              ↺ V60 {micronSetting}µm
            </button>
            <span className="text-amber-400">|</span>
            {immersionAnchors.map((a, i) => (
              <span key={a.sec} className="text-amber-800 dark:text-amber-200/80 whitespace-nowrap">
                @{a.sec / 60}' <strong className="text-amber-900">{a.tds.toFixed(2)}%</strong>
                {i < immersionAnchors.length - 1 && <span className="text-amber-300 ml-1">·</span>}
              </span>
            ))}
            <span className="text-amber-400">|</span>
            <span className="whitespace-nowrap">
              V60 <strong className={tdsDelta > 0.02 ? 'text-emerald-600' : tdsDelta < -0.02 ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}>{tds.toFixed(2)}%</strong>
              {elapsed > 0 && (
                <span className={tdsDelta > 0.02 ? 'text-emerald-600' : tdsDelta < -0.02 ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}>
                  {' '}{tdsDelta > 0 ? '▲' : tdsDelta < 0 ? '▼' : '◆'}{Math.abs(tdsDelta).toFixed(2)}
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      <div className="mb-2">
        <div className="flex items-center justify-between mb-0.5">
          <button onClick={() => setShowFoundationEff(v => !v)}
            className="text-[7px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400 underline decoration-dotted cursor-pointer">
            {showFoundationEff ? '− Hide Foundation Efficiency' : '+ Show Foundation Efficiency'}
          </button>
        </div>
        {showFoundationEff && (
          <FoundationEfficiency
            drainRate={drainRate}
            finesPct={finesPct}
            micronSetting={micronSetting}
            grindSetting={grindSetting}
            ratio={ratio}
            waterVol={waterVol}
            dose={dose}
            pourHeightCm={pourHeightCm}
            pourRate={pourRate}
            channelRisk={channelRisk}
            turbulenceTerm={turbulenceTerm}
            waterTempC={waterTempC}
          />
        )}
      </div>

      {showAdvancedDetails && (
        <>
          <div className="text-[7px] text-slate-500 dark:text-slate-400 mb-2">
            V60-{v60Size}: rim {spec.top}mm • base {spec.bottom}mm • h {spec.height}mm • hold ~{spec.holdMax}ml max
          </div>

          <div className="text-[7px] text-slate-500 dark:text-slate-400 mb-2">
            Dripper: {dripperMeta.label} • ribs {dripperMeta.ribCount} • drain x{dripperMeta.drainGain.toFixed(2)} • pour ramp {dripperMeta.pourRampSec.toFixed(0)}s
          </div>

          <div className="text-[7px] text-slate-500 dark:text-slate-400 mb-2">
            Paper: {paperMeta.label} • permeability x{paperMeta.permScale.toFixed(2)} • fines load x{paperMeta.finesLoad.toFixed(2)}
          </div>

          <div className="text-[7px] text-slate-500 dark:text-slate-400 mb-2">
            Grind #{Math.round(grindSetting)} (~{micronSetting}um) • fines {finesPct.toFixed(1)}% • area {Math.round(surfaceArea)} cm^2
          </div>

          <div className="text-[7px] text-slate-500 dark:text-slate-400 mb-2">
            Darcy model: rib contact {Math.round(alpha * 100)}% • filter load {(rFilterEffective / 1e8).toFixed(1)}e8 m^-1 • cake {Math.round(filterCakeLoad * 100)}% • bed porosity {eps.toFixed(2)}
          </div>

          <div className="text-[7px] text-slate-500 dark:text-slate-400 mb-2">
            Temperature: {waterTempC}C • viscosity {(mu * 1000).toFixed(2)} mPa.s • solubility x{tempSolubility.toFixed(2)}
          </div>

          <div className="text-[7px] text-slate-500 dark:text-slate-400 mb-2">
            Coffee age: {coffeeAgeDays}d ({ageBand}) • degas absorb {degasLevel}% • bloom shield {(absorbShield * 100).toFixed(0)}% • channel memory {Math.round(channelMemory * 100)}%
          </div>

          <div className="flex items-center gap-2 text-[7px] text-slate-500 dark:text-slate-400 mb-2">
            <span>EC calibration</span>
            <select value={ecCalibrationProfile} onChange={e => setEcCalibrationProfile(e.target.value as EcCalibrationProfile)}
              disabled={served}
              className="text-center font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded py-0.5 disabled:opacity-40">
              <option value="default">Default Meter</option>
              <option value="soft-water">Soft Water</option>
              <option value="hard-water">Hard Water</option>
            </select>
            <span>lag {ecCalibration.lagSec.toFixed(2)}s</span>
          </div>

          <div className="text-[7px] text-slate-500 dark:text-slate-400 mb-2">
            Pour height: {pourHeightCm.toFixed(1)}cm from kettle spout
          </div>
        </>
      )}

      <div className="flex gap-3">
        {/* Left: Views */}
        <div className="flex flex-col gap-2 flex-1 items-center">
          {/* Top-down bed */}
          <div className="grid grid-cols-[104px_160px_96px] items-center gap-2 w-full max-w-[380px] mx-auto">
            <div className="flex items-center gap-1 h-40">
              <div className="flex flex-col items-center justify-center h-40 w-12 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70">
                <span className="text-[6px] text-slate-400 dark:text-slate-500 mb-1">Flow</span>
                <input
                  type="range"
                  min={2}
                  max={30}
                  step={1}
                  value={maxPourRate}
                  onChange={e => setMaxPourRate(Math.max(2, Math.min(30, Number(e.target.value))))}
                  disabled={served}
                  className="h-20 w-24 accent-cyan-500"
                  style={{ transform: 'rotate(-90deg)' }}
                />
                <span className="text-[6px] text-slate-400 dark:text-slate-500 -mt-1">2-30</span>
                <span className="text-[7px] font-bold text-cyan-600">{maxPourRate.toFixed(0)}</span>
              </div>

              <div className="flex flex-col items-center justify-center h-40 w-12 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70">
                <span className="text-[6px] text-slate-400 dark:text-slate-500 mb-1">Height</span>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={pourHeightCm}
                  onChange={e => setPourHeightCm(Number(e.target.value))}
                  disabled={served}
                  className="h-20 w-24 accent-indigo-500"
                  style={{ transform: 'rotate(-90deg)' }}
                />
                <span className="text-[6px] text-slate-400 dark:text-slate-500 -mt-1">1-20cm</span>
                <span className="text-[7px] font-bold text-indigo-600">{pourHeightCm.toFixed(1)}</span>
              </div>
            </div>

            <div ref={bedElRef}
              onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
              className="relative rounded-full cursor-crosshair touch-none select-none"
              style={{ width: 160, height: 160, backgroundColor: `hsl(30, ${30 + bedMoisture * 35}%, ${38 - bedMoisture * 20}%)` }}>
              <div className="absolute inset-2 rounded-full"
                style={{ background: `radial-gradient(circle at 50% 50%, ${bedMoisture > 0.25 ? '#3a2010' : '#8b5e3c'}, ${bedMoisture > 0.25 ? '#2a1508' : '#5c3a1e'})`, opacity: 0.5 + bedMoisture * 0.45 }} />
              {topWaterOpacity > 0.01 && (
                <div
                  className="absolute inset-2 rounded-full pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle at 42% 32%, rgba(224,242,254,0.98), rgba(125,211,252,0.62) 42%, rgba(56,189,248,0.38) 72%, rgba(14,165,233,0.18))',
                    opacity: topWaterOpacity,
                  }}
                />
              )}
              {topPoolScale > 0.03 && (
                <div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: `${50 - (10 + topPoolScale * 24)}%`,
                    top: `${50 - (10 + topPoolScale * 24)}%`,
                    width: `${(10 + topPoolScale * 24) * 2}%`,
                    height: `${(10 + topPoolScale * 24) * 2}%`,
                    background: 'radial-gradient(circle at 40% 35%, rgba(224,242,254,0.72), rgba(56,189,248,0.34) 55%, rgba(14,165,233,0.14))',
                    border: '1.5px solid rgba(14,165,233,0.65)',
                    boxShadow: '0 0 0 1px rgba(186,230,253,0.35), 0 0 12px rgba(56,189,248,0.35)',
                    opacity: Math.max(0.3, topWaterOpacity + 0.2),
                  }}
                />
              )}
              {wetRipples.length > 0 && (
                <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" viewBox="0 0 100 100">
                  {wetRipples.map((r, i) => {
                    const age = Math.max(0, elapsed - r.birth);
                    const life = Math.max(0, 1 - age / 1.3);
                    if (life <= 0) return null;
                    const radius = 2 + age * 24 * r.strength;
                    const alpha = 0.78 * life;
                    return (
                      <g key={`rip-${i}`}>
                        <circle cx={r.x * 100} cy={r.y * 100} r={radius} fill="none" stroke={`rgba(14,165,233,${alpha.toFixed(3)})`} strokeWidth={1.4 + life * 0.9} />
                        <circle cx={r.x * 100} cy={r.y * 100} r={Math.max(1.2, radius * 0.42)} fill={`rgba(186,230,253,${(alpha * 0.52).toFixed(3)})`} />
                      </g>
                    );
                  })}
                </svg>
              )}
              {isPouring && mousePos && (
                <div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: `${mousePos.x * 100}%`,
                    top: `${mousePos.y * 100}%`,
                    width: '14%',
                    height: '14%',
                    transform: 'translate(-50%, -50%)',
                    background: 'radial-gradient(circle, rgba(224,242,254,0.95), rgba(56,189,248,0.45) 55%, rgba(14,165,233,0.18) 78%, rgba(14,165,233,0))',
                    boxShadow: '0 0 14px rgba(56,189,248,0.55)',
                  }}
                />
              )}
              {showPourTrace && pourPoints.length > 1 && (
                <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" viewBox="0 0 100 100">
                  <polyline
                    points={pourPoints.slice(-120).map(p => `${(p.x * 100).toFixed(1)},${(p.y * 100).toFixed(1)}`).join(' ')}
                    fill="none"
                    stroke="rgba(249,115,22,0.72)"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {showPourTrace && pourPoints.slice(-40).map((p, i) => (
                <div key={i} className="absolute rounded-full pointer-events-none"
                  style={{
                    left: `${(p.x - 0.02) * 100}%`, top: `${(p.y - 0.02) * 100}%`,
                    width: '4%', height: '4%',
                    backgroundColor: `rgba(249, 115, 22, ${0.38 + Math.random() * 0.25})`,
                  }} />
              ))}
              {isPouring && mousePos && (
                <div className="absolute pointer-events-none"
                  style={{
                    left: `${(mousePos.x - 0.04) * 100}%`, top: `${(mousePos.y - 0.04) * 100}%`,
                    width: '8%', height: '8%',
                    transform: 'translate(-50%, -50%)',
                  }}>
                  {/* Rate ring — fills up as pour rate increases */}
                  <svg viewBox="0 0 20 20" className="w-full h-full">
                    <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(148,163,184,0.3)" strokeWidth="1.5" />
                    <circle cx="10" cy="10" r="8" fill="none"
                      stroke={`hsl(${210 - (pourRate - 2) / 8 * 210}, 100%, 60%)`}
                      strokeWidth="1.5" strokeDasharray={`${(pourRate - 2) / 8 * 50.3} 50.3`}
                      strokeLinecap="round" transform="rotate(-90 10 10)" />
                    <text x="10" y="12" textAnchor="middle" fontSize="4.5" fill="white" fontWeight="bold">
                      {pourRate.toFixed(0)}
                    </text>
                  </svg>
                </div>
              )}
              {/* Pour zone guide — dashed circle shows safe area */}
              <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(148,163,184,0.3)" strokeWidth="0.8" strokeDasharray="2.5 3" />
                <text x="50" y="5" textAnchor="middle" fontSize="3.5" fill="rgba(148,163,184,0.4)">pour zone</text>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[7px] text-white/40 font-semibold tracking-widest uppercase">
                  {isPouring ? `${pourRate.toFixed(1)} g/s` : served ? 'Served' : 'Tap to pour'}
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-between h-40 w-24 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 px-1.5 py-1.5">
              <div>
                <div className="text-[6px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">Timer</div>
                <div className="text-[12px] font-bold text-slate-700 dark:text-slate-300 tabular-nums leading-none mt-0.5">
                  {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700 pt-1">
                <div className="text-[6px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">EC Live</div>
                <div className="flex items-baseline justify-between mt-0.5">
                  <span className="text-[6px] text-emerald-600">Slurry</span>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{liveSlurryEc.toFixed(1)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[6px] text-sky-600">Out</span>
                  <span className="text-[10px] font-bold text-sky-700 tabular-nums">{liveOutEc.toFixed(1)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[6px] text-amber-600 dark:text-amber-400">DRN</span>
                  <span className="text-[10px] font-bold text-amber-700 tabular-nums">{effectiveDrainRate.toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700 pt-1">
                <div className="text-[6px] text-slate-400 dark:text-slate-500">Ground Status</div>
                <div className={`text-[7px] font-bold ${groundStatus === 'Stuck' ? 'text-red-600' : groundStatus === 'Muddy' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}`}>
                  {groundStatus}
                </div>
                <div className="text-[6px] text-slate-500 dark:text-slate-400">{groundPoints}/100 pts</div>
                <div className="text-[6px] text-slate-500 dark:text-slate-400">H2O eff {Math.round(waterEffectiveness * 100)}%</div>
              </div>
            </div>
          </div>

          {/* Dripper + Server side view */}
          <svg width="300" height="220" viewBox="0 0 100 90" className="overflow-visible">
            {/* Clip region = dripper shape */}
            <defs>
              <clipPath id="dripper-clip">
                <polygon points={`20,${V60_TOP_Y} 80,${V60_TOP_Y} ${V60_RX(V60_BOT_Y).toFixed(1)},${V60_BOT_Y} ${V60_LX(V60_BOT_Y).toFixed(1)},${V60_BOT_Y}`} />
              </clipPath>
            </defs>

            {/* V60 cone outline — drawn on top, not clipped */}
            <polygon points={`20,${V60_TOP_Y} 80,${V60_TOP_Y} ${V60_RX(V60_BOT_Y).toFixed(1)},${V60_BOT_Y} ${V60_LX(V60_BOT_Y).toFixed(1)},${V60_BOT_Y}`} fill="none" stroke="#94a3b8" strokeWidth="0.8" />

            {/* All fill layers clipped to the dripper shape */}
            <g clipPath="url(#dripper-clip)">

              {/* LAYER 1: Coffee bed — fills from cone bottom up to bed surface */}
              {(() => {
                const tL = V60_LX(BED_TOP_Y);
                const tR = V60_RX(BED_TOP_Y);
                let d = '';
                for (let i = 0; i < SEGMENTS; i++) {
                  const f = i / (SEGMENTS - 1);
                  const x = tL + f * (tR - tL);
                  const y = BED_TOP_Y + (1 - bedProfile[i]) * 16;
                  d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                }
                d += ` L ${V60_RX(V60_BOT_Y).toFixed(1)} ${V60_BOT_Y} L ${V60_LX(V60_BOT_Y).toFixed(1)} ${V60_BOT_Y} L ${tL.toFixed(1)} ${BED_TOP_Y} Z`;
                return <path d={d} fill={bedMoisture > 0.4 ? '#3a2010' : '#8b5e3c'} opacity={0.7 + bedMoisture * 0.3} />;
              })()}

              {/* LAYER 2: Saturation overlay */}
              {visualSaturationDepth > 0.03 && inDripper > 0.2 && visualSaturationDepth < 0.99 && (() => {
                const tL = V60_LX(BED_TOP_Y);
                const tR = V60_RX(BED_TOP_Y);
                const satY = BED_TOP_Y + (V60_BOT_Y - BED_TOP_Y) * (1 - visualSaturationDepth);
                const satL = V60_LX(satY);
                const satR = V60_RX(satY);
                let d = '';
                for (let i = 0; i < SEGMENTS; i++) {
                  const f = i / (SEGMENTS - 1);
                  const x = tL + f * (tR - tL);
                  const y = BED_TOP_Y + (1 - bedProfile[i]) * 16;
                  d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                }
                d += ` L ${satR.toFixed(1)} ${satY} L ${satL.toFixed(1)} ${satY} L ${tL.toFixed(1)} ${BED_TOP_Y} Z`;
                return <path d={d} fill="#1a0f08" opacity={(0.12 + visualSaturationDepth * 0.2) * (1 - drainProgress * 0.92)} />;
              })()}

              {/* LAYER 3: Water — simple trapezoid */}
              {inDripper > 0.2 && sideWaterOpacity > 0.01 && (() => {
                const fillRatio = inDripper / Math.max(1, dose * 2);
                const waterY = Math.max(V60_TOP_Y, BED_TOP_Y - Math.min(30, fillRatio * 30));
                const wL = V60_LX(waterY);
                const wR = V60_RX(waterY);
                const tL = V60_LX(BED_TOP_Y);
                const tR = V60_RX(BED_TOP_Y);
                const d = `M ${wL.toFixed(1)} ${waterY} L ${wR.toFixed(1)} ${waterY} L ${tR.toFixed(1)} ${BED_TOP_Y} L ${tL.toFixed(1)} ${BED_TOP_Y} Z`;
                return <>
                  <path d={d} fill={`rgba(96,165,250,${sideWaterOpacity.toFixed(3)})`} />
                  <line x1={wL} y1={waterY} x2={wR} y2={waterY} stroke={`rgba(96,165,250,${Math.min(0.9, sideWaterOpacity + 0.2).toFixed(3)})`} strokeWidth="0.7" />
                </>;
              })()}

            </g>

            {/* Channeling paths — dark streaks where water breaks through */}
            {channelRisk > 0.15 && pourPoints.length > 0 && (() => {
              const tL = V60_LX(BED_TOP_Y);
              const tR = V60_RX(BED_TOP_Y);
              const seed = Math.floor(elapsed * 10);
              const maxChannels = Math.min(6, Math.ceil(channelRisk * 8));
              const step = Math.max(1, Math.floor(pourPoints.length / maxChannels));
              const channels: { x: number; depth: number }[] = [];
              for (let i = 0; i < pourPoints.length && channels.length < maxChannels; i += step) {
                const p = pourPoints[i];
                const cx = tL + p.x * (tR - tL);
                const depth = 0.3 + channelRisk * 0.7;
                channels.push({ x: cx, depth });
              }
              return channels.map((ch, ci) => {
                const wiggle = (t: number) => Math.sin(t * 3 + seed + ci * 1.7) * 1.2;
                let d = `M ${ch.x.toFixed(1)} ${(BED_TOP_Y - 1.5).toFixed(1)}`;
                const steps = 6;
                for (let s = 1; s <= steps; s++) {
                  const frac = s / steps;
                  const y = BED_TOP_Y + (V60_BOT_Y - BED_TOP_Y) * frac * ch.depth;
                  const x = ch.x + wiggle(frac) * frac;
                  d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
                }
                return <path key={ci} d={d} fill="none" stroke="#1a0f08" strokeWidth={0.8 + channelRisk * 1.2}
                  opacity={0.15 + channelRisk * 0.5} strokeLinecap="round" />;
              });
            })()}

            {/* Server cup */}
            <rect x="30" y="63" width="40" height="18" rx="2" fill="none" stroke="#94a3b8" strokeWidth="0.8" />
            {drained > 0 && (() => {
              const cupColor = ey < 5 ? '#b8926a' : ey < 10 ? '#8b6f47' : ey < 18 ? '#6b4c2a' : ey < 22 ? '#4a2c11' : '#2c1a08';
              const cupAlpha = 0.3 + (drainPct / 100) * 0.5;
              return <rect x="31" y={81 - (drainPct / 100) * 16} width="38" height={(drainPct / 100) * 16}
                fill={cupColor} opacity={cupAlpha} rx="1" />;
            })()}
            <text x="50" y="85" textAnchor="middle" fontSize="3" fill="#94a3b8">
              {drained.toFixed(0)}g in cup
            </text>

            {/* Falling drips — teardrop shapes from cone to server */}
            {drainRate > 0.02 && poured > 0.5 && inDripper > 0.2 && (() => {
              const spawnInterval = 0.2 / Math.max(0.05, effectiveDrainRate);
              const fallTime = 0.6;
              const latest = Math.floor(elapsed / spawnInterval);
              const count = Math.ceil(fallTime / spawnInterval) + 3;
              const brown = ey < 10 ? '#8b5e3c' : ey < 18 ? '#6b3a1f' : ey < 22 ? '#4a2510' : '#2c1508';
              return Array.from({ length: count }).map((_, i) => {
                const idx = latest - i;
                if (idx < 0) return null;
                const spawnTime = idx * spawnInterval;
                const progress = (elapsed - spawnTime) / fallTime;
                if (progress < 0 || progress > 1) return null;
                const cx = 50 + Math.sin(idx * 1.7 + elapsed * 3) * 0.6;
                const y = V60_BOT_Y + progress * 10;
                const r = 1.2 + progress * 1.2;
                const alpha = 0.85 - progress * 0.5;
                const stretch = 1 + progress * 0.8;
                return <ellipse key={idx} cx={cx} cy={y} rx={r} ry={r * stretch}
                  fill={brown} opacity={alpha} transform={`rotate(${Math.sin(idx * 2.3) * 3}, ${cx}, ${y})`} />;
              });
            })()}

            {/* Diagram labels — toggled via showLabels */}
            {showLabels && <>
              {/* Right side labels */}
              <circle cx={75} cy={28} r="0.8" fill="#64748b" />
              <line x1={75} y1={28} x2={83} y2={28} stroke="#64748b" strokeWidth="0.4" />
              <text x="84" y="27.5" fontSize="2.5" fill="#64748b" fontFamily="sans-serif">
                V60 {v60Size} ({spec.top}mm rim)
              </text>

              <circle cx={75} cy={32} r="0.8" fill="#64748b" />
              <line x1={75} y1={32} x2={83} y2={32} stroke="#64748b" strokeWidth="0.4" />
              <text x="84" y="31.5" fontSize="2.5" fill="#64748b" fontFamily="sans-serif">
                Hold ~{spec.holdMax}ml max
              </text>

              <circle cx={64} cy={48} r="0.8" fill="#64748b" />
              <line x1={64} y1={48} x2={83} y2={48} stroke="#64748b" strokeWidth="0.4" />
              <text x="84" y="47.5" fontSize="2.5" fill="#64748b" fontFamily="sans-serif">Coffee bed</text>

              {/* Left side labels */}
              <circle cx={28} cy={18} r="0.8" fill="#64748b" />
              <line x1={28} y1={18} x2={12} y2={18} stroke="#64748b" strokeWidth="0.4" />
              <text x="2" y="17.5" fontSize="2.5" fill="#64748b" fontFamily="sans-serif">Water</text>

              <circle cx={35} cy={46} r="0.8" fill="#64748b" />
              <line x1={35} y1={46} x2={12} y2={46} stroke="#64748b" strokeWidth="0.4" />
              <text x="2" y="45.5" fontSize="2.5" fill="#64748b" fontFamily="sans-serif">Channeling</text>

              <circle cx={48} cy={62} r="0.8" fill="#64748b" />
              <line x1={48} y1={62} x2={12} y2={62} stroke="#64748b" strokeWidth="0.4" />
              <text x="2" y="61.5" fontSize="2.5" fill="#64748b" fontFamily="sans-serif">Drips</text>

              <circle cx={34} cy={72} r="0.8" fill="#64748b" />
              <line x1={34} y1={72} x2={12} y2={72} stroke="#64748b" strokeWidth="0.4" />
              <text x="2" y="71.5" fontSize="2.5" fill="#64748b" fontFamily="sans-serif">Server</text>
            </>}
          </svg>

          {/* Scale display — moved to server area */}
          <div className="px-3 py-2.5 rounded-lg border bg-slate-900 text-white w-full" style={{ maxWidth: 300, fontFamily: "'Courier New', monospace" }}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-200 w-14">TIME</span>
              <span className="text-slate-200 w-14 text-center">FLOW</span>
              <span className="text-slate-200 w-14 text-center">DRIP</span>
              <span className="text-slate-200 w-14 text-right">CUP</span>
            </div>
            <div className="flex items-center justify-between text-[24px] font-bold tracking-wider mt-0.5 leading-none">
              <span className="w-14 text-blue-300">
                {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}
              </span>
              <span className="w-14 text-center text-cyan-300">
                {isPouring ? pourRate.toFixed(1) : '--'}
              </span>
              <span className="w-14 text-center text-amber-300">
                {(dose + inDripper).toFixed(0)}
              </span>
              <span className="w-14 text-right text-emerald-300">
                {drained.toFixed(0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[9px] text-slate-200 mt-1">
              <span className="w-14">live</span>
              <span className="w-14 text-center">g/s</span>
              <span className="w-14 text-center">g</span>
              <span className="w-14 text-right">g</span>
            </div>
            <div className="flex items-center justify-between text-[9px] text-slate-200 mt-1 pt-1 border-t border-slate-700">
              <span className="w-14">DRN</span>
              <span className="w-14 text-center font-bold text-cyan-400">{effectiveDrainRate.toFixed(2)}</span>
              <span className="w-14 text-center text-slate-200">g/s</span>
              <span className="w-14 text-right text-slate-200">{drained.toFixed(0)}g</span>
            </div>
            <div className="flex items-center justify-between text-[9px] text-slate-200 mt-1 pt-1 border-t border-slate-700">
              <span className="w-14">RATIO</span>
              <span className="w-14 text-center font-bold text-amber-400">1:{drained > 0 ? (drained / dose).toFixed(1) : '0.0'}</span>
              <span className="w-14 text-center text-slate-200">TDS {tds.toFixed(1)}%</span>
              <span className="w-14 text-right text-slate-100">{ey.toFixed(1)}%</span>
            </div>
          </div>

          {/* EC Graph */}
          <div className="w-full" style={{ maxWidth: 260 }}>
            <div className="flex items-center justify-between text-[8px] mb-0.5 gap-1">
              <span className="text-slate-400 dark:text-slate-500">EC</span>
              <span className="text-slate-400 dark:text-slate-500">
                {cleanEcPoints.length > 0
                  ? `Slurry ${cleanEcPoints[cleanEcPoints.length - 1].ecSlurry.toFixed(1)} • Out ${cleanEcPoints[cleanEcPoints.length - 1].ecOut.toFixed(1)}`
                  : '--'}
              </span>
            </div>
            <svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
              {cleanEcPoints.length > 1 && (() => {
                const pts = cleanEcPoints;
                const fullMin = pts[0].t;
                const fullMax = Math.max(fullMin + 1, pts[pts.length - 1].t);
                const totalSpan = Math.max(1, fullMax - fullMin);
                const visibleSpan = Math.max(8, totalSpan / Math.max(1, ecZoom));
                const tMin = Math.max(fullMin, fullMax - visibleSpan);
                const tMax = fullMax;
                const visiblePts = pts.filter(p => p.t >= tMin && Number.isFinite(p.ecSlurry) && Number.isFinite(p.ecOut));
                const scaleX = (t: number) => ((t - tMin) / Math.max(1, tMax - tMin)) * chartW;
                const scaleY = (v: number) => chartH - (v / ecMax) * chartH * 0.85 - 2;
                const dSlurry = visiblePts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.t)} ${scaleY(p.ecSlurry)}`).join(' ');
                const dOut = visiblePts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.t)} ${scaleY(p.ecOut)}`).join(' ');
                const lineColor = resistanceVal > 5 ? '#dc2626' : resistanceVal > 2.5 ? '#d97706' : '#059669';
                return <>
                  <path d={dSlurry} fill="none" stroke={lineColor} strokeWidth="1.2" strokeLinejoin="round" />
                  <path d={dOut} fill="none" stroke="#0ea5e9" strokeWidth="1.1" strokeLinejoin="round" strokeDasharray="2.2 1.6" />
                </>;
              })()}
              {ecIntegrityKink && (() => {
                const fullMin = cleanEcPoints[0].t;
                const fullMax = Math.max(fullMin + 1, cleanEcPoints[cleanEcPoints.length - 1].t);
                const totalSpan = Math.max(1, fullMax - fullMin);
                const visibleSpan = Math.max(8, totalSpan / Math.max(1, ecZoom));
                const tMin = Math.max(fullMin, fullMax - visibleSpan);
                if (ecIntegrityKink.t < tMin) return null;
                const x = ((ecIntegrityKink.t - tMin) / Math.max(1, fullMax - tMin)) * chartW;
                const y = chartH - (ecIntegrityKink.ecSlurry / ecMax) * chartH * 0.85 - 2;
                return <>
                  <line x1={x} y1={0} x2={x} y2={chartH} stroke="#f59e0b" strokeWidth="0.7" strokeDasharray="1.5 1.5" opacity="0.8" />
                  <circle cx={x} cy={y} r="1.8" fill="#f59e0b" stroke="white" strokeWidth="0.6" />
                </>;
              })()}
              {cleanEcPoints.length > 0 && (() => {
                const last = cleanEcPoints[cleanEcPoints.length - 1];
                const fullMin = cleanEcPoints[0].t;
                const fullMax = Math.max(fullMin + 1, cleanEcPoints[cleanEcPoints.length - 1].t);
                const totalSpan = Math.max(1, fullMax - fullMin);
                const visibleSpan = Math.max(8, totalSpan / Math.max(1, ecZoom));
                const tMin = Math.max(fullMin, fullMax - visibleSpan);
                const cx = ((last.t - tMin) / Math.max(1, fullMax - tMin)) * chartW;
                const cy = chartH - (last.ecSlurry / ecMax) * chartH * 0.85 - 2;
                const dotColor = resistanceVal > 5 ? '#dc2626' : resistanceVal > 2.5 ? '#d97706' : '#059669';
                return <circle cx={cx} cy={cy} r="2.5" fill={dotColor} stroke="white" strokeWidth="0.8" />;
              })()}
              {ecPoints.length === 0 && (
                <text x={chartW / 2} y={chartH / 2} textAnchor="middle" fontSize="7" fill="#cbd5e1">
                  Pour to see EC curve
                </text>
              )}
            </svg>
            <div className="flex justify-between text-[7px] text-slate-300 dark:text-slate-600 mt-px">
              <span>0</span>
              <span>{elapsed > 60 ? `${Math.floor(elapsed / 60)}m` : `${Math.floor(elapsed)}s`}</span>
            </div>
            <div className="flex items-center justify-between text-[7px] mt-0.5">
              <span className="text-emerald-600">Slurry EC</span>
              <span className="text-sky-500">Outflow EC</span>
              <span className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setEcZoom(z => Math.max(1, Number((z / 1.4).toFixed(2))))}
                  className="px-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => setEcZoom(1)}
                  className="px-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setEcZoom(z => Math.min(6, Number((z * 1.4).toFixed(2))))}
                  className="px-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50"
                >
                  +
                </button>
              </span>
            </div>
            <div className="text-[7px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
              EC {ecTrendLabel} ({ecTrendPerSec >= 0 ? '+' : ''}{ecTrendPerSec.toFixed(2)}/s) • bed {integrityPct}% {integrityState}
            </div>
          </div>

          {/* Salami Test — full width, no graph constraint */}
          {served && (
            <div className="w-full">
              <button onClick={() => setShowSalami(v => !v)}
                className="text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 underline decoration-dotted font-medium">
                {showSalami ? '− Salami batch test' : '+ Salami batch test'}
              </button>
              {showSalami && salamiSlices.length > 0 && (
                <div className="mt-1 text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed select-all" onClick={e => {
                  const sel = window.getSelection();
                  const range = document.createRange();
                  range.selectNodeContents(e.currentTarget);
                  sel?.removeAllRanges();
                  sel?.addRange(range);
                }}>
                  <div className="flex justify-between font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-0.5 mb-0.5">
                    <span className="w-12">Batch</span>
                    <span className="w-24">Drain</span>
                    <span className="w-12">Time</span>
                    <span className="w-14">TDS</span>
                    <span className="text-right flex-1">Compounds</span>
                  </div>
                  {salamiSlices.map(s => (
                    <div key={s.slice} className="flex justify-between py-px border-b border-slate-100 dark:border-slate-700 last:border-b-0">
                      <span className="w-12 font-bold text-slate-700 dark:text-slate-300">#{s.slice}</span>
                      <span className="w-24">{s.drainStart.toFixed(0)}–{s.drainEnd.toFixed(0)}g</span>
                      <span className="w-12">{Math.floor(s.timeSec / 60)}:{String(Math.floor(s.timeSec % 60)).padStart(2, '0')}</span>
                      <span className="w-14 font-mono font-bold" style={{ color: s.tds > 1.4 ? '#059669' : s.tds > 1.0 ? '#d97706' : '#dc2626' }}>{s.tds.toFixed(2)}%</span>
                      <span className="text-right flex-1">{s.compound}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-0.5 mt-0.5 border-t border-slate-300 dark:border-slate-600 font-bold text-slate-700 dark:text-slate-300">
                    <span className="w-12">Total</span>
                    <span className="w-24">{drained.toFixed(0)}g</span>
                    <span className="w-12">{Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}</span>
                    <span className="w-14 font-mono">{tds.toFixed(2)}%</span>
                    <span className="text-right flex-1">EY {ey.toFixed(1)}%</span>
                  </div>
                </div>
              )}
            </div>
          )}

            {/* Flow Graph (Pour vs Drain-down) */}
            <div className="w-full" style={{ maxWidth: 260 }}>
              <div className="flex items-center justify-between text-[8px] mb-0.5">
                <span className="text-slate-400 dark:text-slate-500">Flow Curve</span>
                <span className="text-slate-400 dark:text-slate-500">Pour {pourRate.toFixed(1)} • Drain {effectiveDrainRate.toFixed(1)} • In {inDripper.toFixed(0)}g</span>
              </div>
              <svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
                {flowPoints.length > 1 && (() => {
                  const pts = flowPoints;
                  const tMin = pts[0].t; const tMax = Math.max(tMin + 1, pts[pts.length - 1].t);
                  const maxFlow = Math.max(1, ...pts.map(p => Math.max(p.pour, p.drain)));
                  const maxInDripper = Math.max(1, ...pts.map(p => p.inDripper));
                  const scaleX = (t: number) => ((t - tMin) / (tMax - tMin)) * chartW;
                  const scaleY = (v: number) => chartH - (v / maxFlow) * (chartH - 3) - 1.5;
                  const scaleYMass = (v: number) => chartH - (v / maxInDripper) * (chartH - 3) - 1.5;
                  const dPour = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.t)} ${scaleY(p.pour)}`).join(' ');
                  const dDrain = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.t)} ${scaleY(p.drain)}`).join(' ');
                  const dMass = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.t)} ${scaleYMass(p.inDripper)}`).join(' ');
                  return <>
                    <path d={dPour} fill="none" stroke="#0ea5e9" strokeWidth="1.1" strokeLinejoin="round" />
                    <path d={dDrain} fill="none" stroke="#f59e0b" strokeWidth="1.1" strokeLinejoin="round" />
                    <path d={dMass} fill="none" stroke="#8b5cf6" strokeWidth="1" strokeLinejoin="round" strokeDasharray="2 1.5" />
                  </>;
                })()}
                {flowPoints.length === 0 && (
                  <text x={chartW / 2} y={chartH / 2} textAnchor="middle" fontSize="7" fill="#cbd5e1">
                    Pour to see flow curves
                  </text>
                )}
              </svg>
              <div className="flex items-center justify-between text-[7px] mt-px">
                <span className="text-sky-500">Pour g/s</span>
                <span className="text-amber-500">Drain g/s</span>
                <span className="text-violet-500">In-dripper g</span>
              </div>
            </div>

        </div>

        {/* Right: Controls + Metrics */}
        <div className="flex flex-col gap-1 min-w-[120px]">
          <div className="text-[8px] text-slate-700 dark:text-slate-300 font-bold">Brew {served ? '✓ Done' : ''}</div>

          <div className="flex items-center justify-between text-[8px]">
            <span className="text-slate-400 dark:text-slate-500">Poured</span>
            <span className="font-bold tabular-nums text-blue-700">{poured.toFixed(0)}g</span>
          </div>
          <div className="flex items-center justify-between text-[8px]">
            <span className="text-slate-400 dark:text-slate-500">Drained</span>
            <span className="font-bold tabular-nums text-amber-700">{drained.toFixed(0)}g</span>
          </div>
          <div className="flex items-center justify-between text-[8px]">
            <span className="text-slate-400 dark:text-slate-500">In dripper</span>
            <span className="font-bold tabular-nums text-sky-600">{inDripper.toFixed(0)}g</span>
          </div>

          <div className="mt-0.5">
            <div className="flex items-center justify-between text-[7px] mb-0.5">
              <span className="text-slate-400 dark:text-slate-500">Pour</span>
              <span ref={pourPctRef} className="font-bold text-blue-600">0%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div ref={pourBarRef} className="h-full rounded-full bg-blue-400" style={{ width: '0%' }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[7px] mb-0.5">
              <span className="text-slate-400 dark:text-slate-500">Drain</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">{Math.round(drainPct)}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${Math.min(100, drainPct)}%` }} />
            </div>
          </div>

          {/* 5× 20% pour marks */}
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`h-0.5 flex-1 rounded transition-all ${poured >= waterVol * (i + 1) / 5 ? 'bg-blue-300' : 'bg-slate-100'}`} />
            ))}
          </div>

          <div className="flex items-center justify-between text-[8px]">
            <span className="text-slate-400 dark:text-slate-500">Time</span>
            <span className="font-bold tabular-nums text-slate-700 dark:text-slate-300">
              {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center justify-between text-[7px]">
            <span className="text-slate-400 dark:text-slate-500">Phase</span>
            <span className={`font-bold ${inBloom ? 'text-blue-600' : 'text-slate-600 dark:text-slate-400'}`}>
              {inBloom ? `Bloom ${Math.round(bloomProgress * 100)}%` : 'Extraction'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[7px]">
            <span className="text-slate-400 dark:text-slate-500">Flow</span>
            <span className={`font-bold ${drainRate < 0.4 ? 'text-red-500 dark:text-red-400' : drainRate < 0.7 ? 'text-amber-500' : 'text-emerald-600'}`}>
              {drainRate < 0.4 ? 'Slow (fines)' : drainRate < 0.7 ? 'Moderate' : 'Fast'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[7px]">
            <span className="text-slate-400 dark:text-slate-500">Resistance</span>
            <span className="font-bold tabular-nums"
              style={{ color: resistanceVal > 5 ? '#dc2626' : resistanceVal > 2.5 ? '#d97706' : '#059669' }}>
              {resistanceVal.toFixed(1)} kPa·s/g
            </span>
            {channelRisk > 0.35 && <span className="text-[6px] text-red-400 ml-auto">{channelRisk > 0.6 ? '⛔ High est.' : '⚠ Est. bypass'}</span>}
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative">
            <div className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, resistanceVal * 10)}%`,
                backgroundColor: resistanceVal > 5 ? '#dc2626' : resistanceVal > 2.5 ? '#d97706' : '#059669',
              }} />
            {[2.5, 5].map(th => (
              <div key={th} className="absolute top-0 h-full w-px bg-white dark:bg-slate-800/60" style={{ left: `${th * 10}%` }} />
            ))}
          </div>
          <div className="flex justify-between text-[5px] text-slate-400 dark:text-slate-500 -mt-0.5">
            <span>Free</span>
            <span>Moderate</span>
            <span>Clogged</span>
          </div>

          <div className="flex items-center justify-between text-[7px]">
            <span className="text-slate-400 dark:text-slate-500">Channel risk (est.)</span>
            <span className={`font-bold ${channelRisk > 0.6 ? 'text-red-500 dark:text-red-400' : channelRisk > 0.35 ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`}>
              {channelRisk < 0.2 ? 'Low' : channelRisk < 0.45 ? 'Moderate' : channelRisk < 0.65 ? 'High' : 'Very high'}
            </span>
          </div>
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, channelRisk * 100)}%`,
                backgroundColor: channelRisk > 0.6 ? '#dc2626' : channelRisk > 0.35 ? '#d97706' : '#94a3b8',
              }} />
          </div>

          <div className="flex items-center justify-between text-[7px] mt-0.5">
            <span className="text-slate-400 dark:text-slate-500">Bed integrity</span>
            <span className={`font-bold ${bedIntegrity > 0.75 ? 'text-emerald-600' : bedIntegrity > 0.55 ? 'text-amber-500' : 'text-red-500 dark:text-red-400'}`}>
              {integrityPct}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{
                width: `${integrityPct}%`,
                backgroundColor: bedIntegrity > 0.75 ? '#10b981' : bedIntegrity > 0.55 ? '#f59e0b' : '#ef4444',
              }} />
          </div>

          <div className="flex items-center justify-between text-[8px]">
            <span className="text-slate-400 dark:text-slate-500">TDS</span>
            <span className={`font-bold tabular-nums ${tds > 0 ? 'text-blue-700' : 'text-slate-300 dark:text-slate-600'}`}>{tds.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between text-[8px]">
            <span className="text-slate-400 dark:text-slate-500">EY</span>
            <span className={`font-bold tabular-nums ${ey > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'}`}>{ey.toFixed(1)}%</span>
          </div>
          <button onClick={() => setShowTdsReport(v => !v)}
            className="text-[6px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400 underline decoration-dotted mt-0.5 text-left">
            {showTdsReport ? '− TDS calc report' : '+ TDS calc report'}
          </button>
          {showTdsReport && tds > 0 && (() => {
            const b = tdsBreakdownRef.current;
            return (
              <div className="text-[6px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1 pt-1 border-t border-slate-200 dark:border-slate-700 space-y-0.5 select-all" onClick={e => {
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(e.currentTarget);
                sel?.removeAllRanges();
                sel?.addRange(range);
              }}>
                <div className="flex justify-between"><span>Extracted</span><span className="font-mono">{b.extracted.toFixed(4)} g</span></div>
                <div className="flex justify-between"><span>Water mass</span><span className="font-mono">{b.waterMass.toFixed(2)} g</span></div>
                <div className="flex justify-between"><span>Accessible fraction</span><span className="font-mono">{(b.accessibleFrac * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span>λ effective</span><span className="font-mono">{b.lambdaEff.toFixed(0)} µm</span></div>
                <div className="flex justify-between"><span>Max extractable</span><span className="font-mono">{b.maxExtractable.toFixed(4)} g</span></div>
                <div className="flex justify-between"><span>τ effective</span><span className="font-mono">{b.effectiveTau.toFixed(2)} s</span></div>
                <div className="flex justify-between"><span>TDS Slurry</span><span className="font-mono">{b.tdsSlurry.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span>f abs</span><span className="font-mono">{b.fAbs.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-slate-600 dark:text-slate-400"><span>TDS (cup)</span><span className="font-mono">{tds.toFixed(2)}%</span></div>
                <div className="flex justify-between font-bold text-slate-600 dark:text-slate-400"><span>EY (Gagné UE)</span><span className="font-mono">{(b.ey).toFixed(1)}%</span></div>
              </div>
            );
          })()}

          {/* Extraction depth — shows how far into the solubles we are */}
          {poured > 0 && (
            <>
              <div className="flex items-center justify-between text-[7px] mt-1">
                <span className="text-slate-400 dark:text-slate-500">Extraction depth</span>
                <span className={`font-bold ${extractionWarning === 'over' ? 'text-red-500 dark:text-red-400' : extractionWarning === 'tannin' ? 'text-orange-500' : extractionWarning === 'exhausting' ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`}>
                  {extractionDepthPct.toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, extractionDepthPct)}%`,
                    backgroundColor: extractionWarning === 'over' ? '#dc2626' : extractionWarning === 'tannin' ? '#ea580c' : extractionWarning === 'exhausting' ? '#d97706' : '#3b82f6',
                  }} />
                <div className="absolute top-0 h-full w-0.5 bg-red-400/60" style={{ left: '65%' }} />
                <div className="absolute top-0 h-full w-0.5 bg-black/20" style={{ left: '80%' }} />
              </div>
              {extractionWarning !== 'none' && (
                <div className="flex items-center gap-1 mt-0.5">
                  {extractionWarning === 'over' ? (
                    <span className="text-[6px] text-red-500 dark:text-red-400 font-bold">⛔ Over-extracted — tannins dominate, bitter/astringent cup</span>
                  ) : extractionWarning === 'tannin' ? (
                    <span className="text-[6px] text-orange-600 font-bold">⚠ Tannin release — good pool spent, pulling bitter compounds</span>
                  ) : (
                    <span className="text-[6px] text-amber-600 dark:text-amber-400">△ Good pool nearly depleted — tannin risk rising</span>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between text-[8px]">
            <span className="text-slate-400 dark:text-slate-500">EC out</span>
            <span className={`font-bold tabular-nums ${liveOutEc > 0 ? 'text-sky-700' : 'text-slate-300 dark:text-slate-600'}`}>{liveOutEc.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-[8px]">
            <span className="text-slate-400 dark:text-slate-500">EC × Flow</span>
            <span className={`font-bold tabular-nums ${liveOutEc > 0 && effectiveDrainRate > 0 ? 'text-violet-700' : 'text-slate-300 dark:text-slate-600'}`}>{(liveOutEc * effectiveDrainRate).toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between text-[7px]">
            <span className="text-slate-400 dark:text-slate-500">Max pour</span>
            <div className="flex items-center gap-1">
              <input type="number" min={2} max={30} step={1} value={maxPourRate}
                onChange={e => setMaxPourRate(Math.max(2, Math.min(30, Number(e.target.value))))}
                disabled={served}
                className="w-10 text-right text-[7px] font-bold text-blue-600 bg-transparent border-b border-slate-200 dark:border-slate-700 outline-none disabled:opacity-30" />
              <span className="text-[6px] text-slate-400 dark:text-slate-500">g/s</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[7px] mt-0.5">
            <span className="text-slate-400 dark:text-slate-500">Pour flow tune</span>
            <span className="font-bold text-blue-600">{pourFlowTrim > 0 ? `+${pourFlowTrim.toFixed(1)}` : pourFlowTrim.toFixed(1)} g/s</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPourFlowTrim(v => Math.max(-3, Number((v - 0.5).toFixed(1))))}
              disabled={served}
              className="text-[7px] font-bold rounded px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 disabled:opacity-30"
            >
              -
            </button>
            <input
              type="range"
              min={-3}
              max={6}
              step={0.1}
              value={pourFlowTrim}
              onChange={e => setPourFlowTrim(Number(e.target.value))}
              disabled={served}
              className="flex-1 h-1 accent-blue-500"
            />
            <button
              onClick={() => setPourFlowTrim(v => Math.min(6, Number((v + 0.5).toFixed(1))))}
              disabled={served}
              className="text-[7px] font-bold rounded px-1.5 py-0.5 border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:opacity-30"
            >
              +
            </button>
            <button
              onClick={() => setPourFlowTrim(0)}
              disabled={served}
              className="text-[7px] font-bold rounded px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 disabled:opacity-30"
            >
              0
            </button>
          </div>

          <div className="flex items-center justify-between text-[7px] mt-0.5">
            <span className="text-slate-400 dark:text-slate-500">Coffee age</span>
            <span className={`font-bold ${degasLevel < 30 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}`}>{coffeeAgeDays}d</span>
          </div>
          <input
            type="range"
            min={3}
            max={60}
            step={1}
            value={coffeeAgeDays}
            onChange={e => setCoffeeAgeDays(Number(e.target.value))}
            disabled={served}
            className="w-full h-1 accent-emerald-500"
          />
          <div className="text-[6px] text-slate-400 dark:text-slate-500 -mt-0.5">
            {degasLevel < 25 ? 'Older coffee: low degas buffering, faster channel risk and flatter cup.' : 'Fresh coffee: better bloom buffering and bed protection.'}
          </div>

          {/* Pattern buttons */}
          <div className="flex flex-wrap gap-1 mt-1">
            {([{ k: 'single', l: '⏺ Spot' }, { k: 'circle', l: '⭘ Circle' }, { k: 'even', l: '⊞ Even' }] as const).map(p => (
              <button key={p.k} onClick={() => patternPour(p.k)}
                disabled={served || remaining <= 0}
                className="text-[7px] font-bold rounded px-1.5 py-1 border transition-all disabled:opacity-30 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50">
                {p.l}
              </button>
            ))}
          </div>

          {/* Serve + Reset */}
          <div className="flex gap-1 mt-1">
            <button onClick={serve} disabled={served || poured <= 0}
              className="flex-1 text-[7px] font-bold rounded px-2 py-1.5 border transition-all disabled:opacity-30 bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600">
              ☕ Serve
            </button>
            <button onClick={reset}
              className="text-[7px] font-bold rounded px-2 py-1.5 border border-red-200 text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100">
              ↻
            </button>
          </div>

          {/* Result after serve */}
          {served && (
            <div className="p-1.5 rounded border text-center text-[8px]"
              style={{
                borderColor: ey >= 18 && ey <= 22 ? '#a7f3d0' : '#fde68a',
                backgroundColor: ey >= 18 && ey <= 22 ? '#ecfdf5' : '#fffbeb',
              }}>
              {ey >= 18 && ey <= 22 ? '✓ Balanced' : ey < 18 ? '⬇ Under' : '⬆ Over'}
              <div className="text-[7px] text-slate-400 dark:text-slate-500">{dose}g · 1:{ratio.toFixed(0)} · {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')} · TDS {tds.toFixed(2)}%</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}