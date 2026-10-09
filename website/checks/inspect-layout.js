async (page) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.evaluate(async () => { for (const image of document.images) { image.loading = 'eager'; await image.decode().catch(() => {}); } });
  await page.screenshot({ path: 'checks/desktop-full.png', fullPage: true, animations: 'disabled' });
  await page.screenshot({ path: 'checks/desktop-hero.png', animations: 'disabled' });
  const desktop = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth, images: [...document.images].map(image => ({ src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0 })), h1: document.querySelector('h1').innerText, brokenAnchors: [...document.querySelectorAll('a[href^="#"]')].filter(a => !document.querySelector(a.getAttribute('href'))).map(a => a.getAttribute('href')) }));
  await page.getByRole('tab', { name: '03 空间关系 目标与区域有何关系' }).click();
  await page.locator('#capabilities').screenshot({ path: 'checks/desktop-capabilities.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.evaluate(async () => { for (const image of document.images) { image.loading = 'eager'; await image.decode().catch(() => {}); } });
  await page.screenshot({ path: 'checks/mobile-full.png', fullPage: true, animations: 'disabled' });
  await page.screenshot({ path: 'checks/mobile-hero.png', animations: 'disabled' });
  const mobile = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth, overflowing: [...document.querySelectorAll('main *,header *,footer *')].filter(el => {const box = el.getBoundingClientRect(); return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);}).map(el => ({ tag: el.tagName, class: el.className })).slice(0,15) }));
  return { desktop, mobile, errors };
}
