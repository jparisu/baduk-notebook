import { expect, test } from '@playwright/test'
import { clickPoint, fresh, openEntry } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('a key described in the Known tags dialog can be added in the editor and is exported in db/tags.json', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Keys…' }).click()
  await page.getByRole('button', { name: '+ New key' }).click()
  await page.locator('#schema-label').fill('Ladder')
  await page.locator('#schema-key').fill('ladder')
  await page.locator('#schema-type').selectOption('flag')
  await page.getByRole('button', { name: 'Save tags' }).click()
  await expect(page.locator('.toast')).toContainText('Tags saved')
  await expect(page.locator('#f-pos-ladder')).toHaveCount(0) // a position only shows the tags it has
  await page.locator('#add-tag-pos').click()
  await page.locator('#add-tag-key-pos').fill('ladder')
  await page.locator('.add-tag.open').getByRole('button', { name: 'Add' }).click()
  await page.locator('#f-pos-ladder').check()
  await expect(page.locator('.pos-values')).toHaveCount(0) // the evaluation card is replaced by the editor in Edit mode
  await page.locator('.top').getByRole('button', { name: 'Editing' }).click()
  await expect(page.locator('.pos-values')).toContainText('Ladder')
  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.locator('.file-list')).toContainText('db/tags.json')
})

test('a brand-new key can be created on a move, is shown as key: value, and can be removed', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R13') // not in the databases
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.locator('#add-tag-move').click()
  await page.locator('#add-tag-key-move').fill('my plan')
  await page.getByLabel('Type of the new tag').selectOption('number')
  await page.locator('.add-tag.open').getByRole('button', { name: 'Add' }).click()
  await page.locator('#f-move-my-plan').fill('3')
  await page.locator('#f-move-my-plan').blur()
  await page.locator('.top').getByRole('button', { name: 'Editing' }).click()
  await expect(page.locator('.why-card .tags')).toContainText('My plan: 3')
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Remove My plan' }).click()
  await expect(page.locator('#f-move-my-plan')).toHaveCount(0)
  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.locator('.file-list')).not.toContainText('db/tags.json') // a plain new key needs no description
})

test('Settings hide the keys you do not want to see', async ({ page }) => {
  await openEntry(page, 'Straight three', 'Side, enclosed')
  await expect(page.locator('.pos-values')).toContainText('Black plays first')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.locator('.cat-row', { hasText: 'Black plays first' }).locator('input').uncheck()
  await page.locator('.modal .box-head').getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('.pos-values')).not.toContainText('Black plays first')
  await expect(page.locator('.pos-values')).toContainText('White plays first')
})

test('This joseki shows the tags of the sequence and keeps its About header in view', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openEntry(page, 'Bent four', 'Corner')
  // Topics are one group of chips, on one row.
  await expect(page.locator('[data-card=joseki] .f', { hasText: 'Topics' }).locator('.value')).toHaveCount(3)
  await expect(page.locator('[data-card=joseki] .fold-head', { hasText: 'About' })).toHaveCount(0) // at the start, its comments are the position's
  await openEntry(page, '3-3 invasion')
  await page.keyboard.press('ArrowRight')
  const card = (await page.locator('[data-card=joseki]').boundingBox())!
  const h = (await page.locator('[data-card=joseki] .fold-head', { hasText: 'About' }).boundingBox())!
  expect(h.y + h.height).toBeLessThanOrEqual(card.y + card.height + 1)
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
