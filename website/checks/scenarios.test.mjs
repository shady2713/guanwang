import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { catalog, categories, normalizeState, getItems, getItem, application, description, detailScope, stateURL, safeReturn, imageFor } from '../dist/scenarios/catalog-model.mjs';

test('complete planning catalog has stable unique items and all taxonomy associations', () => {
  assert.equal(catalog.industries.length, 16);
  assert.equal(catalog.capabilities.length, 13);
  assert.equal(catalog.items.length, 217);
  assert.equal(catalog.applications.length, 576);
  assert.equal(new Set(catalog.items.map(x => x.id)).size, 217);
  const union = new Set();
  for (const industry of catalog.industries) {
    const items = getItems({ view: 'industry', category: industry.id });
    assert.equal(items.length, industry.item_ids.length);
    for (const item of items) { assert.ok(application(item, industry.id)); union.add(item.id); }
  }
  assert.equal(union.size, 217);
  assert.equal(categories('capability').flatMap(category => getItems({ view: 'capability', category: category.id })).length, 217);
});
test('source snapshot remains unchanged and projection does not leak absolute paths', async () => {
  const manifest = JSON.parse(await readFile(new URL('./catalog-source.json', import.meta.url)));
  const source = await readFile(new URL(manifest.source, import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'), manifest.sha256);
  assert.doesNotMatch(JSON.stringify(catalog), /[A-Z]:\\|C:\/Users|Desktop|E:\//i);
});
test('initial gallery matches the six selected city scenes', () => {
  const state = normalizeState(new URLSearchParams());
  assert.deepEqual(state, { view: 'industry', category: 'city', count: 6 });
  assert.deepEqual(getItems(state).slice(0, 6).map(x => x.id), ['401', '404', '308', '410', '216', '902']);
});
test('category mode validates independently without a hidden cross filter', () => {
  assert.equal(normalizeState(new URLSearchParams('view=capability&category=city')).category, 'people');
  assert.equal(normalizeState(new URLSearchParams('view=industry&category=people')).category, 'city');
  assert.equal(normalizeState(new URLSearchParams('view=unknown&category=oops')).view, 'industry');
  assert.ok(getItems({ view: 'capability', category: 'plants' }).every(x => x.capability_id === 'plants'));
});
test('load state is bounded and can roundtrip through a direct link', () => {
  for (const count of ['-6', 'NaN', 'Infinity', '6.5']) assert.equal(normalizeState(new URLSearchParams(`count=${count}`)).count, 6);
  assert.equal(normalizeState(new URLSearchParams('count=9999')).count, 72);
  const state = { view: 'industry', category: 'traffic', count: 18 };
  assert.deepEqual(normalizeState(new URL(stateURL(state), 'http://local').searchParams), state);
});
test('detail return link stays within the catalog', () => {
  for (const input of ['https://evil.test/scenarios/', '//evil.test/scenarios/', '/demo/', 'javascript:alert(1)', null]) assert.equal(safeReturn(input), '/scenarios/');
  assert.equal(safeReturn('/scenarios/?view=capability&category=plants&count=12'), '/scenarios/?view=capability&category=plants&count=12');
});
test('city vehicle scene excludes cross-industry plate capability from the scoped explanation', () => {
  const item = getItem('216');
  assert.doesNotMatch(description(item, 'city'), /车牌/);
  assert.deepEqual(detailScope(item, 'city').map(x => x.id), ['S312', 'S422']);
  assert.ok(item.subcapabilities.includes('占道关联车牌'));
});
test('city trees, river cargo ships, and forest smoke keep source-specific scope', () => {
  assert.doesNotMatch(JSON.stringify(detailScope(getItem('901'), 'city')), /玉米/);
  assert.match(description(getItem('801'), 'water'), /干散货驳船/);
  assert.doesNotMatch(JSON.stringify(detailScope(getItem('801'), 'water')), /客船/);
  assert.deepEqual(detailScope(getItem('601'), 'forest').map(x => x.name), ['烟识别']);
});
test('unsupported status and unverified algorithm chains stay unassigned', () => {
  assert.ok(catalog.items.every(x => x.availability === null && x.algorithm_chain === null));
  assert.ok(catalog.applications.every(x => x.availability === null));
  assert.ok(catalog.items.every(x => x.flight_guidance.validation === 'unverified_trial_guidance'));
});
test('unmapped industry detail does not inherit the full cross-industry scene list', () => {
  assert.equal(application(getItem('910'), 'forest').subcapability_scope, 'not_individually_mapped');
  assert.deepEqual(detailScope(getItem('910'), 'forest'), []);
  assert.ok(detailScope(getItem('910'), null).length > 0);
});
test('every scene has a local, loadable illustration', async () => {
  for (const src of new Set(catalog.items.map(x => imageFor(x).src))) await access(new URL(`../dist${src}`, import.meta.url));
});
