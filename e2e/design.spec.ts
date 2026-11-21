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
  await expect(page.locator('.design-info .move-in')).toContainText('White S18')
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
  await expect(page.locator('.design-info .hint.inherited').first()).toContainText('Inherited from the start')
})

test('the main move of a position is chosen in the editor, and the tree and → follow it', async ({ page }) => {
  await openDesign(page, './?open=joseki/4-4+point/3-3+invasion')
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight') // Black Q17, White R16: Black has three answers
  const main = page.locator('#f-pos-main')
  const before = await main.locator('option:checked').textContent()
  const other = (await main.locator('option').allTextContents()).find((t) => t !== before)!
  await main.selectOption({ label: other })
  await expect(page.locator('.toast')).toContainText('Main move saved in jparisu')
  await expect(main.locator('option:checked')).toHaveText(other)
  await main.blur() // arrow keys go to the board, not to the list
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.design-board .status')).toContainText(`Move 3: Black ${other.split(' ')[0]}`)
})
