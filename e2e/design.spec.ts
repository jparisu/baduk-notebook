import { expect, test } from '@playwright/test'
import { clickPoint, fresh } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

async function openDesign(page: import('@playwright/test').Page, url: string) {
  await page.goto(url)
  await page.locator('svg.board').waitFor()
  await page.locator('.top .modes').getByText('Design').click()
  await expect(page.locator('.design')).toBeVisible()
}

test('builds a mistake line: right-click to classify, name it, save it, export it', async ({ page }) => {
  await openDesign(page, './?open=joseki/3-3+point')
  await clickPoint(page, 'S18') // White invades at the 2-2 point
  await clickPoint(page, 'R18')
  await expect(page.getByRole('button', { name: /Save to database \(2\)/ }).first()).toBeVisible()
  // The 2-2 move is the first move of the tree: right-click it.
  await page.locator('.dtree-canvas .tree-node', { hasText: 'S18' }).click({ button: 'right' })
  await page.locator('.ctx-menu').getByRole('menuitem', { name: 'Mistake', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('Saved as mistake in jparisu')
  // The selected position: one panel with its tags, its name and the move into it.
  await page.locator('.dtree-canvas .tree-node', { hasText: 'S18' }).click()
  await expect(page.locator('.design-info .move-in-head')).toContainText('White S18')
  await page.locator('.design-info').getByRole('tab', { name: 'Position' }).click()
  await page.locator('#f-name-new').fill('3-3 point · 2-2 invasion')
  await page.getByRole('button', { name: 'Name this position' }).click()
  await expect(page.locator('.design-board .status')).toContainText('2-2 invasion')
  await page.locator('.dtree-save').getByRole('button', { name: /Save to jparisu/ }).click()
  await expect(page.locator('.toast')).toContainText('Saved 1 line to jparisu')
  await page.getByRole('button', { name: /Export \/ pull request/ }).click()
  await expect(page.locator('.modal')).toContainText('Propose on GitHub')
  await expect(page.locator('.propose a', { hasText: 'Create on GitHub' }).first()).toHaveAttribute('href', /github\.com\/jparisu\/baduk-notebook\/new\/main\?filename=db%2Fjparisu/)
})

test('hiding a branch leaves a badge, and "Show hidden" brings it back', async ({ page }) => {
  await openDesign(page, './?open=joseki/3-4+point')
  await page.locator('.dtree-bar').getByRole('button', { name: 'Complete' }).click()
  const before = await page.locator('.dtree-canvas .tree-node').count()
  await page.locator('.dtree-canvas .tree-node').nth(1).click({ button: 'right' })
  await page.locator('.ctx-menu').getByRole('menuitem', { name: 'Hide this branch' }).click()
  await expect(page.locator('.dtree-canvas .fold-badge')).toHaveCount(1)
  expect(await page.locator('.dtree-canvas .tree-node').count()).toBeLessThan(before)
  await page.getByRole('button', { name: /Show hidden/ }).click()
  expect(await page.locator('.dtree-canvas .tree-node').count()).toBe(before)
})

test('deleting a session move removes it; zoom and fit change the tree size', async ({ page }) => {
  await openDesign(page, './?open=joseki/3-3+point')
  await clickPoint(page, 'S18')
  await page.locator('.dtree-canvas .tree-node', { hasText: 'S18' }).click({ button: 'right' })
  await page.locator('.ctx-menu').getByRole('menuitem', { name: /Delete this move/ }).click()
  await expect(page.locator('.toast')).toContainText('Removed from the session')
  await expect(page.locator('.dtree-canvas .tree-node', { hasText: 'S18' })).toHaveCount(0)
  const w = Number(await page.locator('.dtree-canvas svg').getAttribute('width'))
  await page.locator('.design').getByRole('button', { name: 'Smaller tree' }).click()
  expect(Number(await page.locator('.dtree-canvas svg').getAttribute('width'))).toBeLessThan(w)
})

test('the library shows mistake joseki only when asked', async ({ page }) => {
  await openDesign(page, './?open=joseki/3-3+point')
  await clickPoint(page, 'S18')
  await page.locator('.dtree-canvas .tree-node', { hasText: 'S18' }).click({ button: 'right' })
  await page.locator('.ctx-menu').getByRole('menuitem', { name: 'Mistake', exact: true }).click()
  await page.locator('.dtree-canvas .tree-node', { hasText: 'S18' }).click()
  await page.locator('.design-info').getByRole('tab', { name: 'Position' }).click()
  await page.locator('#f-name-new').fill('2-2 invasion')
  await page.getByRole('button', { name: 'Name this position' }).click()
  await page.locator('.top .modes').getByText('Explore').click()
  await page.locator('.start-bar').getByRole('button', { name: 'Empty corner' }).click() // leave the joseki, so it is not the current one
  await page.locator('.library input.search').fill('2-2')
  await expect(page.locator('.library .lib-name.mistake')).toHaveCount(0) // Good only
  await page.locator('.kind-filter').getByRole('button', { name: 'All' }).click()
  await expect(page.locator('.library .lib-name.mistake')).toHaveCount(1)
})

test('Only new shows the start position and only the moves added in Design', async ({ page }) => {
  await openDesign(page, './?open=joseki/3-3+point')
  await page.locator('.dtree-bar').getByRole('button', { name: 'Complete' }).click()
  expect(await page.locator('.dtree-canvas .tree-node').count()).toBeGreaterThan(5)
  await clickPoint(page, 'S18') // the 2-2 invasion
  await clickPoint(page, 'R18')
  await page.locator('.dtree-bar').getByRole('button', { name: 'Only new' }).click()
  await expect(page.locator('.dtree-canvas .tree-node')).toHaveCount(3) // the 3-3 stone, S18, R18
  await page.locator('.dtree-canvas .tree-node', { hasText: 'S18' }).click({ button: 'right' })
  await page.locator('.ctx-menu').getByRole('menuitem', { name: 'Mistake', exact: true }).click()
  await expect(page.locator('.dtree-canvas .tree-node')).toHaveCount(3) // still new after it is stored
})

test('position fields show the value inherited from earlier moves until you write your own', async ({ page }) => {
  await openDesign(page, './?open=joseki/4-4+point')
  await clickPoint(page, 'S12') // a new move: the position has no explanation of its own
  await page.locator('.design-info').getByRole('tab', { name: 'Position' }).click()
  // The 4-4 stone (move 1: the line starts at the empty corner) sets values this position inherits.
  await expect(page.locator('.design-info .tag-row.from-inherited .src-badge').first()).toHaveText('move 1')
})

test('the next moves are ordered in the editor; the first is the main move, and the tree and → follow it', async ({ page }) => {
  await openDesign(page, './?open=joseki/4-4+point/3-3+invasion')
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight') // Black Q17, White R16: Black has three answers
  await page.locator('.design-info').getByRole('tab', { name: 'Position' }).click()
  const rows = page.locator('.order-list .order-row')
  await expect(rows).toHaveCount(3)
  const first = (await rows.nth(0).locator('b').textContent())!, second = (await rows.nth(1).locator('b').textContent())!
  await expect(rows.nth(0)).toContainText('main')
  await rows.nth(0).getByRole('button', { name: `Move ${first} down` }).click()
  await expect(page.locator('.toast')).toContainText('Order of the next moves saved in jparisu')
  await expect(rows.nth(0).locator('b')).toHaveText(second)
  await expect(rows.nth(0)).toContainText('main')
  await page.locator('.design-board').click({ position: { x: 5, y: 5 } }) // focus off the list
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.design-board .status')).toContainText(`Move 5: Black ${second}`)
})

test('values from another database are shown with it, and can be removed', async ({ page }) => {
  await openDesign(page, './?open=joseki/4-4+point/3-3+invasion')
  await page.locator('.design-info').getByRole('tab', { name: 'Position' }).click()
  const status = page.locator('.design-info .tag-row', { has: page.locator('#f-pos-status') })
  await expect(status.locator('.src-badge')).toHaveText('general') // edits go into jparisu; the value is in general
  await expect(page.locator('#f-pos-status')).toHaveValue('progress')
  await status.getByRole('button', { name: 'Remove Status' }).click()
  await expect(page.locator('.toast')).toContainText('Status removed from general')
  await expect(page.locator('#f-pos-status')).toHaveCount(0)
  // The badge switches the edits to the database that stores a value.
  const evaluation = page.locator('.design-info .tag-row', { has: page.locator('#f-pos-evaluation') })
  await evaluation.getByRole('button', { name: 'general' }).click()
  await expect(page.locator('.toast')).toContainText('Editing into general')
  // Options explain themselves on hover.
  await page.locator('.design-info').getByRole('tab', { name: /Move into it/ }).click()
  await expect(page.locator('.cat-btn', { hasText: 'Alternative' })).toHaveAttribute('title', /unusual but valid play/)
})
