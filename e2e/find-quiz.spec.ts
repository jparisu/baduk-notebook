import { expect, test } from '@playwright/test'
import { clickPoint, fresh } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('finds a joseki placed in another corner and opens it in that orientation', async ({ page }) => {
  await page.locator('.top .modes').getByText('Find').click()
  await page.getByRole('button', { name: '● Black' }).click()
  await clickPoint(page, 'Q4')
  await clickPoint(page, 'Q3')
  await page.getByRole('button', { name: '○ White' }).click()
  await clickPoint(page, 'R3')
  const exact = page.locator('.result', { hasText: 'Exact' }).first()
  await expect(exact).toContainText('3-3 invasion')
  await expect(exact).toContainText('bottom-right corner')
  await expect(page.locator('.result', { hasText: /3-3 invasion(?! ·)/ })).toHaveCount(1) // exact match hides the rest of its label (named variations are labels of their own)
  await exact.click()
  await expect(page.locator('.status')).toContainText('Move 2')
  await expect(page.getByRole('button', { name: 'Bottom-right corner' })).toHaveClass(/on/)
})

test('loads a game from pasted SGF', async ({ page }) => {
  await page.locator('.top .modes').getByText('Find').click()
  await page.getByRole('button', { name: 'Paste SGF' }).click()
  await page.locator('#paste-sgf').fill('(;GM[1]SZ[19];B[dp];W[cq];B[dq];W[cp])')
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(page.locator('.game-nav')).toContainText('Move 4 of 4')
  await expect(page.locator('.result').first()).toContainText('3-3 invasion')
})

test('quiz shows a card, reveals the answer and schedules it', async ({ page }) => {
  await page.locator('.top .modes').getByText('Quiz').click()
  await expect(page.locator('.quiz-q')).toContainText('to play')
  await page.getByRole('button', { name: 'Show the answer' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('baduk-notebook.quiz.v1') || '{}'))
  expect(Object.keys(stored.cards).length).toBe(1)
})
