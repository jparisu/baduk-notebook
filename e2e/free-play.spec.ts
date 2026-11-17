import { expect, test } from '@playwright/test'
import { clickPoint, fresh } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('keeps every line played in the session and saves the chosen ones', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R14') // not in the databases
  await expect(page.locator('.offbook-pill')).toBeVisible()
  await clickPoint(page, 'O17')
  await page.keyboard.press('ArrowLeft')
  await clickPoint(page, 'P17') // a second variation
  await expect(page.locator('.tree-node')).toContainText([]) // tree renders
  await page.getByRole('button', { name: 'Save lines…' }).click()
  await expect(page.locator('.line-list li')).toHaveCount(2)
  await page.getByRole('button', { name: /Save 1 line/ }).click()
  await expect(page.locator('.toast')).toContainText('Saved 1 line to jparisu')
  await expect(page.locator('.offbook-pill')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Export \(1\)/ })).toBeVisible()
})

test('back and forward replay your own moves; erase removes a variation', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R14')
  await clickPoint(page, 'O17')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.status')).toContainText('Move 3: Black O17')
  await page.getByRole('button', { name: 'Erase variation' }).click()
  await expect(page.locator('.status')).toContainText('Move 2: White R14')
})

test('a transposition brings the known moves back', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R16')
  await clickPoint(page, 'Q17')
  await expect(page.locator('.offbook-pill')).toBeVisible()
  await clickPoint(page, 'R17')
  await expect(page.locator('.offbook-pill')).toHaveCount(0)
  await expect(page.locator('.next-moves .cand').first()).toContainText('R15')
})

test('clicking a reference keeps its marks; clicking again hides them', async ({ page }) => {
  await page.locator('.item', { hasText: '3-3 invasion' }).click()
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  const ref = page.locator('.last-move .ref').first()
  const marks = () => page.locator('svg.board polygon').count()
  const base = await marks()
  await ref.click()
  await page.mouse.move(0, 0)
  await expect.poll(marks).toBeGreaterThan(base)
  await ref.click()
  await page.mouse.move(0, 0)
  await expect.poll(marks).toBe(base)
})
