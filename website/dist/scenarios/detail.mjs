import { getItem, application, description, detailScope, imageFor, safeReturn, catalog } from './catalog-model.mjs';
import { escapeHTML as e, icon, mountChrome } from './shared.mjs';
mountChrome();
const params = new URLSearchParams(location.search);
const item = getItem(params.get('id'));
const main = document.querySelector('#main');
if (!item) {
  main.innerHTML = '<section class="empty-state"><h1>暂未找到这个场景</h1><p>场景编号可能已更新，请返回目录选择。</p><a class="button primary" href="/scenarios/">返回应用场景</a></section>';
} else {
  const industry = item.industry_ids.includes(params.get('industry')) ? params.get('industry') : null;
  const industryName = catalog.industries.find(x => x.id === industry)?.name;
  const app = application(item, industry);
  const scoped = detailScope(item, industry);
  const scopeNote = industry && !scoped.length ? '<p class="scope-note">当前行业尚未逐项映射细分场景。使用条件为能力层面的参考，具体行业适配需另行确认。</p>' : '';
  const image = imageFor(item);
  const back = safeReturn(params.get('return'));
  const dedup = values => [...new Set(values.filter(Boolean))];
  const sensors = industry && app?.industry_source_details?.length ? dedup(scoped.map(x => x.sensor)) : item.sensors;
  const usages = industry && app?.industry_source_details?.length ? dedup(scoped.map(x => x.usage)) : item.usage;
  const limits = industry && app?.industry_source_details?.length ? dedup(scoped.map(x => x.limits)) : item.conditions;
  const list = values => `<ul>${values.map(x => `<li>${e(x)}</li>`).join('')}</ul>`;
  const status = { supported: '已支持', training: '训练中', planned: '规划中' }[app ? app.availability : item.availability] ?? '支持状态待确认';
  document.title = `${item.name} · 视界 AIMaster`;
  main.innerHTML = `<nav class="breadcrumbs" aria-label="面包屑"><a id="back-to-catalog" href="${e(back)}">${icon('arrow-left', 'blue-icon')}返回应用场景</a><span>/</span><span>${e(industryName ?? item.capability_name)}</span></nav><section class="detail-hero"><div><div class="eyebrow">${e(industryName ?? item.capability_name)} · ${e(item.item_type)}</div><h1>${e(item.name)}</h1><p>${e(description(item, industry))}</p><div class="detail-meta"><span>${e(item.capability_name)}</span><span>${status}</span></div><a class="button primary" href="/demo/?scene=${item.id}${industry ? `&industry=${industry}` : ''}">沟通场景适配 ${icon('arrow-right', 'white-icon')}</a></div><div class="scene-photo"><img src="${image.src}" width="1520" height="1035" alt="${e(item.capability_name)}场景示意"><span class="image-label">${image.label}</span></div></section>
  <section class="detail-section"><h2>识别什么</h2><div>${app?.industry_association === 'proposed_reuse' ? '<p class="scope-note">该行业应用为建议复用场景，需要结合现场数据确认适配与效果。</p>' : ''}${scopeNote}<div class="scope-items">${scoped.map(x => `<div><h3>${e(x.name)}</h3><p>${e(x.usage)}</p></div>`).join('')}</div>${industry ? `<details><summary>全部细分能力（跨行业）</summary><p class="scope-note">以下为该能力在不同业务中的完整分类，不表示当前行业全部适用。</p>${list(item.subcapabilities)}</details>` : ''}</div></section>
  <section class="detail-section"><h2>如何使用</h2><div><h3>影像与采集要求</h3>${list(sensors)}${!industry ? `<div style="margin-top:18px">${list(item.inputs)}</div>` : ''}<h3 style="margin-top:24px">分析前的设置</h3>${list(usages)}</div></section>
  <section class="detail-section"><h2>从识别到理解</h2><div><p>算法链可将多个识别与分析步骤连接起来，结合业务规则形成完整判断。具体步骤应依据场景、影像条件和验收目标配置。</p><div class="chain-steps"><div><span>01 · 发现</span><h3>识别目标</h3><p>发现画面中的对象，提取位置及可见特征。</p></div><div><span>02 · 分析</span><h3>结合时空关系</h3><p>按需求分析目标与区域的关系，或连续画面中的变化。</p></div><div><span>03 · 输出</span><h3>形成事件线索</h3><p>依据业务规则整理结果与证据，供复核和业务系统使用。</p></div></div><p class="scope-note">这里展示算法链的配置思路。当前目录未提供该场景已验证的完整算法链，具体方案需演示确认。</p><a class="detail-link" href="/#capabilities">了解产品能力 ${icon('arrow-right', 'blue-icon')}</a></div></section>
  <section class="detail-section"><h2>使用条件</h2><div>${list(limits)}<details><summary>采集试拍参考</summary><p class="scope-note">以下为能力层面的试飞建议，尚未经现场验证；不是检出保证或厂家验证范围。当前行业应按最小目标与现场条件另行试拍。</p><pre>${e(item.flight_guidance?.text ?? '采集参数需结合现场条件确认。')}</pre><p>${e(item.flight_guidance?.detail?.check ?? '')}</p></details></div></section>
  <section class="detail-section"><h2>场景适配</h2><div><p>场景目录用于说明能力规划。模型支持状态、识别效果、算法链与部署方式，应结合您的实际影像和业务规则确认。</p><a class="detail-link" href="/demo/?scene=${item.id}${industry ? `&industry=${industry}` : ''}">预约演示 ${icon('arrow-right', 'blue-icon')}</a></div></section>`;
  document.querySelector('#back-to-catalog').addEventListener('click', event => {
    try { const ref = new URL(document.referrer); if (ref.origin === location.origin && ref.pathname === '/scenarios/' && ref.pathname + ref.search === back) { event.preventDefault(); history.back(); } } catch { /* Direct entry uses the validated catalog link. */ }
  });
}
