import { expect, test } from '@playwright/test'
import { clickPoint, fresh } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('adds a move, sets its category and why, and exports a patch', async ({ page }) => {
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.locator('.edit-panel')).toContainText('Editing jparisu')
  await clickPoint(page, 'R18')
  await expect(page.locator('.toast')).toContainText('Added White R18 to jparisu')
  await expect(page.locator('.status')).toContainText('Move 7: White R18')
  await page.locator('.board-wrap').click({ position: { x: 1, y: 1 } }) // focus the page, not a field
  await page.keyboard.press('1')
  await expect(page.locator('#f-node-XCAT')).toHaveValue('main')
  await page.locator('#f-node-XMW').fill('Connects. Removes the atari on {{TR:Q18|Q18}}.')
  await page.locator('#f-node-XMW').blur()
  await page.getByRole('button', { name: /Export \(1\)/ }).click()
  await expect(page.locator('.file-list')).toContainText('db/jparisu/joseki/4-4-3-3-invasion-notes.sgf')
  await expect(page.locator('.modal')).toContainText('All checks pass')
  await page.locator('summary', { hasText: 'Show the patch' }).click()
  // The personal file is stored in the bottom-left corner: R18 becomes C2 = SGF "cr".
  await expect(page.locator('.patch')).toContainText('+;W[cr]XCAT[main]')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download .patch' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.patch$/)
})

test('drafts survive a reload and can be discarded', async ({ page }) => {
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: 'Edit' }).click()
  await clickPoint(page, 'R18')
  await expect(page.locator('.toast')).toContainText('Added')
  await page.waitForTimeout(300)
  await page.reload()
  await expect(page.locator('.toast')).toContainText('Restored')
  await page.getByRole('button', { name: /Export/ }).click()
  await page.getByRole('button', { name: 'Discard all changes…' }).click()
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('discarded')
})

test('creates a database and a new shape with set-up stones', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Database that receives the edits').selectOption('__new')
  await page.locator('#db-name').fill('My shapes')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('.toast')).toContainText('Created database My shapes')
  await page.locator('.library .seg').getByText('Shapes').click()
  await page.getByRole('button', { name: 'New shape' }).click()
  await page.locator('#new-name').fill('Bent three side')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('.item.cur')).toContainText('Bent three side')
  await page.getByRole('button', { name: '● stone' }).click()
  await clickPoint(page, 'S16')
  await clickPoint(page, 'S15')
  await expect(page.locator('svg.board .stone-b')).toHaveCount(2)
  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.locator('.file-list')).toContainText('db/index.json')
  await expect(page.locator('.file-list')).toContainText('db/my-shapes/shapes/bent-three-side.sgf')
})

test('refuses an occupied point', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit' }).click()
  await clickPoint(page, 'Q16')
  await expect(page.locator('.toast')).toContainText('occupied')
})
