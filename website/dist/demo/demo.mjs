import { mountChrome } from '/scenarios/shared.mjs';
import { getItem, catalog } from '/scenarios/catalog-model.mjs';
mountChrome('demo');
const params = new URLSearchParams(location.search);
const item = getItem(params.get('scene'));
if (item) { const industry = item.industry_ids.includes(params.get('industry')) ? catalog.industries.find(x => x.id === params.get('industry')) : null; const context = document.querySelector('#demo-context'); context.hidden = false; context.textContent = `咨询场景：${item.name}${industry ? ` · ${industry.name}` : ''}`; }
const form = document.querySelector('#demo-form');
const status = document.querySelector('#form-status');
form.addEventListener('submit', event => {
  event.preventDefault();
  let firstError;
  for (const name of ['company', 'contact']) {
    const field = form.elements[name];
    const error = document.querySelector(`#${name}-error`);
    const value = field.value.trim();
    let message = value ? '' : `请填写${name === 'company' ? '公司名称' : '联系方式'}。`;
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    const telephone = /^[+\d\s()-]+$/.test(value) && /^\+?\d{6,15}$/.test(value.replace(/[\s()-]/g, ''));
    if (name === 'contact' && value && !email && !telephone) message = '请输入有效的手机号码或邮箱。';
    error.textContent = message;
    error.hidden = !message;
    field.setAttribute('aria-invalid', String(Boolean(message)));
    if (message && !firstError) firstError = field;
  }
  if (firstError) { status.textContent = '请检查填写内容。'; firstError.focus(); return; }
  status.textContent = '填写内容已检查。当前为静态演示，预约尚未发送。';
});
form.addEventListener('input', event => { status.textContent = ''; if (event.target.matches('input')) { event.target.removeAttribute('aria-invalid'); document.querySelector(`#${event.target.name}-error`).hidden = true; } });
form.querySelector('button[type=submit]').disabled = false;
