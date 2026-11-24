import { expect, test } from '@playwright/test'
import { clickPoint, fresh, openEntry } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('a brand-new key can be created on a move, is shown as key: value, and can be removed', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R13') // not in the databases
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.locator('#add-tag-move').click()
  await page.locator('#add-tag-key-move').fill('my plan')
  await page.getByLabel('Type of the new tag').selectOption('number')
  await page.locator('.new-key').getByRole('button', { name: 'Add' }).click()
  await page.locator('#f-move-my-plan').fill('3')
  await page.locator('#f-move-my-plan').blur()
  await page.locator('.top').getByRole('button', { name: 'Editing' }).click()
  await expect(page.locator('.why-card .tags')).toContainText('My plan: 3')
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Remove My plan' }).click()
  await expect(page.locator('#f-move-my-plan')).toHaveCount(0)
  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.locator('.file-list')).not.toContainText('tags.json') // a plain new key needs no description
})

test('the Position panel shows the position with the tags of its sequence', async ({ page }) => {
  await openEntry(page, 'Bent four', 'Corner')
  const panel = page.locator('[data-card=position]')
  // Topics are one group of chips, on one row.
  await expect(panel.locator('.f', { hasText: 'Topics' }).locator('.value')).toHaveCount(3)
  await openEntry(page, '3-3 invasion')
  await page.keyboard.press('ArrowRight')
  await expect(panel).toContainText('Sequence')
  await expect(panel.locator('.f', { hasText: 'Main move' })).toHaveCount(0) // not shown in the panel by default
  await expect(panel.locator('.f', { hasText: 'Sources' }).locator('a').first()).toHaveAttribute('href', 'https://senseis.xmp.net/?33PointInvasion')
  await expect(page.locator('[data-card=joseki]')).toHaveCount(0)
})

test('a move from another database has a line in its color under the tree node; Settings change that color', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R13') // not in the databases
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.locator('.cat-btn', { hasText: 'Alternative' }).click() // stored in jparisu
  const line = page.locator('.tree-box .db-line')
  await expect(line).toHaveCount(1)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Color of jparisu').fill('#00ff00')
  await page.locator('.modal .box-head').getByRole('button', { name: 'Close' }).click()
  await expect(line).toHaveAttribute('fill', '#00ff00')
  await expect(page.locator('.top .layer', { hasText: 'jparisu' }).locator('.swatch')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
})
