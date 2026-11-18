import { expect, test, type Page } from '@playwright/test'
import { clickPoint, fresh, openEntry } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

/** Position and size of every panel, the columns and the board. */
const boxes = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-card], .wb-col, svg.board')].map((e) => {
      const r = e.getBoundingClientRect()
      return `${(e as HTMLElement).dataset.card ?? (e as HTMLElement).dataset.col ?? 'board'} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`
    }),
  )

test('panels keep their size when what they show changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  await page.locator('svg.board').waitFor()
  const before = await boxes(page)
  for (const p of ['Q16', 'R17', 'Q17', 'R16']) await clickPoint(page, p)
  await openEntry(page, 'Bent four', 'Corner')
  await page.locator('.library input.search').fill('')
  expect(await boxes(page)).toEqual(before)
})

test('a column can be resized by its bar and collapsed with the bar\'s button', async ({ page }) => {
  const right = page.locator('.wb-col[data-col=right]')
  const w0 = (await right.boundingBox())!.width
  const bar = page.locator('.wb-bar').nth(1)
  const b = (await bar.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + 200)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 - 80, b.y + 200, { steps: 4 })
  await page.mouse.up()
  expect((await right.boundingBox())!.width).toBeGreaterThan(w0 + 60)
  await page.getByRole('button', { name: 'Hide right panel' }).click()
  await expect(page.locator('.side-panel.right')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.side-panel.right')).toHaveCount(0) // remembered
  await page.getByRole('button', { name: 'Show right panel' }).click()
  await expect(page.locator('.side-panel.right')).toBeVisible()
})

test('panels in a column are resized by the bar between them', async ({ page }) => {
  const tree = page.locator('[data-card=tree]')
  const h0 = (await tree.boundingBox())!.height
  const split = page.locator('.side-panel.right .stack-split').first()
  const s = (await split.boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  await page.mouse.down()
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2 + 90, { steps: 4 })
  await page.mouse.up()
  expect((await tree.boundingBox())!.height).toBeGreaterThan(h0 + 70)
})

test('Design, Find and Quiz use the same columns', async ({ page }) => {
  for (const m of ['Design', 'Find', 'Quiz']) {
    await page.locator('.top .modes').getByText(m).click()
    await expect(page.locator('.workbench .wb-bar').first(), m).toBeVisible()
  }
})
