import { expect, test } from '@playwright/test'
import { clickPoint, fresh } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('plays freely outside the database, steps back and forward, and saves the line', async ({ page }) => {
  await page.locator('.item', { hasText: '3-3 invasion' }).click()
  await clickPoint(page, 'R14') // not in the database
  await expect(page.locator('.offbook-pill')).toBeVisible()
  await expect(page.locator('.msg.callout')).toHaveCount(0)
  await clickPoint(page, 'O17')
  await expect(page.locator('.status')).toContainText('Move 2: Black O17')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.offbook-pill')).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.status')).toContainText('Move 2: Black O17')
  await page.getByRole('button', { name: 'Save this line' }).click()
  await expect(page.locator('.toast')).toContainText('Saved this line to jparisu')
  await expect(page.locator('.offbook-pill')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Export \(1\)/ })).toBeVisible()
})

test('a transposition brings the messages back', async ({ page }) => {
  await page.locator('.item', { hasText: '3-3 invasion' }).click()
  await clickPoint(page, 'R16')
  await clickPoint(page, 'Q17')
  await expect(page.locator('.offbook-pill')).toBeVisible()
  await clickPoint(page, 'R17')
  await expect(page.locator('.offbook-pill')).toHaveCount(0)
  await expect(page.locator('.cand').first()).toContainText('R15')
})

test('the empty corner leads into the joseki that start from each first move', async ({ page }) => {
  await page.locator('.item', { hasText: 'Empty corner' }).click()
  await expect(page.locator('.status')).toContainText('Black to play')
  await expect(page.locator('.cand')).toHaveCount(5)
  await page.locator('.cand', { hasText: 'Q16' }).click()
  await expect(page.locator('.status')).toContainText('3-3 invasion')
  await page.locator('.cand', { hasText: 'R17' }).click()
  await expect(page.locator('.msg.callout')).toContainText('Takes the corner')
})

test('clicking a reference keeps its marks; clicking again hides them', async ({ page }) => {
  await page.locator('.item', { hasText: '3-3 invasion' }).click()
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  const ref = page.locator('.msg.callout .ref').first()
  const marks = () => page.locator('svg.board polygon').count()
  const base = await marks()
  await ref.click()
  await page.mouse.move(0, 0)
  await expect.poll(marks).toBeGreaterThan(base)
  await ref.click()
  await page.mouse.move(0, 0)
  await expect.poll(marks).toBe(base)
})
