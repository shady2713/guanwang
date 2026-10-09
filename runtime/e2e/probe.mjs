import { chromium } from 'playwright'
const EXE = 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const failed = []
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })
await page.goto('http://127.0.0.1:5178/', { waitUntil: 'load' })
await page.waitForTimeout(1500)
const info = await page.evaluate(() => {
  const out = { stills: [], toolbar: null, tabs: [] }
  for (const img of document.querySelectorAll('.still-strip img')) {
    const r = img.getBoundingClientRect()
    out.stills.push({ src: img.getAttribute('src'), complete: img.complete, nw: img.naturalWidth, w: Math.round(r.width), h: Math.round(r.height) })
  }
  out.toolbar = document.querySelector('.stage-toolbar')?.innerHTML ?? null
  out.tabs = [...document.querySelectorAll('.task-tab')].map((t) => t.textContent)
  return out
})
console.log(JSON.stringify(info, null, 1))
console.log('failed:', failed)
await browser.close()
