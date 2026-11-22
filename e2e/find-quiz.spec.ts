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
  await expect(page.locator('.status')).toContainText('Move 3')
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

test('Find: one result per position (not the same stones after a tenuki), the board is kept, undo / redo / clear', async ({ page }) => {
  await page.locator('.top .modes').getByText('Find').click()
  await page.getByRole('button', { name: '● Black' }).click()
  await clickPoint(page, 'Q16')
  await page.getByRole('button', { name: '○ White' }).click()
  await clickPoint(page, 'R17')
  const exact = page.locator('.result', { has: page.locator('.pill-exact') })
  // The 3-3 invasion; and, with the colors swapped, the shoulder hit on the 3-3 point (listed after it).
  await expect(exact).toHaveCount(2)
  await expect(exact.first()).not.toContainText('colors swapped')
  await expect(exact.nth(1)).toContainText('shoulder hit')
  await expect(exact.nth(1)).toContainText('colors swapped')
  // Undo, redo.
  await page.getByRole('button', { name: /Undo/ }).click()
  await expect(page.locator('svg.board .stone-w')).toHaveCount(0)
  await page.getByRole('button', { name: /Redo/ }).click()
  await expect(page.locator('svg.board .stone-w')).toHaveCount(1)
  // Open the match, come back: the stones are still there.
  await exact.first().click()
  await expect(page.locator('.top .modes').getByText('Explore')).toHaveClass(/on/)
  await page.locator('.top .modes').getByText('Find').click()
  await expect(page.locator('svg.board .stone-b')).toHaveCount(1)
  await expect(page.locator('svg.board .stone-w')).toHaveCount(1)
  await page.getByRole('button', { name: 'Clear board' }).click()
  await expect(page.locator('svg.board .stone-b')).toHaveCount(0)
  await page.getByRole('button', { name: /Undo/ }).click()
  await expect(page.locator('svg.board .stone-b')).toHaveCount(1)
})
