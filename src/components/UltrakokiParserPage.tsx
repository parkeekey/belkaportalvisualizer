import { ChangeEvent, forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { UltrakokiGraph, type ComparisonCurvePoint, type UltrakokiBrewData } from './UltrakokiGraph';

type JsonRecord = Record<string, unknown>;
type CellValue = string | number;
type CsvRows = CellValue[][];
type PointRow = {
  sample_index: number;
  time_s: number;
  ec_value: number;
  temperature: CellValue;
};

type BrewingData = {
  periodSeconds: number;
  pourFlow: number[];
  dripFlow: number[];
  cumulativePour: number[];
  temperature: number[];
  label: string;
};

type ParseMode = 'auto' | 'phases' | 'samples' | 'legacy' | 'points';

type ParseResult = {
  modeUsed: ParseMode;
  detectedSource: 'points' | 'brewingLog';
  rows: CsvRows;
  recipeRows: CsvRows;
  flowSamples: FlowSample[];
  metadataRows: MetadataRow[];
  brewingData: BrewingData | null;
};

type EcCurveSource = 'none' | 'main-profile' | 'point-array' | 'text-extract';

type ComparisonCurveBuildResult = {
  curve: ComparisonCurvePoint[];
  source: EcCurveSource;
};

type FlowSample = {
  sample_index: number;
  time_s: number;
  drip_flow_g_s: number;
  temperature_c: number | null;
  source: 'dripFlow' | 'derived';
};

type MetadataRow = {
  key: string;
  value: string;
  source: 'json' | 'text';
};

export interface UltrakokiParserSessionProfile {
  version: 1;
  rawJson: string;
  ecRawJson: string;
  mode: ParseMode;
  threshold: number;
  minChange: number;
  minPour: number;
  noiseMinWaterAdded: number;
  flowNoiseFloor: number;
  flowSpikeThreshold: number;
  flowMaxThreshold: number;
  flowDisplayMax: number;
  flowSmoothingWindow: number;
  coffeeDoseG: number;
  fileName: string;
  ecFileName: string;
  showImportedEc: boolean;
  zoomLevel: number;
  showToggleW1CumPour: boolean;
  showToggleW1CumBrew: boolean;
  showToggleW1PourRatio: boolean;
  showToggleW1BrewRatio: boolean;
  showToggleW2PourFlow: boolean;
  showToggleW2BrewFlow: boolean;
  showToggleW2Dripper: boolean;
  showToggleW2Temp: boolean;
  showWindow2InWindow1: boolean;
  showWindow1InWindow2: boolean;
}

export interface UltrakokiParserPageHandle {
  exportProfile: () => UltrakokiParserSessionProfile;
  importProfile: (profile: UltrakokiParserSessionProfile) => void;
}

type LegacyPour = {
  pour_index: number;
  pour_type: string;
  start_time_s: number;
  end_time_s: number;
  duration_s: number;
  water_added_g: number;
  cumulative_g: number;
  pour_rate_g_s: number;
  avg_brew_speed_g_s: number;
  max_brew_speed_g_s: number;
};

type LegacyFieldKey = keyof LegacyPour;

const LEGACY_FIELDS: LegacyFieldKey[] = [
  'pour_index',
  'pour_type',
  'start_time_s',
  'end_time_s',
  'duration_s',
  'water_added_g',
  'cumulative_g',
  'pour_rate_g_s',
  'avg_brew_speed_g_s',
  'max_brew_speed_g_s',
];

const STORAGE_KEYS = {
  rawJson: 'ultrakoki.parser.rawJson',
  ecRawJson: 'ultrakoki.parser.ecRawJson',
  mode: 'ultrakoki.parser.mode',
  threshold: 'ultrakoki.parser.threshold',
  minChange: 'ultrakoki.parser.minChange',
  minPour: 'ultrakoki.parser.minPour',
  noiseMinWaterAdded: 'ultrakoki.parser.noiseMinWaterAdded',
  flowNoiseFloor: 'ultrakoki.parser.flowNoiseFloor',
  flowSpikeThreshold: 'ultrakoki.parser.flowSpikeThreshold',
  flowMaxThreshold: 'ultrakoki.parser.flowMaxThreshold',
  flowDisplayMax: 'ultrakoki.parser.flowDisplayMax',
  flowSmoothingWindow: 'ultrakoki.parser.flowSmoothingWindow',
  coffeeDoseG: 'ultrakoki.parser.coffeeDoseG',
  showImportedEc: 'ultrakoki.parser.showImportedEc',
  zoomLevel: 'ultrakoki.parser.zoomLevel',
  showToggleW1CumPour: 'ultrakoki.parser.showToggleW1CumPour',
  showToggleW1CumBrew: 'ultrakoki.parser.showToggleW1CumBrew',
  showToggleW1PourRatio: 'ultrakoki.parser.showToggleW1PourRatio',
  showToggleW1BrewRatio: 'ultrakoki.parser.showToggleW1BrewRatio',
  showToggleW2PourFlow: 'ultrakoki.parser.showToggleW2PourFlow',
  showToggleW2BrewFlow: 'ultrakoki.parser.showToggleW2BrewFlow',
  showToggleW2Dripper: 'ultrakoki.parser.showToggleW2Dripper',
  showToggleW2Temp: 'ultrakoki.parser.showToggleW2Temp',
  showWindow2InWindow1: 'ultrakoki.parser.showWindow2InWindow1',
  showWindow1InWindow2: 'ultrakoki.parser.showWindow1InWindow2',
} as const;

function parseStoredBoolean(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function isObject(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPointLike(value: unknown): value is JsonRecord {
  if (!isObject(value)) return false;
  const hasExplicitEc = Object.prototype.hasOwnProperty.call(value, 'ecValue') || Object.prototype.hasOwnProperty.call(value, 'ec');
  if (hasExplicitEc) return true;

  // If only `y` is present, require a time-like field to avoid matching calibration/image pixel points.
  const hasYLike = Object.prototype.hasOwnProperty.call(value, 'value') || Object.prototype.hasOwnProperty.call(value, 'y');
  const hasTimeLike =
    Object.prototype.hasOwnProperty.call(value, 'time') ||
    Object.prototype.hasOwnProperty.call(value, 'timeMs') ||
    Object.prototype.hasOwnProperty.call(value, 'time_s') ||
    Object.prototype.hasOwnProperty.call(value, 'x');

  if (hasYLike && hasTimeLike) {
    const looksLikeCalibration =
      Object.prototype.hasOwnProperty.call(value, 'dataX') ||
      Object.prototype.hasOwnProperty.call(value, 'dataY') ||
      Object.prototype.hasOwnProperty.call(value, 'label');
    return !looksLikeCalibration;
  }

  return (
    false
  );
}

function extractEcValue(record: JsonRecord): number {
  const candidate =
    record.ecValue ??
    record.ec ??
    record.value ??
    record.y;
  return Number(candidate);
}

function collectArraysDeep(root: unknown, maxArrays = 250): unknown[][] {
  const arrays: unknown[][] = [];
  const stack: unknown[] = [root];
  const visited = new Set<unknown>();

  while (stack.length > 0 && arrays.length < maxArrays) {
    const node = stack.pop();
    if (!node || visited.has(node)) continue;

    if (Array.isArray(node)) {
      arrays.push(node);
      visited.add(node);
      for (let index = node.length - 1; index >= 0; index -= 1) {
        const value = node[index];
        if (isObject(value) || Array.isArray(value)) stack.push(value);
      }
      continue;
    }

    if (isObject(node)) {
      visited.add(node);
      for (const value of Object.values(node)) {
        if (isObject(value) || Array.isArray(value)) stack.push(value);
      }
    }
  }

  return arrays;
}

function collectObjectsDeep(root: unknown, maxObjects = 500): JsonRecord[] {
  const objects: JsonRecord[] = [];
  const stack: unknown[] = [root];
  const visited = new Set<unknown>();

  while (stack.length > 0 && objects.length < maxObjects) {
    const node = stack.pop();
    if (!node || visited.has(node)) continue;

    if (Array.isArray(node)) {
      visited.add(node);
      for (let index = node.length - 1; index >= 0; index -= 1) {
        const value = node[index];
        if (isObject(value) || Array.isArray(value)) stack.push(value);
      }
      continue;
    }

    if (isObject(node)) {
      objects.push(node);
      visited.add(node);
      for (const value of Object.values(node)) {
        if (isObject(value) || Array.isArray(value)) stack.push(value);
      }
    }
  }

  return objects;
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const num = typeof item === 'number' ? item : Number(item);
      return Number.isFinite(num) ? num : null;
    })
    .filter((item): item is number => item !== null);
}

function findPointArray(root: unknown): { kind: 'points'; points: PointRow[] } | null {
  const candidates = collectArraysDeep(root);

  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length < 2) continue;

    // Support plain numeric arrays as EC curves.
    const numericSeries = candidate
      .map((item) => (typeof item === 'number' ? item : Number(item)))
      .filter((value) => Number.isFinite(value));
    if (numericSeries.length >= 2 && numericSeries.length === candidate.length) {
      const points = numericSeries.map((ecValue, index) => ({
        sample_index: index,
        time_s: index,
        ec_value: Number(ecValue.toFixed(3)),
        temperature: '',
      }));
      return { kind: 'points', points };
    }

    const points = candidate
      .map((item, index) => {
        if (!isPointLike(item)) return null;
        const timeMs = Number(item.timeMs);
        const time = Number(item.time);
        const ecValue = extractEcValue(item);
        const temperature = Number(item.temperature);

        if (!Number.isFinite(ecValue)) return null;

        return {
          sample_index: index,
          time_s: Number.isFinite(timeMs)
            ? Number((timeMs / 1000).toFixed(3))
            : Number.isFinite(time)
              ? Number(time.toFixed(3))
              : index,
          ec_value: Number(ecValue.toFixed(3)),
          temperature: Number.isFinite(temperature) ? Number(temperature.toFixed(3)) : '',
        };
      })
      .filter((item): item is PointRow => item !== null);

    if (points.length >= 2) {
      return { kind: 'points', points };
    }
  }

  return null;
}

function findBrewingLog(root: unknown): BrewingData | null {
  const candidates = collectObjectsDeep(root);

  for (const candidate of candidates) {
    const maybeBrewingLog = isObject(candidate.brewingLog)
      ? candidate.brewingLog
      : isObject(candidate.brewLog)
        ? candidate.brewLog
        : candidate;

    const pourFlow = toNumberArray(maybeBrewingLog.size ?? maybeBrewingLog.pourFlow ?? maybeBrewingLog.flow);
    const dripFlow = toNumberArray(maybeBrewingLog.bsize ?? maybeBrewingLog.dripFlow ?? maybeBrewingLog.outflow);
    const cumulativePour = toNumberArray(
      maybeBrewingLog.total ??
        maybeBrewingLog.adc1 ??
        maybeBrewingLog.cumulativePour ??
        maybeBrewingLog.cumulative,
    );

    const temperature = toNumberArray(
      maybeBrewingLog.temperature ??
      maybeBrewingLog.temp ??
      maybeBrewingLog.waterTemp ??
      maybeBrewingLog.brewTemp,
    );

    const sampleCount = Math.max(pourFlow.length, dripFlow.length, cumulativePour.length, temperature.length);
    if (sampleCount <= 1) continue;

    const rawDuration = Number(
      maybeBrewingLog.period ??
        candidate.period ??
        maybeBrewingLog.totalDuration ??
        candidate.totalDuration,
    );

    const duration = Number.isFinite(rawDuration) && rawDuration > 10000 ? rawDuration / 1000 : rawDuration;

    const cupFactory = typeof candidate.cupFactory === 'string' ? candidate.cupFactory : '';
    const cupModel = typeof candidate.cupModel === 'string' ? candidate.cupModel : '';

    return {
      periodSeconds: Number.isFinite(duration) && duration > 0 ? duration : sampleCount - 1,
      pourFlow: pourFlow.length ? pourFlow : Array(sampleCount).fill(0),
      dripFlow: dripFlow.length ? dripFlow : Array(sampleCount).fill(0),
      cumulativePour: cumulativePour.length ? cumulativePour : Array(sampleCount).fill(0),
      temperature: temperature.length ? temperature : Array(sampleCount).fill(0),
      label: [cupFactory, cupModel].filter(Boolean).join(' / ') || 'Ultrakoki brew log',
    };
  }

  return null;
}

function stripJsonComments(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');
}

function parseJsonLenient(rawJson: string): unknown {
  const normalized = rawJson.trim().replace(/^\uFEFF/, '');
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    const stripped = stripJsonComments(normalized);
    return JSON.parse(stripped) as unknown;
  }
}

function extractEcValuesFromText(rawText: string): number[] {
  const values: number[] = [];
  const regex = /"(?:ecValue|ec|value|y)"\s*:\s*(-?\d+(?:\.\d+)?)/g;

  let match = regex.exec(rawText);
  while (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) values.push(value);
    match = regex.exec(rawText);
  }

  return values;
}

function toCsvValue(value: CellValue): string {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows: CsvRows): string {
  return rows.map((row) => row.map(toCsvValue).join(',')).join('\n');
}

function sum(values: number[], startIndex: number, endIndex: number, intervalSeconds: number): number {
  let total = 0;
  for (let index = startIndex; index <= endIndex; index += 1) {
    total += (values[index] || 0) * intervalSeconds;
  }
  return total;
}

function detectPhases(pourFlow: number[], threshold: number): Array<{ start: number; end: number }> {
  const phases: Array<{ start: number; end: number }> = [];
  let start: number | null = null;

  for (let index = 0; index < pourFlow.length; index += 1) {
    const active = (pourFlow[index] || 0) > threshold;
    if (active && start === null) {
      start = index;
    }

    const nextActive = index + 1 < pourFlow.length ? (pourFlow[index + 1] || 0) > threshold : false;
    if (start !== null && (!active || !nextActive) && (!nextActive || index === pourFlow.length - 1)) {
      const end = active ? index : Math.max(start, index - 1);
      if (end >= start) phases.push({ start, end });
      start = null;
    }
  }

  return phases;
}

function buildSampleRows(data: BrewingData): CsvRows {
  const intervalSeconds = data.periodSeconds / Math.max(1, data.pourFlow.length - 1);
  const maxLength = Math.max(data.pourFlow.length, data.dripFlow.length, data.cumulativePour.length);
  const rows: CsvRows = [[
    'sample_index',
    'time_s',
    'pour_flow_g_s',
    'drip_flow_g_s',
    'cumulative_pour_raw',
  ]];

  let runningPour = 0;
  for (let index = 0; index < maxLength; index += 1) {
    const pour = data.pourFlow[index] || 0;
    runningPour += pour * intervalSeconds;
    rows.push([
      index,
      Number((index * intervalSeconds).toFixed(3)),
      Number(pour.toFixed(3)),
      Number((data.dripFlow[index] || 0).toFixed(3)),
      data.cumulativePour[index] ?? Number(runningPour.toFixed(3)),
    ]);
  }

  return rows;
}

function buildPointRows(points: PointRow[]): CsvRows {
  const rows: CsvRows = [['sample_index', 'time_s', 'ec_value', 'temperature']];

  for (const point of points) {
    rows.push([
      Number(point.sample_index),
      Number(point.time_s),
      Number(point.ec_value),
      point.temperature,
    ]);
  }

  return rows;
}

function buildPhaseRows(data: BrewingData, threshold: number): CsvRows {
  const intervalSeconds = data.periodSeconds / Math.max(1, data.pourFlow.length - 1);
  const phases = detectPhases(data.pourFlow, threshold);

  const totalPour = sum(data.pourFlow, 0, data.pourFlow.length - 1, intervalSeconds);
  const totalDrip = sum(data.dripFlow, 0, data.dripFlow.length - 1, intervalSeconds);

  const rows: CsvRows = [[
    'phase_index',
    'phase_name',
    'start_time_s',
    'end_time_s',
    'duration_s',
    'pour_g',
    'pour_pct',
    'water_in_g',
    'water_in_ratio_pct',
    'water_out_g',
    'water_out_ratio_pct',
  ]];

  phases.forEach((phase, index) => {
    const pourG = sum(data.pourFlow, phase.start, phase.end, intervalSeconds);
    const dripG = sum(data.dripFlow, phase.start, phase.end, intervalSeconds);
    const startTime = phase.start * intervalSeconds;
    const endTime = phase.end * intervalSeconds;
    const duration = Math.max(0, endTime - startTime);

    rows.push([
      index + 1,
      index === 0 ? 'Blooming' : `Pour ${index + 1}`,
      Number(startTime.toFixed(3)),
      Number(endTime.toFixed(3)),
      Number(duration.toFixed(3)),
      Number(pourG.toFixed(3)),
      totalPour > 0 ? Number(((pourG / totalPour) * 100).toFixed(1)) : 0,
      Number(pourG.toFixed(3)),
      totalPour > 0 ? Number(((pourG / totalPour) * 100).toFixed(1)) : 0,
      Number(dripG.toFixed(3)),
      totalDrip > 0 ? Number(((dripG / totalDrip) * 100).toFixed(1)) : 0,
    ]);
  });

  return rows;
}

function classifyPour(amountG: number, rateGPerS: number, previousAmountG: number | null): string {
  if (amountG <= 2.0) {
    if (previousAmountG == null || previousAmountG > 2.0) return 'Switch pressed';
    return 'Switch pressed [Off]';
  }
  if (amountG > 100 || rateGPerS > 20) return 'Dripper removed';
  return 'Normal pour';
}

function buildLegacyRows(data: BrewingData, minDetectableChange: number, minTotalPour: number): CsvRows {
  const total = data.cumulativePour;
  const bsize = data.dripFlow;
  const nSamples = total.length;
  const intervalSeconds = nSamples > 1 ? data.periodSeconds / (nSamples - 1) : 0;

  const pours: Array<{
    pourIndex: number;
    startTimeS: number;
    endTimeS: number;
    durationS: number;
    amountG: number;
    cumulativeG: number;
    pourRateGPerS: number;
    avgBrewSpeedGPerS: number;
    maxBrewSpeedGPerS: number;
    pourType: string;
  }> = [];

  let inPour = false;
  let startIdx: number | null = null;

  const closePourSegment = (endIdx: number) => {
    if (!inPour || startIdx == null) return;

    const t0 = startIdx * intervalSeconds;
    const t1 = endIdx * intervalSeconds;
    const c0 = Number.isFinite(total[startIdx]) ? total[startIdx] : 0;
    const c1 = Number.isFinite(total[endIdx]) ? total[endIdx] : c0;
    const added = c1 - c0;
    const duration = t1 - t0;

    if (added >= minTotalPour && duration > 0) {
      const brewSpeeds = bsize.slice(startIdx, endIdx + 1).map((value) => (Number.isFinite(value) ? value : 0));
      const avgBrewSpeed = brewSpeeds.length > 0
        ? brewSpeeds.reduce((acc, value) => acc + value, 0) / brewSpeeds.length
        : 0;
      const maxBrewSpeed = brewSpeeds.length > 0 ? Math.max(...brewSpeeds) : 0;
      const pourRate = duration > 0 ? added / duration : 0;
      const previousAmount = pours.length > 0 ? pours[pours.length - 1].amountG : null;
      const pourType = classifyPour(added, pourRate, previousAmount);

      pours.push({
        pourIndex: pours.length + 1,
        startTimeS: Number(t0.toFixed(2)),
        endTimeS: Number(t1.toFixed(2)),
        durationS: Number(duration.toFixed(2)),
        amountG: Number(added.toFixed(1)),
        cumulativeG: Number(c1.toFixed(1)),
        pourRateGPerS: Number(pourRate.toFixed(2)),
        avgBrewSpeedGPerS: Number(avgBrewSpeed.toFixed(2)),
        maxBrewSpeedGPerS: Number(maxBrewSpeed.toFixed(2)),
        pourType,
      });
    }

    inPour = false;
    startIdx = null;
  };

  for (let index = 1; index < nSamples; index += 1) {
    const prev = Number.isFinite(total[index - 1]) ? total[index - 1] : 0;
    const curr = Number.isFinite(total[index]) ? total[index] : prev;
    const change = curr - prev;

    if (change >= minDetectableChange && !inPour) {
      inPour = true;
      startIdx = index - 1;
    } else if ((change < minDetectableChange || curr <= prev) && inPour) {
      closePourSegment(index - 1);
    }
  }

  if (inPour) {
    closePourSegment(nSamples - 1);
  }

  const rows: CsvRows = [[
    'pour_index',
    'pour_type',
    'start_time_s',
    'end_time_s',
    'duration_s',
    'water_added_g',
    'cumulative_g',
    'pour_rate_g_s',
    'avg_brew_speed_g_s',
    'max_brew_speed_g_s',
  ]];

  for (const pour of pours) {
    rows.push([
      pour.pourIndex,
      pour.pourType,
      pour.startTimeS,
      pour.endTimeS,
      pour.durationS,
      pour.amountG,
      pour.cumulativeG,
      pour.pourRateGPerS,
      pour.avgBrewSpeedGPerS,
      pour.maxBrewSpeedGPerS,
    ]);
  }

  return rows;
}

function filterLegacyRowsByWaterAdded(rows: CsvRows, minWaterAddedG: number): CsvRows {
  if (!rows.length || minWaterAddedG <= 0) return rows;

  const header = rows[0].map((value) => String(value));
  const waterAddedIndex = header.indexOf('water_added_g');
  if (waterAddedIndex < 0) return rows;

  const filteredBody = rows.slice(1).filter((row) => {
    const value = Number(row[waterAddedIndex]);
    if (!Number.isFinite(value)) return false;
    return value >= minWaterAddedG;
  });

  return [rows[0], ...filteredBody];
}

function parseLegacyPours(recipeRows: CsvRows): LegacyPour[] {
  if (!recipeRows.length) return [];

  const header = recipeRows[0].map((value) => String(value));
  const hasAllColumns = LEGACY_FIELDS.every((field) => header.includes(field));
  if (!hasAllColumns) return [];

  const indexByName = new Map<string, number>();
  header.forEach((name, index) => indexByName.set(name, index));

  return recipeRows.slice(1).map((row) => {
    const getText = (field: LegacyFieldKey) => String(row[indexByName.get(field) ?? -1] ?? '');
    const getNumber = (field: LegacyFieldKey) => {
      const numeric = Number(getText(field));
      return Number.isFinite(numeric) ? numeric : 0;
    };

    return {
      pour_index: getNumber('pour_index'),
      pour_type: getText('pour_type'),
      start_time_s: getNumber('start_time_s'),
      end_time_s: getNumber('end_time_s'),
      duration_s: getNumber('duration_s'),
      water_added_g: getNumber('water_added_g'),
      cumulative_g: getNumber('cumulative_g'),
      pour_rate_g_s: getNumber('pour_rate_g_s'),
      avg_brew_speed_g_s: getNumber('avg_brew_speed_g_s'),
      max_brew_speed_g_s: getNumber('max_brew_speed_g_s'),
    };
  });
}

function buildLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function buildStepPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const curr = points[index];
    path += ` L ${curr.x.toFixed(2)} ${prev.y.toFixed(2)} L ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
  }
  return path;
}

function extractDoseFromMetadata(metadataRows: MetadataRow[]): number | null {
  const doseRow = metadataRows.find((row) => /dose/i.test(row.key));
  if (!doseRow) return null;
  const match = doseRow.value.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function titleCaseKey(input: string): string {
  return input
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function estimateDerivedDripFlow(data: BrewingData, intervalSeconds: number, sampleCount: number): number[] {
  const decaySeconds = Math.max(intervalSeconds * 2, Math.min(8, Math.max(4, data.periodSeconds / 20)));
  const relaxation = 0.45;
  const derived: number[] = [];
  let retainedWater = 0;
  let previousFlow = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const pourFlow = Number.isFinite(data.pourFlow[index]) ? Math.max(0, data.pourFlow[index]) : 0;
    retainedWater += pourFlow * intervalSeconds;

    const targetFlow = retainedWater > 0 ? retainedWater / decaySeconds : 0;
    previousFlow += (targetFlow - previousFlow) * relaxation;

    const maxDrain = intervalSeconds > 0 ? retainedWater / intervalSeconds : retainedWater;
    const dripFlow = Math.max(0, Math.min(previousFlow, maxDrain));
    retainedWater = Math.max(0, retainedWater - dripFlow * intervalSeconds);

    if (pourFlow === 0 && retainedWater < 0.001 && dripFlow < 0.001) {
      retainedWater = 0;
      previousFlow = 0;
    }

    derived.push(Number(dripFlow.toFixed(3)));
  }

  return derived;
}

function buildFlowSamples(data: BrewingData): FlowSample[] {
  const intervalSeconds = data.periodSeconds / Math.max(1, data.cumulativePour.length - 1);
  const hasNativeDrip = data.dripFlow.some((value) => Number.isFinite(value) && value > 0);
  const sampleCount = Math.max(data.dripFlow.length, data.cumulativePour.length, data.temperature.length);
  const derivedDripFlow = hasNativeDrip ? [] : estimateDerivedDripFlow(data, intervalSeconds, sampleCount);

  const samples: FlowSample[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index * intervalSeconds;
    let value = 0;
    let source: 'dripFlow' | 'derived' = 'dripFlow';

    if (hasNativeDrip) {
      value = Number.isFinite(data.dripFlow[index]) ? data.dripFlow[index] : 0;
      source = 'dripFlow';
    } else {
      value = derivedDripFlow[index] ?? 0;
      source = 'derived';
    }

    const clamped = Number.isFinite(value) ? Math.max(0, value) : 0;
    samples.push({
      sample_index: index,
      time_s: Number(time.toFixed(3)),
      drip_flow_g_s: Number(clamped.toFixed(3)),
      temperature_c: Number.isFinite(data.temperature[index]) ? Number(data.temperature[index].toFixed(2)) : null,
      source,
    });
  }

  return samples;
}

function extractMetadataFromJson(root: unknown): MetadataRow[] {
  const rows: MetadataRow[] = [];
  const seen = new Set<string>();
  const keysMatcher = /(bean|coffee|origin|process|roast|grinder|dripper|filter|recipe|dose|ratio|water|temp|temperature|kettle|brew|method|note|notes|profile|name|model)/i;

  const objects = collectObjectsDeep(root, 1200);
  for (const objectNode of objects) {
    for (const [key, value] of Object.entries(objectNode)) {
      if (!keysMatcher.test(key)) continue;
      if (value == null) continue;

      const valueText = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : Array.isArray(value)
          ? value.filter((item) => typeof item === 'string' || typeof item === 'number').slice(0, 6).join(', ')
          : '';

      const normalizedValue = valueText.trim();
      if (!normalizedValue) continue;

      const displayKey = titleCaseKey(key);
      const dedupeKey = `${displayKey.toLowerCase()}::${normalizedValue.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      rows.push({ key: displayKey, value: normalizedValue, source: 'json' });
      if (rows.length >= 40) return rows;
    }
  }

  return rows;
}

function extractMetadataFromText(rawText: string): MetadataRow[] {
  const rows: MetadataRow[] = [];
  const seen = new Set<string>();
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const matcher = /(bean|coffee|origin|process|roast|grinder|dripper|filter|recipe|dose|ratio|water|temp|temperature|kettle|brew|method|note|notes|profile|name|model)/i;

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (!key || !value) continue;
    if (!matcher.test(key)) continue;

    const displayKey = titleCaseKey(key);
    const dedupeKey = `${displayKey.toLowerCase()}::${value.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    rows.push({ key: displayKey, value, source: 'text' });
    if (rows.length >= 25) break;
  }

  return rows;
}

function smoothSeries(values: number[], windowSize: number): number[] {
  const size = Math.max(1, Math.floor(windowSize));
  if (size === 1 || values.length === 0) return values;

  const half = Math.floor(size / 2);
  return values.map((_, index) => {
    const start = Math.max(0, index - half);
    const end = Math.min(values.length - 1, index + half);
    const slice = values.slice(start, end + 1);
    const total = slice.reduce((sum, item) => sum + item, 0);
    return Number((total / slice.length).toFixed(3));
  });
}

function medianValue(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentileValue(values: number[], percentile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const clamped = Math.max(0, Math.min(1, percentile));
  const index = clamped * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const fraction = index - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function sanitizeFlowSeries(
  values: number[],
  noiseFloor: number,
  maxThreshold: number,
  spikeThreshold: number,
  smoothingWindow: number,
): number[] {
  if (!values.length) return [];

  const floorClamped = values.map((value) => {
    const numeric = Number.isFinite(value) ? value : 0;
    return numeric >= noiseFloor && numeric <= maxThreshold ? numeric : 0;
  });

  const spikeSuppressed = floorClamped.map((value, index, array) => {
    const localWindow = [
      array[index - 2],
      array[index - 1],
      array[index + 1],
      array[index + 2],
    ].filter((item): item is number => Number.isFinite(item));

    const localBaseline = medianValue(localWindow);
    const prev = index > 0 ? array[index - 1] : localBaseline;
    const next = index + 1 < array.length ? array[index + 1] : localBaseline;
    const neighborPeak = Math.max(prev, next, localBaseline);
    const isSingleSampleSpike =
      value > spikeThreshold &&
      localBaseline > 0 &&
      value > Math.max(localBaseline * 1.8, localBaseline + spikeThreshold) &&
      value > Math.max(1.5, neighborPeak * 1.3);

    if (!isSingleSampleSpike) return value;
    return Math.max(localBaseline, (prev + next) / 2);
  });

  const terminalSuppressed = [...spikeSuppressed];
  if (terminalSuppressed.length >= 2) {
    const lastIndex = terminalSuppressed.length - 1;
    const lastValue = terminalSuppressed[lastIndex];
    const prevValue = terminalSuppressed[lastIndex - 1];
    const abruptTailSpike = lastValue > 0 && lastValue > Math.max(spikeThreshold, prevValue * 1.7, prevValue + spikeThreshold);
    if (abruptTailSpike) {
      terminalSuppressed[lastIndex] = 0;
    }
  }

  const smoothed = smoothSeries(terminalSuppressed, smoothingWindow);
  return smoothed.map((value) => Number(value.toFixed(3)));
}

function parseUltrakokiJson(
  rawJson: string,
  mode: ParseMode,
  threshold: number,
  minDetectableChange: number,
  minTotalPour: number,
): ParseResult {
  const metadataTextRows = extractMetadataFromText(rawJson);
  let parsed: unknown;
  try {
    parsed = parseJsonLenient(rawJson);
  } catch {
    const extractedValues = extractEcValuesFromText(rawJson);
    if (extractedValues.length >= 2) {
      const fallbackRows = buildPointRows(
        extractedValues.map((value, index) => ({
          sample_index: index,
          time_s: index,
          ec_value: Number(value.toFixed(3)),
          temperature: '',
        })),
      );
      return {
        modeUsed: 'points',
        detectedSource: 'points',
        rows: fallbackRows,
        recipeRows: fallbackRows,
        flowSamples: [],
        metadataRows: metadataTextRows,
        brewingData: null,
      };
    }
    throw new Error('Invalid JSON format. Tried tolerant parsing, but still could not read this file.');
  }

  const metadataJsonRows = extractMetadataFromJson(parsed);
  const metadataRows = [...metadataJsonRows, ...metadataTextRows].slice(0, 60);

  const pointArray = findPointArray(parsed);
  if (pointArray && (mode === 'auto' || mode === 'points')) {
    const rows = buildPointRows(pointArray.points);
    return {
      modeUsed: 'points',
      detectedSource: 'points',
      rows,
      recipeRows: rows,
      flowSamples: [],
      metadataRows,
      brewingData: null,
    };
  }

  const data = findBrewingLog(parsed);
  if (!data) {
    throw new Error('Could not find a supported point array or Ultrakoki brewingLog in the JSON.');
  }

  let rows: CsvRows;
  let modeUsed: ParseMode;

  if (mode === 'samples') {
    rows = buildSampleRows(data);
    modeUsed = 'samples';
  } else if (mode === 'legacy') {
    rows = buildLegacyRows(data, minDetectableChange, minTotalPour);
    modeUsed = 'legacy';
  } else if (mode === 'phases') {
    rows = buildPhaseRows(data, threshold);
    modeUsed = 'phases';
  } else {
    rows = buildLegacyRows(data, minDetectableChange, minTotalPour);
    modeUsed = 'legacy';
  }

  const recipeRows = modeUsed === 'legacy' ? rows : buildLegacyRows(data, minDetectableChange, minTotalPour);
  const flowSamples = buildFlowSamples(data);

  return {
    modeUsed,
    detectedSource: 'brewingLog',
    rows,
    recipeRows,
    flowSamples,
    metadataRows,
    brewingData: data,
  };
}

function buildComparisonCurve(rawInput: string): ComparisonCurveBuildResult {
  const normalizePoints = (points: PointRow[]) => points
    .map((point, index) => {
      const time = Number.isFinite(point.time_s) ? Number(point.time_s) : index;
      const ecValue = Number(point.ec_value);
      if (!Number.isFinite(time) || !Number.isFinite(ecValue)) return null;
      return {
        time: Number(time.toFixed(3)),
        ecValue: Number(ecValue.toFixed(3)),
      };
    })
    .filter((point): point is ComparisonCurvePoint => point !== null)
    .sort((left, right) => left.time - right.time);

  const normalizeDigitizerPoints = (points: unknown[]): ComparisonCurvePoint[] => points
    .map((item, index) => {
      if (!isObject(item)) return null;

      const rawTime = Number(item.time ?? item.time_s ?? item.x ?? index);
      const rawEc = Number(item.ecValue ?? item.ec ?? item.value ?? item.y);
      if (!Number.isFinite(rawTime) || !Number.isFinite(rawEc)) return null;

      return {
        time: Number(rawTime.toFixed(3)),
        ecValue: Number(rawEc.toFixed(3)),
      };
    })
    .filter((point): point is ComparisonCurvePoint => point !== null)
    .sort((left, right) => left.time - right.time);

  const extractDigitizerCurveFromWorkspaceProfile = (parsed: unknown): ComparisonCurvePoint[] => {
    if (!isObject(parsed)) return [];
    const digitizer = isObject(parsed.digitizer) ? parsed.digitizer : null;
    if (!digitizer) return [];

    const preferredCurves = [
      Array.isArray(digitizer.fineGeneratedCurve) ? digitizer.fineGeneratedCurve : [],
      Array.isArray(digitizer.extractedPoints) ? digitizer.extractedPoints : [],
    ];

    for (const candidate of preferredCurves) {
      const normalized = normalizeDigitizerPoints(candidate);
      if (normalized.length >= 2) return normalized;
    }

    return [];
  };

  const trimmed = rawInput.trim();
  if (!trimmed) return { curve: [], source: 'none' };

  try {
    const parsed = parseJsonLenient(trimmed);
    const profileCurve = extractDigitizerCurveFromWorkspaceProfile(parsed);
    if (profileCurve.length >= 2) {
      return { curve: profileCurve, source: 'main-profile' };
    }

    const pointArray = findPointArray(parsed);
    if (pointArray && pointArray.points.length >= 2) {
      return { curve: normalizePoints(pointArray.points), source: 'point-array' };
    }
  } catch {
    // Fall through to text-based extraction.
  }

  const values = extractEcValuesFromText(trimmed);
  const curve = values.map((value, index) => ({
    time: index,
    ecValue: Number(value.toFixed(3)),
  }));
  return { curve, source: curve.length >= 2 ? 'text-extract' : 'none' };
}

function downloadCsv(csvText: string, name = 'ultrakoki_parsed.csv') {
  const blob = new Blob([`${csvText}\n`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export const UltrakokiParserPage = forwardRef<UltrakokiParserPageHandle>((_, ref) => {
  const [rawJson, setRawJson] = useState('');
  const [ecRawJson, setEcRawJson] = useState('');
  const [mode, setMode] = useState<ParseMode>('legacy');
  const [threshold, setThreshold] = useState(0.01);
  const [minChange, setMinChange] = useState(0.5);
  const [minPour, setMinPour] = useState(1.0);
  const [noiseMinWaterAdded, setNoiseMinWaterAdded] = useState(2.0);
  const [flowNoiseFloor, setFlowNoiseFloor] = useState(0.15);
  const [flowSpikeThreshold, setFlowSpikeThreshold] = useState(4.5);
  const [flowMaxThreshold, setFlowMaxThreshold] = useState(12.0);
  const [flowDisplayMax, setFlowDisplayMax] = useState(0);
  const [flowSmoothingWindow, setFlowSmoothingWindow] = useState(3);
  const [coffeeDoseG, setCoffeeDoseG] = useState(15);
  const [fileName, setFileName] = useState('');
  const [ecFileName, setEcFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ecImportError, setEcImportError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [ecComparisonCurve, setEcComparisonCurve] = useState<ComparisonCurvePoint[]>([]);
  const [ecCurveSource, setEcCurveSource] = useState<EcCurveSource>('none');
  const [showImportedEc, setShowImportedEc] = useState(true);

  // Chart toggles and zoom
  const [zoomLevel, setZoomLevel] = useState(1);
  const [chartMouseX, setChartMouseX] = useState<number | null>(null);
  const [showToggleW1CumPour, setShowToggleW1CumPour] = useState(true);
  const [showToggleW1CumBrew, setShowToggleW1CumBrew] = useState(true);
  const [showToggleW1PourRatio, setShowToggleW1PourRatio] = useState(true);
  const [showToggleW1BrewRatio, setShowToggleW1BrewRatio] = useState(true);
  const [showToggleW2PourFlow, setShowToggleW2PourFlow] = useState(true);
  const [showToggleW2BrewFlow, setShowToggleW2BrewFlow] = useState(true);
  const [showToggleW2Dripper, setShowToggleW2Dripper] = useState(true);
  const [showToggleW2Temp, setShowToggleW2Temp] = useState(true);
  const [showWindow2InWindow1, setShowWindow2InWindow1] = useState(false);
  const [showWindow1InWindow2, setShowWindow1InWindow2] = useState(false);

  useImperativeHandle(ref, () => ({
    exportProfile: () => ({
      version: 1,
      rawJson,
      ecRawJson,
      mode,
      threshold,
      minChange,
      minPour,
      noiseMinWaterAdded,
      flowNoiseFloor,
      flowSpikeThreshold,
      flowMaxThreshold,
      flowDisplayMax,
      flowSmoothingWindow,
      coffeeDoseG,
      fileName,
      ecFileName,
      showImportedEc,
      zoomLevel,
      showToggleW1CumPour,
      showToggleW1CumBrew,
      showToggleW1PourRatio,
      showToggleW1BrewRatio,
      showToggleW2PourFlow,
      showToggleW2BrewFlow,
      showToggleW2Dripper,
      showToggleW2Temp,
      showWindow2InWindow1,
      showWindow1InWindow2,
    }),
    importProfile: (profile) => {
      const nextRawJson = profile.rawJson ?? '';
      const nextEcRawJson = profile.ecRawJson ?? '';
      const nextMode = ['auto', 'phases', 'samples', 'legacy', 'points'].includes(profile.mode)
        ? profile.mode
        : 'legacy';

      setRawJson(nextRawJson);
      setEcRawJson(nextEcRawJson);
      setMode(nextMode);
      setThreshold(Number.isFinite(profile.threshold) ? profile.threshold : 0.01);
      setMinChange(Number.isFinite(profile.minChange) ? profile.minChange : 0.5);
      setMinPour(Number.isFinite(profile.minPour) ? profile.minPour : 1);
      setNoiseMinWaterAdded(Number.isFinite(profile.noiseMinWaterAdded) ? profile.noiseMinWaterAdded : 2);
      setFlowNoiseFloor(Number.isFinite(profile.flowNoiseFloor) ? profile.flowNoiseFloor : 0.15);
      setFlowSpikeThreshold(Number.isFinite(profile.flowSpikeThreshold) ? profile.flowSpikeThreshold : 4.5);
      setFlowMaxThreshold(Number.isFinite(profile.flowMaxThreshold) ? profile.flowMaxThreshold : 12);
      setFlowDisplayMax(Number.isFinite(profile.flowDisplayMax) ? profile.flowDisplayMax : 0);
      setFlowSmoothingWindow(Number.isFinite(profile.flowSmoothingWindow) ? profile.flowSmoothingWindow : 3);
      setCoffeeDoseG(Number.isFinite(profile.coffeeDoseG) ? profile.coffeeDoseG : 15);
      setFileName(profile.fileName ?? '');
      setEcFileName(profile.ecFileName ?? '');
      setShowImportedEc(Boolean(profile.showImportedEc));
      setZoomLevel(Number.isFinite(profile.zoomLevel) ? profile.zoomLevel : 1);
      setShowToggleW1CumPour(Boolean(profile.showToggleW1CumPour));
      setShowToggleW1CumBrew(Boolean(profile.showToggleW1CumBrew));
      setShowToggleW1PourRatio(Boolean(profile.showToggleW1PourRatio));
      setShowToggleW1BrewRatio(Boolean(profile.showToggleW1BrewRatio));
      setShowToggleW2PourFlow(Boolean(profile.showToggleW2PourFlow));
      setShowToggleW2BrewFlow(Boolean(profile.showToggleW2BrewFlow));
      setShowToggleW2Dripper(Boolean(profile.showToggleW2Dripper));
      setShowToggleW2Temp(Boolean(profile.showToggleW2Temp));
      setShowWindow2InWindow1(Boolean(profile.showWindow2InWindow1));
      setShowWindow1InWindow2(Boolean(profile.showWindow1InWindow2));
      setChartMouseX(null);

      if (nextRawJson.trim()) {
        try {
          const nextResult = parseUltrakokiJson(nextRawJson, nextMode, profile.threshold ?? 0.01, profile.minChange ?? 0.5, profile.minPour ?? 1);
          setResult(nextResult);
          setError(null);
        } catch (parseError) {
          const message = parseError instanceof Error ? parseError.message : 'Failed to parse restored parser JSON.';
          setResult(null);
          setError(message);
        }
      } else {
        setResult(null);
        setError(null);
      }

      if (nextEcRawJson.trim()) {
        const comparisonResult = buildComparisonCurve(nextEcRawJson);
        const curve = comparisonResult.curve;
        if (curve.length >= 2) {
          setEcComparisonCurve(curve);
          setEcCurveSource(comparisonResult.source);
          setEcImportError(null);
        } else {
          setEcComparisonCurve([]);
          setEcCurveSource('none');
          setEcImportError('Could not restore EC overlay from the saved profile.');
        }
      } else {
        setEcComparisonCurve([]);
        setEcCurveSource('none');
        setEcImportError(null);
      }
    },
  }), [
    rawJson,
    ecRawJson,
    mode,
    threshold,
    minChange,
    minPour,
    noiseMinWaterAdded,
    flowNoiseFloor,
    flowSpikeThreshold,
    flowMaxThreshold,
    flowDisplayMax,
    flowSmoothingWindow,
    coffeeDoseG,
    fileName,
    ecFileName,
    showImportedEc,
    zoomLevel,
    showToggleW1CumPour,
    showToggleW1CumBrew,
    showToggleW1PourRatio,
    showToggleW1BrewRatio,
    showToggleW2PourFlow,
    showToggleW2BrewFlow,
    showToggleW2Dripper,
    showToggleW2Temp,
    showWindow2InWindow1,
    showWindow1InWindow2,
  ]);

  useEffect(() => {
    try {
      const savedRawJson = localStorage.getItem(STORAGE_KEYS.rawJson);
      const savedMode = localStorage.getItem(STORAGE_KEYS.mode);
      const savedThreshold = localStorage.getItem(STORAGE_KEYS.threshold);
      const savedMinChange = localStorage.getItem(STORAGE_KEYS.minChange);
      const savedMinPour = localStorage.getItem(STORAGE_KEYS.minPour);
      const savedEcRawJson = localStorage.getItem(STORAGE_KEYS.ecRawJson);
      const savedNoiseMinWaterAdded = localStorage.getItem(STORAGE_KEYS.noiseMinWaterAdded);
      const savedFlowNoiseFloor = localStorage.getItem(STORAGE_KEYS.flowNoiseFloor);
      const savedFlowSpikeThreshold = localStorage.getItem(STORAGE_KEYS.flowSpikeThreshold);
      const savedFlowMaxThreshold = localStorage.getItem(STORAGE_KEYS.flowMaxThreshold);
      const savedFlowDisplayMax = localStorage.getItem(STORAGE_KEYS.flowDisplayMax);
      const savedFlowSmoothingWindow = localStorage.getItem(STORAGE_KEYS.flowSmoothingWindow);
      const savedCoffeeDoseG = localStorage.getItem(STORAGE_KEYS.coffeeDoseG);
      const savedShowImportedEc = localStorage.getItem(STORAGE_KEYS.showImportedEc);
      const savedZoomLevel = localStorage.getItem(STORAGE_KEYS.zoomLevel);
      const savedShowToggleW1CumPour = localStorage.getItem(STORAGE_KEYS.showToggleW1CumPour);
      const savedShowToggleW1CumBrew = localStorage.getItem(STORAGE_KEYS.showToggleW1CumBrew);
      const savedShowToggleW1PourRatio = localStorage.getItem(STORAGE_KEYS.showToggleW1PourRatio);
      const savedShowToggleW1BrewRatio = localStorage.getItem(STORAGE_KEYS.showToggleW1BrewRatio);
      const savedShowToggleW2PourFlow = localStorage.getItem(STORAGE_KEYS.showToggleW2PourFlow);
      const savedShowToggleW2BrewFlow = localStorage.getItem(STORAGE_KEYS.showToggleW2BrewFlow);
      const savedShowToggleW2Dripper = localStorage.getItem(STORAGE_KEYS.showToggleW2Dripper);
      const savedShowToggleW2Temp = localStorage.getItem(STORAGE_KEYS.showToggleW2Temp);
      const savedShowWindow2InWindow1 = localStorage.getItem(STORAGE_KEYS.showWindow2InWindow1);
      const savedShowWindow1InWindow2 = localStorage.getItem(STORAGE_KEYS.showWindow1InWindow2);

      if (savedRawJson) setRawJson(savedRawJson);
      if (savedEcRawJson) setEcRawJson(savedEcRawJson);
      if (savedMode && ['auto', 'phases', 'samples', 'legacy', 'points'].includes(savedMode)) {
        setMode(savedMode as ParseMode);
      }
      if (savedThreshold && Number.isFinite(Number(savedThreshold))) setThreshold(Number(savedThreshold));
      if (savedMinChange && Number.isFinite(Number(savedMinChange))) setMinChange(Number(savedMinChange));
      if (savedMinPour && Number.isFinite(Number(savedMinPour))) setMinPour(Number(savedMinPour));
      if (savedNoiseMinWaterAdded && Number.isFinite(Number(savedNoiseMinWaterAdded))) {
        setNoiseMinWaterAdded(Number(savedNoiseMinWaterAdded));
      }
      if (savedFlowNoiseFloor && Number.isFinite(Number(savedFlowNoiseFloor))) {
        setFlowNoiseFloor(Number(savedFlowNoiseFloor));
      }
      if (savedFlowSpikeThreshold && Number.isFinite(Number(savedFlowSpikeThreshold))) {
        setFlowSpikeThreshold(Number(savedFlowSpikeThreshold));
      }
      if (savedFlowMaxThreshold && Number.isFinite(Number(savedFlowMaxThreshold))) {
        setFlowMaxThreshold(Number(savedFlowMaxThreshold));
      }
      if (savedFlowDisplayMax && Number.isFinite(Number(savedFlowDisplayMax))) {
        setFlowDisplayMax(Number(savedFlowDisplayMax));
      }
      if (savedFlowSmoothingWindow && Number.isFinite(Number(savedFlowSmoothingWindow))) {
        setFlowSmoothingWindow(Number(savedFlowSmoothingWindow));
      }
      if (savedCoffeeDoseG && Number.isFinite(Number(savedCoffeeDoseG))) {
        setCoffeeDoseG(Math.max(0.1, Number(savedCoffeeDoseG)));
      }
      if (savedZoomLevel && Number.isFinite(Number(savedZoomLevel))) {
        setZoomLevel(Math.max(0.5, Number(savedZoomLevel)));
      }
      setShowImportedEc(parseStoredBoolean(savedShowImportedEc, true));
      setShowToggleW1CumPour(parseStoredBoolean(savedShowToggleW1CumPour, true));
      setShowToggleW1CumBrew(parseStoredBoolean(savedShowToggleW1CumBrew, true));
      setShowToggleW1PourRatio(parseStoredBoolean(savedShowToggleW1PourRatio, true));
      setShowToggleW1BrewRatio(parseStoredBoolean(savedShowToggleW1BrewRatio, true));
      setShowToggleW2PourFlow(parseStoredBoolean(savedShowToggleW2PourFlow, true));
      setShowToggleW2BrewFlow(parseStoredBoolean(savedShowToggleW2BrewFlow, true));
      setShowToggleW2Dripper(parseStoredBoolean(savedShowToggleW2Dripper, true));
      setShowToggleW2Temp(parseStoredBoolean(savedShowToggleW2Temp, true));
      setShowWindow2InWindow1(parseStoredBoolean(savedShowWindow2InWindow1, false));
      setShowWindow1InWindow2(parseStoredBoolean(savedShowWindow1InWindow2, false));
    } catch {
      // Ignore browser storage errors.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.rawJson, rawJson);
      localStorage.setItem(STORAGE_KEYS.ecRawJson, ecRawJson);
      localStorage.setItem(STORAGE_KEYS.mode, mode);
      localStorage.setItem(STORAGE_KEYS.threshold, String(threshold));
      localStorage.setItem(STORAGE_KEYS.minChange, String(minChange));
      localStorage.setItem(STORAGE_KEYS.minPour, String(minPour));
      localStorage.setItem(STORAGE_KEYS.noiseMinWaterAdded, String(noiseMinWaterAdded));
      localStorage.setItem(STORAGE_KEYS.flowNoiseFloor, String(flowNoiseFloor));
      localStorage.setItem(STORAGE_KEYS.flowSpikeThreshold, String(flowSpikeThreshold));
      localStorage.setItem(STORAGE_KEYS.flowMaxThreshold, String(flowMaxThreshold));
      localStorage.setItem(STORAGE_KEYS.flowDisplayMax, String(flowDisplayMax));
      localStorage.setItem(STORAGE_KEYS.flowSmoothingWindow, String(flowSmoothingWindow));
      localStorage.setItem(STORAGE_KEYS.coffeeDoseG, String(coffeeDoseG));
      localStorage.setItem(STORAGE_KEYS.showImportedEc, String(showImportedEc));
      localStorage.setItem(STORAGE_KEYS.zoomLevel, String(zoomLevel));
      localStorage.setItem(STORAGE_KEYS.showToggleW1CumPour, String(showToggleW1CumPour));
      localStorage.setItem(STORAGE_KEYS.showToggleW1CumBrew, String(showToggleW1CumBrew));
      localStorage.setItem(STORAGE_KEYS.showToggleW1PourRatio, String(showToggleW1PourRatio));
      localStorage.setItem(STORAGE_KEYS.showToggleW1BrewRatio, String(showToggleW1BrewRatio));
      localStorage.setItem(STORAGE_KEYS.showToggleW2PourFlow, String(showToggleW2PourFlow));
      localStorage.setItem(STORAGE_KEYS.showToggleW2BrewFlow, String(showToggleW2BrewFlow));
      localStorage.setItem(STORAGE_KEYS.showToggleW2Dripper, String(showToggleW2Dripper));
      localStorage.setItem(STORAGE_KEYS.showToggleW2Temp, String(showToggleW2Temp));
      localStorage.setItem(STORAGE_KEYS.showWindow2InWindow1, String(showWindow2InWindow1));
      localStorage.setItem(STORAGE_KEYS.showWindow1InWindow2, String(showWindow1InWindow2));
    } catch {
      // Ignore browser storage errors.
    }
  }, [
    rawJson,
    ecRawJson,
    mode,
    threshold,
    minChange,
    minPour,
    noiseMinWaterAdded,
    flowNoiseFloor,
    flowSpikeThreshold,
    flowMaxThreshold,
    flowDisplayMax,
    flowSmoothingWindow,
    coffeeDoseG,
    showImportedEc,
    zoomLevel,
    showToggleW1CumPour,
    showToggleW1CumBrew,
    showToggleW1PourRatio,
    showToggleW1BrewRatio,
    showToggleW2PourFlow,
    showToggleW2BrewFlow,
    showToggleW2Dripper,
    showToggleW2Temp,
    showWindow2InWindow1,
    showWindow1InWindow2,
  ]);

  const effectiveRecipeRows = useMemo(() => {
    if (!result) return [];
    return filterLegacyRowsByWaterAdded(result.recipeRows, noiseMinWaterAdded);
  }, [result, noiseMinWaterAdded]);

  const effectiveRows = useMemo(() => {
    if (!result) return [];
    if (result.modeUsed === 'legacy') {
      return filterLegacyRowsByWaterAdded(result.rows, noiseMinWaterAdded);
    }
    return result.rows;
  }, [result, noiseMinWaterAdded]);

  const csvText = useMemo(() => (effectiveRows.length ? rowsToCsv(effectiveRows) : ''), [effectiveRows]);

  const runParse = () => {
    if (!rawJson.trim()) {
      setError('Please choose a JSON file or paste JSON text first.');
      setResult(null);
      return;
    }

    try {
      const nextResult = parseUltrakokiJson(rawJson, mode, threshold, minChange, minPour);
      setError(null);
      setResult(nextResult);
      const nextDose = extractDoseFromMetadata(nextResult.metadataRows);
      if (nextDose) setCoffeeDoseG(nextDose);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : 'Failed to parse JSON data.';
      setError(message);
      setResult(null);
    }
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setRawJson(text);
    setFileName(file.name);
    setError(null);
  };

  const onEcFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setEcRawJson(text);
    setEcFileName(file.name);
    setEcImportError(null);
  };

  const importEcCurve = () => {
    const comparisonResult = buildComparisonCurve(ecRawJson);
    const curve = comparisonResult.curve;
    if (curve.length < 2) {
      setEcImportError('Could not find a valid EC curve. Provide JSON with point arrays or ec values.');
      setEcComparisonCurve([]);
      setEcCurveSource('none');
      return;
    }
    setEcImportError(null);
    setEcComparisonCurve(curve);
    setEcCurveSource(comparisonResult.source);
  };

  const clearEcCurve = () => {
    setEcRawJson('');
    setEcFileName('');
    setEcComparisonCurve([]);
    setEcCurveSource('none');
    setEcImportError(null);
  };

  const rows = effectiveRows;
  const headers = rows[0] ?? [];
  const dataRows = rows.slice(1);
  const previewRows = dataRows.slice(0, 30);

  const recipeRows = effectiveRecipeRows.slice(1);
  const legacyPours = useMemo(() => parseLegacyPours(effectiveRecipeRows), [effectiveRecipeRows]);
  const metadataRows = result?.metadataRows ?? [];
  const suggestedDose = useMemo(() => extractDoseFromMetadata(metadataRows), [metadataRows]);

  const filteredFlowSamples = useMemo(() => {
    const base = result?.flowSamples ?? [];
    if (!base.length) return [];

    const sanitized = sanitizeFlowSeries(
      base.map((sample) => sample.drip_flow_g_s),
      flowNoiseFloor,
      flowMaxThreshold,
      flowSpikeThreshold,
      flowSmoothingWindow,
    );

    return base.map((sample, index) => ({
      ...sample,
      drip_flow_g_s: sanitized[index] ?? 0,
    }));
  }, [result?.flowSamples, flowNoiseFloor, flowMaxThreshold, flowSpikeThreshold, flowSmoothingWindow]);

  const brewChartData = useMemo(() => {
    const brewingData = result?.brewingData;
    if (!brewingData) return null;

    const interval = brewingData.periodSeconds / Math.max(1, brewingData.cumulativePour.length - 1);
    const sampleCount = Math.max(
      brewingData.pourFlow.length,
      brewingData.cumulativePour.length,
      filteredFlowSamples.length,
      brewingData.temperature.length,
    );
    if (sampleCount < 2) return null;

    const times = Array.from({ length: sampleCount }, (_, index) => Number((index * interval).toFixed(2)));
    const rawPourFlow = Array.from({ length: sampleCount }, (_, index) => Number((brewingData.pourFlow[index] ?? 0).toFixed(3)));
    const pourFlow = sanitizeFlowSeries(rawPourFlow, flowNoiseFloor, flowMaxThreshold, flowSpikeThreshold, 1);
    const brewFlow = Array.from({ length: sampleCount }, (_, index) => {
      const smoothed = filteredFlowSamples[index]?.drip_flow_g_s;
      const fallback = brewingData.dripFlow[index] ?? 0;
      return Number((Number.isFinite(smoothed) ? smoothed : fallback).toFixed(3));
    });

    const cumulativePour = Array.from({ length: sampleCount }, (_, index) => {
      const direct = brewingData.cumulativePour[index];
      if (Number.isFinite(direct)) return Number(direct.toFixed(3));
      const prev = index > 0 ? (brewingData.cumulativePour[index - 1] ?? 0) : 0;
      return Number(prev.toFixed(3));
    });

    const cumulativeBrew: number[] = [];
    let running = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      running += (brewFlow[index] ?? 0) * interval;
      cumulativeBrew.push(Number(running.toFixed(3)));
    }

    const ratioBase = Math.max(0.1, coffeeDoseG || suggestedDose || 15);
    const pourRatio = cumulativePour.map((value) => Number((value / ratioBase).toFixed(3)));
    const brewRatio = cumulativeBrew.map((value) => Number((value / ratioBase).toFixed(3)));
    const temperature = Array.from({ length: sampleCount }, (_, index) => {
      const flowTemp = filteredFlowSamples[index]?.temperature_c;
      const fallback = brewingData.temperature[index];
      const value = Number.isFinite(flowTemp) ? flowTemp : Number.isFinite(fallback) ? fallback : null;
      return value == null ? null : Number(value.toFixed(2));
    });

    return { times, interval, pourFlow, brewFlow, cumulativePour, cumulativeBrew, pourRatio, brewRatio, temperature, ratioBase };
  }, [result?.brewingData, filteredFlowSamples, coffeeDoseG, suggestedDose, flowNoiseFloor, flowMaxThreshold, flowSpikeThreshold, flowDisplayMax]);

  const combinedBrewEcData = useMemo<UltrakokiBrewData | null>(() => {
    if (!brewChartData || !result?.brewingData) return null;

    const period = brewChartData.times[brewChartData.times.length - 1] ?? result.brewingData.periodSeconds;
    const dripFlow = brewChartData.times.map((_, index) => {
      const value = filteredFlowSamples[index]?.drip_flow_g_s ?? brewChartData.brewFlow[index] ?? 0;
      return Number(value.toFixed(3));
    });

    return {
      period,
      label: result.brewingData.label,
      intervalSeconds: brewChartData.interval,
      pourFlow: brewChartData.pourFlow,
      dripFlow,
      cumulativePour: brewChartData.cumulativePour,
    };
  }, [brewChartData, result?.brewingData, filteredFlowSamples]);

  const dripperFlowByPour = useMemo(() => {
    if (!legacyPours.length || !filteredFlowSamples.length) return [] as number[];

    return legacyPours.map((pour) => {
      const inWindow = filteredFlowSamples.filter(
        (sample) => sample.time_s >= pour.start_time_s && sample.time_s <= pour.end_time_s,
      );

      if (inWindow.length > 0) {
        const avg = inWindow.reduce((sum, sample) => sum + sample.drip_flow_g_s, 0) / inWindow.length;
        return Number(avg.toFixed(3));
      }

      // Fall back to closest sample around pour end time.
      const closest = filteredFlowSamples.reduce((best, sample) => {
        if (!best) return sample;
        return Math.abs(sample.time_s - pour.end_time_s) < Math.abs(best.time_s - pour.end_time_s) ? sample : best;
      }, filteredFlowSamples[0]);

      return Number((closest?.drip_flow_g_s ?? 0).toFixed(3));
    });
  }, [legacyPours, filteredFlowSamples]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h2 className="text-2xl font-bold text-slate-900">Ultrakoki JSON Parser</h2>
        <p className="text-sm text-slate-600 mt-1">
          Load Ultrakoki JSON and preview pouring recipe data before exporting CSV.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">Load JSON file</label>
            <input
              type="file"
              accept="application/json,.json,text/plain"
              onChange={onFileChange}
              className="block w-full text-sm text-slate-700 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white hover:file:bg-slate-800"
            />
            {fileName && <p className="text-xs text-slate-500">Loaded: {fileName}</p>}

            <label className="block text-sm font-semibold text-slate-700">Or paste JSON</label>
            <textarea
              value={rawJson}
              onChange={(event) => setRawJson(event.target.value)}
              placeholder="Paste Ultrakoki JSON..."
              className="w-full h-56 p-3 rounded-lg border border-slate-300 font-mono text-xs"
            />

            <div className="pt-2 border-t border-slate-200">
              <label className="block text-sm font-semibold text-slate-700">Optional EC chart JSON (for overlay)</label>
              <input
                type="file"
                accept="application/json,.json,text/plain"
                onChange={onEcFileChange}
                className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-amber-600 file:text-white hover:file:bg-amber-700"
              />
              {ecFileName && <p className="text-xs text-slate-500 mt-1">Loaded EC file: {ecFileName}</p>}

              <textarea
                value={ecRawJson}
                onChange={(event) => setEcRawJson(event.target.value)}
                placeholder="Paste digitized EC JSON here (optional)..."
                className="mt-2 w-full h-28 p-3 rounded-lg border border-slate-300 font-mono text-xs"
              />

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={importEcCurve}
                  className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                >
                  Import EC Overlay
                </button>
                <button
                  onClick={clearEcCurve}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
                >
                  Clear EC Overlay
                </button>
                <span className="text-xs text-slate-600 self-center">Points: {ecComparisonCurve.length}</span>
              </div>

              {ecImportError && (
                <div className="mt-2 rounded-lg border border-rose-300 bg-rose-50 text-rose-700 text-xs px-3 py-2">
                  {ecImportError}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Mode</label>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as ParseMode)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="legacy">legacy (pour recipe)</option>
                <option value="phases">phases</option>
                <option value="samples">samples</option>
                <option value="points">points</option>
                <option value="auto">auto</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Threshold</label>
                <input
                  type="number"
                  step="0.01"
                  value={threshold}
                  onChange={(event) => setThreshold(Number(event.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Min Change</label>
                <input
                  type="number"
                  step="0.1"
                  value={minChange}
                  onChange={(event) => setMinChange(Number(event.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Min Pour</label>
                <input
                  type="number"
                  step="0.1"
                  value={minPour}
                  onChange={(event) => setMinPour(Number(event.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Noise Tolerance: Min Water Added (g)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={noiseMinWaterAdded}
                onChange={(event) => setNoiseMinWaterAdded(Math.max(0, Number(event.target.value) || 0))}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              />
              <p className="text-[11px] text-slate-500 mt-1">Filters tiny pour events from recipe/graph. Set 0 to disable filtering.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Flow Noise Floor (g/s)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={flowNoiseFloor}
                  onChange={(event) => setFlowNoiseFloor(Math.max(0, Number(event.target.value) || 0))}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Flow Spike Threshold (g/s)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={flowSpikeThreshold}
                  onChange={(event) => setFlowSpikeThreshold(Math.max(0, Number(event.target.value) || 0))}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
                <p className="text-[11px] text-slate-500 mt-1">Drops one-sample spikes caused when the dripper is removed.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Flow Max Threshold (g/s)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={flowMaxThreshold}
                  onChange={(event) => setFlowMaxThreshold(Math.max(0, Number(event.target.value) || 0))}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
                <p className="text-[11px] text-slate-500 mt-1">Any flow above this is treated as absurd and removed before smoothing.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Flow Graph Ceiling (g/s)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={flowDisplayMax}
                  onChange={(event) => setFlowDisplayMax(Math.max(0, Number(event.target.value) || 0))}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
                <p className="text-[11px] text-slate-500 mt-1">Set flow chart max. Use 0 for auto scaling (robust 92nd percentile so normal flow stays visible).</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Flow Smoothing Window</label>
                <select
                  value={flowSmoothingWindow}
                  onChange={(event) => setFlowSmoothingWindow(Number(event.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                >
                  <option value={1}>1 (raw)</option>
                  <option value={3}>3 (light)</option>
                  <option value={5}>5 (medium)</option>
                  <option value={7}>7 (strong)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={runParse}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
              >
                Parse JSON
              </button>
              <button
                onClick={() => result && downloadCsv(csvText, `ultrakoki_${result.modeUsed}.csv`)}
                disabled={!result}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Export CSV
              </button>
            </div>

            {result && (
              <div className="rounded-lg bg-slate-100 border border-slate-200 p-3 text-xs text-slate-700 space-y-1">
                <p><span className="font-semibold">Detected:</span> {result.detectedSource}</p>
                <p><span className="font-semibold">Mode used:</span> {result.modeUsed}</p>
                <p><span className="font-semibold">Rows:</span> {Math.max(0, rows.length - 1)}</p>
                {result.modeUsed === 'legacy' && (
                  <p><span className="font-semibold">Noise filtered:</span> {Math.max(0, (result.rows.length - 1) - (rows.length - 1))} rows removed</p>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 text-rose-700 text-sm px-3 py-2">
            {error}
          </div>
        )}
      </section>

      {recipeRows.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <h3 className="text-lg font-bold text-slate-900">Pouring Recipe Preview</h3>
          <p className="text-sm text-slate-600">Derived from legacy pour detection for quick brewing review.</p>

          {brewChartData && (
            <div className="mt-4 rounded-xl border border-slate-200 p-3 bg-slate-50 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-slate-700">Coffee Dose (g) for ratio:</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={coffeeDoseG}
                  onChange={(event) => setCoffeeDoseG(Math.max(0.1, Number(event.target.value) || 0.1))}
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
                {suggestedDose && (
                  <button
                    onClick={() => setCoffeeDoseG(suggestedDose)}
                    className="px-2 py-1 rounded-md border border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Use parsed dose ({suggestedDose}g)
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-4 border-t border-slate-300 pt-3">
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">Zoom</div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
                      className="px-2 py-1 rounded-md border border-slate-300 bg-white text-sm font-semibold hover:bg-slate-100"
                    >
                      −
                    </button>
                    <span className="px-3 py-1 rounded-md border border-slate-300 bg-white text-xs text-slate-700 min-w-[50px] text-center">
                      {(zoomLevel * 100).toFixed(0)}%
                    </span>
                    <button
                      onClick={() => setZoomLevel(zoomLevel + 0.25)}
                      className="px-2 py-1 rounded-md border border-slate-300 bg-white text-sm font-semibold hover:bg-slate-100"
                    >
                      +
                    </button>
                    <button
                      onClick={() => setZoomLevel(1)}
                      className="px-2 py-1 rounded-md border border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-100"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">Window 1 Series</div>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showToggleW1CumPour}
                        onChange={(e) => setShowToggleW1CumPour(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-slate-700">Cumulative Pour</span>
                    </label>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showToggleW1CumBrew}
                        onChange={(e) => setShowToggleW1CumBrew(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-slate-700">Cumulative Brew</span>
                    </label>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showToggleW1PourRatio}
                        onChange={(e) => setShowToggleW1PourRatio(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-slate-700">Pour Ratio</span>
                    </label>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showToggleW1BrewRatio}
                        onChange={(e) => setShowToggleW1BrewRatio(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-slate-700">Brew Ratio</span>
                    </label>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">Window 2 Series</div>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showToggleW2PourFlow}
                        onChange={(e) => setShowToggleW2PourFlow(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-slate-700">Pour Flow</span>
                    </label>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showToggleW2BrewFlow}
                        onChange={(e) => setShowToggleW2BrewFlow(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-slate-700">Brew Flow</span>
                    </label>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showToggleW2Dripper}
                        onChange={(e) => setShowToggleW2Dripper(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-slate-700">Dripper Flow</span>
                    </label>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showToggleW2Temp}
                        onChange={(e) => setShowToggleW2Temp(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-slate-700">Temperature</span>
                    </label>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">Cross-Window Overlay</div>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showWindow2InWindow1}
                        onChange={(e) => setShowWindow2InWindow1(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-slate-700">Show Window 2 data in Window 1</span>
                    </label>
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showWindow1InWindow2}
                        onChange={(e) => setShowWindow1InWindow2(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-slate-700">Show Window 1 data in Window 2</span>
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-1">Combined Brew Graph</h4>
                <p className="text-xs text-slate-500 mb-2">Single graph with a shared timestamp, crosshair, and zoom. Top band shows cumulative and ratio. Bottom band shows flow and temperature.</p>
                <div className="overflow-x-auto">
                  {(() => {
                    const svgWidth = Math.round(980 * zoomLevel);
                    return (
                      <svg
                        viewBox={`0 0 ${svgWidth} 420`}
                        className="h-auto cursor-crosshair"
                        style={{ width: `${svgWidth}px`, minWidth: `${Math.max(760, svgWidth)}px` }}
                        onMouseMove={(e) => {
                          const svg = e.currentTarget;
                          const rect = svg.getBoundingClientRect();
                          const x = ((e.clientX - rect.left) / rect.width) * svgWidth;
                          setChartMouseX(x);
                        }}
                        onMouseLeave={() => setChartMouseX(null)}
                      >
                        <rect x="0" y="0" width={svgWidth} height="420" rx="10" fill="#f8fafc" />
                        {(() => {
                          const pad = { left: 64, right: 78, top: 22, bottom: 42 };
                          const plotW = svgWidth - pad.left - pad.right;
                          const topPlot = { y: pad.top, h: 148 };
                          const gap = 34;
                          const bottomPlot = { y: topPlot.y + topPlot.h + gap, h: 148 };
                          const n = brewChartData.times.length;
                          const domainCount = Math.max(1, n - 1);
                          const weightMax = Math.max(1, ...brewChartData.cumulativePour, ...brewChartData.cumulativeBrew);
                          const ratioMax = Math.max(1, ...brewChartData.pourRatio, ...brewChartData.brewRatio);
                          const positiveFlowValues = [
                            ...brewChartData.pourFlow,
                            ...brewChartData.brewFlow,
                            ...filteredFlowSamples.map((sample) => sample.drip_flow_g_s),
                          ].filter((value) => Number.isFinite(value) && value > 0);
                          const flowMax = positiveFlowValues.length ? Math.max(...positiveFlowValues) : 1;
                          const flowP92 = percentileValue(positiveFlowValues, 0.92);
                          const robustAutoCeiling = Math.max(0.35, flowP92 * 1.2);
                          const flowVisualMax = flowDisplayMax > 0 ? flowDisplayMax : Math.min(flowMax, robustAutoCeiling);
                          const tempValues = brewChartData.temperature.filter((value): value is number => value != null && Number.isFinite(value));
                          const tempMin = tempValues.length ? Math.min(...tempValues) : 0;
                          const tempMax = tempValues.length ? Math.max(...tempValues) : 1;
                          const topCumBand = { minY: topPlot.y + 4, maxY: topPlot.y + topPlot.h * 0.56 };
                          const topRatioBand = { minY: topPlot.y + topPlot.h * 0.46, maxY: topPlot.y + topPlot.h - 4 };
                          const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
                          const toX = (index: number) => pad.left + (index / domainCount) * plotW;
                          const fromX = (x: number) => {
                            const normalized = (x - pad.left) / plotW;
                            return Math.max(0, Math.min(domainCount, normalized * domainCount));
                          };
                          const toTopLeftY = (value: number) => {
                            const t = clamp01(value / weightMax);
                            return topCumBand.maxY - t * (topCumBand.maxY - topCumBand.minY);
                          };
                          const toTopRightY = (value: number) => {
                            const t = clamp01(value / ratioMax);
                            return topRatioBand.maxY - t * (topRatioBand.maxY - topRatioBand.minY);
                          };
                          const toBottomRightY = (value: number) => {
                            const boosted = Math.pow(clamp01(value / flowVisualMax), 0.7);
                            return bottomPlot.y + bottomPlot.h - boosted * bottomPlot.h;
                          };
                          const toBottomLeftY = (value: number) => {
                            const denominator = Math.max(0.1, tempMax - tempMin);
                            return bottomPlot.y + bottomPlot.h - ((value - tempMin) / denominator) * bottomPlot.h;
                          };
                          const toTopFlowY = (value: number) => {
                            const boosted = Math.pow(clamp01(value / flowVisualMax), 0.7);
                            return topRatioBand.maxY - boosted * (topRatioBand.maxY - topRatioBand.minY);
                          };
                          const toTopTempY = (value: number) => {
                            const denominator = Math.max(0.1, tempMax - tempMin);
                            const normalized = clamp01((value - tempMin) / denominator);
                            return topRatioBand.maxY - normalized * (topRatioBand.maxY - topRatioBand.minY);
                          };
                          const toBottomWeightY = (value: number) => {
                            const boosted = Math.pow(clamp01(value / weightMax), 0.7);
                            return bottomPlot.y + bottomPlot.h - boosted * bottomPlot.h;
                          };
                          const toBottomRatioY = (value: number) => {
                            const boosted = Math.pow(clamp01(value / ratioMax), 0.8);
                            return bottomPlot.y + bottomPlot.h - boosted * bottomPlot.h;
                          };

                          const pointsCumPour = brewChartData.cumulativePour.map((value, index) => ({ x: toX(index), y: toTopLeftY(value) }));
                          const pointsCumBrew = brewChartData.cumulativeBrew.map((value, index) => ({ x: toX(index), y: toTopLeftY(value) }));
                          const pointsPourRatio = brewChartData.pourRatio.map((value, index) => ({ x: toX(index), y: toTopRightY(value) }));
                          const pointsBrewRatio = brewChartData.brewRatio.map((value, index) => ({ x: toX(index), y: toTopRightY(value) }));
                          const pointsPourFlow = brewChartData.pourFlow.map((value, index) => ({ x: toX(index), y: toBottomRightY(value) }));
                          const pointsBrewFlow = brewChartData.brewFlow.map((value, index) => ({ x: toX(index), y: toBottomRightY(value) }));
                          const pointsDripper = filteredFlowSamples.map((sample, index) => ({ x: toX(index), y: toBottomRightY(sample.drip_flow_g_s) }));
                          const pointsTemp = brewChartData.temperature
                            .map((value, index) => (value == null ? null : { x: toX(index), y: toBottomLeftY(value) }))
                            .filter((point): point is { x: number; y: number } => point !== null);
                          const pointsTopPourFlow = brewChartData.pourFlow.map((value, index) => ({ x: toX(index), y: toTopFlowY(value) }));
                          const pointsTopBrewFlow = brewChartData.brewFlow.map((value, index) => ({ x: toX(index), y: toTopFlowY(value) }));
                          const pointsTopDripper = filteredFlowSamples.map((sample, index) => ({ x: toX(index), y: toTopFlowY(sample.drip_flow_g_s) }));
                          const pointsTopTemp = brewChartData.temperature
                            .map((value, index) => (value == null ? null : { x: toX(index), y: toTopTempY(value) }))
                            .filter((point): point is { x: number; y: number } => point !== null);
                          const pointsBottomCumPour = brewChartData.cumulativePour.map((value, index) => ({ x: toX(index), y: toBottomWeightY(value) }));
                          const pointsBottomCumBrew = brewChartData.cumulativeBrew.map((value, index) => ({ x: toX(index), y: toBottomWeightY(value) }));
                          const pointsBottomPourRatio = brewChartData.pourRatio.map((value, index) => ({ x: toX(index), y: toBottomRatioY(value) }));
                          const pointsBottomBrewRatio = brewChartData.brewRatio.map((value, index) => ({ x: toX(index), y: toBottomRatioY(value) }));
                          const sortedImportedEcCurve = [...ecComparisonCurve]
                            .filter(point => Number.isFinite(point.time) && Number.isFinite(point.ecValue))
                            .sort((a, b) => a.time - b.time);
                          const makeArea = (points: Array<{ x: number; y: number }>, baselineY: number) => points.length
                            ? `${buildLinePath(points)} L ${points[points.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)} L ${points[0].x.toFixed(2)} ${baselineY.toFixed(2)} Z`
                            : '';
                          const interpValue = (arr: number[], position: number) => {
                            const baseIndex = Math.floor(position);
                            const nextIndex = Math.min(baseIndex + 1, n - 1);
                            const fraction = position - baseIndex;
                            const first = arr[baseIndex] ?? 0;
                            const second = arr[nextIndex] ?? 0;
                            return first * (1 - fraction) + second * fraction;
                          };
                          const interpolateImportedEcAtTime = (timeSeconds: number): number | null => {
                            if (sortedImportedEcCurve.length === 0) return null;
                            if (timeSeconds <= sortedImportedEcCurve[0].time) return sortedImportedEcCurve[0].ecValue;

                            const lastPoint = sortedImportedEcCurve[sortedImportedEcCurve.length - 1];
                            if (timeSeconds >= lastPoint.time) return lastPoint.ecValue;

                            for (let i = 1; i < sortedImportedEcCurve.length; i += 1) {
                              const left = sortedImportedEcCurve[i - 1];
                              const right = sortedImportedEcCurve[i];
                              if (timeSeconds <= right.time) {
                                const span = right.time - left.time;
                                if (span <= 0) return right.ecValue;
                                const ratio = (timeSeconds - left.time) / span;
                                return left.ecValue + (right.ecValue - left.ecValue) * ratio;
                              }
                            }

                            return lastPoint.ecValue;
                          };

                          const crosshairActive = chartMouseX !== null && chartMouseX >= pad.left && chartMouseX <= pad.left + plotW;
                          const hoverIndex = crosshairActive ? fromX(chartMouseX) : null;
                          const hoverTime = hoverIndex == null ? null : interpValue(brewChartData.times, hoverIndex);
                          const hoverTemp = hoverIndex == null
                            ? null
                            : interpValue(brewChartData.temperature.map((value) => (value == null ? tempMin : value)), hoverIndex);
                          const hoverImportedEc = hoverTime == null || !showImportedEc
                            ? null
                            : interpolateImportedEcAtTime(hoverTime);
                          const hoverEcSourceLabel = ecCurveSource === 'main-profile'
                            ? 'Main App profile'
                            : 'Imported EC JSON';
                          const tooltipX = crosshairActive && chartMouseX != null
                            ? Math.min(Math.max(pad.left + 8, chartMouseX + 10), pad.left + plotW - 172)
                            : 0;

                          return (
                            <>
                              {[0, 1, 2, 3, 4, 5].map((tick) => {
                                const topY = topPlot.y + (tick / 5) * topPlot.h;
                                const bottomY = bottomPlot.y + (tick / 5) * bottomPlot.h;
                                return (
                                  <g key={`combined-grid-${tick}`}>
                                    <line x1={pad.left} y1={topY} x2={pad.left + plotW} y2={topY} stroke="#e2e8f0" />
                                    <line x1={pad.left} y1={bottomY} x2={pad.left + plotW} y2={bottomY} stroke="#e2e8f0" />
                                  </g>
                                );
                              })}

                              <rect x={pad.left} y={topPlot.y} width={plotW} height={topPlot.h} fill="none" stroke="#cbd5e1" />
                              <rect x={pad.left} y={bottomPlot.y} width={plotW} height={bottomPlot.h} fill="none" stroke="#cbd5e1" />

                              {showToggleW1BrewRatio && <path d={makeArea(pointsBrewRatio, topRatioBand.maxY)} fill="#22c55e" fillOpacity={0.14} />}
                              {showToggleW1PourRatio && <path d={makeArea(pointsPourRatio, topRatioBand.maxY)} fill="#10b981" fillOpacity={0.18} />}
                              {showToggleW2PourFlow && <path d={makeArea(pointsPourFlow, bottomPlot.y + bottomPlot.h)} fill="#60a5fa" fillOpacity={0.2} />}
                              {showToggleW2BrewFlow && <path d={makeArea(pointsBrewFlow, bottomPlot.y + bottomPlot.h)} fill="#34d399" fillOpacity={0.2} />}

                              {showToggleW1CumPour && <path d={buildStepPath(pointsCumPour)} fill="none" stroke="#2563eb" strokeWidth={2.2} />}
                              {showToggleW1CumBrew && <path d={buildStepPath(pointsCumBrew)} fill="none" stroke="#0f766e" strokeWidth={2.2} />}
                              {showToggleW1PourRatio && <path d={buildLinePath(pointsPourRatio)} fill="none" stroke="#10b981" strokeWidth={2} />}
                              {showToggleW1BrewRatio && <path d={buildLinePath(pointsBrewRatio)} fill="none" stroke="#22c55e" strokeWidth={2} />}
                              {showToggleW2PourFlow && <path d={buildLinePath(pointsPourFlow)} fill="none" stroke="#2563eb" strokeWidth={2} />}
                              {showToggleW2BrewFlow && <path d={buildLinePath(pointsBrewFlow)} fill="none" stroke="#059669" strokeWidth={2} />}
                              {showToggleW2Dripper && <path d={buildLinePath(pointsDripper)} fill="none" stroke="#16a34a" strokeWidth={2} strokeDasharray="6 4" />}
                              {showToggleW2Temp && pointsTemp.length > 1 && <path d={buildLinePath(pointsTemp)} fill="none" stroke="#ef4444" strokeWidth={1.8} />}

                              {showWindow2InWindow1 && showToggleW2PourFlow && <path d={buildLinePath(pointsTopPourFlow)} fill="none" stroke="#2563eb" strokeWidth={1.5} strokeOpacity={0.5} strokeDasharray="4 3" />}
                              {showWindow2InWindow1 && showToggleW2BrewFlow && <path d={buildLinePath(pointsTopBrewFlow)} fill="none" stroke="#059669" strokeWidth={1.5} strokeOpacity={0.5} strokeDasharray="4 3" />}
                              {showWindow2InWindow1 && showToggleW2Dripper && <path d={buildLinePath(pointsTopDripper)} fill="none" stroke="#16a34a" strokeWidth={1.5} strokeOpacity={0.5} strokeDasharray="2 3" />}
                              {showWindow2InWindow1 && showToggleW2Temp && pointsTopTemp.length > 1 && <path d={buildLinePath(pointsTopTemp)} fill="none" stroke="#ef4444" strokeWidth={1.4} strokeOpacity={0.5} strokeDasharray="2 2" />}

                              {showWindow1InWindow2 && showToggleW1CumPour && <path d={buildLinePath(pointsBottomCumPour)} fill="none" stroke="#2563eb" strokeWidth={1.5} strokeOpacity={0.5} strokeDasharray="5 3" />}
                              {showWindow1InWindow2 && showToggleW1CumBrew && <path d={buildLinePath(pointsBottomCumBrew)} fill="none" stroke="#0f766e" strokeWidth={1.5} strokeOpacity={0.5} strokeDasharray="5 3" />}
                              {showWindow1InWindow2 && showToggleW1PourRatio && <path d={buildLinePath(pointsBottomPourRatio)} fill="none" stroke="#10b981" strokeWidth={1.4} strokeOpacity={0.45} strokeDasharray="2 3" />}
                              {showWindow1InWindow2 && showToggleW1BrewRatio && <path d={buildLinePath(pointsBottomBrewRatio)} fill="none" stroke="#22c55e" strokeWidth={1.4} strokeOpacity={0.45} strokeDasharray="2 3" />}

                              {crosshairActive && hoverIndex != null && hoverTime != null && chartMouseX != null && (
                                <>
                                  <line x1={chartMouseX} y1={topPlot.y} x2={chartMouseX} y2={bottomPlot.y + bottomPlot.h} stroke="#ef4444" strokeWidth={1} strokeDasharray="3 3" />
                                  <rect x={tooltipX} y={topPlot.y + 6} width="172" height={hoverImportedEc === null ? 118 : 146} fill="#fff" stroke="#ef4444" rx="4" />
                                  <text x={tooltipX + 8} y={topPlot.y + 22} fontSize="11" fill="#334155" fontWeight="bold">t: {hoverTime.toFixed(1)}s</text>
                                  <text x={tooltipX + 8} y={topPlot.y + 37} fontSize="10" fill="#2563eb">Pour: {interpValue(brewChartData.cumulativePour, hoverIndex).toFixed(2)}g</text>
                                  <text x={tooltipX + 8} y={topPlot.y + 51} fontSize="10" fill="#0f766e">Brew: {interpValue(brewChartData.cumulativeBrew, hoverIndex).toFixed(2)}g</text>
                                  <text x={tooltipX + 8} y={topPlot.y + 65} fontSize="10" fill="#10b981">Pour ratio: {interpValue(brewChartData.pourRatio, hoverIndex).toFixed(2)}x</text>
                                  <text x={tooltipX + 8} y={topPlot.y + 79} fontSize="10" fill="#22c55e">Brew ratio: {interpValue(brewChartData.brewRatio, hoverIndex).toFixed(2)}x</text>
                                  <text x={tooltipX + 8} y={topPlot.y + 93} fontSize="10" fill="#059669">Brew flow: {interpValue(brewChartData.brewFlow, hoverIndex).toFixed(2)}g/s</text>
                                  <text x={tooltipX + 8} y={topPlot.y + 107} fontSize="10" fill="#ef4444">Temp: {(hoverTemp ?? tempMin).toFixed(1)}°C</text>
                                  {hoverImportedEc !== null && (
                                    <>
                                      <text x={tooltipX + 8} y={topPlot.y + 121} fontSize="10" fill="#111827">EC: {hoverImportedEc.toFixed(2)} mS/cm</text>
                                      <text x={tooltipX + 8} y={topPlot.y + 135} fontSize="9" fill="#64748b">Source: {hoverEcSourceLabel}</text>
                                    </>
                                  )}
                                </>
                              )}

                              {Array.from({ length: 7 }, (_, tick) => {
                                const x = pad.left + (tick / 6) * plotW;
                                const labelTime = brewChartData.times[Math.round((tick / 6) * domainCount)] ?? 0;
                                return (
                                  <g key={`time-tick-${tick}`}>
                                    <line x1={x} y1={bottomPlot.y + bottomPlot.h} x2={x} y2={bottomPlot.y + bottomPlot.h + 6} stroke="#94a3b8" />
                                    <text x={x} y={bottomPlot.y + bottomPlot.h + 20} textAnchor="middle" fontSize="10" fill="#475569">{labelTime.toFixed(0)}s</text>
                                  </g>
                                );
                              })}

                              <text x={pad.left - 8} y={topPlot.y + 10} textAnchor="end" fontSize="10" fill="#334155">{weightMax.toFixed(1)} g</text>
                              <text x={pad.left - 8} y={topPlot.y + topPlot.h} textAnchor="end" fontSize="10" fill="#334155">0</text>
                              <text x={pad.left + plotW + 8} y={topPlot.y + 10} textAnchor="start" fontSize="10" fill="#047857">{ratioMax.toFixed(2)}x</text>
                              <text x={pad.left + plotW + 8} y={topPlot.y + topPlot.h} textAnchor="start" fontSize="10" fill="#047857">0</text>

                              <text x={pad.left - 8} y={bottomPlot.y + 10} textAnchor="end" fontSize="10" fill="#ef4444">{tempMax.toFixed(1)}C</text>
                              <text x={pad.left - 8} y={bottomPlot.y + bottomPlot.h} textAnchor="end" fontSize="10" fill="#ef4444">{tempMin.toFixed(1)}C</text>
                              <text x={pad.left + plotW + 8} y={bottomPlot.y + 10} textAnchor="start" fontSize="10" fill="#0369a1">{flowVisualMax.toFixed(2)} g/s</text>
                              <text x={pad.left + plotW + 8} y={bottomPlot.y + bottomPlot.h} textAnchor="start" fontSize="10" fill="#0369a1">0</text>

                              <text x={pad.left} y={topPlot.y - 6} fontSize="10" fill="#64748b">Top: cumulative + ratio</text>
                              <text x={pad.left} y={bottomPlot.y - 6} fontSize="10" fill="#64748b">Bottom: flow + temperature</text>
                            </>
                          );
                        })()}
                      </svg>
                    );
                  })()}
                </div>
              </div>

              {combinedBrewEcData && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">Experimental Combined Brew + EC Chart</h4>
                      <p className="text-xs text-slate-500">Uses imported EC curve on top of parser brew data. This is the first integration pass.</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showImportedEc}
                        onChange={(event) => setShowImportedEc(event.target.checked)}
                        className="w-4 h-4"
                      />
                      Show imported EC overlay
                    </label>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <UltrakokiGraph
                      data={combinedBrewEcData}
                      comparisonCurve={showImportedEc ? ecComparisonCurve : []}
                      comparisonLabel="Imported EC chart"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {recipeRows.map((row, index) => (
              <div key={index} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <div className="text-xs text-slate-500">Pour #{row[0]}</div>
                <div className="text-sm font-semibold text-slate-900">{row[1]}</div>
                <div className="text-xs text-slate-700 mt-1">{row[2]}s to {row[3]}s ({row[4]}s)</div>
                <div className="text-sm text-emerald-700 font-semibold mt-1">+{row[5]} g</div>
                <div className="text-xs text-slate-600">Cumulative: {row[6]} g</div>
                <div className="text-xs text-slate-600">Rate: {row[7]} g/s</div>
                {dripperFlowByPour[index] !== undefined && (
                  <div className="text-xs text-emerald-700">Current dripper flow: {dripperFlowByPour[index].toFixed(2)} g/s</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {metadataRows.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <h3 className="text-lg font-bold text-slate-900">Brew Metadata</h3>
          <p className="text-sm text-slate-600">Parsed bean, dripper, and recipe text fields from JSON/text.</p>

          <div className="overflow-auto mt-3 border border-slate-200 rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-3 py-2 border-b border-slate-200 text-slate-700 font-semibold">Field</th>
                  <th className="text-left px-3 py-2 border-b border-slate-200 text-slate-700 font-semibold">Value</th>
                  <th className="text-left px-3 py-2 border-b border-slate-200 text-slate-700 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody>
                {metadataRows.map((row, index) => (
                  <tr key={`${row.key}-${index}`} className="odd:bg-white even:bg-slate-50">
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-700 font-semibold whitespace-nowrap">{row.key}</td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-700">{row.value}</td>
                    <td className="px-3 py-2 border-b border-slate-100 text-slate-500 uppercase">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result && (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <h3 className="text-lg font-bold text-slate-900">Data Table Preview</h3>
          <p className="text-sm text-slate-600">Showing first {previewRows.length} rows.</p>

          <div className="overflow-auto mt-3 border border-slate-200 rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100">
                <tr>
                  {headers.map((header, index) => (
                    <th key={index} className="text-left px-3 py-2 border-b border-slate-200 text-slate-700 font-semibold whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="odd:bg-white even:bg-slate-50">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-3 py-2 border-b border-slate-100 whitespace-nowrap text-slate-700">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
});

UltrakokiParserPage.displayName = 'UltrakokiParserPage';
