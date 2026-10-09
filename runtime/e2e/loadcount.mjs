import { chromium } from 'playwright'

const EXE = 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1360, height: 800 } })
await page.goto('http://127.0.0.1:5178/', { waitUntil: 'load' })
await page.waitForTimeout(1500)
await page.evaluate(() => {
  window.__srcSets = []
  window.__loadCalls = 0
  const v = document.querySelector('.stage__video')
  const mo = new MutationObserver(() => window.__srcSets.push(v.getAttribute('src')))
  mo.observe(v, { attributes: true, attributeFilter: ['src'] })
  const orig = v.load.bind(v)
  v.load = function () { window.__loadCalls++; return orig() }
})
for (const i of [1, 2, 1]) {
  await page.locator('.task-tabs [role=tab]').nth(i).click()
  await page.waitForTimeout(1500)
  const s = await page.evaluate(() => ({ sets: window.__srcSets.length, loads: window.__loadCalls, list: window.__srcSets.map((x) => x.split('/').pop()) }))
  console.log(`tab ${i} -> src assignments=${s.sets} load() calls=${s.loads}`, s.list.join(','))
}
await browser.close()
