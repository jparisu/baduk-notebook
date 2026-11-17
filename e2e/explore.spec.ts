import { expect, test } from '@playwright/test'
import { clickPoint, fresh, openEntry } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('starts at the empty corner and recognizes the joseki as you play', async ({ page }) => {
  await expect(page.locator('.status')).toContainText('Empty corner')
  await expect(page.locator('.next-moves .mv')).toHaveCount(5)
  await clickPoint(page, 'Q16')
  await expect(page.locator('.status')).toContainText('4-4 point')
  await expect(page.locator('.next-moves .mv').first()).toBeVisible() // the 4-4 connector opens its joseki
  await clickPoint(page, 'R17')
  await expect(page.locator('.status')).toContainText('3-3 invasion')
  await expect(page.locator('.joseki-info')).toContainText('4-4 point · 3-3 invasion')
  await expect(page.locator('.why-card')).toContainText('Takes the corner')
  await expect(page.locator('.next-moves .mv').first()).toContainText('Q17')
})

test('opens a joseki from the library and navigates with the keyboard', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.status')).toContainText('Move 3: Black R15')
  await page.keyboard.press('End')
  await expect(page.locator('.status')).toContainText('Move 11')
})

test('reopens the last position after a reload', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R17')
  await expect(page.locator('.status')).toContainText('Move 2: White R17')
  await page.reload()
  await expect(page.locator('.status')).toContainText('Move 2: White R17')
})

test('hovering a reference draws its marks on the board', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  const before = await page.locator('svg.board polygon').count()
  await page.locator('.why-card .ref').first().hover()
  await expect.poll(() => page.locator('svg.board polygon').count()).toBeGreaterThan(before)
})

test('switching a database off hides its notes', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  for (const p of ['R17', 'Q17', 'R16', 'R15', 'Q18', 'P18']) await clickPoint(page, p) // the line of the jparisu notes
  await expect(page.locator('.pos-eval .note-card')).toContainText('Remember')
  await page.locator('.top .layer', { hasText: 'jparisu' }).locator('input').uncheck()
  await expect(page.locator('.pos-eval .note-card')).toHaveCount(0)
})

test('orientation controls move the corner', async ({ page }) => {
  await page.getByRole('button', { name: 'Bottom-left corner' }).click()
  await expect(page.locator('svg.board text', { hasText: /^A$/ }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Reset orientation' }).click()
  await expect(page.locator('svg.board text', { hasText: /^T$/ }).first()).toBeVisible()
})

test('theme and dark mode can be chosen in settings', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.locator('.theme-card', { hasText: 'Minimalist' }).click()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-style', 'minimal')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark')
})

test('shapes: Black and White moves are shown separately', async ({ page }) => {
  await page.locator('.library .seg').getByText('Shapes').click()
  await openEntry(page, 'Straight three')
  await expect(page.locator('.side-switch')).toBeVisible()
  await expect(page.locator('.next-moves .mv')).toHaveCount(2) // Black: T15 correct, T14 wrong
  await page.locator('.side-tabs').getByText('White plays').click()
  await expect(page.locator('.next-moves .mv')).toHaveCount(1)
  await expect(page.locator('svg.board .marker')).toHaveCount(1)
})

test('side panels can be hidden and folded', async ({ page }) => {
  await page.getByRole('button', { name: 'Hide left panel' }).click()
  await expect(page.locator('.side.left')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show left panel' }).click()
  await page.locator('[data-card="search"] .card-head').click()
  await expect(page.locator('[data-card="search"] .card-body')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('[data-card="search"] .card-body')).toHaveCount(0) // remembered
})

test('a good move that starts another variation is drawn dashed', async ({ page }) => {
  for (const p of ['Q16', 'R17', 'Q17', 'R16', 'R15', 'S15']) await clickPoint(page, p)
  await expect(page.locator('.next-moves .mv .mk.dash')).toHaveCount(1)
  await expect(page.locator('.next-moves .mv', { hasText: 'S14' })).toContainText('→ double hane')
  await expect(page.locator('svg.board circle[stroke-dasharray]')).toHaveCount(1)
})

test('the library folds by family and filters by tag', async ({ page }) => {
  await expect(page.locator('.library .lib-name', { hasText: 'Low approach' })).toHaveCount(0) // families start folded
  await page.getByRole('button', { name: 'Open 3-4 point' }).click()
  await expect(page.locator('.library .lib-name', { hasText: 'Low approach' })).toHaveCount(1)
  await page.getByRole('button', { name: /^Tags/ }).click()
  await page.locator('.tag-chips .chip', { hasText: 'invasion' }).click()
  await expect(page.locator('.library .lib-name:not(.fam-only)')).toContainText(['3-3 invasion'])
})

test('the tree shows only a few moves around the current one', async ({ page }) => {
  for (const p of ['Q16', 'R17', 'Q17', 'R16', 'R15', 'S15']) await clickPoint(page, p)
  await expect(page.locator('.tree-box text', { hasText: '⋯3' })).toHaveCount(1)
  expect(await page.locator('.tree-box .tree-node').count()).toBeLessThan(40)
})

test('fits on a 1366×768 screen without scrolling the page', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(768)
})
