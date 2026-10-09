import catalog from './catalog-data.mjs';
export { catalog };
export const PAGE_SIZE = 6;
const itemMap = new Map(catalog.items.map(x => [x.id, x]));
const appMap = new Map(catalog.applications.map(x => [`${x.industry_id}:${x.item_id}`, x]));
const featured = ['401', '404', '308', '410', '216', '902'];
export function categories(view) { return view === 'capability' ? catalog.capabilities : catalog.industries; }
export function normalizeState(params) {
  const view = params.get('view') === 'capability' ? 'capability' : 'industry';
  const category = categories(view).some(x => x.id === params.get('category')) ? params.get('category') : categories(view)[0].id;
  const requested = Number(params.get('count'));
  const total = getItems({ view, category }).length;
  const count = Number.isSafeInteger(requested) && requested >= PAGE_SIZE ? Math.min(requested, total) : Math.min(PAGE_SIZE, total);
  return { view, category, count };
}
export function getItems(state) {
  if (state.view === 'capability') return catalog.items.filter(x => x.capability_id === state.category);
  const category = catalog.industries.find(x => x.id === state.category);
  if (!category) return [];
  const ids = state.category === 'city' ? [...featured, ...category.item_ids] : category.item_ids;
  return [...new Set(ids)].map(id => itemMap.get(id)).filter(Boolean);
}
export function getItem(id) { return itemMap.get(id); }
export function application(item, industry) { return appMap.get(`${industry}:${item.id}`) ?? null; }
export function description(item, industry) { return application(item, industry)?.description ?? item.description; }
export function detailScope(item, industry) {
  const app = application(item, industry);
  if (industry && app) return app.industry_source_details ?? [];
  return item.source_scene_details;
}
export function stateURL(state) {
  const p = new URLSearchParams({ view: state.view, category: state.category });
  if (state.count > PAGE_SIZE) p.set('count', String(state.count));
  return `/scenarios/?${p}`;
}
export function safeReturn(value) {
  try {
    const url = new URL(value, 'http://local.invalid');
    if (url.origin !== 'http://local.invalid' || url.pathname !== '/scenarios/') return '/scenarios/';
    return stateURL(normalizeState(url.searchParams));
  } catch { return '/scenarios/'; }
}
const specialImages = { '401': 'litter', '404': 'street-market', '308': 'manhole', '410': 'street-banner', '216': 'fire-access', '902': 'urban-greenery' };
const categoryImages = { people: 'people-scene', vehicles: 'fire-access', ships: 'ships-scene', roads: 'manhole', buildings: 'construction', urban_objects: 'litter', smoke_fire: 'smoke-scene', water_objects: 'water-scene', plants: 'urban-greenery', animals: 'animals-scene', equipment: 'equipment-scene', ground: 'ground-scene', survey_aux: 'ground-scene' };
export function imageFor(item) {
  const name = specialImages[item.id] ?? categoryImages[item.capability_id];
  return { src: name === 'construction' ? '/assets/construction.webp' : `/assets/scenarios/${name}.webp`, small: name === 'construction' ? null : `/assets/scenarios/${name}-640.webp`, label: specialImages[item.id] ? '场景示意' : '能力类别场景示意' };
}
export const galleryCopy = { '401': '发现可见垃圾与杂物，记录位置供现场复核。', '404': '结合通行区域与管理规则，发现经营占用线索。', '308': '检查缺失、破损或明显移位，保留相关画面。', '410': '发现横幅及悬挂物，记录位置供设置管理核查。', '216': '当前城市应用：记录消防登高面及消防通道占用线索。', '902': '提取绿化带等植被范围，记录可见边界。' };
