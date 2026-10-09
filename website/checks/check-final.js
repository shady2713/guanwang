async (page) => {
  const results = {};
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'checks/mobile-320-hero.png', animations: 'disabled' });
  results.smallMobile = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, headlineHeight: document.querySelector('h1').offsetHeight }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.menu-toggle').click();
  await page.locator('#main-nav').getByRole('button', { name: '预约演示', exact: true }).click();
  await page.screenshot({ path: 'checks/mobile-contact.png', animations: 'disabled' });
  results.formFields = await page.locator('#contact-form input:visible').count();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('file:///C:/Users/64576/Desktop/%E8%A7%86%E7%95%8C/website/dist/index.html', { waitUntil: 'load' });
  await page.getByRole('tab', { name: '水域巡查', exact: true }).click();
  results.fileMode = await page.locator('#tab-water').getAttribute('aria-selected') === 'true';
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.evaluate(async () => { for (const image of document.images) { image.loading = 'eager'; await image.decode(); } });
  await page.screenshot({ path: 'checks/desktop-full.png', fullPage: true, animations: 'disabled' });
  await page.screenshot({ path: 'checks/desktop-hero.png', animations: 'disabled' });
  return results;
}
