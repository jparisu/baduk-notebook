import { expect, test } from '@playwright/test'
import { clickPoint, fresh, openEntry } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('navigates a joseki with the keyboard and shows the move explanation', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  await expect(page.locator('.status')).toContainText('Start position')
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.status')).toContainText('Move 4: Black R15')
  await expect(page.locator('.msg.callout')).toContainText('Hane at the head')
  await page.keyboard.press('End')
  await expect(page.locator('.status')).toContainText('Move 12')
})

test('hovering a reference draws its marks on the board', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  const before = await page.locator('svg.board polygon').count()
  await page.locator('.msg.callout .ref').first().hover()
  await expect.poll(() => page.locator('svg.board polygon').count()).toBeGreaterThan(before)
})

test('switching a database off hides its lines and notes', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  for (const p of ['R17', 'Q17', 'R16', 'R15', 'Q18', 'P18']) await clickPoint(page, p) // the line of the jparisu notes
  await expect(page.locator('.status')).toContainText('Move 6')
  await expect(page.locator('.msg.note')).toContainText('Remember')
  await page.locator('.top .layer', { hasText: 'jparisu' }).locator('input').uncheck()
  await expect(page.locator('.msg.note')).toHaveCount(0)
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
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-style', 'minimal')
})

test('shapes show a result for each side', async ({ page }) => {
  await page.locator('.library .seg').getByText('Shapes').click()
  await page.locator('.item', { hasText: 'Straight three' }).click()
  await expect(page.locator('.right')).toContainText('Black first')
  await expect(page.locator('.cand')).toHaveCount(3)
})
