import { expect, test } from '@playwright/test'
import { clickPoint, fresh, openEntry } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('starts at the empty corner and recognizes the joseki as you play', async ({ page }) => {
  await expect(page.locator('.status')).toContainText('Empty corner')
  await expect(page.locator('.next-moves .cand')).toHaveCount(5)
  await clickPoint(page, 'Q16')
  await expect(page.locator('.status')).toContainText('3-3 invasion')
  await expect(page.locator('.pos-info')).toContainText('4-4 point · 3-3 invasion')
  await clickPoint(page, 'R17')
  await expect(page.locator('.last-move')).toContainText('Takes the corner')
  await expect(page.locator('.next-moves .cand').first()).toContainText('Q17')
})

test('opens a joseki from the library and navigates with the keyboard', async ({ page }) => {
  await page.locator('.item', { hasText: '3-3 invasion' }).first().click()
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.status')).toContainText('Move 4: Black R15')
  await page.keyboard.press('End')
  await expect(page.locator('.status')).toContainText('Move 12')
})

test('reopens the last position after a reload', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R17')
  await expect(page.locator('.status')).toContainText('Move 2: White R17')
  await page.reload()
  await expect(page.locator('.status')).toContainText('Move 2: White R17')
})

test('hovering a reference draws its marks on the board', async ({ page }) => {
  await page.locator('.item', { hasText: '3-3 invasion' }).first().click()
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  const before = await page.locator('svg.board polygon').count()
  await page.locator('.last-move .ref').first().hover()
  await expect.poll(() => page.locator('svg.board polygon').count()).toBeGreaterThan(before)
})

test('switching a database off hides its notes', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  for (const p of ['R17', 'Q17', 'R16', 'R15', 'Q18', 'P18']) await clickPoint(page, p) // the line of the jparisu notes
  await expect(page.locator('.pos-info .msg.note')).toContainText('Remember')
  await page.locator('.top .layer', { hasText: 'jparisu' }).locator('input').uncheck()
  await expect(page.locator('.pos-info .msg.note')).toHaveCount(0)
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
  await page.locator('.item', { hasText: 'Straight three' }).click()
  await expect(page.locator('.side-switch')).toBeVisible()
  await expect(page.locator('.next-moves .cand')).toHaveCount(2) // Black: T15 correct, T14 wrong
  await page.locator('.side-tabs').getByText('White plays').click()
  await expect(page.locator('.next-moves .cand')).toHaveCount(1)
  await expect(page.locator('svg.board .marker')).toHaveCount(1)
})
