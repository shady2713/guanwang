import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DURATION,
  PATH,
  DEFAULT_REGION,
  safeProgress,
  pointInPolygon,
  frameAt,
  entryProgress,
  eventAt,
  normalizeDemoQuery,
} from '../dist/experience/demo-model.mjs';

const square = [
  { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 },
  { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 },
];

test('preset path, duration and perspective scale remain consistent', () => {
  assert.equal(DURATION, 12_000);
  assert.deepEqual(PATH, [{ x: 0.56, y: 0.98 }, { x: 0.18, y: 0.04 }]);
  const start = frameAt(0);
  const finish = frameAt(1);
  assert.equal(start.x, 0.56);
  assert.equal(start.y, 0.98);
  assert.equal(start.scale, 1.18);
  assert.ok(Math.abs(finish.x - 0.18) < 1e-12);
  assert.ok(Math.abs(finish.y - 0.04) < 1e-12);
  assert.ok(Math.abs(finish.scale - 0.48) < 1e-12);
  assert.ok(frameAt(0.4).scale > frameAt(0.8).scale);
  assert.ok(Object.isFrozen(PATH[0]) && Object.isFrozen(DEFAULT_REGION[0]));
});

test('progress clamps invalid and out of range playback positions', () => {
  assert.equal(safeProgress(NaN), 0);
  assert.equal(safeProgress(undefined), 0);
  assert.equal(safeProgress(-1), 0);
  assert.equal(safeProgress(2), 1);
  assert.equal(safeProgress(Infinity), 1);
  assert.equal(safeProgress(-Infinity), 0);
  assert.equal(safeProgress('0.25'), 0.25);
  assert.deepEqual(frameAt(-1), frameAt(0));
  assert.deepEqual(frameAt(2), frameAt(1));
  assert.deepEqual(frameAt(NaN), frameAt(0));
});

test('polygon interior, edges, vertices and reversed order agree', () => {
  const interior = { x: 0.5, y: 0.5 };
  const edge = { x: 0.2, y: 0.5 };
  const vertex = { x: 0.2, y: 0.2 };
  for (const polygon of [square, [...square].reverse()]) {
    assert.equal(pointInPolygon(interior, polygon), true);
    assert.equal(pointInPolygon(edge, polygon), true);
    assert.equal(pointInPolygon(vertex, polygon), true);
    assert.equal(pointInPolygon({ x: 0.1, y: 0.5 }, polygon), false);
    assert.equal(pointInPolygon({ x: 0.2 - 1e-6, y: 0.5 }, polygon), false);
  }
  assert.equal(pointInPolygon({ x: NaN, y: 0.5 }, square), false);
  assert.equal(pointInPolygon(interior, []), false);
  assert.equal(pointInPolygon(interior, null), false);
  assert.equal(pointInPolygon(interior, [{ x: 0, y: 0 }, { x: 1, y: 1 }]), false);
});

test('default road trajectory starts outside, enters, and leaves', () => {
  const entry = entryProgress();
  assert.ok(entry > 0.36 && entry < 0.37);
  assert.equal(frameAt(0).inside, false);
  assert.equal(frameAt(entry - 0.001).inside, false);
  assert.equal(frameAt(entry).inside, true);
  assert.equal(frameAt(0.5).inside, true);
  assert.equal(frameAt(0.8).inside, false);
  assert.equal(frameAt(1).inside, false);
});

test('event belongs to one preset vehicle and follows the playhead', () => {
  const entry = entryProgress();
  assert.equal(eventAt(entry - 0.001), null);
  assert.equal(eventAt(NaN), null);
  const event = eventAt(entry);
  assert.equal(event.type, 'region-entry');
  assert.equal(event.source, '预设巡查样片');
  assert.equal(event.progress, entry);
  assert.equal(event.evidenceBefore.vehicleId, event.evidenceAfter.vehicleId);
  assert.equal(event.evidenceBefore.inside, false);
  assert.equal(event.evidenceAfter.inside, true);
  assert.ok(event.evidenceBefore.progress < entry);
  assert.ok(event.evidenceAfter.progress > entry);
  assert.deepEqual(eventAt(1), event);
  // Seeking backward removes the event instead of retaining historical state.
  assert.equal(eventAt(0.2), null);
});

test('disabled entry rule keeps position detection without producing events', () => {
  assert.equal(frameAt(0.5).inside, true);
  assert.equal(eventAt(0.5, { ruleEnabled: false }), null);
  assert.equal(eventAt(1, { ruleEnabled: false }), null);
});

test('changing the region changes the event and moving it away removes it', () => {
  const shifted = DEFAULT_REGION.map(({ x, y }) => ({ x, y: y - 0.1 }));
  const shiftedEntry = entryProgress(shifted);
  assert.ok(shiftedEntry > entryProgress());
  assert.equal(eventAt(entryProgress(), { region: shifted }), null);
  const shiftedEvent = eventAt(1, { region: shifted });
  assert.equal(shiftedEvent.progress, shiftedEntry);
  assert.equal(shiftedEvent.evidenceBefore.inside, false);
  assert.equal(shiftedEvent.evidenceAfter.inside, true);
  const movedAway = DEFAULT_REGION.map(({ x, y }) => ({ x: x + 0.4, y }));
  assert.equal(entryProgress(movedAway), null);
  assert.equal(eventAt(1, { region: movedAway }), null);
  assert.equal(entryProgress([]), null);
});

test('starting inside a region does not fabricate an entry event', () => {
  const initialRegion = [
    { x: 0.4, y: 0.8 }, { x: 0.7, y: 0.8 },
    { x: 0.7, y: 1.1 }, { x: 0.4, y: 1.1 },
  ];
  assert.equal(frameAt(0, initialRegion).inside, true);
  assert.equal(frameAt(0.5, initialRegion).inside, false);
  assert.equal(entryProgress(initialRegion), null);
  assert.equal(eventAt(1, { region: initialRegion }), null);
});

test('short region passages retain evidence on the correct side', () => {
  const shortRegion = [
    { x: 0.36, y: 0.507 }, { x: 0.38, y: 0.507 },
    { x: 0.38, y: 0.515 }, { x: 0.36, y: 0.515 },
  ];
  const event = eventAt(1, { region: shortRegion });
  assert.ok(event);
  assert.equal(event.evidenceBefore.inside, false);
  assert.equal(event.evidenceAfter.inside, true);
});

test('natural language demo accepts only supported preset queries', () => {
  for (const supported of ['查找白色车辆', '白色车辆', '  查找白色车辆  ', '\n白色\t车辆\u3000']) {
    assert.equal(normalizeDemoQuery(supported), true);
  }
  for (const unsupported of ['', '查找红色车辆', '查找白色车辆并识别车牌', '白色车辆。', null, 123]) {
    assert.equal(normalizeDemoQuery(unsupported), false);
  }
});
