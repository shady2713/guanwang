export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const icon = (name, cls = '') => `<img class="icon ${cls}" src="/assets/scenarios/icons/${name}.svg" width="20" height="20" alt="">`;
export function mountChrome(active = 'scenarios') {
  document.querySelector('#site-header').innerHTML = `<div class="header-inner shell"><a class="brand" href="/" aria-label="视界 AIMaster 首页"><span>视界</span> AIMaster</a><nav id="main-nav" aria-label="主导航"><a href="/#capabilities">产品能力</a><a href="/scenarios/" ${active === 'scenarios' ? 'aria-current="page"' : ''}>应用场景</a><a href="/#integration">部署与集成</a><a href="/#resources">资源与支持</a></nav><a class="button primary header-demo" href="/demo/" ${active === 'demo' ? 'aria-current="page"' : ''}>预约演示</a><button class="menu-toggle" type="button" aria-label="打开导航菜单" aria-controls="main-nav" aria-expanded="false">${icon('menu-2')}</button></div>`;
  document.querySelector('#site-footer').innerHTML = `<div class="footer-inner shell"><div><a class="brand footer-brand" href="/"><span>视界</span> AIMaster</a><p>不止于识别，更在于理解。</p></div><nav aria-label="页脚导航"><a href="/#capabilities">产品能力</a><a href="/scenarios/">应用场景</a><a href="/#integration">部署与集成</a><a href="/demo/">预约演示</a></nav><small>© ${new Date().getFullYear()} 视界 AIMaster</small></div>`;
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#main-nav');
  const close = (restore = false) => { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', '打开导航菜单'); nav.classList.remove('open'); if (restore) toggle.focus(); };
  toggle.addEventListener('click', () => { const open = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单'); });
  nav.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  document.addEventListener('click', event => { if (!event.target.closest('#site-header')) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') close(true); });
  window.matchMedia('(min-width: 901px)').addEventListener('change', () => close());
}
export function demoBand() {
  return `<section class="demo-band" aria-labelledby="demo-band-title"><img src="/assets/scenarios/city-panorama.webp" width="2086" height="754" alt="" loading="lazy"><div class="shell demo-band-inner"><div><h2 id="demo-band-title">了解场景适配与部署方式</h2><p>结合您的实际业务场景，获取详细方案。</p></div><a class="button primary" href="/demo/">预约演示 ${icon('arrow-right', 'white-icon')}</a></div></section>`;
}
