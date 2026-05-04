import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Target, AlertCircle } from 'lucide-react';
import { InteractiveDataGraph } from './InteractiveDataGraph';
import { UltrakokiGraph, type UltrakokiBrewData } from './UltrakokiGraph';
import { TDSAnalysisGraph } from './TDSAnalysisGraph';

interface CalibrationPoint {
  x: number;
  y: number;
  dataX: number;
  dataY: number;
  label: string;
}

interface DataPoint {
  x: number;
  y: number;
  time: number;
  ecValue: number;
  temperature?: number;
  isAutoDetected?: boolean;
  id?: string;
}

interface PhaseLog {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  color: string;
  expectedECMin?: number | null;
  expectedECMax?: number | null;
}

interface PhasePinTarget {
  logId: string;
  boundary: 'startTime' | 'endTime';
}

interface ManualDigitizerProps {
  onDataExtracted: (data: DataPoint[]) => void;
}

interface SavedCalibrationProfile {
  version: number;
  name: string;
  sourceImageName?: string;
  sourceImageSize: {
    width: number;
    height: number;
  };
  points: CalibrationPoint[];
  createdAt: string;
}

interface SavedPhaseLogProfile {
  version: number;
  name: string;
  phaseLogs: PhaseLog[];
  createdAt: string;
}

interface CalibrationBoxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const CALIBRATION_PROFILE_STORAGE_KEY = 'belkaCalibrationProfiles';
const PHASE_LOG_PROFILE_STORAGE_KEY = 'belkaPhaseLogProfiles';
const CALIBRATION_BOX_MIN_SIZE = 10;
const CALIBRATION_BOX_HANDLE_RADIUS = 26;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => toFiniteNumber(item))
    .filter((item): item is number => item !== null);
};

const buildPreviewUltrakokiBrewData = (): UltrakokiBrewData => {
  const period = 127;
  const intervalSeconds = 1;
  const sampleCount = period + 1;
  const pourFlow: number[] = [];
  const dripFlow: number[] = [];
  const cumulativePour: number[] = [];
  let runningPour = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const pulseA = 5.1 * Math.exp(-Math.pow((index - 12) / 5.2, 2));
    const pulseB = 4.6 * Math.exp(-Math.pow((index - 39) / 6.5, 2));
    const pulseC = 3.9 * Math.exp(-Math.pow((index - 72) / 7.3, 2));
    const pulseD = 2.7 * Math.exp(-Math.pow((index - 98) / 8.2, 2));
    const pour = Math.max(0, pulseA + pulseB + pulseC + pulseD);
    const delayedPour = index >= 4 ? pourFlow[index - 4] ?? 0 : 0;
    const drip = Math.max(0, delayedPour * 0.82 + 0.18 * Math.sin(index / 7));

    runningPour += pour;
    pourFlow.push(Number(pour.toFixed(3)));
    dripFlow.push(Number(drip.toFixed(3)));
    cumulativePour.push(Number(runningPour.toFixed(3)));
  }

  return {
    period,
    label: 'Preview brew / mock Ultrakoki data',
    intervalSeconds,
    pourFlow,
    dripFlow,
    cumulativePour,
  };
};

type Step = 'upload' | 'calibrate-origin' | 'calibrate-x' | 'calibrate-y' | 'calibrate-highest' | 'calibrate-temp-min' | 'calibrate-temp-max' | 'extract' | 'complete';

export const ManualDigitizer: React.FC<ManualDigitizerProps> = ({ onDataExtracted }) => {
  const PHASE_COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#14b8a6'];
  const DEFAULT_PHASE_NAMES = ['Blooming', 'Acidity', 'Body', 'Sweetness', 'Aftertaste', 'Finish'];
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([]);
  const [extractedPoints, setExtractedPoints] = useState<DataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showMinSec, setShowMinSec] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);
  const [manualHighestEC, setManualHighestEC] = useState<string>('');
  const [fineGeneratedCurve, setFineGeneratedCurve] = useState<DataPoint[]>([]);
  const [viewMode, setViewMode] = useState<'original' | 'fine'>('original');
  const [intervalMs, setIntervalMs] = useState<number>(100);
  const [tempCalibration, setTempCalibration] = useState<{ min: number; max: number } | null>(null);
  const [manualTempMin, setManualTempMin] = useState<string>('60');
  const [manualTempMax, setManualTempMax] = useState<string>('88');
  const [showTempPrompt, setShowTempPrompt] = useState<boolean>(false);
  const [showECPrompt, setShowECPrompt] = useState<boolean>(false);
  const [eraserMode, setEraserMode] = useState<boolean>(false);
  const [eraserSizePx, setEraserSizePx] = useState<number>(14);
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false
  });
  const [redLightTime, setRedLightTime] = useState<number | null>(null);
  const [showRedLight, setShowRedLight] = useState<boolean>(false);
  const [redLightTimeThreshold, setRedLightTimeThreshold] = useState<number>(60);
  const [redLightECThreshold, setRedLightECThreshold] = useState<number>(3.0);
  const [savedCalibrationProfiles, setSavedCalibrationProfiles] = useState<SavedCalibrationProfile[]>([]);
  const [selectedCalibrationProfile, setSelectedCalibrationProfile] = useState<string>('');
  const [showSaveProfileForm, setShowSaveProfileForm] = useState<boolean>(false);
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [loadedCalibrationProfileName, setLoadedCalibrationProfileName] = useState<string | null>(null);
  const [savedPhaseLogProfiles, setSavedPhaseLogProfiles] = useState<SavedPhaseLogProfile[]>([]);
  const [selectedPhaseLogProfile, setSelectedPhaseLogProfile] = useState<string>('');
  const [showSavePhaseProfileForm, setShowSavePhaseProfileForm] = useState<boolean>(false);
  const [newPhaseProfileName, setNewPhaseProfileName] = useState<string>('');
  const [loadedPhaseProfileName, setLoadedPhaseProfileName] = useState<string | null>(null);
  const [autoDetectPreference, setAutoDetectPreference] = useState<boolean>(() => {
    // Load saved preference from localStorage
    const saved = localStorage.getItem('autoDetectPreference');
    return saved === 'true';
  });
  const [autoGenerateAfterDetectPreference, setAutoGenerateAfterDetectPreference] = useState<boolean>(() => {
    const saved = localStorage.getItem('autoGenerateAfterDetectPreference');
    return saved === 'true';
  });
  const [pendingAutoGenerate, setPendingAutoGenerate] = useState<boolean>(false);
  const [phaseLogs, setPhaseLogs] = useState<PhaseLog[]>([]);
  const [phasePinTarget, setPhasePinTarget] = useState<PhasePinTarget | null>(null);
  const [phasePinCursor, setPhasePinCursor] = useState<{ x: number; time: number; visible: boolean }>({
    x: 0,
    time: 0,
    visible: false
  });
  const [calibrateXValue, setCalibrateXValue] = useState<number>(150);
  const [calibrateYValue, setCalibrateYValue] = useState<number>(20);
  const [useBoxCalibrationMode, setUseBoxCalibrationMode] = useState<boolean>(false);
  const [editableCalibrationBox, setEditableCalibrationBox] = useState<CalibrationBoxRect | null>(null);
  const [calibrationBoxDragMode, setCalibrationBoxDragMode] = useState<'draw' | 'move' | 'resize-top-left' | 'resize-top-right' | 'resize-bottom-left' | 'resize-bottom-right' | null>(null);
  const [calibrationBoxDragOrigin, setCalibrationBoxDragOrigin] = useState<{ x: number; y: number } | null>(null);
  const [calibrationBoxInitialRect, setCalibrationBoxInitialRect] = useState<CalibrationBoxRect | null>(null);
  const [showJsonImportPrompt, setShowJsonImportPrompt] = useState<boolean>(false);
  const [importedJsonText, setImportedJsonText] = useState<string>('');
  const [importedJsonLabel, setImportedJsonLabel] = useState<string | null>(null);
  const [ultrakokiBrewData, setUltrakokiBrewData] = useState<UltrakokiBrewData | null>(null);
  const [doseWeight, setDoseWeight] = useState<number>(() => {
    const saved = localStorage.getItem('belkaDoseWeight');
    return saved ? (parseFloat(saved) || 15) : 15;
  });
  const [conversionFactor, setConversionFactor] = useState<number>(() => {
    const saved = localStorage.getItem('belkaConversionFactor');
    return saved ? (parseFloat(saved) || 0.5) : 0.5;
  });
  const [refractometerTDSInput, setRefractometerTDSInput] = useState<string>(() => {
    return localStorage.getItem('belkaRefractometerTDS') || '';
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const suppressNextCanvasClickRef = useRef<boolean>(false);

  const updateCalibrateXValue = useCallback((rawValue: string) => {
    const parsed = Number(rawValue);
    setCalibrateXValue(Number.isFinite(parsed) ? Math.max(1, parsed) : 150);
  }, []);

  const updateCalibrateYValue = useCallback((rawValue: string) => {
    const parsed = Number(rawValue);
    setCalibrateYValue(Number.isFinite(parsed) ? Math.max(1, parsed) : 20);
  }, []);

  const clampValue = useCallback((value: number, min: number, max: number) => {
    return Math.min(max, Math.max(min, value));
  }, []);

  const createCalibrationBoxRect = useCallback((start: { x: number; y: number }, end: { x: number; y: number }): CalibrationBoxRect => ({
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  }), []);

  const syncCalibrationPointsFromBox = useCallback((rect: CalibrationBoxRect) => {
    const originPoint: CalibrationPoint = {
      x: rect.left,
      y: rect.bottom,
      dataX: 0,
      dataY: 0,
      label: 'Origin (0, 0)'
    };
    const xEndPoint: CalibrationPoint = {
      x: rect.right,
      y: rect.bottom,
      dataX: calibrateXValue,
      dataY: 0,
      label: `Time Axis End (${calibrateXValue}s mark)`
    };
    const yEndPoint: CalibrationPoint = {
      x: rect.left,
      y: rect.top,
      dataX: 0,
      dataY: calibrateYValue,
      label: `EC Axis End (${calibrateYValue} EC mark)`
    };

    setCalibrationPoints(prev => {
      const tail = prev.length > 3 ? prev.slice(3) : [];
      return [originPoint, xEndPoint, yEndPoint, ...tail];
    });
  }, [calibrateXValue, calibrateYValue]);

  const getCalibrationBoxHitTarget = useCallback((x: number, y: number, rect: CalibrationBoxRect) => {
    const corners = [
      { mode: 'resize-top-left' as const, x: rect.left, y: rect.top },
      { mode: 'resize-top-right' as const, x: rect.right, y: rect.top },
      { mode: 'resize-bottom-left' as const, x: rect.left, y: rect.bottom },
      { mode: 'resize-bottom-right' as const, x: rect.right, y: rect.bottom },
    ];

    for (const corner of corners) {
      const distance = Math.hypot(x - corner.x, y - corner.y);
      if (distance <= CALIBRATION_BOX_HANDLE_RADIUS) {
        return corner.mode;
      }
    }

    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return 'move' as const;
    }

    return null;
  }, []);

  const commitEditableBoxCalibration = useCallback(() => {
    if (!editableCalibrationBox) {
      setError('Draw or adjust the EC box first, then confirm it.');
      return;
    }

    const width = editableCalibrationBox.right - editableCalibrationBox.left;
    const height = editableCalibrationBox.bottom - editableCalibrationBox.top;
    if (width < CALIBRATION_BOX_MIN_SIZE || height < CALIBRATION_BOX_MIN_SIZE) {
      setError('The EC box is too small. Resize it larger before confirming.');
      return;
    }

    syncCalibrationPointsFromBox(editableCalibrationBox);
    setCurrentStep('calibrate-highest');
    setError(null);
  }, [editableCalibrationBox, syncCalibrationPointsFromBox]);

  
  // Save auto-detect preference to localStorage
  useEffect(() => {
    localStorage.setItem('autoDetectPreference', autoDetectPreference.toString());
  }, [autoDetectPreference]);

  useEffect(() => {
    localStorage.setItem('autoGenerateAfterDetectPreference', autoGenerateAfterDetectPreference.toString());
  }, [autoGenerateAfterDetectPreference]);

  useEffect(() => {
    setCalibrationPoints(prev => {
      if (prev.length < 3) return prev;

      let changed = false;
      const next = [...prev];

      if (next[1] && next[1].dataX !== calibrateXValue) {
        next[1] = {
          ...next[1],
          dataX: calibrateXValue,
          label: `Time Axis End (${calibrateXValue}s mark)`
        };
        changed = true;
      }

      if (next[2] && next[2].dataY !== calibrateYValue) {
        next[2] = {
          ...next[2],
          dataY: calibrateYValue,
          label: `EC Axis End (${calibrateYValue} EC mark)`
        };
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [calibrateXValue, calibrateYValue]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CALIBRATION_PROFILE_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as SavedCalibrationProfile[];
      if (!Array.isArray(parsed)) return;

      const validProfiles = parsed.filter(profile =>
        profile &&
        typeof profile.name === 'string' &&
        profile.name.trim().length > 0 &&
        Array.isArray(profile.points) &&
        profile.points.length >= 4
      );

      setSavedCalibrationProfiles(validProfiles);
    } catch (err) {
      console.error('Failed to load calibration profiles:', err);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PHASE_LOG_PROFILE_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as SavedPhaseLogProfile[];
      if (!Array.isArray(parsed)) return;

      const validProfiles = parsed.filter(profile => {
        if (!profile || typeof profile.name !== 'string' || profile.name.trim().length === 0 || !Array.isArray(profile.phaseLogs)) {
          return false;
        }

        return profile.phaseLogs.every(log => (
          log &&
          typeof log.name === 'string' &&
          typeof log.startTime === 'number' &&
          typeof log.endTime === 'number' &&
          typeof log.color === 'string'
        ));
      });

      setSavedPhaseLogProfiles(validProfiles);
    } catch (err) {
      console.error('Failed to load phase log profiles:', err);
    }
  }, []);

  const getCurrentData = useCallback((): DataPoint[] => {
    if (viewMode === 'fine' && fineGeneratedCurve.length > 0) {
      return fineGeneratedCurve;
    }
    return extractedPoints;
  }, [viewMode, fineGeneratedCurve, extractedPoints]);

  const getSortedCurrentData = useCallback((): DataPoint[] => {
    return [...getCurrentData()].sort((a, b) => a.time - b.time);
  }, [getCurrentData]);

  const getCurveEndTime = useCallback((): number => {
    const sorted = getSortedCurrentData();
    return sorted.length > 0 ? sorted[sorted.length - 1].time : 0;
  }, [getSortedCurrentData]);

  const getCumulativePourAtTime = useCallback((time: number): number | null => {
    if (!ultrakokiBrewData || ultrakokiBrewData.cumulativePour.length === 0 || ultrakokiBrewData.intervalSeconds <= 0) {
      return null;
    }

    const clampedTime = Math.max(0, time);
    const rawIndex = clampedTime / ultrakokiBrewData.intervalSeconds;
    const lowerIndex = Math.max(0, Math.min(ultrakokiBrewData.cumulativePour.length - 1, Math.floor(rawIndex)));
    const upperIndex = Math.max(0, Math.min(ultrakokiBrewData.cumulativePour.length - 1, Math.ceil(rawIndex)));
    const lowerValue = ultrakokiBrewData.cumulativePour[lowerIndex];
    const upperValue = ultrakokiBrewData.cumulativePour[upperIndex];

    if (!Number.isFinite(lowerValue) && !Number.isFinite(upperValue)) {
      return null;
    }
    if (lowerIndex === upperIndex || !Number.isFinite(upperValue)) {
      return Number.isFinite(lowerValue) ? Number(lowerValue.toFixed(1)) : null;
    }
    if (!Number.isFinite(lowerValue)) {
      return Number(upperValue.toFixed(1));
    }

    const interpolated = lowerValue + (upperValue - lowerValue) * (rawIndex - lowerIndex);
    return Number(interpolated.toFixed(1));
  }, [ultrakokiBrewData]);

  const formatPourAmount = useCallback((value: number | null | undefined) => {
    return value === null || value === undefined || !Number.isFinite(value) ? 'n/a' : `${value.toFixed(1)} ml`;
  }, []);

  const getPhaseMetrics = useCallback((log: PhaseLog) => {
    const points = getSortedCurrentData().filter(point => point.time >= log.startTime && point.time <= log.endTime);
    const startEC = points.length > 0 ? points[0].ecValue : null;
    const endEC = points.length > 0 ? points[points.length - 1].ecValue : null;
    const startPour = getCumulativePourAtTime(log.startTime);
    const endPour = getCumulativePourAtTime(log.endTime);
    const ecDelta = startEC !== null && endEC !== null
      ? Number((endEC - startEC).toFixed(2))
      : null;
    const pouredAmount = startPour !== null && endPour !== null
      ? Number(Math.max(0, endPour - startPour).toFixed(1))
      : null;

    return {
      duration: Math.max(0, log.endTime - log.startTime),
      startEC,
      endEC,
      ecDelta,
      startPour,
      endPour,
      pouredAmount,
      pointCount: points.length,
    };
  }, [getCumulativePourAtTime, getSortedCurrentData]);

  const autoDetectPhaseLogs = useCallback(() => {
    const sorted = [...getCurrentData()].sort((a, b) => a.time - b.time);
    if (sorted.length < 3) {
      setError('Need at least 3 data points to detect phase durations');
      return;
    }

    const curveStart = sorted[0].time;
    const curveEnd = sorted[sorted.length - 1].time;
    const peakPoint = sorted.reduce((best, point) => point.ecValue > best.ecValue ? point : best, sorted[0]);
    const boundaries: number[] = [curveStart];

    if (peakPoint.time > curveStart + 2 && peakPoint.time < curveEnd - 2) {
      boundaries.push(peakPoint.time);
    }

    for (let index = 1; index < sorted.length - 1; index += 1) {
      const previousSlope = sorted[index].ecValue - sorted[index - 1].ecValue;
      const nextSlope = sorted[index + 1].ecValue - sorted[index].ecValue;
      const time = sorted[index].time;
      const isTurningPoint = Math.sign(previousSlope) !== Math.sign(nextSlope);
      const isMeaningful = Math.abs(previousSlope - nextSlope) >= 0.35;
      if (isTurningPoint && isMeaningful && time > curveStart + 4 && time < curveEnd - 4) {
        boundaries.push(time);
      }
    }

    if (redLightTime !== null && redLightTime > curveStart && redLightTime < curveEnd) {
      boundaries.push(redLightTime);
    }
    boundaries.push(curveEnd);

    const uniqueBoundaries = Array.from(new Set(boundaries.map(value => Math.round(value * 10) / 10)))
      .sort((a, b) => a - b)
      .filter((value, index, array) => {
        if (index === 0) return true;
        return value - array[index - 1] >= 2;
      });

    const detectedLogs: PhaseLog[] = [];
    for (let index = 0; index < uniqueBoundaries.length - 1; index += 1) {
      const start = uniqueBoundaries[index];
      const end = uniqueBoundaries[index + 1];
      if (end <= start) continue;
      detectedLogs.push({
        id: `phase-${Date.now()}-${index}`,
        name: DEFAULT_PHASE_NAMES[index] || `Phase ${index + 1}`,
        startTime: start,
        endTime: end,
        color: PHASE_COLORS[index % PHASE_COLORS.length],
        expectedECMin: null,
        expectedECMax: null,
      });
    }

    if (detectedLogs.length === 0) {
      setError('Could not detect valid phase durations from this curve');
      return;
    }

    setPhaseLogs(detectedLogs);
    setError(null);
  }, [getCurrentData, redLightTime]);

  const addPhaseLog = useCallback(() => {
    const curveEnd = getCurveEndTime();
    const lastEnd = phaseLogs.length > 0 ? phaseLogs[phaseLogs.length - 1].endTime : 0;
    const start = Math.max(0, Math.min(lastEnd, curveEnd));
    const end = Math.max(start + 2, Math.min(curveEnd, start + 15));
    const idx = phaseLogs.length;
    setPhaseLogs(prev => ([
      ...prev,
      {
        id: `phase-manual-${Date.now()}-${idx}`,
        name: `Phase ${idx + 1}`,
        startTime: start,
        endTime: end,
        color: PHASE_COLORS[idx % PHASE_COLORS.length],
        expectedECMin: null,
        expectedECMax: null
      }
    ]));
  }, [phaseLogs, getCurveEndTime]);

  const addPhaseLogAfter = useCallback((afterId: string) => {
    const curveEnd = getCurveEndTime();
    setPhaseLogs(prev => {
      const insertIndex = prev.findIndex(log => log.id === afterId);
      const baseIndex = insertIndex >= 0 ? insertIndex : prev.length - 1;
      const baseLog = baseIndex >= 0 ? prev[baseIndex] : null;
      const start = Math.max(0, Math.min(baseLog?.endTime ?? 0, curveEnd));
      const end = Math.max(start + 2, Math.min(curveEnd, start + 15));
      const nextLog: PhaseLog = {
        id: `phase-manual-${Date.now()}-${baseIndex + 1}`,
        name: `Phase ${prev.length + 1}`,
        startTime: start,
        endTime: end,
        color: PHASE_COLORS[(baseIndex + 1) % PHASE_COLORS.length],
        expectedECMin: null,
        expectedECMax: null
      };

      if (insertIndex < 0) {
        return [...prev, nextLog];
      }

      return [
        ...prev.slice(0, insertIndex + 1),
        nextLog,
        ...prev.slice(insertIndex + 1)
      ];
    });
  }, [getCurveEndTime]);

  const updatePhaseLog = useCallback((id: string, patch: Partial<PhaseLog>) => {
    setPhaseLogs(prev => prev.map(log => {
      if (log.id !== id) return log;
      const next = { ...log, ...patch };
      if (next.endTime < next.startTime) {
        next.endTime = next.startTime;
      }
      return next;
    }));
  }, []);

  const fitPhaseLogToExpectedRange = useCallback((id: string) => {
    const sorted = getSortedCurrentData();
    const log = phaseLogs.find(item => item.id === id);
    if (!log) return;

    const minEC = log.expectedECMin;
    const maxEC = log.expectedECMax;
    if (minEC === null || minEC === undefined || maxEC === null || maxEC === undefined) {
      setError('Set both expected EC min and max before fitting the phase');
      return;
    }

    const low = Math.min(minEC, maxEC);
    const high = Math.max(minEC, maxEC);
    const matches = sorted.filter(point => point.ecValue >= low && point.ecValue <= high);

    if (matches.length === 0) {
      setError('No points found inside the expected EC range for this phase');
      return;
    }

    updatePhaseLog(id, {
      startTime: Number(matches[0].time.toFixed(1)),
      endTime: Number(matches[matches.length - 1].time.toFixed(1))
    });
    setError(null);
  }, [getSortedCurrentData, phaseLogs, updatePhaseLog]);

  const removePhaseLog = useCallback((id: string) => {
    setPhaseLogs(prev => prev.filter(log => log.id !== id));
  }, []);

  const beginPhasePinning = useCallback((logId: string, boundary: 'startTime' | 'endTime') => {
    setEraserMode(false);
    setEraserCursor(cursor => ({ ...cursor, visible: false }));
    setPhasePinTarget({ logId, boundary });
    setPhasePinCursor(cursor => ({ ...cursor, visible: false }));
  }, []);

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target?.result as string);
      setSelectedImageName(file.name);
      setCalibrationPoints([]);
      setExtractedPoints([]);
      setFineGeneratedCurve([]);
      setPhaseLogs([]);
      setPhasePinTarget(null);
      setPhasePinCursor(cursor => ({ ...cursor, visible: false }));
      setLoadedCalibrationProfileName(null);
      setLoadedPhaseProfileName(null);
      setImportedJsonLabel(null);
      setError(null);
      setCurrentStep('calibrate-origin');
    };
    reader.readAsDataURL(file);
  }, []);


  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;
    
    if (!canvas || !ctx || !img) {
      console.log('Missing elements:', { canvas: !!canvas, ctx: !!ctx, img: !!img });
      return;
    }

    // Wait for image to be fully loaded
    if (!img.complete || img.naturalWidth === 0) {
      console.log('Image not loaded yet');
      return;
    }

    // Use actual image dimensions without scaling
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    // Clear canvas first
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw image
    ctx.drawImage(img, 0, 0);
    console.log('Canvas drawn with image:', canvas.width, 'x', canvas.height);

    // Draw Red Light line if enabled and time is calculated
    if (showRedLight && redLightTime !== null && calibrationPoints.length >= 3) {
      console.log('Drawing Red Light line:', { showRedLight, redLightTime, calibrationPointsLength: calibrationPoints.length });
      
      const origin = calibrationPoints[0];
      const xEnd = calibrationPoints[1]; // calibrated time end point
      const xAxisMax = xEnd.dataX || 150;
      const xScale = xAxisMax !== 0 ? (xEnd.x - origin.x) / xAxisMax : 0;
      
      const redLineX = origin.x + redLightTime * xScale;
      
      console.log('Red Light calculations:', { origin: { x: origin.x, y: origin.y }, xEnd: { x: xEnd.x, y: xEnd.y }, xScale, redLineX, redLightTime });
      
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(redLineX, 0);
      ctx.lineTo(redLineX, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Add Red Light label with time
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      const redMins = Math.floor(redLightTime / 60);
      const redSecs = Math.floor(redLightTime % 60);
      const redLabel = `${redMins}:${redSecs.toString().padStart(2, '0')}`;
      ctx.fillText(`Red Light (${redLabel})`, redLineX, 30);
    }

    // Draw phase logs as colored duration bands and boundary lines.
    if (phaseLogs.length > 0 && calibrationPoints.length >= 3) {
      const origin = calibrationPoints[0];
      const xEnd = calibrationPoints[1];
      const xSpan = xEnd.x - origin.x;
      const xAxisMax = xEnd.dataX || 150;
      const timeToPixel = (time: number) => {
        if (xSpan === 0) return origin.x;
        if (time <= xAxisMax) {
          return origin.x + (time / xAxisMax) * xSpan;
        }
        const beyondRatio = (time - xAxisMax) / 50;
        return xEnd.x + beyondRatio * xSpan;
      };

      const hexToRgba = (hex: string, alpha: number) => {
        const clean = hex.replace('#', '');
        const bigint = parseInt(clean, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      };

      phaseLogs.forEach((log, index) => {
        const startX = timeToPixel(log.startTime);
        const endX = timeToPixel(log.endTime);
        const left = Math.max(0, Math.min(startX, endX));
        const width = Math.abs(endX - startX);
        if (width < 2) return;

        // Transparent band for duration.
        ctx.fillStyle = hexToRgba(log.color, 0.12);
        ctx.fillRect(left, 0, width, canvas.height);

        // Start/end boundaries.
        ctx.strokeStyle = log.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label near top, staggered by row index.
        const labelX = left + width / 2;
        const labelY = 18 + (index % 3) * 16;
        ctx.fillStyle = log.color;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(log.name, labelX, labelY);
      });
    }

    if (phasePinTarget && phasePinCursor.visible) {
      const activeLog = phaseLogs.find(log => log.id === phasePinTarget.logId);
      const guideColor = activeLog?.color || '#0f766e';
      ctx.save();
      ctx.strokeStyle = guideColor;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(phasePinCursor.x, 0);
      ctx.lineTo(phasePinCursor.x, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = guideColor;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${activeLog?.name || 'Phase'} ${phasePinTarget.boundary === 'startTime' ? 'start' : 'end'} @ ${phasePinCursor.time.toFixed(1)}s`,
        phasePinCursor.x,
        canvas.height - 16
      );
      ctx.restore();
    }

    // Draw calibration points
    calibrationPoints.forEach(point => {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Optional editable box alignment preview (for origin/x-end/y-max calibration)
    if (useBoxCalibrationMode && editableCalibrationBox) {
      const { left, right, top, bottom } = editableCalibrationBox;
      const width = right - left;
      const height = bottom - top;

      if (width > 2 && height > 2) {
        ctx.save();
        ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.fillRect(left, top, width, height);
        ctx.strokeRect(left, top, width, height);
        ctx.setLineDash([]);

        // Origin marker (0,0)
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(left, bottom, 7, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(left, bottom, 3.5, 0, 2 * Math.PI);
        ctx.fill();

        // X end marker (Xmax,0)
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(right, bottom, 7, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(right, bottom, 3.5, 0, 2 * Math.PI);
        ctx.fill();

        // Y max marker (0,Ymax)
        ctx.fillStyle = '#16a34a';
        ctx.beginPath();
        ctx.arc(left, top, 7, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(left, top, 3.5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#1e3a8a';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Drag inside to move. Drag corners to resize.', left + 10, Math.max(16, top - 10));

        const handles = [
          { x: left, y: top },
          { x: right, y: top },
          { x: left, y: bottom },
          { x: right, y: bottom },
        ];
        handles.forEach(handle => {
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#1d4ed8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.rect(handle.x - 8, handle.y - 8, 16, 16);
          ctx.fill();
          ctx.stroke();
        });
        ctx.restore();
      }
    }

    // Draw current data points (extracted, generated, or fine generated)
    const currentData = getCurrentData();
    currentData.forEach((point, index) => {
      // Different colors for different types
      if (viewMode === 'fine') {
        ctx.fillStyle = '#10b981'; // Green for generated
      } else {
        // Auto-detected points are purple, manual points are blue
        ctx.fillStyle = point.isAutoDetected ? '#8b5cf6' : '#3b82f6';
      }
      
      // Highlight dragged point
      if (isDragging && draggedPointIndex === index) {
        ctx.fillStyle = '#ef4444';
      }
      
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
      ctx.fill();
      
      // Add white center for visibility
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Draw live eraser radius preview on top of points
    if (eraserMode && eraserCursor.visible) {
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(eraserCursor.x, eraserCursor.y, eraserSizePx, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }, [
    calibrationPoints,
    getCurrentData,
    viewMode,
    isDragging,
    draggedPointIndex,
    eraserMode,
    eraserSizePx,
    eraserCursor,
    phaseLogs,
    phasePinTarget,
    phasePinCursor,
    showRedLight,
    redLightTime,
    useBoxCalibrationMode,
    editableCalibrationBox
  ]);

  // Redraw canvas when Red Light state changes
  useEffect(() => {
    if (selectedImage) {
      drawCanvas();
    }
  }, [showRedLight, redLightTime, selectedImage, drawCanvas]);

  const findPointAtPosition = useCallback((canvasX: number, canvasY: number, hitRadius: number = 10) => {
    const currentData = getCurrentData();
    console.log('Checking', currentData.length, 'points for click at', { canvasX, canvasY });
    
    for (let i = 0; i < currentData.length; i++) {
      const point = currentData[i];
      const distance = Math.sqrt(Math.pow(canvasX - point.x, 2) + Math.pow(canvasY - point.y, 2));
      console.log(`Point ${i}: pos=(${point.x.toFixed(1)}, ${point.y.toFixed(1)}) distance=${distance.toFixed(2)}`);
      
      if (distance <= hitRadius) {
        console.log('Found point at index:', i);
        return i;
      }
    }
    console.log('No points found within click radius');
    return -1;
  }, [getCurrentData]);

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (suppressNextCanvasClickRef.current) {
      suppressNextCanvasClickRef.current = false;
      return;
    }

    // In box calibration mode, click-based axis calibration is disabled.
    if (useBoxCalibrationMode && (currentStep === 'calibrate-origin' || currentStep === 'calibrate-x' || currentStep === 'calibrate-y')) {
      return;
    }

    console.log('Canvas clicked! Current step:', currentStep, 'View mode:', viewMode);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const canvasX = x * (canvas.width / rect.width);
    const canvasY = y * (canvas.height / rect.height);
    
    console.log('Click coordinates:', { canvasX, canvasY });
    console.log('Current data points:', getCurrentData().length);

    if (currentStep === 'extract' && phasePinTarget) {
      let pinnedTime = 0;
      if (calibrationPoints.length >= 2) {
        const origin = calibrationPoints[0];
        const xEnd = calibrationPoints[1];
        const xSpan = xEnd.x - origin.x;
        const xAxisMax = xEnd.dataX || calibrateXValue;
        if (xSpan !== 0) {
          if (canvasX <= xEnd.x) {
            pinnedTime = ((canvasX - origin.x) / xSpan) * xAxisMax;
          } else {
            pinnedTime = xAxisMax + ((canvasX - xEnd.x) / xSpan) * 50;
          }
        }
      }
      pinnedTime = Math.max(0, Number(pinnedTime.toFixed(1)));
      updatePhaseLog(phasePinTarget.logId, {
        [phasePinTarget.boundary]: pinnedTime
      } as Partial<PhaseLog>);
      setPhasePinTarget(null);
      setPhasePinCursor(cursor => ({ ...cursor, visible: false }));
      setError(null);
      return;
    }

    if (currentStep === 'calibrate-origin') {
      // First click: Origin point (0,0) - shared for both axes
      const newPoint: CalibrationPoint = {
        x: x * (canvas.width / rect.width),
        y: y * (canvas.height / rect.height),
        dataX: 0,
        dataY: 0,
        label: 'Origin (0, 0)'
      };
      
      console.log('Adding origin point:', newPoint);
      setCalibrationPoints([newPoint]);
      setCurrentStep('calibrate-x');
      
    } else if (currentStep === 'calibrate-x') {
      // Second click: X-axis end point at user-specified seconds (last visible mark)
      const newPoint: CalibrationPoint = {
        x: x * (canvas.width / rect.width),
        y: y * (canvas.height / rect.height),
        dataX: calibrateXValue,
        dataY: 0,
        label: `Time Axis End (${calibrateXValue}s mark)`
      };
      
      const updated = [...calibrationPoints, newPoint];
      console.log('Adding X-axis point:', newPoint);
      setCalibrationPoints(updated);
      setCurrentStep('calibrate-y');
      
    } else if (currentStep === 'calibrate-y') {
      // Third click: Y-axis end point at user-specified EC (last visible mark)
      const newPoint: CalibrationPoint = {
        x: x * (canvas.width / rect.width),
        y: y * (canvas.height / rect.height),
        dataX: 0,
        dataY: calibrateYValue,
        label: `EC Axis End (${calibrateYValue} EC mark)`
      };
      
      const updated = [...calibrationPoints, newPoint];
      console.log('Adding Y-axis point:', newPoint);
      setCalibrationPoints(updated);
      setCurrentStep('calibrate-highest');
    } else if (currentStep === 'calibrate-highest') {
      // Fourth click: Highest visible EC point on the curve
      const dataCoords = pixelToData(canvasX, canvasY);
      const newPoint: CalibrationPoint = {
        x: x * (canvas.width / rect.width),
        y: y * (canvas.height / rect.height),
        dataX: dataCoords.time,
        dataY: dataCoords.ecValue,
        label: 'Highest EC Point (visible)'
      };
      
      const updated = [...calibrationPoints, newPoint];
      console.log('Adding highest point:', newPoint);
      setCalibrationPoints(updated);
      setManualHighestEC(dataCoords.ecValue.toFixed(2)); // Pre-fill with detected value
      setCurrentStep('extract');
    } else if (currentStep === 'calibrate-temp-min') {
      // Fifth click: Temperature minimum point (from phone reading)
      const minTemp = tempCalibration?.min || 60;
      const newPoint: CalibrationPoint = {
        x: x * (canvas.width / rect.width),
        y: y * (canvas.height / rect.height),
        dataX: 0,
        dataY: minTemp,
        label: `Temp Min (${minTemp}°C)`
      };
      
      const updated = [...calibrationPoints, newPoint];
      console.log('Adding temp min point:', newPoint);
      setCalibrationPoints(updated);
      setCurrentStep('calibrate-temp-max');
    } else if (currentStep === 'calibrate-temp-max') {
      // Sixth click: Temperature maximum point (from phone reading)
      const maxTemp = tempCalibration?.max || 88;
      const newPoint: CalibrationPoint = {
        x: x * (canvas.width / rect.width),
        y: y * (canvas.height / rect.height),
        dataX: 0,
        dataY: maxTemp,
        label: `Temp Max (${maxTemp}°C)`
      };
      
      const updated = [...calibrationPoints, newPoint];
      console.log('Adding temp max point:', newPoint);
      setCalibrationPoints(updated);
      setShowTempPrompt(true);
      setCurrentStep('extract');
    } else if (currentStep === 'extract') {
      // Check if clicking on existing point
      const pointIndex = findPointAtPosition(canvasX, canvasY, eraserMode ? eraserSizePx : 10);
      console.log('Point detection result:', pointIndex);
      
      if (eraserMode && pointIndex >= 0) {
        // Eraser mode - delete the point
        console.log('Deleting point:', pointIndex);
        const currentData = getCurrentData();
        const updatedData = currentData.filter((_, index) => index !== pointIndex);
        
        // Update the correct data array
        switch (viewMode) {
          case 'fine':
            setFineGeneratedCurve(updatedData);
            break;
          default:
            setExtractedPoints(updatedData);
        }
      } else if (!eraserMode && pointIndex >= 0) {
        console.log('Starting to drag point:', pointIndex);
        // Start dragging existing point
        setIsDragging(true);
        setDraggedPointIndex(pointIndex);
      } else if (!eraserMode) {
        console.log('Adding new manual point');
        // Add new manual point
        const newPoint: DataPoint = {
          x: canvasX,
          y: canvasY,
          time: 0,
          ecValue: 0,
          isAutoDetected: false,
          id: `manual-${Date.now()}`
        };
        
        // Convert pixel coordinates to data coordinates
        const dataCoords = pixelToData(newPoint.x, newPoint.y);
        newPoint.time = dataCoords.time;
        newPoint.ecValue = dataCoords.ecValue;
        newPoint.temperature = dataCoords.temperature;
        
        // Add new point to the appropriate data array based on current view mode
        const updated = [...getCurrentData(), newPoint].sort((a, b) => a.time - b.time);
        
        // Update the correct data array
        switch (viewMode) {
          case 'fine':
            setFineGeneratedCurve(updated);
            break;
          default:
            setExtractedPoints(updated);
        }
      }
    }
  }, [currentStep, calibrationPoints, extractedPoints, findPointAtPosition, eraserMode, eraserSizePx, phasePinTarget, updatePhaseLog, calibrateXValue, calibrateYValue, useBoxCalibrationMode]);

  const getCanvasCoordinatesFromClient = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (clientY - rect.top) * (canvas.height / rect.height);
    return { canvas, canvasX, canvasY };
  }, []);

  const handleCanvasPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!(useBoxCalibrationMode && (currentStep === 'calibrate-origin' || currentStep === 'calibrate-x' || currentStep === 'calibrate-y'))) {
      return;
    }

    const coords = getCanvasCoordinatesFromClient(event.clientX, event.clientY);
    if (!coords) return;
    event.preventDefault();
    coords.canvas.setPointerCapture(event.pointerId);
    const hitTarget = editableCalibrationBox
      ? getCalibrationBoxHitTarget(coords.canvasX, coords.canvasY, editableCalibrationBox)
      : null;

    setCalibrationBoxDragOrigin({ x: coords.canvasX, y: coords.canvasY });
    setCalibrationBoxInitialRect(editableCalibrationBox);

    if (hitTarget && editableCalibrationBox) {
      setCalibrationBoxDragMode(hitTarget);
      return;
    }

    const freshRect = createCalibrationBoxRect(
      { x: coords.canvasX, y: coords.canvasY },
      { x: coords.canvasX, y: coords.canvasY }
    );
    setCalibrationBoxDragMode('draw');
    setCalibrationBoxInitialRect(freshRect);
    setEditableCalibrationBox(freshRect);
  }, [useBoxCalibrationMode, currentStep, getCanvasCoordinatesFromClient, editableCalibrationBox, getCalibrationBoxHitTarget, createCalibrationBoxRect]);

  const handleCanvasPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!calibrationBoxDragMode || !calibrationBoxDragOrigin) return;
    const coords = getCanvasCoordinatesFromClient(event.clientX, event.clientY);
    if (!coords) return;
    event.preventDefault();

    const canvasWidth = coords.canvas.width;
    const canvasHeight = coords.canvas.height;
    let nextRect: CalibrationBoxRect | null = null;

    if (calibrationBoxDragMode === 'draw') {
      nextRect = createCalibrationBoxRect(calibrationBoxDragOrigin, { x: coords.canvasX, y: coords.canvasY });
    } else if (calibrationBoxInitialRect) {
      const dx = coords.canvasX - calibrationBoxDragOrigin.x;
      const dy = coords.canvasY - calibrationBoxDragOrigin.y;
      const initial = calibrationBoxInitialRect;

      if (calibrationBoxDragMode === 'move') {
        const width = initial.right - initial.left;
        const height = initial.bottom - initial.top;
        const left = clampValue(initial.left + dx, 0, canvasWidth - width);
        const top = clampValue(initial.top + dy, 0, canvasHeight - height);
        nextRect = {
          left,
          top,
          right: left + width,
          bottom: top + height,
        };
      } else {
        nextRect = { ...initial };
        if (calibrationBoxDragMode === 'resize-top-left' || calibrationBoxDragMode === 'resize-bottom-left') {
          nextRect.left = clampValue(coords.canvasX, 0, initial.right - CALIBRATION_BOX_MIN_SIZE);
        }
        if (calibrationBoxDragMode === 'resize-top-right' || calibrationBoxDragMode === 'resize-bottom-right') {
          nextRect.right = clampValue(coords.canvasX, initial.left + CALIBRATION_BOX_MIN_SIZE, canvasWidth);
        }
        if (calibrationBoxDragMode === 'resize-top-left' || calibrationBoxDragMode === 'resize-top-right') {
          nextRect.top = clampValue(coords.canvasY, 0, initial.bottom - CALIBRATION_BOX_MIN_SIZE);
        }
        if (calibrationBoxDragMode === 'resize-bottom-left' || calibrationBoxDragMode === 'resize-bottom-right') {
          nextRect.bottom = clampValue(coords.canvasY, initial.top + CALIBRATION_BOX_MIN_SIZE, canvasHeight);
        }
      }
    }

    if (nextRect) {
      setEditableCalibrationBox(nextRect);
      syncCalibrationPointsFromBox(nextRect);
      setError(null);
    }
  }, [calibrationBoxDragMode, calibrationBoxDragOrigin, getCanvasCoordinatesFromClient, calibrationBoxInitialRect, createCalibrationBoxRect, clampValue, syncCalibrationPointsFromBox]);

  const handleCanvasPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!calibrationBoxDragMode) return;

    const coords = getCanvasCoordinatesFromClient(event.clientX, event.clientY);
    if (!coords) return;

    event.preventDefault();
    try {
      coords.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // no-op: release can throw if pointer capture is already released
    }

    if (editableCalibrationBox) {
      const width = editableCalibrationBox.right - editableCalibrationBox.left;
      const height = editableCalibrationBox.bottom - editableCalibrationBox.top;
      if (width < CALIBRATION_BOX_MIN_SIZE || height < CALIBRATION_BOX_MIN_SIZE) {
        setError('Draw a larger box. Then drag inside to move it or use the corner handles to resize it.');
      }
    }

    setCalibrationBoxDragMode(null);
    setCalibrationBoxDragOrigin(null);
    setCalibrationBoxInitialRect(null);
    suppressNextCanvasClickRef.current = true;
  }, [calibrationBoxDragMode, getCanvasCoordinatesFromClient, editableCalibrationBox]);

  const pixelToData = useCallback((pixelX: number, pixelY: number) => {
    if (calibrationPoints.length < 3) {
      return { time: 0, ecValue: 0 };
    }

    // Get calibration points
    const origin = calibrationPoints[0]; // (0, 0)
    const xEnd = calibrationPoints[1]; // (150s mark, 0)
    const yEnd = calibrationPoints[2]; // (0, 20 EC mark)
    const highestPoint = calibrationPoints[3] || null; // Highest visible EC point (may not exist yet)

    // Calculate scales based on 150 second and 20 EC calibration
    const xScale = (xEnd.x - origin.x) !== 0 ? (xEnd.dataX - origin.dataX) / (xEnd.x - origin.x) : 0;
    const yScale = (yEnd.y - origin.y) !== 0 ? (yEnd.dataY - origin.dataY) / (yEnd.y - origin.y) : 0;

    // Convert to data coordinates
    let time = origin.dataX + (pixelX - origin.x) * xScale;
    let ecValue = origin.dataY + (pixelY - origin.y) * yScale;
    let temperature = undefined;

    // Temperature conversion if calibration points exist
    if (calibrationPoints.length >= 6) {
      const tempMinPoint = calibrationPoints[4]; // Temp min point
      const tempMaxPoint = calibrationPoints[5]; // Temp max point
      
      // Calculate temperature scale with division by zero protection
      const tempScale = (tempMaxPoint.y - tempMinPoint.y) !== 0 ? 
        (tempMaxPoint.dataY - tempMinPoint.dataY) / (tempMaxPoint.y - tempMinPoint.y) : 0;
      temperature = tempMinPoint.dataY + (pixelY - tempMinPoint.y) * tempScale;
    }

    // Extrapolate beyond calibrated x-max seconds if pixel is beyond the calibration point
    const xAxisMax = xEnd.dataX || calibrateXValue;
    if (pixelX > xEnd.x) {
      const beyondRatio = (xEnd.x - origin.x) !== 0 ? (pixelX - xEnd.x) / (xEnd.x - origin.x) : 0;
      time = Math.min(xAxisMax + 50, xAxisMax + (beyondRatio * 50));
    }

    // Improved EC extrapolation using highest point reference
    const yAxisMax = yEnd.dataY || calibrateYValue;
    if (pixelY < yEnd.y && highestPoint) {
      const aboveRatio = (yEnd.y - origin.y) !== 0 ? (yEnd.y - pixelY) / (yEnd.y - origin.y) : 0;
      
      if (highestPoint.dataY > yAxisMax) {
        const ecRange = highestPoint.dataY - yAxisMax;
        ecValue = Math.min(40, yAxisMax + (aboveRatio * (ecRange + 10)));
      } else {
        ecValue = Math.min(yAxisMax + 10, yAxisMax + (aboveRatio * 10));
      }
    }

    return { time, ecValue, temperature };
  }, [calibrationPoints, calibrateXValue, calibrateYValue]);

  const dataToCanvas = useCallback((time: number, ecValue: number) => {
    if (calibrationPoints.length < 3) {
      return { x: 0, y: 0 };
    }

    // Get calibration points (4-point system)
    const origin = calibrationPoints[0]; // (0, 0)
    const xEnd = calibrationPoints[1]; // (150s mark, 0)
    const yEnd = calibrationPoints[2]; // (0, 20 EC mark)

    // Calculate scales based on 150 second and 20 EC calibration
    const xScale = (xEnd.x - origin.x) !== 0 ? (xEnd.dataX - origin.dataX) / (xEnd.x - origin.x) : 0;
    const yScale = (yEnd.y - origin.y) !== 0 ? (yEnd.dataY - origin.dataY) / (yEnd.y - origin.y) : 0;

    // Convert data coordinates to pixel coordinates
    let pixelX = xScale !== 0 ? origin.x + (time - origin.dataX) / xScale : origin.x;
    let pixelY = yScale !== 0 ? origin.y + (ecValue - origin.dataY) / yScale : origin.y;

    // Handle extrapolation for time beyond calibrated x-max
    const xAxisMaxC = xEnd.dataX || calibrateXValue;
    if (time > xAxisMaxC) {
      const beyondRatio = (time - xAxisMaxC) / 50;
      pixelX = xEnd.x + beyondRatio * (xEnd.x - origin.x);
    }

    // Handle extrapolation for EC above calibrated y-max
    const yAxisMaxC = yEnd.dataY || calibrateYValue;
    if (ecValue > yAxisMaxC && calibrationPoints.length >= 4) {
      const highestPoint = calibrationPoints[3];
      if (highestPoint.dataY > yAxisMaxC) {
        const aboveRatio = (ecValue - yAxisMaxC) / (highestPoint.dataY - yAxisMaxC);
        pixelY = yEnd.y - aboveRatio * (yEnd.y - highestPoint.y);
      }
    }

    return { x: pixelX, y: pixelY };
  }, [calibrationPoints, calibrateXValue, calibrateYValue]);

  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = (event.clientX - rect.left) * (canvas.width / rect.width);
    const canvasY = (event.clientY - rect.top) * (canvas.height / rect.height);

    // Keep a live eraser cursor preview synced with actual canvas pixels.
    if (eraserMode) {
      setEraserCursor({ x: canvasX, y: canvasY, visible: true });
    }

    if (phasePinTarget) {
      const dataCoords = pixelToData(canvasX, canvasY);
      setPhasePinCursor({
        x: canvasX,
        time: Math.max(0, Number(dataCoords.time.toFixed(1))),
        visible: true
      });
    }

    if (!isDragging || draggedPointIndex === null) return;

    // Get current data based on view mode
    const currentData = getCurrentData();
    const updatedPoints = [...currentData];
    const point = updatedPoints[draggedPointIndex];
    
    point.x = canvasX;
    point.y = canvasY;
    
    // Convert to data coordinates
    const dataCoords = pixelToData(canvasX, canvasY);
    point.time = dataCoords.time;
    point.ecValue = dataCoords.ecValue;
    
    // Update the correct data array
    switch (viewMode) {
      case 'fine':
        setFineGeneratedCurve(updatedPoints);
        break;
      default:
        setExtractedPoints(updatedPoints);
    }
  }, [isDragging, draggedPointIndex, getCurrentData, viewMode, eraserMode, phasePinTarget, pixelToData]);

  const handleCanvasMouseUp = useCallback(() => {
    setIsDragging(false);
    setDraggedPointIndex(null);
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    setIsDragging(false);
    setDraggedPointIndex(null);
    setEraserCursor(prev => ({ ...prev, visible: false }));
    setPhasePinCursor(prev => ({ ...prev, visible: false }));
    setCalibrationBoxDragMode(null);
    setCalibrationBoxDragOrigin(null);
    setCalibrationBoxInitialRect(null);
  }, []);

  useEffect(() => {
    if (!eraserMode) {
      setEraserCursor(prev => ({ ...prev, visible: false }));
    }
  }, [eraserMode]);

  const updateHighestEC = useCallback((value: string) => {
    setManualHighestEC(value);
    
    // Update the calibration point with manual value
    if (calibrationPoints.length >= 4) {
      const updated = [...calibrationPoints];
      updated[3] = {
        ...updated[3],
        dataY: parseFloat(value) || updated[3].dataY,
        label: `Highest EC Point (${value})`
      };
      setCalibrationPoints(updated);
      
      // Also update the extracted highest point if it exists
      setExtractedPoints(prev => {
        const updatedPoints = [...prev];
        const highestIndex = updatedPoints.findIndex(p => p.id?.startsWith('highest-calibration-'));
        if (highestIndex >= 0) {
          updatedPoints[highestIndex] = {
            ...updatedPoints[highestIndex],
            ecValue: parseFloat(value) || updatedPoints[highestIndex].ecValue
          };
        }
        return updatedPoints.sort((a, b) => a.time - b.time);
      });
    }
  }, [calibrationPoints]);

  const autoPlaceHighestPoint = useCallback(() => {
    const highestEC = parseFloat(manualHighestEC);
    if (!isFinite(highestEC) || highestEC <= 0 || calibrationPoints.length < 3) return;
    const origin = calibrationPoints[0];
    const xEnd = calibrationPoints[1];
    const yEnd = calibrationPoints[2];
    const ySpan = yEnd.y - origin.y; // negative (canvas Y increases downward)
    const yDataSpan = yEnd.dataY - origin.dataY;
    const pixelY = yDataSpan !== 0 ? origin.y + (highestEC - origin.dataY) * (ySpan / yDataSpan) : yEnd.y;
    const pixelX = (origin.x + xEnd.x) / 2;
    const newPoint: CalibrationPoint = {
      x: pixelX,
      y: pixelY,
      dataX: (origin.dataX + xEnd.dataX) / 2,
      dataY: highestEC,
      label: `Highest EC Point (${highestEC})`
    };
    setCalibrationPoints([...calibrationPoints.slice(0, 3), newPoint]);
    setCurrentStep('extract');
  }, [calibrationPoints, manualHighestEC]);

  const completeHighestCalibration = useCallback(() => {
    if (calibrationPoints.length >= 4) {
      // Add the highest calibration point to extracted points
      const highestPoint = calibrationPoints[3];
      const extractedHighest: DataPoint = {
        x: highestPoint.x,
        y: highestPoint.y,
        time: highestPoint.dataX,
        ecValue: highestPoint.dataY,
        isAutoDetected: true,
        id: `highest-calibration-${Date.now()}`
      };
      
      // Add to extracted points and sort by time
      setExtractedPoints(prev => [...prev, extractedHighest].sort((a, b) => a.time - b.time));
      setCurrentStep('extract');
    }
  }, [calibrationPoints]);

  const detectBlueCurve = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;
    
    if (!canvas || !ctx || !img || calibrationPoints.length < 3) {
      return [];
    }

    // Get image data for edge detection
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Find blue pixels (simplified color detection)
    const bluePixels: Array<{x: number, y: number}> = [];
    
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const idx = (y * canvas.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Simple blue detection (blue channel dominant)
        if (b > r * 1.5 && b > g * 1.5 && b > 100) {
          bluePixels.push({x, y});
        }
      }
    }

    // Group blue pixels by X coordinate to find the curve
    const curvePoints: Array<{x: number, y: number}> = [];
    const xGroups: {[key: number]: number[]} = {};
    
    bluePixels.forEach(pixel => {
      if (!xGroups[pixel.x]) xGroups[pixel.x] = [];
      xGroups[pixel.x].push(pixel.y);
    });

    // For each X column, find the median Y (likely the curve)
    Object.keys(xGroups).forEach(x => {
      const xNum = parseInt(x);
      const yValues = xGroups[xNum].sort((a, b) => a - b);
      const medianY = yValues[Math.floor(yValues.length / 2)];
      curvePoints.push({x: xNum, y: medianY});
    });

    // Convert to data coordinates and return
    return curvePoints.map(point => {
      const dataCoords = pixelToData(point.x, point.y);
      return {
        x: point.x,
        y: point.y,
        time: dataCoords.time,
        ecValue: dataCoords.ecValue
      };
    }).filter(point => 
      point.time >= 0 && point.ecValue >= 0 && 
      point.time <= 200 && point.ecValue <= 30
    ).sort((a, b) => a.time - b.time);

  }, [calibrationPoints, pixelToData]);

  const generateCurve = useCallback(() => {
    // Trace the EC line from the image first
    const tracedPoints = detectBlueCurve();
    if (extractedPoints.length < 2 && tracedPoints.length < 2) {
      setError('Need at least 2 data points or a detectable blue EC line');
      return;
    }
    let sourcePoints: DataPoint[];

    if (tracedPoints.length > 0) {
      const tracedDataPoints: DataPoint[] = tracedPoints.map(tp => ({
        x: tp.x,
        y: tp.y,
        time: tp.time,
        ecValue: tp.ecValue,
        isAutoDetected: true,
        id: `trace-${Math.round(tp.time * 1000)}`
      }));
      const filteredTraced = tracedDataPoints.filter(tp =>
        !extractedPoints.some(ep => Math.abs(ep.time - tp.time) < 0.3)
      );
      sourcePoints = [...filteredTraced, ...extractedPoints].sort((a, b) => a.time - b.time);
    } else {
      sourcePoints = [...extractedPoints].sort((a, b) => a.time - b.time);
    }

    const stepSec = intervalMs / 1000; // e.g. 0.1 for 100ms
    const curve: DataPoint[] = [];

    // Add all source points first
    sourcePoints.forEach(point => {
      curve.push({ ...point, id: `original-${point.id || 'unknown'}` });
    });

    // Fill gaps between consecutive source points at the chosen interval
    for (let i = 0; i < sourcePoints.length - 1; i++) {
      const start = sourcePoints[i];
      const end = sourcePoints[i + 1];
      const gap = end.time - start.time;
      const steps = Math.ceil(gap / stepSec);

      if (steps > 1) {
        for (let step = 1; step < steps; step++) {
          const t = start.time + step * stepSec;
          const ratio = (t - start.time) / (end.time - start.time);
          const ecValue = start.ecValue + (end.ecValue - start.ecValue) * ratio;
          const canvasCoords = dataToCanvas(t, ecValue);
          curve.push({
            x: canvasCoords.x,
            y: canvasCoords.y,
            time: t,
            ecValue,
            isAutoDetected: false,
            id: `gen-${Math.round(t * 1000)}`
          });
        }
      }
    }

    curve.sort((a, b) => a.time - b.time);
    setFineGeneratedCurve(curve);
    setViewMode('fine');
    setError(null);
  }, [extractedPoints, detectBlueCurve, dataToCanvas, intervalMs]);


  const calculateRedLight = useCallback(() => {
    const currentData = getCurrentData();
    
    // Filter points based on time threshold
    const filteredData = currentData.filter(point => point.time >= redLightTimeThreshold);
    
    // Sort only the filtered data (much smaller dataset)
    const sortedData = filteredData.sort((a, b) => a.time - b.time);
    
    console.log('Calculating Red Light for mode:', viewMode);
    console.log('Settings:', { 
      timeThreshold: redLightTimeThreshold, 
      ecThreshold: redLightECThreshold,
      originalLength: currentData.length, 
      filteredLength: sortedData.length 
    });
    
    // Find first point where EC < threshold (already filtered for time)
    for (const point of sortedData) {
      if (point.ecValue < redLightECThreshold) {
        console.log('Found Red Light point:', point);
        setRedLightTime(point.time);
        setShowRedLight(true); // Always show when calculated
        return point.time;
      }
    }
    
    console.log('No Red Light point found');
    setRedLightTime(null);
    setShowRedLight(false); // Hide when no result
    return null;
  }, [getCurrentData, viewMode, redLightTimeThreshold, redLightECThreshold]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const formatRawSeconds = useCallback((seconds: number) => {
    return seconds.toFixed(1);
  }, []);

  const saveCalibrationProfile = useCallback((profileName: string) => {
    if (calibrationPoints.length < 4) {
      setError('Need 4 calibration points before saving calibration profile');
      return;
    }

    const sourceWidth = imageRef.current?.naturalWidth || canvasRef.current?.width || 0;
    const sourceHeight = imageRef.current?.naturalHeight || canvasRef.current?.height || 0;
    if (!sourceWidth || !sourceHeight) {
      setError('Image must be loaded before saving calibration profile');
      return;
    }

    const name = profileName.trim();
    if (!name) {
      setError('Profile name cannot be empty');
      return;
    }

    const payload: SavedCalibrationProfile = {
      version: 1,
      name: name,
      sourceImageName: selectedImageName || undefined,
      sourceImageSize: {
        width: sourceWidth,
        height: sourceHeight
      },
      points: calibrationPoints.slice(0, 4),
      createdAt: new Date().toISOString()
    };

    const existingIndex = savedCalibrationProfiles.findIndex(profile => profile.name === name);
    let updatedProfiles: SavedCalibrationProfile[] = [];

    if (existingIndex >= 0) {
      updatedProfiles = [...savedCalibrationProfiles];
      updatedProfiles[existingIndex] = payload;
    } else {
      updatedProfiles = [...savedCalibrationProfiles, payload];
    }

    updatedProfiles.sort((a, b) => a.name.localeCompare(b.name));
    setSavedCalibrationProfiles(updatedProfiles);
    setSelectedCalibrationProfile(name);
    localStorage.setItem(CALIBRATION_PROFILE_STORAGE_KEY, JSON.stringify(updatedProfiles));
    setShowSaveProfileForm(false);
    setNewProfileName('');
    setError(null);
  }, [calibrationPoints, selectedImageName, savedCalibrationProfiles]);

  const applyCalibrationProfile = useCallback((profile: SavedCalibrationProfile) => {
    const currentWidth = imageRef.current?.naturalWidth || canvasRef.current?.width || 0;
    const currentHeight = imageRef.current?.naturalHeight || canvasRef.current?.height || 0;
    if (!currentWidth || !currentHeight) {
      setError('Upload and render screenshot first before loading profile');
      return;
    }

    const savedWidth = profile.sourceImageSize?.width || currentWidth || 1;
    const savedHeight = profile.sourceImageSize?.height || currentHeight || 1;

    const xRatio = savedWidth ? currentWidth / savedWidth : 1;
    const yRatio = savedHeight ? currentHeight / savedHeight : 1;

    const scaledPoints = profile.points.slice(0, 4).map((point) => ({
      ...point,
      x: point.x * xRatio,
      y: point.y * yRatio
    }));

    setCalibrationPoints(scaledPoints);
    setManualHighestEC(scaledPoints[3].dataY.toFixed(2));
    if (scaledPoints.length >= 2) setCalibrateXValue(scaledPoints[1].dataX);
    if (scaledPoints.length >= 3) setCalibrateYValue(scaledPoints[2].dataY);
    setCurrentStep('extract');
    setLoadedCalibrationProfileName(profile.name);
    setError(null);
  }, []);

  const loadSelectedCalibrationProfile = useCallback(() => {
    if (!selectedCalibrationProfile) {
      setError('Select a calibration profile first');
      return;
    }

    const profile = savedCalibrationProfiles.find(item => item.name === selectedCalibrationProfile);
    if (!profile) {
      setError('Selected calibration profile was not found');
      return;
    }

    applyCalibrationProfile(profile);
  }, [selectedCalibrationProfile, savedCalibrationProfiles, applyCalibrationProfile]);

  const savePhaseLogProfile = useCallback((profileName: string) => {
    if (phaseLogs.length === 0) {
      setError('Add at least one phase log before saving a phase profile');
      return;
    }

    const name = profileName.trim();
    if (!name) {
      setError('Phase profile name cannot be empty');
      return;
    }

    const sanitizedPhaseLogs = phaseLogs
      .map((log, index) => ({
        id: `phase-${index + 1}`,
        name: (log.name || `Phase ${index + 1}`).trim() || `Phase ${index + 1}`,
        startTime: Number.isFinite(log.startTime) ? Number(log.startTime.toFixed(1)) : 0,
        endTime: Number.isFinite(log.endTime) ? Number(log.endTime.toFixed(1)) : 0,
        color: log.color || PHASE_COLORS[index % PHASE_COLORS.length],
        expectedECMin: log.expectedECMin ?? null,
        expectedECMax: log.expectedECMax ?? null,
      }))
      .sort((a, b) => a.startTime - b.startTime);

    const payload: SavedPhaseLogProfile = {
      version: 1,
      name,
      phaseLogs: sanitizedPhaseLogs,
      createdAt: new Date().toISOString(),
    };

    const existingIndex = savedPhaseLogProfiles.findIndex(profile => profile.name === name);
    let updatedProfiles: SavedPhaseLogProfile[] = [];

    if (existingIndex >= 0) {
      updatedProfiles = [...savedPhaseLogProfiles];
      updatedProfiles[existingIndex] = payload;
    } else {
      updatedProfiles = [...savedPhaseLogProfiles, payload];
    }

    updatedProfiles.sort((a, b) => a.name.localeCompare(b.name));
    setSavedPhaseLogProfiles(updatedProfiles);
    setSelectedPhaseLogProfile(name);
    setLoadedPhaseProfileName(name);
    localStorage.setItem(PHASE_LOG_PROFILE_STORAGE_KEY, JSON.stringify(updatedProfiles));
    setShowSavePhaseProfileForm(false);
    setNewPhaseProfileName('');
    setError(null);
  }, [phaseLogs, PHASE_COLORS, savedPhaseLogProfiles]);

  const applyPhaseLogProfile = useCallback((profile: SavedPhaseLogProfile) => {
    const appliedLogs = profile.phaseLogs
      .map((log, index) => ({
        id: `phase-loaded-${Date.now()}-${index}`,
        name: (log.name || `Phase ${index + 1}`).trim() || `Phase ${index + 1}`,
        startTime: Number.isFinite(log.startTime) ? Number(log.startTime.toFixed(1)) : 0,
        endTime: Number.isFinite(log.endTime) ? Number(log.endTime.toFixed(1)) : 0,
        color: log.color || PHASE_COLORS[index % PHASE_COLORS.length],
        expectedECMin: log.expectedECMin ?? null,
        expectedECMax: log.expectedECMax ?? null,
      }))
      .sort((a, b) => a.startTime - b.startTime);

    setPhaseLogs(appliedLogs);
    setPhasePinTarget(null);
    setPhasePinCursor(cursor => ({ ...cursor, visible: false }));
    setLoadedPhaseProfileName(profile.name);
    setError(null);
  }, [PHASE_COLORS]);

  const loadSelectedPhaseLogProfile = useCallback(() => {
    if (!selectedPhaseLogProfile) {
      setError('Select a phase profile first');
      return;
    }

    const profile = savedPhaseLogProfiles.find(item => item.name === selectedPhaseLogProfile);
    if (!profile) {
      setError('Selected phase profile was not found');
      return;
    }

    applyPhaseLogProfile(profile);
  }, [selectedPhaseLogProfile, savedPhaseLogProfiles, applyPhaseLogProfile]);

  const toggleDataView = useCallback(() => {
    setViewMode(prev => prev === 'original' ? 'fine' : 'original');
  }, []);

  
  const resetCalibration = useCallback(() => {
    setCalibrationPoints([]);
    setExtractedPoints([]);
    setFineGeneratedCurve([]);
    setPhaseLogs([]);
    setPhasePinTarget(null);
    setPhasePinCursor(cursor => ({ ...cursor, visible: false }));
    setLoadedCalibrationProfileName(null);
    setLoadedPhaseProfileName(null);
    setViewMode('original');
    setManualHighestEC('');
    setImportedJsonLabel(null);
    setImportedJsonText('');
    setShowJsonImportPrompt(false);
    setUltrakokiBrewData(null);
    setEditableCalibrationBox(null);
    setCalibrationBoxDragMode(null);
    setCalibrationBoxDragOrigin(null);
    setCalibrationBoxInitialRect(null);
    setUseBoxCalibrationMode(false);
    setCurrentStep('calibrate-origin');
  }, []);

  const importJsonPayload = useCallback((inputText: string, closePromptOnSuccess: boolean = true) => {
    try {
      // ── Sanitize raw input before parsing ────────────────────────────────
      let raw = inputText
        .replace(/^\uFEFF/, '')          // strip UTF-8 BOM
        .replace(/^\u200B/, '')          // strip zero-width space
        .trim();

      // Extract the first JSON value if the text has extra leading/trailing chars
      const firstBracket = raw.search(/[\[{]/);
      if (firstBracket > 0) raw = raw.slice(firstBracket);
      // Remove trailing text after the closing bracket/brace
      const closingChar = raw[0] === '[' ? ']' : '}';
      const lastClose = raw.lastIndexOf(closingChar);
      if (lastClose > 0) raw = raw.slice(0, lastClose + 1);

      // Strip single-line // comments
      raw = raw.replace(/\/\/[^\n]*/g, '');
      // Strip block /* … */ comments
      raw = raw.replace(/\/\*[\s\S]*?\*\//g, '');
      // Remove trailing commas before } or ] (common JSONC issue)
      raw = raw.replace(/,\s*([}\]])/g, '$1');

      const parsed = JSON.parse(raw) as unknown;

      const buildPoint = (time: number, ecValue: number, temperature: number | undefined, index: number): DataPoint => ({
        x: 0,
        y: 0,
        time: Number(time.toFixed(3)),
        ecValue: Number(ecValue.toFixed(3)),
        temperature,
        isAutoDetected: true,
        id: `import-${index}`
      });

      let importedPoints: DataPoint[] = [];
      let importedLabel = 'Imported JSON';
      let importedBrewData: UltrakokiBrewData | null = null;

      if (Array.isArray(parsed)) {
        importedPoints = parsed
          .map((item, index) => {
            if (!isRecord(item)) return null;
            const timeMs = toFiniteNumber(item.timeMs);
            const timeSeconds = toFiniteNumber(item.time);
            const ecValue = toFiniteNumber(item.ecValue) ?? toFiniteNumber(item.ec) ?? toFiniteNumber(item.value);
            const temperature = toFiniteNumber(item.temperature) ?? undefined;

            if (ecValue === null) return null;

            const resolvedTime = timeMs !== null
              ? timeMs / 1000
              : timeSeconds !== null
                ? timeSeconds
                : index;

            return buildPoint(resolvedTime, ecValue, temperature, index);
          })
          .filter((point): point is DataPoint => point !== null)
          .sort((a, b) => a.time - b.time);

        importedLabel = 'Imported point array';
        setUltrakokiBrewData(null);
      } else if (isRecord(parsed)) {
        // Accept ultrakoki wrappers where payload may be nested or stringified.
        const tryRecord = (value: unknown): Record<string, unknown> | null => {
          if (isRecord(value)) return value as Record<string, unknown>;
          if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              try {
                const parsedInner = JSON.parse(trimmed) as unknown;
                return isRecord(parsedInner) ? parsedInner as Record<string, unknown> : null;
              } catch {
                return null;
              }
            }
          }
          return null;
        };

        const outer = parsed as Record<string, unknown>;
        const candidates: Record<string, unknown>[] = [outer];
        const nestedCandidates = [outer.json, outer.data, outer.payload, outer.body, outer.result]
          .map(value => tryRecord(value))
          .filter((value): value is Record<string, unknown> => value !== null);
        candidates.push(...nestedCandidates);

        const pickArray = (obj: Record<string, unknown>, keys: string[]): number[] => {
          for (const key of keys) {
            const values = toNumberArray(obj[key]);
            if (values.length > 0) return values;
          }
          return [];
        };

        for (const candidate of candidates) {
          const brewingLog = isRecord(candidate.brewingLog)
            ? candidate.brewingLog as Record<string, unknown>
            : isRecord(candidate.brewLog)
              ? candidate.brewLog as Record<string, unknown>
              : candidate;

          let pourFlow = pickArray(brewingLog, ['size', 'pourFlow', 'flow']);
          let dripFlow = pickArray(brewingLog, ['bsize', 'dripFlow', 'outflow']);
          let cumulativePour = pickArray(brewingLog, ['adc1', 'cumulativePour', 'cumulative']);

          if (cumulativePour.length === 0 && pourFlow.length > 0) {
            let running = 0;
            cumulativePour = pourFlow.map(value => {
              running += value;
              return Number(running.toFixed(3));
            });
          }

          const sampleCount = Math.max(pourFlow.length, dripFlow.length, cumulativePour.length);
          if (sampleCount <= 1) continue;

          if (pourFlow.length === 0) pourFlow = Array(sampleCount).fill(0);
          if (dripFlow.length === 0) dripFlow = Array(sampleCount).fill(0);
          if (cumulativePour.length === 0) cumulativePour = Array(sampleCount).fill(0);

          const rawDuration =
            toFiniteNumber(brewingLog.period) ??
            toFiniteNumber(brewingLog.totalDuration) ??
            toFiniteNumber(candidate.period) ??
            toFiniteNumber(candidate.totalDuration) ??
            toFiniteNumber(outer.period) ??
            toFiniteNumber(outer.totalDuration) ??
            Math.max(sampleCount - 1, 1);

          // Some exports store duration in ms.
          const duration = rawDuration > 10000 ? rawDuration / 1000 : rawDuration;
          const intervalSeconds = sampleCount > 1 ? duration / (sampleCount - 1) : 1;

          const singleBean = isRecord(candidate.singleBean) ? candidate.singleBean as Record<string, unknown> : null;
          const labelParts = [
            typeof candidate.cupFactory === 'string' ? candidate.cupFactory.trim() : '',
            typeof candidate.cupModel === 'string' ? candidate.cupModel.trim() : '',
            typeof singleBean?.name === 'string' ? singleBean.name.trim() : ''
          ].filter(Boolean);
          importedLabel = labelParts.length > 0 ? labelParts.join(' / ') : 'Imported ultrakoki brew log';

          importedBrewData = {
            period: Number(duration.toFixed(3)),
            label: importedLabel,
            intervalSeconds: Number(intervalSeconds.toFixed(6)),
            pourFlow,
            dripFlow,
            cumulativePour,
          };
          break;
        }
      }

      if (importedBrewData) {
        setUltrakokiBrewData(importedBrewData);
        setImportedJsonLabel(importedLabel);
        if (closePromptOnSuccess) setShowJsonImportPrompt(false);
        setImportedJsonText('');
        setError(null);
        return;
      }

      if (importedPoints.length < 2) {
        setError('Could not find a supported import in this JSON. Expected either an EC point array or an Ultrakoki brewingLog with pour data.');
        return;
      }

      // Map imported data coordinates through current calibration so points render on the canvas
      const mappedPoints = calibrationPoints.length >= 3
        ? importedPoints.map(pt => {
            const canvasCoords = dataToCanvas(pt.time, pt.ecValue);
            return { ...pt, x: canvasCoords.x, y: canvasCoords.y };
          })
        : importedPoints;

      setExtractedPoints(mappedPoints);
      setFineGeneratedCurve([]);
      setViewMode('original');
      setImportedJsonLabel(importedLabel);
      setCurrentStep('extract');
      if (closePromptOnSuccess) setShowJsonImportPrompt(false);
      setImportedJsonText('');
      setError(null);
      onDataExtracted(mappedPoints);
    } catch (err) {
      console.error('Failed to import JSON:', err);
      setError('Invalid JSON. Paste a full JSON object or point-array export.');
    }
  }, [onDataExtracted, calibrationPoints, dataToCanvas]);

  const importJsonData = useCallback(() => {
    importJsonPayload(importedJsonText, true);
  }, [importJsonPayload, importedJsonText]);

  const resetGenerated = useCallback(() => {
    setFineGeneratedCurve([]);
    setViewMode('original');
    setError(null);
  }, []);

  const completeExtraction = useCallback(() => {
    if (extractedPoints.length === 0) {
      setError('Please extract at least one data point');
      return;
    }

    // Sort points by time
    const sorted = extractedPoints.sort((a, b) => a.time - b.time);
    onDataExtracted(sorted);
    setCurrentStep('complete');
  }, [extractedPoints, onDataExtracted]);

  const autoDetectCurve = useCallback(() => {
    const detectedPoints = detectBlueCurve();
    if (detectedPoints.length > 0) {
      // Sample points (take every Nth point to avoid too many)
      const sampleSize = Math.min(20, detectedPoints.length);
      const step = Math.max(1, Math.floor(detectedPoints.length / sampleSize));
      const sampled = detectedPoints.filter((_, index) => index % step === 0);

      // Mark as auto-detected and sort by time
      const markedPoints = sampled.map(point => ({
        ...point,
        isAutoDetected: true,
        id: `auto-${Date.now()}-${Math.random()}`
      })).sort((a, b) => a.time - b.time);

      setExtractedPoints(prev => {
        // Merge with existing points, preserving highest calibration point
        const existingHighestPoint = prev.find(p => p.id?.startsWith('highest-calibration-'));
        const mergedPoints = [...markedPoints];

        // Add back the highest calibration point if it exists
        if (existingHighestPoint) {
          mergedPoints.push({
            ...existingHighestPoint,
            isAutoDetected: existingHighestPoint.isAutoDetected || true,
            id: existingHighestPoint.id || `highest-calibration-${Date.now()}`
          });
        }

        // Remove duplicates (points too close to each other) and sort
        const finalPoints = mergedPoints
          .sort((a, b) => a.time - b.time)
          .filter((point, index, array) => {
            // Keep the point if it's the highest calibration point
            if (point.id?.startsWith('highest-calibration-')) return true;
            // Remove if too close to another point (within 0.5 seconds)
            return !array.some((other, otherIndex) =>
              otherIndex !== index &&
              Math.abs(other.time - point.time) < 0.5
            );
          });

        if (autoGenerateAfterDetectPreference && finalPoints.length >= 2) {
          setPendingAutoGenerate(true);
        }

        return finalPoints;
      });
    }
  }, [detectBlueCurve, autoGenerateAfterDetectPreference]);

  // Auto-detect when preference is enabled and calibration is complete.
  useEffect(() => {
    if (autoDetectPreference && currentStep === 'extract' && calibrationPoints.length >= 3 && selectedImage) {
      // Auto-detect after a short delay to ensure canvas is ready
      const timer = window.setTimeout(() => {
        autoDetectCurve();
      }, 500);

      return () => window.clearTimeout(timer);
    }
  }, [autoDetectPreference, currentStep, calibrationPoints.length, selectedImage, autoDetectCurve]);

  // If enabled, generate curve right after auto-detect has populated extracted points.
  useEffect(() => {
    if (!pendingAutoGenerate) return;
    if (currentStep !== 'extract') {
      setPendingAutoGenerate(false);
      return;
    }
    if (extractedPoints.length < 2) return;

    generateCurve();
    setPendingAutoGenerate(false);
  }, [pendingAutoGenerate, currentStep, extractedPoints.length, generateCurve]);

  const downloadJSON = useCallback(() => {
    const currentData = getCurrentData();
    const sorted = currentData.sort((a, b) => a.time - b.time);
    
    // Convert to milliseconds for JSON format
    const jsonData = sorted.map(point => ({
      timeMs: Math.round(point.time * 1000), // Convert to milliseconds
      ecValue: parseFloat(point.ecValue.toFixed(3)),
      temperature: point.temperature ? parseFloat(point.temperature.toFixed(1)) : null
    }));
    
    const json = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Different filename based on data type
    const dataType = viewMode === 'fine' ? `generated_${intervalMs}ms` : 'extracted_points';
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `belka_ec_${dataType}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [getCurrentData, viewMode]);

  const downloadData = useCallback(() => {
    // Use the current data based on view mode
    const currentData = getCurrentData();
    const sorted = currentData.sort((a, b) => a.time - b.time);
    
    const csv = [
      showMinSec ? 'Time (Min:Sec),EC Value,Temperature (°C)' : 'Time (seconds),EC Value,Temperature (°C)',
      ...sorted.map(point => {
        const tempStr = point.temperature ? point.temperature.toFixed(1) : '';
        if (showMinSec) {
          const minutes = Math.floor(point.time / 60);
          const seconds = Math.floor(point.time % 60);
          const timeFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          return `${timeFormatted},${point.ecValue.toFixed(3)},${tempStr}`;
        } else {
          return `${point.time.toFixed(2)},${point.ecValue.toFixed(3)},${tempStr}`;
        }
      })
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    // Different filename based on data type
    const dataType = viewMode === 'fine' ? `generated_${intervalMs}ms` : 'extracted_points';
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `belka_ec_${dataType}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [getCurrentData, viewMode, showMinSec]);

  useEffect(() => {
    if (selectedImage && imageRef.current) {
      const img = imageRef.current;
      if (img.complete) {
        drawCanvas();
      } else {
        img.onload = () => {
          drawCanvas();
        };
      }
    }
  }, [selectedImage, calibrationPoints, extractedPoints, drawCanvas]);

  const getInstructions = () => {
    switch (currentStep) {
      case 'upload':
        return 'Upload your Belka Portal screenshot to begin';
      case 'calibrate-origin':
        return 'Click on the ORIGIN where time = 0 and EC = 0 (bottom-left corner of the graph)';
      case 'calibrate-x':
        return `Click on the ${calibrateXValue} SECOND mark on the X-axis (right side of the graph)`;
      case 'calibrate-y':
        return `Click on the ${calibrateYValue} EC mark on the Y-axis (left side of the graph)`;
      case 'calibrate-highest':
        return 'Click on the HIGHEST visible EC point on the blue curve. This helps the system extrapolate EC values above 20 more accurately.';
      case 'calibrate-temp-min':
        return 'Click on the MINIMUM temperature point on the graph. Enter the minimum temperature from your phone (e.g., 60°C).';
      case 'calibrate-temp-max':
        return 'Click on the MAXIMUM temperature point on the graph. Enter the maximum temperature from your phone (e.g., 88°C).';
      case 'extract':
        return 'Click on the blue curve to extract data points. Use Auto-Detect for faster extraction, or click manually for precise control.';
      case 'complete':
        return 'Extraction complete! Download your data in CSV or JSON format.';
      default:
        return '';
    }

  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Manual Belka Portal Digitizer
          </h2>
          <p className="text-gray-600">
            Click-based calibration for accurate EC data extraction
          </p>
          {/* Status indicators */}
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Screenshot */}
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                selectedImage
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-500'
              }`}
              title={selectedImage ? `Screenshot loaded: ${selectedImageName}` : 'No screenshot loaded'}
            >
              <span className={`h-2 w-2 rounded-full ${selectedImage ? 'bg-green-500' : 'bg-gray-400'}`} />
              {selectedImage ? `Screenshot: ${selectedImageName}` : 'No screenshot'}
            </div>

            {/* Calibration */}
            {(() => {
              const calibrated = calibrationPoints.length >= 3;
              const loaded = loadedCalibrationProfileName !== null;
              const ok = calibrated || loaded;
              const label = loaded
                ? `Calibration: ${loadedCalibrationProfileName}`
                : calibrated
                ? 'Calibration done'
                : 'Not calibrated';
              return (
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                    ok ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                  }`}
                  title={label}
                >
                  <span className={`h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {label}
                </div>
              );
            })()}

            {/* Ultrakoki JSON (optional) */}
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                ultrakokiBrewData
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-400'
              }`}
              title={ultrakokiBrewData ? 'Ultrakoki JSON loaded' : 'Ultrakoki JSON not loaded (optional)'}
            >
              <span className={`h-2 w-2 rounded-full ${ultrakokiBrewData ? 'bg-blue-500' : 'bg-gray-300'}`} />
              {ultrakokiBrewData ? 'Ultrakoki: loaded' : 'Ultrakoki: —'}
            </div>
          </div>
        </div>
          <div className="p-6">
            {/* Upload Step */}
          {currentStep === 'upload' && (
            <div className="mb-6">
              <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-10 h-10 mb-3 text-gray-400" />
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Click to upload</span> Belka Portal screenshot
                  </p>
                  <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
              </label>
            </div>
          )}

          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-amber-900">Ultrakoki Graph Sandbox</div>
                <p className="text-sm text-amber-800">
                  Open Ultrakoki brew first so we can iterate on the custom graph layout in-app without touching calibration or JSON import.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => {
                    setUltrakokiBrewData(buildPreviewUltrakokiBrewData());
                    setImportedJsonLabel('Preview brew / mock Ultrakoki data');
                  }}
                  className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
                >
                  Preview Ultrakoki Graph
                </button>
                <button
                  onClick={() => setShowJsonImportPrompt(true)}
                  className="rounded-lg border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-950"
                >
                  Import Ultrakoki JSON
                </button>
                {ultrakokiBrewData && (
                  <button
                    onClick={() => {
                      setUltrakokiBrewData(null);
                      if (importedJsonLabel === 'Preview brew / mock Ultrakoki data') {
                        setImportedJsonLabel(null);
                      }
                    }}
                    className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Hide Graph
                  </button>
                )}
              </div>
            </div>
          </div>

          {ultrakokiBrewData && (
            <div className="mb-6">
              <UltrakokiGraph
                data={ultrakokiBrewData}
                comparisonCurve={getCurrentData().map(point => ({
                  time: point.time,
                  ecValue: point.ecValue,
                }))}
                comparisonLabel={viewMode === 'fine' ? 'Generated EC curve' : 'Digitized EC curve'}
                phaseLogs={phaseLogs}
                redLightTime={redLightTime}
                showRedLight={redLightTime !== null}
              />
            </div>
          )}

          {/* Image Display and Calibration */}
          {selectedImage && (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                  <Target className="w-5 h-5 text-blue-500 mr-2" />
                  <p className="text-blue-700 font-medium">{getInstructions()}</p>
                </div>
                {currentStep === 'calibrate-origin' && (
                  <div className="mt-3 flex items-center gap-3">
                    <label className="text-sm font-medium text-blue-800 whitespace-nowrap">Zero point value:</label>
                    <span className="px-3 py-1 text-sm bg-white border border-blue-300 rounded font-mono font-bold text-blue-900">0 (fixed)</span>
                    <span className="text-xs text-blue-600">Click the bottom-left corner where both axes meet. This is always (0, 0).</span>
                  </div>
                )}
                {(currentStep === 'calibrate-origin' || currentStep === 'calibrate-x' || currentStep === 'calibrate-y') && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-sm font-medium text-blue-800 whitespace-nowrap">Time Axis End (s):</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={calibrateXValue}
                        onChange={(e) => updateCalibrateXValue(e.target.value)}
                        className="w-28 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <label className="text-sm font-medium text-blue-800 whitespace-nowrap">EC Axis End:</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={calibrateYValue}
                        onChange={(e) => updateCalibrateYValue(e.target.value)}
                        className="w-28 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <span className="text-xs text-blue-600">Adjust these values any time before extraction.</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setUseBoxCalibrationMode(prev => {
                            const next = !prev;
                            if (next && calibrationPoints.length >= 3) {
                              setEditableCalibrationBox({
                                left: calibrationPoints[0].x,
                                top: calibrationPoints[2].y,
                                right: calibrationPoints[1].x,
                                bottom: calibrationPoints[0].y,
                              });
                            }
                            if (!next) {
                              setEditableCalibrationBox(null);
                              setCalibrationBoxDragMode(null);
                              setCalibrationBoxDragOrigin(null);
                              setCalibrationBoxInitialRect(null);
                            }
                            return next;
                          });
                        }}
                        className={`px-3 py-1.5 text-sm rounded border ${useBoxCalibrationMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-100'}`}
                      >
                        {useBoxCalibrationMode ? 'Draw EC Box: ON' : 'Use Draw EC Box'}
                      </button>
                      <span className="text-xs text-blue-700">
                        Draw the box, then drag inside to move it or use the corner handles to resize it. Better for phone corrections.
                      </span>
                    </div>
                    {useBoxCalibrationMode && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={commitEditableBoxCalibration}
                          disabled={!editableCalibrationBox}
                          className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white border border-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:border-slate-300 disabled:cursor-not-allowed"
                        >
                          Confirm Box Calibration
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditableCalibrationBox(null);
                            setCalibrationBoxDragMode(null);
                            setCalibrationBoxDragOrigin(null);
                            setCalibrationBoxInitialRect(null);
                            setCalibrationPoints(prev => prev.slice(0, 1));
                          }}
                          className="px-3 py-1.5 text-sm rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        >
                          Clear Box
                        </button>
                        <span className="text-xs text-blue-600">
                          Confirm only when the box lines up with the true graph origin, time end, and EC top.
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {currentStep === 'calibrate-highest' && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-medium text-blue-800 whitespace-nowrap">Highest EC value:</label>
                      <input
                        type="number"
                        min={0.1}
                        step={0.5}
                        value={manualHighestEC}
                        onChange={(e) => setManualHighestEC(e.target.value)}
                        className="w-28 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="e.g. 25"
                        autoFocus
                      />
                      <button
                        onClick={autoPlaceHighestPoint}
                        disabled={calibrationPoints.length < 3 || !manualHighestEC || !parseFloat(manualHighestEC)}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        Confirm without clicking
                      </button>
                    </div>
                    <p className="text-xs text-blue-600">Type the peak EC you read on the graph, then confirm — or click the peak directly on the curve.</p>
                  </div>
                )}
              </div>

              {/* Calibration Confirmation (shown after 4-point calibration completes) */}
              {currentStep === 'extract' && calibrationPoints.length >= 4 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="font-semibold text-green-900 flex items-center gap-2">
                      <span>✓ Calibration Complete</span>
                      {loadedCalibrationProfileName && (
                        <span className="text-xs font-normal text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          {loadedCalibrationProfileName}
                        </span>
                      )}
                      {importedJsonLabel && (
                        <span className="text-xs font-normal text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          JSON: {importedJsonLabel}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={resetCalibration}
                      className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200 border border-red-200"
                    >
                      Reset Calibration
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-green-800">
                    <div className="bg-white rounded border border-green-100 px-2 py-1.5">
                      <div className="font-medium text-green-700">Origin</div>
                      <div>({calibrationPoints[0].dataX}, {calibrationPoints[0].dataY})</div>
                      <div className="text-green-500">px ({Math.round(calibrationPoints[0].x)}, {Math.round(calibrationPoints[0].y)})</div>
                    </div>
                    <div className="bg-white rounded border border-green-100 px-2 py-1.5">
                      <div className="font-medium text-green-700">Time max</div>
                      <div>{calibrationPoints[1].dataX}s</div>
                      <div className="text-green-500">px ({Math.round(calibrationPoints[1].x)}, {Math.round(calibrationPoints[1].y)})</div>
                    </div>
                    <div className="bg-white rounded border border-green-100 px-2 py-1.5">
                      <div className="font-medium text-green-700">EC max</div>
                      <div>{calibrationPoints[2].dataY} EC</div>
                      <div className="text-green-500">px ({Math.round(calibrationPoints[2].x)}, {Math.round(calibrationPoints[2].y)})</div>
                    </div>
                    <div className="bg-white rounded border border-green-100 px-2 py-1.5">
                      <div className="font-medium text-green-700">Highest EC</div>
                      <div>{calibrationPoints[3].dataY.toFixed(2)} EC</div>
                      <div className="text-green-500">at {calibrationPoints[3].dataX.toFixed(1)}s</div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-green-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setUltrakokiBrewData(buildPreviewUltrakokiBrewData());
                          setImportedJsonLabel('Preview brew / mock Ultrakoki data');
                        }}
                        className="py-2.5 bg-amber-100 text-amber-900 font-medium rounded-lg hover:bg-amber-200 text-sm border border-amber-200"
                      >
                        Preview Ultrakoki Graph
                      </button>
                      <button
                        onClick={() => setShowJsonImportPrompt(true)}
                        className="py-2.5 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-900 text-sm flex items-center justify-center gap-2"
                      >
                        <span>⬆</span> Import Ultrakoki JSON
                      </button>
                    </div>
                    <p className="text-xs text-green-700 mt-1.5 text-center">
                      Preview the custom Ultrakoki graph first, or import a real brew log once the layout looks right.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="text-sm font-semibold text-slate-800 mb-2">Calibration Profile</div>
                <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
                  <select
                    value={selectedCalibrationProfile}
                    onChange={(e) => setSelectedCalibrationProfile(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
                  >
                    <option value="">Select saved profile...</option>
                    {savedCalibrationProfiles.map(profile => (
                      <option key={profile.name} value={profile.name}>{profile.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={loadSelectedCalibrationProfile}
                    disabled={!selectedCalibrationProfile || !selectedImage}
                    className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    Load Selected Profile
                  </button>
                </div>
                <div className="text-xs text-slate-600 mt-2">
                  Upload screenshot first, then load a saved calibration profile by name.
                </div>
              </div>

              {/* Red Light Control */}
              {currentStep === 'extract' && getCurrentData().length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-4 mb-3">
                    <button
                      onClick={calculateRedLight}
                      className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                    >
                      Recalculate Red Light
                    </button>
                    {redLightTime !== null && (
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={showRedLight}
                          onChange={(e) => setShowRedLight(e.target.checked)}
                          className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                        />
                        Show Red Light Line
                      </label>
                    )}
                    {redLightTime !== null && (
                      <div className="text-sm font-medium text-gray-700">
                        Red Light: {formatTime(redLightTime)} ({formatRawSeconds(redLightTime)}s)
                      </div>
                    )}
                  </div>
                  
                  {/* Red Light Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Time Threshold (seconds)
                      </label>
                      <input
                        type="number"
                        value={redLightTimeThreshold}
                        onChange={(e) => setRedLightTimeThreshold(Number(e.target.value))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                        min="0"
                        max="200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        EC Threshold
                      </label>
                      <input
                        type="number"
                        value={redLightECThreshold}
                        onChange={(e) => setRedLightECThreshold(Number(e.target.value))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                        min="0"
                        max="50"
                        step="0.1"
                      />
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-600 mt-2">
                    Finds when time &gt; {redLightTimeThreshold}s AND EC &lt; {redLightECThreshold} - automatically shows result below graph
                  </div>
                </div>
              )}

              {currentStep === 'extract' && getCurrentData().length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <div className="font-semibold text-indigo-900">Extraction Phase Logs</div>
                      <div className="text-xs text-indigo-700 mt-1">Manual-first workflow: pick start/end directly on the screenshot for each phase.</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={autoDetectPhaseLogs}
                        className="px-3 py-1 bg-indigo-200 text-indigo-900 text-sm rounded hover:bg-indigo-300"
                      >
                        Auto-Suggest
                      </button>
                      <button
                        onClick={addPhaseLog}
                        className="px-3 py-1 bg-teal-500 text-white text-sm rounded hover:bg-teal-600"
                      >
                        Add Log
                      </button>
                      {phaseLogs.length > 0 && (
                        <button
                          onClick={() => {
                            setPhaseLogs([]);
                            setLoadedPhaseProfileName(null);
                          }}
                          className="px-3 py-1 bg-slate-500 text-white text-sm rounded hover:bg-slate-600"
                        >
                          Clear Logs
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mb-3 rounded-lg border border-indigo-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Phase Summary Profile</div>
                    <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
                      <select
                        value={selectedPhaseLogProfile}
                        onChange={(e) => setSelectedPhaseLogProfile(e.target.value)}
                        className="flex-1 rounded border border-indigo-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Select saved phase profile...</option>
                        {savedPhaseLogProfiles.map(profile => (
                          <option key={profile.name} value={profile.name}>{profile.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={loadSelectedPhaseLogProfile}
                        disabled={!selectedPhaseLogProfile}
                        className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                      >
                        Load Phase Profile
                      </button>
                      {!showSavePhaseProfileForm && (
                        <button
                          onClick={() => {
                            const defaultName = selectedImageName
                              ? `${selectedImageName.replace(/\.[^/.]+$/, '')}_phases`
                              : 'belka_phase_profile';
                            setNewPhaseProfileName(defaultName);
                            setShowSavePhaseProfileForm(true);
                          }}
                          disabled={phaseLogs.length === 0}
                          className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                        >
                          Save Phase Profile
                        </button>
                      )}
                    </div>

                    {showSavePhaseProfileForm && (
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="text"
                          value={newPhaseProfileName}
                          onChange={(e) => setNewPhaseProfileName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') savePhaseLogProfile(newPhaseProfileName);
                            if (e.key === 'Escape') {
                              setShowSavePhaseProfileForm(false);
                              setNewPhaseProfileName('');
                            }
                          }}
                          placeholder="Phase profile name..."
                          autoFocus
                          className="flex-1 rounded border border-indigo-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          onClick={() => savePhaseLogProfile(newPhaseProfileName)}
                          className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setShowSavePhaseProfileForm(false);
                            setNewPhaseProfileName('');
                          }}
                          className="rounded bg-slate-400 px-3 py-2 text-sm font-medium text-white hover:bg-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {loadedPhaseProfileName && (
                      <div className="mt-2 text-xs text-indigo-700">
                        Loaded phase profile: <strong>{loadedPhaseProfileName}</strong>
                      </div>
                    )}
                  </div>

                  {phasePinTarget && (
                    <div className="mb-3 bg-white border border-indigo-300 rounded-lg p-3 text-sm text-indigo-900">
                      Click the screenshot to set
                      {' '}
                      <strong>{phasePinTarget.boundary === 'startTime' ? 'start' : 'end'}</strong>
                      {' '}
                      for
                      {' '}
                      <strong>{phaseLogs.find(log => log.id === phasePinTarget.logId)?.name || 'selected phase'}</strong>.
                      <button
                        onClick={() => {
                          setPhasePinTarget(null);
                          setPhasePinCursor(cursor => ({ ...cursor, visible: false }));
                        }}
                        className="ml-3 px-2 py-1 bg-slate-200 text-slate-800 rounded hover:bg-slate-300"
                      >
                        Cancel Pinning
                      </button>
                    </div>
                  )}

                  {phaseLogs.length === 0 ? (
                    <div className="text-sm text-indigo-700">No phase logs yet. Click Add Log, then use Pick Start and Pick End on the screenshot.</div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {phaseLogs.map((log) => {
                        const metrics = getPhaseMetrics(log);
                        return (
                        <div key={log.id} className="bg-white border border-indigo-100 rounded-lg p-3">
                          <div className="grid grid-cols-3 gap-2 items-end">
                            <div className="col-span-2">
                              <label className="text-xs text-gray-600">Name</label>
                              <input
                                type="text"
                                value={log.name}
                                onChange={(e) => updatePhaseLog(log.id, { name: e.target.value })}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Color</label>
                              <input
                                type="color"
                                value={log.color}
                                onChange={(e) => updatePhaseLog(log.id, { color: e.target.value })}
                                className="w-full h-8 border border-gray-300 rounded"
                              />
                            </div>

                            <div>
                              <label className="text-xs text-gray-600">Start (s)</label>
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={log.startTime}
                                onChange={(e) => updatePhaseLog(log.id, { startTime: Math.max(0, Number(e.target.value) || 0) })}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">End (s)</label>
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={log.endTime}
                                onChange={(e) => updatePhaseLog(log.id, { endTime: Math.max(0, Number(e.target.value) || 0) })}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </div>
                            <div className="flex items-center justify-center rounded border border-indigo-100 bg-indigo-50 h-9 text-xs font-semibold text-indigo-700">
                              {metrics.duration.toFixed(1)}s
                            </div>

                            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700">
                              Start EC: <strong>{metrics.startEC !== null ? metrics.startEC.toFixed(2) : 'n/a'}</strong>
                            </div>
                            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700">
                              End EC: <strong>{metrics.endEC !== null ? metrics.endEC.toFixed(2) : 'n/a'}</strong>
                            </div>
                            <div className={`rounded border px-2 py-2 text-xs ${metrics.ecDelta !== null && metrics.ecDelta < 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                              EC Delta: <strong>{metrics.ecDelta !== null ? `${metrics.ecDelta > 0 ? '+' : ''}${metrics.ecDelta.toFixed(2)}` : 'n/a'}</strong>
                            </div>

                            <div>
                              <label className="text-xs text-gray-600">Expected EC Min</label>
                              <input
                                type="number"
                                step={0.1}
                                value={log.expectedECMin ?? ''}
                                onChange={(e) => updatePhaseLog(log.id, { expectedECMin: e.target.value === '' ? null : Number(e.target.value) })}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Expected EC Max</label>
                              <input
                                type="number"
                                step={0.1}
                                value={log.expectedECMax ?? ''}
                                onChange={(e) => updatePhaseLog(log.id, { expectedECMax: e.target.value === '' ? null : Number(e.target.value) })}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </div>
                            <button
                              onClick={() => fitPhaseLogToExpectedRange(log.id)}
                              className="px-2 py-2 bg-sky-500 text-white text-xs rounded hover:bg-sky-600"
                            >
                              Fit to EC Range
                            </button>

                            <button
                              onClick={() => beginPhasePinning(log.id, 'startTime')}
                              className={`px-2 py-2 text-xs rounded ${phasePinTarget?.logId === log.id && phasePinTarget.boundary === 'startTime' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-900 hover:bg-indigo-200'}`}
                            >
                              Pick Start
                            </button>
                            <button
                              onClick={() => beginPhasePinning(log.id, 'endTime')}
                              className={`px-2 py-2 text-xs rounded ${phasePinTarget?.logId === log.id && phasePinTarget.boundary === 'endTime' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-900 hover:bg-indigo-200'}`}
                            >
                              Pick End
                            </button>
                            <button
                              onClick={() => addPhaseLogAfter(log.id)}
                              className="px-2 py-2 bg-teal-500 text-white text-xs rounded hover:bg-teal-600"
                            >
                              + Add Next
                            </button>
                          </div>

                          <div className="mt-2 flex justify-end">
                            <button
                              onClick={() => removePhaseLog(log.id)}
                              className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      )})}
                    </div>
                  )}

                  {/* Phase Summary */}
                  {phaseLogs.length > 0 && (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
                      <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-sky-50 px-4 py-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-500">Phase Summary</div>
                            <h4 className="mt-1 text-lg font-semibold text-slate-900">Phase timing, EC and pour targets</h4>
                            <p className="mt-1 text-sm text-slate-600">
                              Focus view for what each phase covers, how EC moves, and how much water is added inside that phase.
                            </p>
                          </div>
                          {redLightTime !== null && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-red-500">Red Light Stop</div>
                              <div className="mt-1 text-base font-semibold">Stop at {formatPourAmount(getCumulativePourAtTime(redLightTime))}</div>
                              <div className="mt-1 text-xs text-red-700">Time {formatTime(redLightTime)} ({formatRawSeconds(redLightTime)}s)</div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="overflow-x-auto px-4 py-4">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                              <th className="pb-3 pr-4">Phase</th>
                              <th className="pb-3 pr-4">Time</th>
                              <th className="pb-3 pr-4">Duration</th>
                              <th className="pb-3 pr-4">EC</th>
                              <th className="pb-3 pr-0 text-right">Pour</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...phaseLogs]
                              .sort((a, b) => a.startTime - b.startTime)
                              .map((log) => {
                                const metrics = getPhaseMetrics(log);
                                return (
                                  <tr key={log.id} className="border-b border-slate-100 align-top last:border-b-0">
                                    <td className="py-3 pr-4">
                                      <div className="flex items-center gap-2">
                                        <span className="inline-block h-3 w-3 rounded-full" style={{ background: log.color }} />
                                        <span className="font-medium text-slate-900">{log.name}</span>
                                      </div>
                                    </td>
                                    <td className="py-3 pr-4 text-slate-700">
                                      <div>{formatTime(log.startTime)} - {formatTime(log.endTime)}</div>
                                      <div className="mt-1 text-xs text-slate-500">{formatRawSeconds(log.startTime)}s - {formatRawSeconds(log.endTime)}s</div>
                                    </td>
                                    <td className="py-3 pr-4 text-slate-700">{metrics.duration.toFixed(1)}s</td>
                                    <td className="py-3 pr-4 text-slate-700">
                                      {metrics.startEC !== null ? (
                                        <>
                                          <div>{metrics.startEC.toFixed(2)} - {metrics.endEC !== null ? metrics.endEC.toFixed(2) : 'n/a'}</div>
                                          <div className={`mt-1 text-xs font-semibold ${metrics.ecDelta !== null && metrics.ecDelta < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                            Delta {metrics.ecDelta !== null ? `${metrics.ecDelta > 0 ? '+' : ''}${metrics.ecDelta.toFixed(2)}` : 'n/a'}
                                          </div>
                                        </>
                                      ) : (
                                        'n/a'
                                      )}
                                    </td>
                                    <td className="py-3 pl-4 pr-0 text-right text-slate-700">
                                      <div className="font-medium text-slate-900">{formatPourAmount(metrics.pouredAmount)}</div>
                                      <div className="mt-1 text-xs text-slate-500">{formatPourAmount(metrics.startPour)} - {formatPourAmount(metrics.endPour)}</div>
                                    </td>
                                  </tr>
                                );
                              })}
                            {redLightTime !== null && (
                              <tr className="bg-red-50/80 align-top">
                                <td className="py-3 pr-4 font-semibold text-red-800">Red Light</td>
                                <td className="py-3 pr-4 text-red-700">
                                  <div>{formatTime(redLightTime)}</div>
                                  <div className="mt-1 text-xs text-red-600">{formatRawSeconds(redLightTime)}s</div>
                                </td>
                                <td className="py-3 pr-4 text-red-700">Stop water</td>
                                <td className="py-3 pr-4 text-red-700">Target hand-off point</td>
                                <td className="py-3 pl-4 pr-0 text-right font-semibold text-red-800">{formatPourAmount(getCumulativePourAtTime(redLightTime))}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 'extract' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => {
                        setEraserMode(prev => {
                          const next = !prev;
                          if (!next) {
                            setEraserCursor(cursor => ({ ...cursor, visible: false }));
                          }
                          return next;
                        });
                      }}
                      className={`px-3 py-2 sm:px-4 ${eraserMode ? 'bg-red-600' : 'bg-red-500'} text-white rounded-lg hover:bg-red-600 text-sm sm:text-base`}
                    >
                      {eraserMode ? 'Exit Eraser' : 'Eraser'}
                    </button>
                    <div className="flex items-center gap-2">
                      <label htmlFor="eraser-size" className="text-sm text-red-700 font-medium whitespace-nowrap">
                        Eraser Size:
                      </label>
                      <input
                        id="eraser-size"
                        type="range"
                        min={6}
                        max={40}
                        step={1}
                        value={eraserSizePx}
                        onChange={(e) => setEraserSizePx(Number(e.target.value))}
                        className="w-32"
                      />
                      <input
                        type="number"
                        min={6}
                        max={40}
                        step={1}
                        value={eraserSizePx}
                        onChange={(e) => setEraserSizePx(Math.max(6, Math.min(40, Number(e.target.value) || 6)))}
                        className="w-16 px-2 py-1 text-sm border border-red-300 rounded"
                      />
                      <span className="text-sm text-red-700">px</span>
                    </div>
                  </div>
                  <div className="text-xs text-red-600 mt-1">
                    Click near a point to delete it within the selected pixel radius.
                  </div>
                </div>
              )}

              {/* Canvas */}
              <div className="relative">
                <img
                  ref={imageRef}
                  src={selectedImage || ''}
                  alt="Belka Portal screenshot"
                  className="max-w-full h-auto hidden"
                  onLoad={drawCanvas}
                />
                <canvas
                  ref={canvasRef}
                  className="border border-gray-300 rounded-lg"
                  onClick={handleCanvasClick}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseLeave}
                  style={{ 
                    cursor: useBoxCalibrationMode && (currentStep === 'calibrate-origin' || currentStep === 'calibrate-x' || currentStep === 'calibrate-y')
                      ? 'crosshair'
                      : eraserMode
                        ? 'crosshair'
                        : 'default',
                    display: 'block',
                    maxWidth: '100%',
                    height: 'auto',
                    touchAction: 'none'
                  }}
                />
                {eraserMode && (
                  <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded text-sm">
                    Eraser Mode - Radius: {eraserSizePx}px
                  </div>
                )}
                {useBoxCalibrationMode && (currentStep === 'calibrate-origin' || currentStep === 'calibrate-x' || currentStep === 'calibrate-y') && (
                  <div className="absolute top-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-sm">
                    Draw EC Box Mode
                  </div>
                )}
              </div>

              {/* Calibration Points Display */}
              {calibrationPoints.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {calibrationPoints.map((point, index) => (
                    <div key={index} className="bg-gray-50 p-3 rounded-lg">
                      <div className="text-sm font-medium text-gray-900">{point.label}</div>
                      <div className="text-xs text-gray-600">
                        Pixel: ({Math.round(point.x)}, {Math.round(point.y)})
                      </div>
                      <div className="text-xs text-gray-600">
                        Data: ({point.dataX}, {point.dataY})
                      </div>
                    </div>
                  ))}
                  
                  {/* Manual EC Adjustment - only show during highest point calibration */}
                  {currentStep === 'calibrate-highest' && calibrationPoints.length >= 4 && (
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <div className="text-sm font-medium text-blue-900 mb-2">Micro-Calibrate Highest EC</div>
                      <div className="space-y-2">
                        <input
                          type="number"
                          step="0.01"
                          value={manualHighestEC}
                          onChange={(e) => updateHighestEC(e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="EC value"
                        />
                        <button
                          onClick={completeHighestCalibration}
                          className="w-full px-2 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                        >
                          Finish EC Calibration
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Finish Calibration Buttons for other steps */}
                  {(currentStep === 'calibrate-origin' || currentStep === 'calibrate-x' || currentStep === 'calibrate-y') && (
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="text-sm font-medium text-gray-900 mb-2">
                        {currentStep === 'calibrate-origin' && 'Origin Point Calibration'}
                        {currentStep === 'calibrate-x' && 'X-Axis Calibration'}
                        {currentStep === 'calibrate-y' && 'Y-Axis Calibration'}
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs text-gray-600">
                          {currentStep === 'calibrate-origin' && 'Click the origin corner (value = 0), then click Finish.'}
                          {currentStep === 'calibrate-x' && `Click the ${calibrateXValue}s mark on the time axis, then click Finish.`}
                          {currentStep === 'calibrate-y' && `Click the ${calibrateYValue} EC mark on the Y-axis, then click Finish.`}
                        </div>
                        <button
                          onClick={() => {
                            if (currentStep === 'calibrate-origin') {
                              setCurrentStep('calibrate-x');
                            } else if (currentStep === 'calibrate-x') {
                              setCurrentStep('calibrate-y');
                            } else if (currentStep === 'calibrate-y') {
                              setCurrentStep('calibrate-highest');
                            }
                          }}
                          className="w-full px-2 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                          disabled={calibrationPoints.length < (currentStep === 'calibrate-origin' ? 1 : currentStep === 'calibrate-x' ? 2 : 3)}
                        >
                          Finish {currentStep === 'calibrate-origin' ? 'Origin' : currentStep === 'calibrate-x' ? 'X-Axis' : 'Y-Axis'} Calibration
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Temperature Min Calibration */}
                  {currentStep === 'calibrate-temp-min' && calibrationPoints.length >= 5 && (
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                      <div className="text-sm font-medium text-orange-900 mb-2">Temperature Minimum Calibration</div>
                      <div className="space-y-2">
                        <div className="text-xs text-gray-600">
                          Enter the minimum temperature from your phone (°C)
                        </div>
                        <input
                          type="number"
                          step="1"
                          value={manualTempMin}
                          onChange={(e) => {
                            setManualTempMin(e.target.value);
                            setTempCalibration(prev => prev ? { ...prev, min: parseFloat(e.target.value) || 60 } : { min: parseFloat(e.target.value) || 60, max: 88 });
                          }}
                          className="w-full px-2 py-1 text-sm border border-orange-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="Min temperature (°C)"
                        />
                        <button
                          onClick={() => setCurrentStep('calibrate-temp-max')}
                          className="w-full px-2 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600"
                        >
                          Finish Min Temperature
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Temperature Max Calibration */}
                  {currentStep === 'calibrate-temp-max' && calibrationPoints.length >= 6 && (
                    <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                      <div className="text-sm font-medium text-red-900 mb-2">Temperature Maximum Calibration</div>
                      <div className="space-y-2">
                        <div className="text-xs text-gray-600">
                          Enter the maximum temperature from your phone (°C)
                        </div>
                        <input
                          type="number"
                          step="1"
                          value={manualTempMax}
                          onChange={(e) => {
                            setManualTempMax(e.target.value);
                            setTempCalibration(prev => prev ? { ...prev, max: parseFloat(e.target.value) || 88 } : { min: 60, max: parseFloat(e.target.value) || 88 });
                          }}
                          className="w-full px-2 py-1 text-sm border border-red-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                          placeholder="Max temperature (°C)"
                        />
                        <button
                          onClick={() => setCurrentStep('extract')}
                          className="w-full px-2 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                        >
                          Finish Temperature Calibration
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Calibration Actions */}
              <div className="bg-white border border-gray-200 rounded-lg p-2 flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setShowECPrompt(true)}
                  className="px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 flex-1 sm:flex-none"
                >
                  Recalibrate EC
                </button>
                <button
                  onClick={() => setShowTempPrompt(true)}
                  className="px-3 py-2 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 flex-1 sm:flex-none"
                >
                  Add Temperature Calibration
                </button>
                {calibrationPoints.length >= 4 && !showSaveProfileForm && (
                  <button
                    onClick={() => {
                      const defaultName = selectedImageName
                        ? `${selectedImageName.replace(/\.[^/.]+$/, '')}_calibration`
                        : 'belka_calibration';
                      setNewProfileName(defaultName);
                      setShowSaveProfileForm(true);
                    }}
                    className="px-3 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 flex-1 sm:flex-none"
                  >
                    Save As Profile
                  </button>
                )}
                {showSaveProfileForm && (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={newProfileName}
                      onChange={e => setNewProfileName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveCalibrationProfile(newProfileName);
                        if (e.key === 'Escape') { setShowSaveProfileForm(false); setNewProfileName(''); }
                      }}
                      placeholder="Profile name..."
                      autoFocus
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <button
                      onClick={() => saveCalibrationProfile(newProfileName)}
                      className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setShowSaveProfileForm(false); setNewProfileName(''); }}
                      className="px-3 py-1 bg-gray-400 text-white text-sm rounded hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <button
                  onClick={loadSelectedCalibrationProfile}
                  disabled={!selectedCalibrationProfile}
                  className="px-3 py-2 bg-slate-600 text-white text-sm rounded hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex-1 sm:flex-none"
                >
                  Load Profile
                </button>
                <button
                  onClick={() => setCurrentStep('calibrate-highest')}
                  className="px-3 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 whitespace-nowrap flex-1 sm:flex-none"
                >
                  Add Highest EC Point
                </button>
              </div>

              {loadedCalibrationProfileName && (
                <div className="mb-4 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2">
                  Loaded calibration profile: <strong>{loadedCalibrationProfileName}</strong>
                </div>
              )}

              {/* Auto-Detect Preference */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoDetectPreference}
                    onChange={(e) => setAutoDetectPreference(e.target.checked)}
                    className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Auto-detect curve after calibration (saves preference)
                  </span>
                </label>
                <div className="text-xs text-gray-500 mt-1">
                  When enabled, automatically runs curve detection after completing calibration
                </div>
                <label className="flex items-center cursor-pointer mt-3">
                  <input
                    type="checkbox"
                    checked={autoGenerateAfterDetectPreference}
                    onChange={(e) => setAutoGenerateAfterDetectPreference(e.target.checked)}
                    className="mr-2 w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">
                    Auto-generate curve after auto-detect (uses selected interval)
                  </span>
                </label>
                <div className="text-xs text-gray-500 mt-1">
                  Runs Generate automatically after detection, using the current interval setting.
                </div>
              </div>

              {/* EC Calibration Prompt Modal */}
              {showECPrompt && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white p-6 rounded-lg shadow-xl max-w-md">
                    <h3 className="text-lg font-bold mb-4">EC Calibration Options</h3>
                    <div className="space-y-3">
                      <button
                        onClick={() => {
                          setCurrentStep('calibrate-origin');
                          setShowECPrompt(false);
                        }}
                        className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Start Full EC Calibration
                      </button>
                      <button
                        onClick={() => {
                          setCurrentStep('calibrate-highest');
                          setShowECPrompt(false);
                        }}
                        className="w-full px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
                      >
                        Add Highest EC Point Only
                      </button>
                      <button
                        onClick={() => setShowECPrompt(false)}
                        className="w-full px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Temperature Calibration Prompt Modal */}
              {showTempPrompt && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white p-6 rounded-lg shadow-xl max-w-md">
                    <h3 className="text-lg font-bold mb-4">Temperature Calibration</h3>
                    <p className="text-gray-600 mb-4">
                      Calibrate temperature using your phone readings for accurate temperature data extraction.
                    </p>
                    <div className="space-y-3">
                      <button
                        onClick={() => {
                          setTempCalibration({ min: 60, max: 88 });
                          setCurrentStep('calibrate-temp-min');
                          setShowTempPrompt(false);
                        }}
                        className="w-full px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
                      >
                        Start Temperature Calibration
                      </button>
                      <button
                        onClick={() => setShowTempPrompt(false)}
                        className="w-full px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                      >
                        Skip Temperature
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showJsonImportPrompt && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <div>
                        <h3 className="text-base font-bold text-gray-900">Import Ultrakoki JSON</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Ultrakoki loads brew timing, flow, and pour total. Point-array JSON still imports EC curve data.</p>
                      </div>
                      <button
                        onClick={() => { setShowJsonImportPrompt(false); setImportedJsonText(''); }}
                        className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    </div>

                    {/* File upload */}
                    <div className="px-5 pt-4">
                      <label className="flex items-center gap-3 w-full border-2 border-dashed border-slate-300 rounded-lg px-4 py-3 cursor-pointer hover:border-slate-500 hover:bg-slate-50 transition-colors">
                        <span className="text-2xl">📂</span>
                        <div>
                          <div className="text-sm font-medium text-slate-700">Upload a .json file</div>
                          <div className="text-xs text-slate-400">Replaces anything pasted below</div>
                        </div>
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const text = ev.target?.result as string ?? '';
                              setImportedJsonText(text);
                            };
                            reader.readAsText(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs text-gray-400 font-medium">or paste</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>

                    {/* Paste area */}
                    <div className="px-5">
                      <textarea
                        value={importedJsonText}
                        onChange={(e) => setImportedJsonText(e.target.value)}
                        placeholder='{ "json": { "brewingLog": { "adc1": [...], "size": [...], "bsize": [...], "period": 127 } } }'
                        rows={8}
                        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
                      />
                      {importedJsonText.length > 0 && (
                        <div className="text-right">
                          <button
                            onClick={() => setImportedJsonText('')}
                            className="text-xs text-gray-400 hover:text-gray-600 mt-0.5"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-4 flex gap-2 justify-end">
                      <button
                        onClick={() => { setShowJsonImportPrompt(false); setImportedJsonText(''); }}
                        className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={importJsonData}
                        disabled={importedJsonText.trim().length === 0}
                        className="px-5 py-2 text-sm font-semibold bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Import
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TDS & EY Analysis */}
              {(extractedPoints.length > 0 || fineGeneratedCurve.length > 0) && (
                <div className="space-y-3">
                  {/* Dose / factor inputs */}
                  <div className="flex flex-wrap items-center gap-4 px-1">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Coffee dose (g):</label>
                      <input
                        type="number"
                        min={1}
                        step={0.5}
                        value={doseWeight}
                        onChange={(e) => {
                          const v = Math.max(0.1, parseFloat(e.target.value) || 15);
                          setDoseWeight(v);
                          localStorage.setItem('belkaDoseWeight', String(v));
                        }}
                        className="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-slate-700 whitespace-nowrap">EC→TDS factor:</label>
                      <input
                        type="number"
                        min={0.1}
                        max={1}
                        step={0.01}
                        value={conversionFactor}
                        onChange={(e) => {
                          const v = Math.min(1, Math.max(0.1, parseFloat(e.target.value) || 0.5));
                          setConversionFactor(v);
                          localStorage.setItem('belkaConversionFactor', String(v));
                        }}
                        className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                      <span className="text-xs text-slate-500">(0.5 = standard, 0.55 = mineral-rich)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Refractometer TDS % (optional):</label>
                      <input
                        type="number"
                        min={0}
                        max={5}
                        step={0.01}
                        placeholder="e.g. 1.35"
                        value={refractometerTDSInput}
                        onChange={(e) => {
                          const value = e.target.value;
                          setRefractometerTDSInput(value);
                          localStorage.setItem('belkaRefractometerTDS', value);
                        }}
                        className="w-24 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                      {refractometerTDSInput.trim().length > 0 && (
                        <button
                          onClick={() => {
                            setRefractometerTDSInput('');
                            localStorage.removeItem('belkaRefractometerTDS');
                          }}
                          className="text-xs text-slate-500 hover:text-slate-700"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <TDSAnalysisGraph
                    ecPoints={getCurrentData()}
                    brewData={ultrakokiBrewData}
                    phaseLogs={phaseLogs}
                    doseWeight={doseWeight}
                    conversionFactor={conversionFactor}
                    refractometerTDS={(() => {
                      const n = parseFloat(refractometerTDSInput);
                      return Number.isFinite(n) && n > 0 ? n : null;
                    })()}
                  />
                </div>
              )}

              {/* Interactive Graph */}
              {(extractedPoints.length > 0 || fineGeneratedCurve.length > 0) && (
                <InteractiveDataGraph
                  dataPoints={getCurrentData()}
                  onDataUpdate={(updatedPoints) => {
                    switch (viewMode) {
                      case 'fine':
                        setFineGeneratedCurve(updatedPoints);
                        break;
                      default:
                        setExtractedPoints(updatedPoints);
                    }
                  }}
                  redLightTime={redLightTime}
                  showRedLight={showRedLight}
                  phaseLogs={phaseLogs}
                  cumulativePourData={ultrakokiBrewData ? {
                    values: ultrakokiBrewData.cumulativePour,
                    intervalSeconds: ultrakokiBrewData.intervalSeconds,
                    label: importedJsonLabel || ultrakokiBrewData.label,
                  } : undefined}
                />
              )}

              {/* Data Table */}
              {(extractedPoints.length > 0 || fineGeneratedCurve.length > 0) && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50 px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Curve Table</div>
                        <h4 className="mt-1 text-lg font-semibold text-slate-900">
                          {viewMode === 'fine' ? `Generated EC curve (${intervalMs}ms)` : 'Digitized EC curve'}
                        </h4>
                        <p className="mt-1 text-sm text-slate-600">
                          Same timebase as the charts above, with point-by-point EC values and optional temperature readings.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {fineGeneratedCurve.length > 0 && (
                          <button
                            onClick={toggleDataView}
                            className="rounded-full bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-200"
                          >
                            {viewMode === 'fine' ? 'Show Original' : 'Show Generated'}
                          </button>
                        )}
                        <button
                          onClick={() => setShowMinSec(!showMinSec)}
                          className="rounded-full bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-950"
                        >
                          {showMinSec ? 'Show Seconds' : 'Show Min:Sec'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[420px]">
                      <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                        <div className="font-medium opacity-80">Total Points</div>
                        <div className="mt-1 text-sm font-semibold">{getCurrentData().length}</div>
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                        <div className="font-medium opacity-80">Time Range</div>
                        <div className="mt-1 text-sm font-semibold">
                          {getCurrentData().length > 0 ? `${getCurrentData()[getCurrentData().length - 1]?.time.toFixed(0)}s` : '0s'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                        <div className="font-medium opacity-80">EC Range</div>
                        <div className="mt-1 text-sm font-semibold">
                          {getCurrentData().length > 0
                            ? `${Math.min(...getCurrentData().map(p => p.ecValue)).toFixed(1)}-${Math.max(...getCurrentData().map(p => p.ecValue)).toFixed(1)}`
                            : '0-0'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
                        <div className="font-medium opacity-80">Pour Overlay</div>
                        <div className="mt-1 text-sm font-semibold">
                          {ultrakokiBrewData ? `${Math.max(...ultrakokiBrewData.cumulativePour.filter(Number.isFinite), 0).toFixed(1)} g` : 'Not loaded'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="max-h-96 overflow-auto px-4 py-4 sm:px-5">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-2 pr-4 text-left font-semibold">Time ({showMinSec ? 'Min:Sec' : 'Seconds'})</th>
                          <th className="py-2 pr-4 text-left font-semibold">EC Value</th>
                          <th className="py-2 pr-4 text-left font-semibold">Temperature (°C)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getCurrentData().map((point, index) => (
                          <tr key={index} className="border-b border-slate-100 odd:bg-slate-50/60">
                            <td className="py-2 pr-4 text-slate-800">
                              {showMinSec
                                ? (() => {
                                    const minutes = Math.floor(point.time / 60);
                                    const seconds = Math.floor(point.time % 60);
                                    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                                  })()
                                : `${point.time.toFixed(1)}s`}
                            </td>
                            <td className="py-2 pr-4 font-medium text-slate-900">{point.ecValue.toFixed(2)}</td>
                            <td className="py-2 pr-4 text-slate-700">
                              {point.temperature ? `${point.temperature.toFixed(1)}°C` : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
                {currentStep === 'extract' && (
                  <div className="w-full space-y-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Flow</div>
                      <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
                        <button
                          onClick={autoDetectCurve}
                          className="px-3 py-2 sm:px-4 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm sm:text-base"
                        >
                          Auto-Detect
                        </button>
                        {/* Interval selector + Generate button */}
                        <div className="flex items-center gap-1 bg-teal-50 border border-teal-200 rounded-lg px-2 py-1">
                          <label className="text-xs text-teal-700 font-medium whitespace-nowrap">Interval:</label>
                          <select
                            value={intervalMs}
                            onChange={e => setIntervalMs(Number(e.target.value))}
                            className="text-xs border-0 bg-transparent text-teal-800 font-semibold focus:outline-none cursor-pointer"
                          >
                            <option value={100}>100 ms</option>
                            <option value={250}>250 ms</option>
                            <option value={500}>500 ms</option>
                            <option value={1000}>1 s</option>
                            <option value={2000}>2 s</option>
                          </select>
                          <button
                            onClick={generateCurve}
                            className="px-3 py-1 bg-teal-500 text-white rounded hover:bg-teal-600 text-sm font-medium"
                          >
                            Generate
                          </button>
                        </div>
                        <button
                          onClick={completeExtraction}
                          className="px-3 py-2 sm:px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm sm:text-base"
                        >
                          Complete
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Edit</div>
                      <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
                        {fineGeneratedCurve.length > 0 && (
                          <button
                            onClick={resetGenerated}
                            className="px-3 py-2 sm:px-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm sm:text-base"
                          >
                            Reset Gen
                          </button>
                        )}
                        <button
                          onClick={resetCalibration}
                          className="px-3 py-2 sm:px-4 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm sm:text-base"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {currentStep === 'complete' && (
                  <>
                    <button
                      onClick={resetCalibration}
                      className="px-3 py-2 sm:px-4 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm sm:text-base"
                    >
                      Start Over
                    </button>
                    <button
                      onClick={downloadJSON}
                      className="px-3 py-2 sm:px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm sm:text-base"
                    >
                      Download JSON
                    </button>
                    <button
                      onClick={downloadData}
                      className="px-3 py-2 sm:px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm sm:text-base"
                    >
                      Download CSV
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              <p className="text-red-700">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
