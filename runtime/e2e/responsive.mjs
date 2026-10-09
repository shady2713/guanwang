import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/'
const OUT = 'C:/Users/64576/Desktop/视界/runtime/e2e/shots'
const EXE = 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: EXE })

async function seek(page, t) {
  await page.evaluate(async (time) => {
    const v = document.querySelector('.stage__video')
    v.pause()
    v.currentTime = time
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
  }, t)
  await page.waitForTimeout(300)
}

for (const [name, size] of [
  ['mobile-390', { width: 390, height: 844 }],
  ['mobile-320', { width: 320, height: 740 }],
  ['tablet-768', { width: 768, height: 1024 }],
  ['desktop-2560', { width: 2560, height: 1440 }],
]) {
  const page = await browser.newPage({ viewport: size, isMobile: size.width < 900, hasTouch: size.width < 900 })
  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await page.evaluate(() => document.querySelector('#capabilities')?.scrollIntoView())
  await page.waitForTimeout(300)
  await seek(page, 2.4)
  const m = await page.evaluate(() => {
    const doc = document.documentElement
    const stage = document.querySelector('.stage').getBoundingClientRect()
    const controls = document.querySelector('.stage-controls').getBoundingClientRect()
    const video = document.querySelector('.stage__video').getBoundingClientRect()
    const chain = document.querySelector('.chain__list')
    const overflow = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 6)
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 60))
    return {
      scrollW: doc.scrollWidth,
      innerW: window.innerWidth,
      stage: [Math.round(stage.width), Math.round(stage.height)],
      video: [Math.round(video.width), Math.round(video.height)],
      controlsBelow: controls.top >= stage.bottom - 2,
      chainCollapsed: chain ? chain.hasAttribute('hidden') : null,
      chainToggleVisible: !document.querySelector('.chain__toggle')?.hidden,
      overflow,
    }
  })
  console.log(name, JSON.stringify(m))
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false })
  await page.evaluate(() => document.querySelector('.chain__toggle')?.scrollIntoView())
  if (await page.locator('.chain__toggle').isVisible().catch(() => false)) {
    await page.locator('.chain__toggle').click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT, `${name}-chain.png`) })
  }
  await page.close()
}
await browser.close()
