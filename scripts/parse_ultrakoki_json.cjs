#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    mode: 'auto',
    threshold: 0.01,
    minDetectableChange: 0.5,
    minTotalPour: 1.0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!args.input && !value.startsWith('--')) {
      args.input = value;
      continue;
    }

    if (value === '--output' || value === '-o') {
      args.output = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (value === '--mode') {
      args.mode = (argv[index + 1] || 'phases').toLowerCase();
      index += 1;
      continue;
    }

    if (value === '--threshold') {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed)) {
        args.threshold = parsed;
      }
      index += 1;
      continue;
    }

    if (value === '--min-change') {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed)) {
        args.minDetectableChange = parsed;
      }
      index += 1;
      continue;
    }

    if (value === '--min-pour') {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed)) {
        args.minTotalPour = parsed;
      }
      index += 1;
    }
  }

  return args;
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .trim();
  return JSON.parse(raw);
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPointLike(value) {
  return isObject(value) && (
    Object.prototype.hasOwnProperty.call(value, 'ecValue') ||
    Object.prototype.hasOwnProperty.call(value, 'ec') ||
    Object.prototype.hasOwnProperty.call(value, 'value')
  );
}

function toNumberArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const num = typeof item === 'number' ? item : Number(item);
      return Number.isFinite(num) ? num : null;
    })
    .filter((item) => item !== null);
}

function findPointArray(root) {
  const candidates = [];
  if (Array.isArray(root)) candidates.push(root);
  if (isObject(root)) {
    candidates.push(root.points, root.dataPoints, root.curve, root.series);
    const nested = [root.json, root.data, root.payload, root.body, root.result]
      .filter((item) => Array.isArray(item) || isObject(item));
    candidates.push(...nested);
  }

  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length < 2) continue;
    const points = candidate
      .map((item, index) => {
        if (!isPointLike(item)) return null;
        const timeMs = Number(item.timeMs);
        const time = Number(item.time);
        const ecValue = Number(item.ecValue ?? item.ec ?? item.value);
        const temperature = Number(item.temperature);

        if (!Number.isFinite(ecValue)) return null;

        return {
          sample_index: index,
          time_s: Number.isFinite(timeMs) ? Number((timeMs / 1000).toFixed(3)) : Number.isFinite(time) ? Number(time.toFixed(3)) : index,
          ec_value: Number(ecValue.toFixed(3)),
          temperature: Number.isFinite(temperature) ? Number(temperature.toFixed(3)) : '',
        };
      })
      .filter(Boolean);

    if (points.length >= 2) {
      return { kind: 'points', points };
    }
  }

  return null;
}

function findBrewingLog(root) {
  const candidates = [];
  if (isObject(root)) candidates.push(root);

  for (const candidate of candidates) {
    const nested = [candidate.json, candidate.data, candidate.payload, candidate.body, candidate.result]
      .filter(isObject);
    candidates.push(...nested);
  }

  for (const candidate of candidates) {
    const brewingLog = isObject(candidate.brewingLog)
      ? candidate.brewingLog
      : isObject(candidate.brewLog)
        ? candidate.brewLog
        : candidate;

    const pourFlow = toNumberArray(brewingLog.size || brewingLog.pourFlow || brewingLog.flow);
    const dripFlow = toNumberArray(brewingLog.bsize || brewingLog.dripFlow || brewingLog.outflow);
    const cumulativePour = toNumberArray(
      brewingLog.total ||
      brewingLog.adc1 ||
      brewingLog.cumulativePour ||
      brewingLog.cumulative
    );

    const sampleCount = Math.max(pourFlow.length, dripFlow.length, cumulativePour.length);
    if (sampleCount > 1) {
      const rawDuration = Number(brewingLog.period || candidate.period || brewingLog.totalDuration || candidate.totalDuration);
      const duration = Number.isFinite(rawDuration) && rawDuration > 10000 ? rawDuration / 1000 : rawDuration;
      return {
        periodSeconds: Number.isFinite(duration) && duration > 0 ? duration : sampleCount - 1,
        pourFlow: pourFlow.length ? pourFlow : Array(sampleCount).fill(0),
        dripFlow: dripFlow.length ? dripFlow : Array(sampleCount).fill(0),
        cumulativePour: cumulativePour.length ? cumulativePour : Array(sampleCount).fill(0),
        label: typeof candidate.cupFactory === 'string' || typeof candidate.cupModel === 'string'
          ? [candidate.cupFactory, candidate.cupModel].filter(Boolean).join(' / ')
          : 'Ultrakoki brew log',
      };
    }
  }

  return null;
}

function toCsvValue(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows) {
  return rows.map((row) => row.map(toCsvValue).join(',')).join('\n');
}

function sum(values, startIndex, endIndex, intervalSeconds) {
  let total = 0;
  for (let index = startIndex; index <= endIndex; index += 1) {
    total += (values[index] || 0) * intervalSeconds;
  }
  return total;
}

function detectPhases(pourFlow, threshold) {
  const phases = [];
  let start = null;

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

function buildSampleRows(data) {
  const intervalSeconds = data.periodSeconds / Math.max(1, data.pourFlow.length - 1);
  const maxLength = Math.max(data.pourFlow.length, data.dripFlow.length, data.cumulativePour.length);
  const rows = [[
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

function buildPointRows(points) {
  const rows = [[
    'sample_index',
    'time_s',
    'ec_value',
    'temperature',
  ]];

  for (const point of points) {
    rows.push([
      point.sample_index,
      point.time_s,
      point.ec_value,
      point.temperature,
    ]);
  }

  return rows;
}

function buildPhaseRows(data, threshold) {
  const intervalSeconds = data.periodSeconds / Math.max(1, data.pourFlow.length - 1);
  const phases = detectPhases(data.pourFlow, threshold);

  const totalPour = sum(data.pourFlow, 0, data.pourFlow.length - 1, intervalSeconds);
  const totalDrip = sum(data.dripFlow, 0, data.dripFlow.length - 1, intervalSeconds);

  const rows = [[
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

function classifyPour(amountG, rateGPerS, previousAmountG) {
  if (amountG <= 2.0) {
    if (previousAmountG == null || previousAmountG > 2.0) return 'Switch pressed';
    return 'Switch pressed [Off]';
  }
  if (amountG > 100 || rateGPerS > 20) return 'Dripper removed';
  return 'Normal pour';
}

function buildLegacyRows(data, minDetectableChange, minTotalPour) {
  const total = data.cumulativePour;
  const bsize = data.dripFlow;
  const nSamples = total.length;
  const intervalSeconds = nSamples > 1 ? data.periodSeconds / (nSamples - 1) : 0;

  const pours = [];
  let inPour = false;
  let startIdx = null;

  const closePourSegment = (endIdx) => {
    if (!inPour || startIdx == null) return;
    const t0 = startIdx * intervalSeconds;
    const t1 = endIdx * intervalSeconds;
    const c0 = Number.isFinite(total[startIdx]) ? total[startIdx] : 0;
    const c1 = Number.isFinite(total[endIdx]) ? total[endIdx] : c0;
    const added = c1 - c0;
    const duration = t1 - t0;

    if (added >= minTotalPour && duration > 0) {
      const brewSpeeds = bsize.slice(startIdx, endIdx + 1).map((v) => Number.isFinite(v) ? v : 0);
      const avgBrewSpeed = brewSpeeds.length > 0
        ? brewSpeeds.reduce((a, b) => a + b, 0) / brewSpeeds.length
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

  for (let i = 1; i < nSamples; i += 1) {
    const prev = Number.isFinite(total[i - 1]) ? total[i - 1] : 0;
    const curr = Number.isFinite(total[i]) ? total[i] : prev;
    const change = curr - prev;

    if (change >= minDetectableChange && !inPour) {
      inPour = true;
      startIdx = i - 1;
    } else if ((change < minDetectableChange || curr <= prev) && inPour) {
      closePourSegment(i - 1);
    }
  }

  if (inPour) {
    closePourSegment(nSamples - 1);
  }

  const rows = [[
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('Usage: node scripts/parse_ultrakoki_json.cjs <input.json> [--mode auto|phases|samples|legacy|points] [--threshold 0.01] [--min-change 0.5] [--min-pour 1.0] [--output out.csv]');
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  const parsed = readJsonFile(inputPath);

  const pointArray = findPointArray(parsed);
  if (pointArray && (args.mode === 'auto' || args.mode === 'points')) {
    const rows = buildPointRows(pointArray.points);
    const output = csv(rows) + '\n';
    if (args.output) {
      fs.writeFileSync(path.resolve(args.output), output, 'utf8');
    } else {
      process.stdout.write(output);
    }
    return;
  }

  const data = findBrewingLog(parsed);

  if (!data) {
    console.error('Could not find a supported point array or Ultrakoki brewingLog in the JSON.');
    process.exit(1);
  }

  let rows;
  if (args.mode === 'samples') {
    rows = buildSampleRows(data);
  } else if (args.mode === 'legacy') {
    rows = buildLegacyRows(data, args.minDetectableChange, args.minTotalPour);
  } else if (args.mode === 'phases') {
    rows = buildPhaseRows(data, args.threshold);
  } else {
    rows = buildLegacyRows(data, args.minDetectableChange, args.minTotalPour);
  }

  const output = csv(rows) + '\n';
  if (args.output) {
    fs.writeFileSync(path.resolve(args.output), output, 'utf8');
  } else {
    process.stdout.write(output);
  }
}

main();