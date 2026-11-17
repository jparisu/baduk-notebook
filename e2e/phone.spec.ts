import { expect, test } from '@playwright/test'
import { fresh, openEntry } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('phone layout: no sideways scroll, drawer, bottom bar', async ({ page }) => {
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await expect(page.locator('.bottom-bar')).toBeVisible()
  await page.locator('.bottom-bar').getByRole('button', { name: 'Forward (→)' }).click()
  await expect(page.locator('.status')).toContainText('Move 1')
  await page.getByRole('button', { name: 'Open library and menu' }).click()
  await page.locator('.drawer .library .seg').getByText('Shapes').click()
  await openEntry(page, 'Straight four')
  await expect(page.locator('.drawer')).toHaveCount(0)
  await expect(page.locator('.status')).toContainText('Straight four')
  await page.locator('.phone-tabs').getByText('Tree').click()
  await expect(page.locator('.tree-box')).toBeVisible()
})

test('phone: tapping a next-move marker plays it', async ({ page }) => {
  await page.locator('svg.board .marker').first().tap()
  await expect(page.locator('.status')).toContainText('Move 1')
})

test('phone: tapping a reference shows its marks and tapping again hides them', async ({ page }) => {
  await page.getByRole('button', { name: 'Open library and menu' }).click()
  await openEntry(page, '3-3 invasion')
  for (let i = 0; i < 3; i++) await page.locator('.bottom-bar').getByRole('button', { name: 'Forward (→)' }).click()
  const ref = page.locator('.why-card .ref').first()
  const marks = () => page.locator('svg.board polygon').count()
  const base = await marks()
  await ref.tap()
  await expect.poll(marks).toBeGreaterThan(base)
  await ref.tap()
  await expect.poll(marks).toBe(base)
})
