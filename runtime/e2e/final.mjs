import { chromium } from 'playwright'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/'
const OUT = 'C:/Users/64576/Desktop/视界/runtime/e2e/shots/final'
const EXE = 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
const browser = await chromium.launch({ executablePath: EXE })

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(OUT, '01-hero.png') })
await page.evaluate(() => document.querySelector('#capabilities')?.scrollIntoView())
await page.waitForTimeout(400)

const seek = async (t) => {
  await page.evaluate(async (time) => {
    const v = document.querySelector('.stage__video')
    v.pause(); v.currentTime = time
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
  }, t)
  await page.waitForTimeout(350)
}

await seek(2.6)
await page.locator('#capabilities').screenshot({ path: path.join(OUT, '02-industry-region.png') })
await page.locator('.segmented button', { hasText: '原始画面' }).first().click()
await page.waitForTimeout(400)
await page.locator('#capabilities').screenshot({ path: path.join(OUT, '03-industry-raw.png') })
await page.locator('.segmented button', { hasText: '对照' }).first().click()
await page.waitForTimeout(400)
await page.locator('#capabilities').screenshot({ path: path.join(OUT, '04-industry-compare.png') })
await page.locator('.segmented button', { hasText: '分析效果' }).first().click()
await page.waitForTimeout(300)
await page.locator('.stage-toolbar .segmented button', { hasText: '车辆检测' }).click()
await page.waitForTimeout(1200)
await seek(1.5)
await page.locator('#capabilities').screenshot({ path: path.join(OUT, '05-industry-detection.png') })
await page.locator('.task-tabs [role=tab]').nth(1).click()
await page.waitForTimeout(1500)
await seek(7.5)
await page.locator('#capabilities').screenshot({ path: path.join(OUT, '06-language.png') })
await page.locator('.task-tabs [role=tab]').nth(2).click()
await page.waitForTimeout(1500)
await seek(7.2)
await page.locator('#capabilities').screenshot({ path: path.join(OUT, '07-image-search.png') })

const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await m.goto(BASE, { waitUntil: 'load' })
await m.waitForTimeout(1500)
await m.evaluate(() => document.querySelector('#capabilities')?.scrollIntoView())
await m.evaluate(async () => {
  const v = document.querySelector('.stage__video'); v.pause(); v.currentTime = 2.6
  await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
})
await m.waitForTimeout(400)
await m.screenshot({ path: path.join(OUT, '08-mobile-390.png') })

const d = await browser.newPage({ viewport: { width: 1360, height: 800 } })
await d.goto(BASE + 'demo/', { waitUntil: 'load' })
await d.waitForTimeout(600)
await d.screenshot({ path: path.join(OUT, '09-demo.png') })
await browser.close()
console.log('final screenshots written to', OUT)
