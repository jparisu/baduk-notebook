import { expect, test } from '@playwright/test'
import { clickPoint, fresh, openEntry } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('a new key added in the Keys dialog can be set in the editor and is exported in db/schema.json', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Keys…' }).click()
  await page.getByRole('button', { name: '+ New key' }).click()
  await page.locator('#schema-label').fill('Ladder')
  await page.locator('#schema-key').fill('ladder')
  await page.locator('#schema-type').selectOption('flag')
  await page.getByRole('button', { name: 'Save keys' }).click()
  await expect(page.locator('.toast')).toContainText('Keys saved')
  await page.locator('#f-ladder').check()
  await expect(page.locator('.pos-values')).toHaveCount(0) // the evaluation card is replaced by the editor in Edit mode
  await page.locator('.top').getByRole('button', { name: 'Editing' }).click()
  await expect(page.locator('.pos-values')).toContainText('Ladder')
  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.locator('.file-list')).toContainText('db/schema.json')
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

test('This joseki keeps its sub-panel headers in view, whatever the content', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await openEntry(page, 'Bent four', 'Corner')
  const card = (await page.locator('[data-card=joseki]').boundingBox())!
  for (const t of ['Description', 'Details']) {
    const h = (await page.locator('[data-card=joseki] .fold-head', { hasText: t }).boundingBox())!
    expect(h.y + h.height, t).toBeLessThanOrEqual(card.y + card.height + 1)
  }
  // Tags are one group of chips, on one row.
  await expect(page.locator('[data-card=joseki] .f', { hasText: 'Tags' }).locator('.value')).toHaveCount(3)
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
