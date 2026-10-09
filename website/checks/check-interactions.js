async (page) => {
  const results = [];
  const errors = [];
  const requests = [];
  const assert = (condition, name) => { if (!condition) throw new Error(name); results.push(name); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '01 目标识别 画面中有什么' }).click();
  await page.keyboard.press('ArrowRight');
  assert(await page.locator('#cap-temporal').getAttribute('aria-selected') === 'true', '能力标签支持方向键');
  assert((await page.locator('#capability-condition').textContent()).includes('单帧图片无法确认'), '时序说明保留连续观察条件');
  await page.keyboard.press('End');
  assert(await page.locator('#capability-visual').getAttribute('data-mode') === 'spatial', '空间标签更新图层');
  await page.keyboard.press('Home');
  assert(await page.locator('#cap-target').getAttribute('aria-selected') === 'true', '能力标签 Home 回到起始');
  for (const [key, title] of [['city','城市管理'],['traffic','交通巡检'],['water','水域巡查'],['construction','区域安全']]) {
    await page.getByRole('tab', { name: title, exact: true }).click();
    assert(await page.locator(`#scene-${key}`).evaluate(el => el.classList.contains('active')), `${title}切换画面`);
    await page.getByRole('button', { name: '查看场景说明', exact: true }).click();
    assert(await page.locator('#scene-dialog-title').textContent() === title, `${title}详情一致`);
    await page.keyboard.press('Escape');
  }
  for (const [label, id] of [['了解工作方式','overview-dialog'],['查看接入与部署','technical-dialog'],['隐私说明','privacy-dialog']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    assert(await page.locator(`#${id}`).isVisible(), `${label}入口可用`);
    await page.keyboard.press('Escape');
    assert(!await page.locator(`#${id}`).isVisible(), `${label}支持 Escape 关闭`);
  }
  await page.locator('#main-nav').getByRole('button', { name: '产品与服务', exact: true }).click();
  await page.getByRole('button', { name: '咨询产品方案', exact: true }).click();
  assert(await page.locator('#contact-dialog').isVisible() && !await page.locator('#services-dialog').isVisible(), '服务弹窗可以进入预约且只打开一个弹窗');
  assert(await page.locator('#contact-form input:visible').count() === 2, '预约只显示公司名称与联系方式');
  await page.getByRole('button', { name: '下载需求草稿', exact: true }).click();
  assert(await page.locator('#contact-company').evaluate(el => !el.validity.valid), '公司名称必填校验');
  await page.getByLabel('公司名称').fill('静态页面测试公司');
  await page.getByLabel('联系方式').fill('test@example.com');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载需求草稿', exact: true }).click();
  const download = await downloadEvent;
  await download.saveAs('checks/request-draft-test.txt');
  assert((await page.locator('#form-status').textContent()).includes('预约尚未发送'), '草稿下载明确未发送预约');
  await page.screenshot({ path: 'checks/desktop-contact.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  assert(!await page.locator('body').evaluate(el => el.classList.contains('dialog-open')), '关闭弹窗恢复滚动');
  await page.getByRole('tab', { name: '水域巡查', exact: true }).click();
  await page.getByRole('button', { name: '查看场景说明', exact: true }).click();
  await page.getByRole('button', { name: '沟通场景需求', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.locator('#main-nav').getByRole('button', { name: '预约演示', exact: true }).click();
  assert(await page.locator('#contact-form input[type="hidden"]').count() === 0, '通用预约不残留隐藏场景');
  await page.keyboard.press('Escape');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0,0));
    const size = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    assert(size.content === size.viewport, `${width}px 无横向滚动`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.menu-toggle').click();
  assert(await page.locator('.menu-toggle').getAttribute('aria-expanded') === 'true', '手机导航展开');
  await page.screenshot({ path: 'checks/mobile-menu.png', animations: 'disabled' });
  await page.locator('#main-nav').getByRole('link', { name: '应用场景', exact: true }).click();
  assert(await page.locator('.menu-toggle').getAttribute('aria-expanded') === 'false', '导航跳转后自动收起');
  await page.getByRole('tab', { name: '水域巡查', exact: true }).click();
  await page.getByRole('button', { name: '查看场景说明', exact: true }).click();
  await page.getByRole('button', { name: '沟通场景需求', exact: true }).click();
  await page.screenshot({ path: 'checks/mobile-contact.png', animations: 'disabled' });
  const dialogFits = await page.locator('#contact-dialog').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height <= innerHeight; });
  assert(dialogFits, '手机预约弹窗适配视口');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: '探索产品能力', exact: true }).click();
  await page.locator('#cap-target').waitFor({ state: 'visible' });
  assert(errors.length === 0, '无 JavaScript 运行错误');
  assert(requests.every(request => request.method === 'GET'), '表单未发送网络提交');
  assert(requests.every(request => request.url.startsWith('http://127.0.0.1:4173/')), '页面无外部网络依赖');
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  return { passed: results.length, results, errors, requests: requests.length };
}
