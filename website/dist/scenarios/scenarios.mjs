import { categories, normalizeState, getItems, description, stateURL, imageFor, galleryCopy, application } from './catalog-model.mjs';
import { escapeHTML as e, icon, mountChrome, demoBand } from './shared.mjs';
mountChrome();
document.querySelector('#conversion').innerHTML = demoBand();
let state = normalizeState(new URLSearchParams(location.search));
const remembered = { industry: 'city', capability: 'people' };
const tabs = document.querySelector('#category-tabs');
const grid = document.querySelector('#scene-grid');
const more = document.querySelector('#load-more');
const end = document.querySelector('#all-loaded');
history.replaceState({ scrollY: 0 }, '', stateURL(state));
function card(item, index) {
  const image = imageFor(item);
  const industry = state.view === 'industry' ? state.category : null;
  const query = new URLSearchParams({ id: item.id, return: stateURL(state) });
  if (industry) query.set('industry', industry);
  const href = `/scenarios/detail.html?${query}`;
  const text = industry === 'city' && galleryCopy[item.id] ? galleryCopy[item.id] : description(item, industry);
  const app = application(item, industry);
  const status = { supported: '已支持', training: '训练中', planned: '规划中' }[app ? app.availability : item.availability];
  const responsive = image.small ? `srcset="${image.small} 640w, ${image.src} 1520w" sizes="(max-width:600px) calc(100vw - 40px), (max-width:900px) calc((100vw - 72px) / 2), calc((100vw - 184px) / 3)"` : '';
  return `<article class="scene-card" data-item="${e(item.id)}"><a class="scene-photo" href="${e(href)}" tabindex="-1" aria-hidden="true"><img src="${image.src}" ${responsive} width="1520" height="1035" alt="${e(item.capability_name)}的场景示意画面" loading="${index < 3 ? 'eager' : 'lazy'}"><span class="image-label">${image.label}</span></a><h3><a href="${e(href)}">${e(item.name)}</a></h3><p>${e(text)}</p>${status ? `<div class="status-badge">${status}</div>` : ''}<a class="detail-link" href="${e(href)}" aria-label="查看详情：${e(item.name)}">查看详情 ${icon('arrow-right', 'blue-icon')}</a></article>`;
}
function render(append = false) {
  remembered[state.view] = state.category;
  document.querySelectorAll('.view-tabs button').forEach(button => { const selected = button.id === `view-${state.view}`; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
  const category = categories(state.view).find(x => x.id === state.category);
  tabs.innerHTML = categories(state.view).map(x => `<button type="button" role="tab" id="category-${x.id}" data-category="${x.id}" aria-selected="${x.id === state.category}" aria-controls="scene-panel" tabindex="${x.id === state.category ? 0 : -1}">${e(x.name)}</button>`).join('');
  tabs.setAttribute('aria-label', state.view === 'industry' ? '行业分类' : '能力分类');
  document.querySelector('#category-panel').setAttribute('aria-labelledby', `view-${state.view}`);
  document.querySelector('#scene-panel').setAttribute('aria-labelledby', `category-${state.category}`);
  document.querySelector('#category-title').textContent = category.name;
  document.querySelector('#category-description').textContent = category.description;
  const items = getItems(state);
  const previous = append ? grid.children.length : 0;
  if (!append) grid.replaceChildren();
  grid.insertAdjacentHTML('beforeend', items.slice(previous, state.count).map((item, index) => card(item, previous + index)).join(''));
  // Keep every detail URL current so returning preserves the expanded gallery.
  grid.querySelectorAll('a').forEach(link => { const url = new URL(link.href); url.searchParams.set('return', stateURL(state)); link.href = url.pathname + url.search; });
  more.hidden = state.count >= items.length;
  end.hidden = !more.hidden;
  document.querySelector('#results-status').textContent = `${category.name}，已展示 ${Math.min(state.count, items.length)} / ${items.length} 个场景。`;
}
function saveScroll() { history.replaceState({ ...history.state, scrollY: window.scrollY }, '', location.href); }
function change(next, focusId) {
  saveScroll();
  state = normalizeState(new URLSearchParams({ view: next.view, category: next.category }));
  history.pushState({ scrollY: window.scrollY }, '', stateURL(state));
  render();
  document.getElementById(focusId)?.focus({ preventScroll: true });
}
tabs.addEventListener('click', event => { const button = event.target.closest('[data-category]'); if (button) change({ view: state.view, category: button.dataset.category }, button.id); });
document.querySelector('.view-tabs').addEventListener('click', event => { const button = event.target.closest('[role=tab]'); if (!button) return; const view = button.id.replace('view-', ''); change({ view, category: remembered[view] }, button.id); });
function keyboardTabs(event) {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const buttons = [...event.currentTarget.querySelectorAll('[role=tab]')];
  let index = buttons.indexOf(document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = buttons.length - 1;
  else index = (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
  buttons[index].click();
}
tabs.addEventListener('keydown', keyboardTabs);
document.querySelector('.view-tabs').addEventListener('keydown', keyboardTabs);
more.addEventListener('click', () => { state.count = Math.min(state.count + 6, getItems(state).length); history.replaceState({ scrollY: window.scrollY }, '', stateURL(state)); render(true); if (more.hidden) end.focus({ preventScroll: true }); });
grid.addEventListener('click', event => { if (event.target.closest('a')) saveScroll(); });
window.addEventListener('popstate', () => { state = normalizeState(new URLSearchParams(location.search)); render(); requestAnimationFrame(() => window.scrollTo(0, history.state?.scrollY ?? 0)); });
window.addEventListener('pagehide', saveScroll);
render();
