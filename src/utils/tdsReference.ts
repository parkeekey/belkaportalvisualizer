const RATIOS: number[] = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const EY_VALUES: number[] = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];

const TDS_GRID: number[][] = [
  [1.56, 1.57, 1.65, 1.73, 1.80, 1.87, 1.94, 2.01, 2.08, 2.15, 2.22, 2.29, 2.36, 2.43],
  [1.45, 1.46, 1.53, 1.60, 1.68, 1.75, 1.83, 1.90, 1.98, 2.06, 2.14, 2.22, 2.30, 2.38],
  [1.35, 1.36, 1.40, 1.48, 1.55, 1.65, 1.70, 1.77, 1.85, 1.93, 2.01, 2.09, 2.17, 2.25],
  [1.24, 1.25, 1.31, 1.36, 1.45, 1.46, 1.60, 1.68, 1.76, 1.84, 1.92, 2.00, 2.08, 2.16],
  [1.15, 1.16, 1.22, 1.28, 1.35, 1.40, 1.50, 1.58, 1.65, 1.72, 1.79, 1.86, 1.93, 2.00],
  [1.05, 1.15, 1.20, 1.25, 1.30, 1.37, 1.44, 1.50, 1.56, 1.62, 1.68, 1.74, 1.80, 1.86],
  [1.02, 1.03, 1.07, 1.14, 1.18, 1.23, 1.33, 1.40, 1.48, 1.56, 1.64, 1.72, 1.80, 1.88],
  [0.96, 0.97, 1.02, 1.07, 1.13, 1.17, 1.28, 1.35, 1.43, 1.51, 1.59, 1.67, 1.75, 1.83],
  [0.91, 0.92, 0.97, 1.02, 1.08, 1.12, 1.23, 1.31, 1.38, 1.45, 1.52, 1.59, 1.66, 1.73],
  [0.87, 0.88, 0.93, 0.98, 1.03, 1.07, 1.17, 1.25, 1.32, 1.39, 1.46, 1.53, 1.60, 1.67],
  [0.84, 0.85, 0.89, 0.94, 0.99, 1.03, 1.12, 1.19, 1.26, 1.33, 1.40, 1.47, 1.54, 1.61],
  [0.81, 0.82, 0.86, 0.91, 0.96, 1.00, 1.09, 1.16, 1.23, 1.30, 1.37, 1.44, 1.51, 1.58],
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateRowAtRatio(ratio: number): number[] {
  const eyIdx = EY_VALUES.indexOf(18);
  const refEy = 18;
  // Below SCA range — use physical formula TDS = EY / (ratio - r)
  // with r calibrated so the formula passes through the SCA grid point at ratio 13
  if (ratio <= RATIOS[0]) {
    const r = RATIOS[0] - refEy / TDS_GRID[0][eyIdx];
    return EY_VALUES.map(ey => ey / (ratio - r));
  }
  // Above SCA range — calibrated at ratio 24
  if (ratio >= RATIOS[RATIOS.length - 1]) {
    const last = RATIOS.length - 1;
    const r = RATIOS[last] - refEy / TDS_GRID[last][eyIdx];
    return EY_VALUES.map(ey => ey / (ratio - r));
  }
  for (let i = 0; i < RATIOS.length - 1; i++) {
    if (ratio >= RATIOS[i] && ratio <= RATIOS[i + 1]) {
      const t = (ratio - RATIOS[i]) / (RATIOS[i + 1] - RATIOS[i]);
      return TDS_GRID[i].map((v, j) => lerp(v, TDS_GRID[i + 1][j], t));
    }
  }
  return TDS_GRID[4];
}

function interpolateTDSFromRow(row: number[], ey: number): number {
  if (ey <= EY_VALUES[0]) {
    const t = (ey - EY_VALUES[0]) / (EY_VALUES[1] - EY_VALUES[0]);
    return lerp(row[0], row[1], t);
  }
  if (ey >= EY_VALUES[EY_VALUES.length - 1]) {
    const i = EY_VALUES.length - 1;
    const t = (ey - EY_VALUES[i - 1]) / (EY_VALUES[i] - EY_VALUES[i - 1]);
    return lerp(row[i - 1], row[i], t);
  }
  for (let j = 0; j < EY_VALUES.length - 1; j++) {
    if (ey >= EY_VALUES[j] && ey <= EY_VALUES[j + 1]) {
      const t = (ey - EY_VALUES[j]) / (EY_VALUES[j + 1] - EY_VALUES[j]);
      return lerp(row[j], row[j + 1], t);
    }
  }
  return row[4];
}

export function getReferenceTDS(ratio: number, ey: number): number {
  if (ratio <= 0 || ey <= 0) return 0;
  const row = interpolateRowAtRatio(ratio);
  return parseFloat(interpolateTDSFromRow(row, ey).toFixed(4));
}

export function getReferenceEY(ratio: number, tds: number): number {
  if (ratio <= 0 || tds <= 0) return 0;
  const row = interpolateRowAtRatio(ratio);
  if (tds <= row[0]) {
    const t = (tds - row[0]) / (row[1] - row[0]);
    return parseFloat(lerp(EY_VALUES[0], EY_VALUES[1], t).toFixed(4));
  }
  if (tds >= row[row.length - 1]) {
    const i = row.length - 1;
    const t = (tds - row[i - 1]) / (row[i] - row[i - 1]);
    return parseFloat(lerp(EY_VALUES[i - 1], EY_VALUES[i], t).toFixed(4));
  }
  for (let j = 0; j < EY_VALUES.length - 1; j++) {
    if (tds >= row[j] && tds <= row[j + 1]) {
      const t = (tds - row[j]) / (row[j + 1] - row[j]);
      return parseFloat(lerp(EY_VALUES[j], EY_VALUES[j + 1], t).toFixed(4));
    }
  }
  return 20;
}

export function getReferenceTDSRange(ratio: number, eyMin: number, eyMax: number): { tdsMin: number; tdsMax: number } {
  return {
    tdsMin: getReferenceTDS(ratio, eyMin),
    tdsMax: getReferenceTDS(ratio, eyMax),
  };
}
