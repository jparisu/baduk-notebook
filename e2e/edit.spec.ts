import { expect, test } from '@playwright/test'
import { clickPoint, fresh, openEntry } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('game scenario: mark the opponent\'s unknown move as a mistake and my answer as a punishment that leaves Black better', async ({ page }) => {
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
  await page.getByRole('tab', { name: 'Position' }).click()
  await page.locator('#f-pos-evaluation').fill('0.5') // the evaluation slider (inherited from the line), toward Black
  await page.getByRole('tab', { name: /Move into it/ }).click()
  await page.locator('#f-move-comment').fill('Cuts off the hane stone.')
  await page.locator('#f-move-comment').blur()
  await page.getByRole('button', { name: /Export \(1\)/ }).click()
  await expect(page.locator('.modal')).toContainText('All checks pass')
  await page.locator('summary', { hasText: 'Show the patch' }).click()
  await expect(page.locator('.patch')).toContainText('"kind": "mistake"')
  await expect(page.locator('.patch')).toContainText('"kind": "punish"')
  await expect(page.locator('.patch')).toContainText('"comments": [')
  await expect(page.locator('.patch')).toContainText('"evaluation": 0.5')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download .patch' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.patch$/)
})

test('names a position, and the moves after it carry the name', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R13') // an approach that is not in the databases
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('tab', { name: 'Position' }).click()
  await expect(page.locator('#f-name-new')).toHaveValue('2') // the position's move number
  await expect(page.locator('.parent-chips .chip')).toHaveText(['joseki×', '4-4 point×']) // the current parents
  await page.locator('#f-name-new').fill('Low approach')
  await page.getByRole('button', { name: 'Name this position' }).click()
  await expect(page.locator('.status')).toContainText('Low approach')
  await clickPoint(page, 'O17')
  await page.getByRole('tab', { name: /Move into it/ }).click()
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

test('a position and a move can have several comments', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R13') // not in the databases
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.locator('#f-move-comment').fill('First comment on the move.')
  await page.locator('#f-move-comment').blur()
  await page.locator('#f-move-comment-new').fill('Second comment on the move.')
  await page.locator('#f-move-comment-new').blur()
  await expect(page.locator('#f-move-comment')).toHaveValue('First comment on the move.')
  await expect(page.locator('#f-move-comment-1')).toHaveValue('Second comment on the move.')
  await page.locator('.comment-item').first().getByRole('button', { name: 'Remove this comment' }).click()
  await expect(page.locator('#f-move-comment')).toHaveValue('Second comment on the move.')
})

test('life & death results name the color, and Swap colors flips them', async ({ page }) => {
  await openEntry(page, 'Straight three', 'Side, enclosed')
  const row = (label: string) => page.locator('.pos-values .f', { hasText: label })
  await expect(row('Black plays first')).toContainText('Black lives')
  await page.getByRole('button', { name: /Swap colors/ }).click()
  await expect(row('White plays first')).toContainText('White lives')
})

test('a board reference in a comment gets its words from a field, when inserted and afterwards', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R13') // not in the databases
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('tab', { name: /Move into it/ }).click()
  const box = page.locator('#f-move-comment')
  await box.fill('Look at ')
  await box.blur() // saved: the comment is now the first one
  await page.locator('#f-move-comment').click() // where the reference goes
  await page.locator('#f-move-comment').press('End')
  await page.locator('.edit-toolbar').getByRole('button', { name: 'Triangle', exact: true }).click()
  await expect(page.locator('#ref-words')).toBeVisible()
  await clickPoint(page, 'Q16')
  await page.locator('#ref-words').fill('the 4-4 stone')
  await page.locator('.edit-toolbar').getByRole('button', { name: /^Insert/ }).click()
  // Stored in the database's own orientation (jparisu keeps this corner at the bottom left): shown as Q16 here.
  await expect(page.locator('#f-move-comment')).toHaveValue(/^Look at \{\{TR:[A-T]\d+\|the 4-4 stone\}\}$/)
  // Its words can be changed afterwards, without touching the {{…}}.
  const words = page.getByLabel('Words for the triangle on Q16')
  await expect(words).toHaveValue('the 4-4 stone')
  await words.fill('this stone')
  await words.press('Enter')
  await expect(page.locator('#f-move-comment')).toHaveValue(/^Look at \{\{TR:[A-T]\d+\|this stone\}\}$/)
})
