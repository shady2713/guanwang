// probe: does the poster image actually render? (poster URL currently resolves to /media/media/...)
import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://127.0.0.1:5178'
const browser = await chromium.launch({ executablePath: 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' })
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage()
const bad = []
page.on('response', (r) => { if (r.status() >= 400 || (r.request().resourceType() === 'image')) bad.push(`${r.status()} ${r.request().resourceType()} ${r.url()}`) })
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForSelector('.stage__video', { timeout: 8000 })
await page.waitForTimeout(2500)
const info = await page.evaluate(async () => {
  const v = document.querySelector('.stage__video')
  const img = new Image()
  img.src = v.poster
  const ok = await new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); setTimeout(() => res('timeout'), 4000) })
  return { posterAttr: v.poster, posterLoads: ok, natural: img.naturalWidth, currentSrc: v.currentSrc, hasPlayed: v.currentTime }
})
console.log(JSON.stringify(info, null, 2))
console.log('image/4xx responses:', bad.filter((u) => u.includes('jpg') || u.includes('media')).join('\n  '))
await page.locator('.stage').screenshot({ path: 'C:/Users/64576/Desktop/视界/runtime/e2e/shots/probe-poster.png' })
await browser.close()