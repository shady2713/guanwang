import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/'
const OUT = 'C:/Users/64576/Desktop/视界/runtime/e2e/shots'
const EXE = 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(1500)
await page.evaluate(() => document.querySelector('#capabilities')?.scrollIntoView())
await page.waitForTimeout(400)
await page.screenshot({ path: path.join(OUT, 'full-page.png'), fullPage: true })
const boxes = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('#capabilities > *, #capabilities .task-panel > *')) {
    const r = el.getBoundingClientRect()
    out.push({ sel: el.className || el.tagName, top: Math.round(r.top + window.scrollY), h: Math.round(r.height) })
  }
  return out
})
console.log(JSON.stringify(boxes, null, 1))
await browser.close()
