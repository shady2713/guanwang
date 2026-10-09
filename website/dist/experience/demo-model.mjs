/**
 * Deterministic illustration of one vehicle crossing a configurable region.
 * Coordinates, detections and events are preset demo data, never AI output.
 */
export const DURATION = 12_000;

export const PATH = Object.freeze([
  Object.freeze({ x: 0.56, y: 0.98 }),
  Object.freeze({ x: 0.18, y: 0.04 }),
]);

export const DEFAULT_REGION = Object.freeze([
  Object.freeze({ x: 0.29, y: 0.31 }),
  Object.freeze({ x: 0.42, y: 0.40 }),
  Object.freeze({ x: 0.51, y: 0.66 }),
  Object.freeze({ x: 0.36, y: 0.62 }),
]);

const BOUNDARY_EPSILON = 1e-9;
const ENTRY_SAMPLES = 2_048;
const DEMO_VEHICLE_ID = 'demo-vehicle-01';

export function safeProgress(progress) {
  const value = Number(progress);
  return Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));
}

function validPoint(point) {
  return point !== null && typeof point === 'object'
    && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function onSegment(point, first, second) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return Math.hypot(point.x - first.x, point.y - first.y) <= BOUNDARY_EPSILON;
  }
  const distance = Math.abs((point.x - first.x) * dy - (point.y - first.y) * dx) / length;
  return distance <= BOUNDARY_EPSILON
    && point.x >= Math.min(first.x, second.x) - BOUNDARY_EPSILON
    && point.x <= Math.max(first.x, second.x) + BOUNDARY_EPSILON
    && point.y >= Math.min(first.y, second.y) - BOUNDARY_EPSILON
    && point.y <= Math.max(first.y, second.y) + BOUNDARY_EPSILON;
}

/** The polygon boundary counts as inside, including vertices. */
export function pointInPolygon(point, polygon) {
  if (!validPoint(point) || !Array.isArray(polygon) || polygon.length < 3
    || !polygon.every(validPoint)) return false;

  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const first = polygon[previous];
    const second = polygon[index];
    if (onSegment(point, first, second)) return true;
    if ((first.y > point.y) !== (second.y > point.y)
      && point.x < ((second.x - first.x) * (point.y - first.y)) / (second.y - first.y) + first.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function frameAt(progress, region = DEFAULT_REGION) {
  const position = safeProgress(progress);
  const first = PATH[0];
  const last = PATH[PATH.length - 1];
  const point = {
    x: first.x + (last.x - first.x) * position,
    y: first.y + (last.y - first.y) * position,
  };
  return {
    progress: position,
    ...point,
    scale: 1.18 + (0.48 - 1.18) * position,
    inside: pointInPolygon(point, region),
  };
}

/**
 * First sampled outside-to-inside transition, refined by bisection.
 * A vehicle that starts inside the region does not produce an entry event.
 */
export function entryProgress(region = DEFAULT_REGION) {
  let previousInside = frameAt(0, region).inside;
  for (let sample = 1; sample <= ENTRY_SAMPLES; sample += 1) {
    const position = sample / ENTRY_SAMPLES;
    const currentInside = frameAt(position, region).inside;
    if (!previousInside && currentInside) {
      let outside = (sample - 1) / ENTRY_SAMPLES;
      let inside = position;
      for (let refinement = 0; refinement < 36; refinement += 1) {
        const middle = (outside + inside) / 2;
        if (frameAt(middle, region).inside) inside = middle;
        else outside = middle;
      }
      return inside;
    }
    previousInside = currentInside;
  }
  return null;
}

function evidenceFrame(entry, direction, region) {
  let interval = 0.08;
  let frame = frameAt(entry + direction * interval, region);
  // Keep the evidence immediately on each side of the first boundary even
  // when a moved region gives a short passage through the preset trajectory.
  for (let attempt = 0; attempt < 36 && frame.inside !== (direction > 0); attempt += 1) {
    interval /= 2;
    frame = frameAt(entry + direction * interval, region);
  }
  return { ...frame, vehicleId: DEMO_VEHICLE_ID };
}

export function eventAt(progress, { ruleEnabled = true, region = DEFAULT_REGION } = {}) {
  if (!ruleEnabled) return null;
  const entry = entryProgress(region);
  if (entry === null || safeProgress(progress) < entry) return null;
  return {
    type: 'region-entry',
    progress: entry,
    source: '预设巡查样片',
    evidenceBefore: evidenceFrame(entry, -1, region),
    evidenceAfter: evidenceFrame(entry, 1, region),
  };
}

/** Only the two advertised preset prompts are supported by this demo. */
export function normalizeDemoQuery(query) {
  if (typeof query !== 'string') return false;
  const normalized = query.replace(/\s/gu, '');
  return normalized === '查找白色车辆' || normalized === '白色车辆';
}
