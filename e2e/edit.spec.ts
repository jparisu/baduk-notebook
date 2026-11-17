import { expect, test } from '@playwright/test'
import { clickPoint, fresh, openEntry } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('game scenario: mark the opponent\'s unknown move as a mistake and my answer as a punishment worth +3', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight') // ... B R15, White to play
  await clickPoint(page, 'S16') // opponent plays something not in the list
  await expect(page.locator('.offbook-pill')).toBeVisible()
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.locator('.cat-btn', { hasText: 'Mistake' }).click()
  await expect(page.locator('.toast')).toContainText('Saved as mistake in jparisu')
  await expect(page.locator('.offbook-pill')).toHaveCount(0)
  await clickPoint(page, 'S15') // my answer
  await page.locator('.cat-btn', { hasText: 'Punishment' }).click()
  await page.locator('#f-XPB').fill('+3')
  await page.locator('#f-XPB').press('Enter')
  await page.locator('#f-node-XMW').fill('Cuts off the hane stone.')
  await page.locator('#f-node-XMW').blur()
  await page.getByRole('button', { name: /Export \(1\)/ }).click()
  await expect(page.locator('.modal')).toContainText('All checks pass')
  await page.locator('summary', { hasText: 'Show the patch' }).click()
  await expect(page.locator('.patch')).toContainText('"status": "mistake"')
  await expect(page.locator('.patch')).toContainText('"status": "punish"')
  await expect(page.locator('.patch')).toContainText('"balance": 3')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download .patch' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.patch$/)
})

test('names a position, and the moves after it carry the name', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R13') // an approach that is not in the databases
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.locator('#f-name-new').fill('Low approach')
  await page.getByRole('button', { name: 'Name this position' }).click()
  await expect(page.locator('.status')).toContainText('Low approach')
  await clickPoint(page, 'O17')
  await page.locator('.cat-btn', { hasText: 'Main move' }).click()
  await expect(page.locator('.status')).toContainText('Low approach')
})

test('drafts survive a reload and can be discarded', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R14')
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.locator('.cat-btn', { hasText: 'Alternative' }).click()
  await page.waitForTimeout(300)
  await page.reload()
  await expect(page.locator('.toast')).toContainText('Restored')
  await page.getByRole('button', { name: /Export/ }).click()
  await page.getByRole('button', { name: 'Discard all changes…' }).click()
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('discarded')
})

test('creates a database and a new shape start with set-up stones', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Database that receives the edits').selectOption('__new')
  await page.locator('#db-name').fill('My shapes')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('.toast')).toContainText('Created database My shapes')
  await page.getByRole('button', { name: 'New start position' }).click()
  await page.locator('.modal').getByRole('button', { name: 'Life & death' }).click()
  await page.locator('#new-name').fill('Comb six side')
  await expect(page.locator('#new-id')).toHaveValue('life & death/Comb six side')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('.status')).toContainText('Comb six side')
  await page.getByRole('button', { name: /Set-up black stone/ }).click()
  await clickPoint(page, 'S16')
  await clickPoint(page, 'S15')
  await expect(page.locator('svg.board .stone-b')).toHaveCount(2)
  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.locator('.file-list')).toContainText('db/my-shapes/shapes/comb-six-side.json')
})

test('tools explain themselves on hover', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('button', { name: /Wall: a barrier of stones/ })).toBeVisible()
})

test('refuses an occupied point', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'Q16')
  await expect(page.locator('.toast')).toContainText('occupied')
})

test('the eye mark is drawn on the board', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('button', { name: /Eye: a point/ }).click()
  await clickPoint(page, 'R17')
  await expect(page.locator('svg.board .mark-eye')).toHaveCount(1)
})

test('a position and a move can have several notes', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R13') // not in the databases
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.locator('#f-node-XMW').fill('First note on the move.')
  await page.locator('#f-node-XMW').blur()
  await page.locator('#f-node-XMW-new').fill('Second note on the move.')
  await page.locator('#f-node-XMW-new').blur()
  await expect(page.locator('#f-node-XMW')).toHaveValue('First note on the move.')
  await expect(page.locator('#f-node-XMW-1')).toHaveValue('Second note on the move.')
  await page.locator('.note-item').first().getByRole('button', { name: 'Remove this note' }).click()
  await expect(page.locator('#f-node-XMW')).toHaveValue('Second note on the move.')
})

test('life & death results name the color, and Swap colors flips them', async ({ page }) => {
  await openEntry(page, 'Straight three', 'Side, enclosed')
  await expect(page.locator('.pos-eval')).toContainText('Black plays first: Black lives')
  await page.getByRole('button', { name: /Swap colors/ }).click()
  await expect(page.locator('.pos-eval')).toContainText('White plays first: White lives')
})
