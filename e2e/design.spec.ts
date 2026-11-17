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
  await openDesign(page, './?open=3-3-point')
  await clickPoint(page, 'S18') // White invades at the 2-2 point
  await clickPoint(page, 'R18')
  await expect(page.getByRole('button', { name: /Save to database \(2\)/ }).first()).toBeVisible()
  // The 2-2 move is the first move of the tree: right-click it.
  await page.locator('.dtree-canvas .tree-node', { hasText: 'S18' }).click({ button: 'right' })
  await page.locator('.ctx-menu').getByRole('menuitem', { name: 'Mistake', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('Saved as mistake in jparisu')
  await page.locator('.design-info').getByRole('tab', { name: 'Name' }).click()
  await page.locator('#f-name-new').fill('3-3 point · 2-2 invasion')
  await page.getByRole('button', { name: 'Name this position' }).click()
  await expect(page.locator('.design-board .status')).toContainText('2-2 invasion')
  await page.locator('.dtree-save').getByRole('button', { name: /Save to jparisu/ }).click()
  await expect(page.locator('.toast')).toContainText('Saved 1 line to jparisu')
  await page.getByRole('button', { name: /Export \/ pull request/ }).click()
  await expect(page.locator('.modal')).toContainText('Propose on GitHub')
  await expect(page.locator('.propose a', { hasText: 'Create on GitHub' }).first()).toHaveAttribute('href', /github\.com\/jparisu\/baduk-notebook\/new\/main\?filename=db%2Fjparisu/)
})

test('folding a branch hides it in Design only, with a badge', async ({ page }) => {
  await openDesign(page, './?open=3-4-point')
  const before = await page.locator('.dtree-canvas .tree-node').count()
  await page.locator('.dtree-canvas .tree-node').nth(1).click({ button: 'right' })
  await page.locator('.ctx-menu').getByRole('menuitem', { name: /Fold this branch/ }).click()
  await expect(page.locator('.dtree-canvas .fold-badge')).toHaveCount(1)
  expect(await page.locator('.dtree-canvas .tree-node').count()).toBeLessThan(before)
  await page.getByRole('button', { name: /Show folded/ }).click()
  expect(await page.locator('.dtree-canvas .tree-node').count()).toBe(before)
})

test('deleting a session move removes it; zoom and fit change the tree size', async ({ page }) => {
  await openDesign(page, './?open=3-3-point')
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
  await openDesign(page, './?open=3-3-point')
  await clickPoint(page, 'S18')
  await page.locator('.dtree-canvas .tree-node', { hasText: 'S18' }).click({ button: 'right' })
  await page.locator('.ctx-menu').getByRole('menuitem', { name: 'Mistake', exact: true }).click()
  await page.locator('.design-info').getByRole('tab', { name: 'Name' }).click()
  await page.locator('#f-name-new').fill('2-2 invasion')
  await page.getByRole('button', { name: 'Name this position' }).click()
  await page.locator('.top .modes').getByText('Explore').click()
  await page.locator('.start-bar').getByRole('button', { name: 'Empty corner' }).click() // leave the joseki, so it is not the current one
  await page.locator('.library input.search').fill('2-2')
  await expect(page.locator('.library .lib-name.mistake')).toHaveCount(0) // Good only
  await page.locator('.kind-filter').getByRole('button', { name: 'All' }).click()
  await expect(page.locator('.library .lib-name.mistake')).toHaveCount(1)
})

test('the tree shows only this joseki, from its start; you can move the start and limit how far ahead', async ({ page }) => {
  await openDesign(page, './')
  await clickPoint(page, 'Q16') // 4-4 point
  await clickPoint(page, 'R14') // low approach
  const nodes = page.locator('.dtree-canvas .tree-node')
  await expect(page.locator('.tree-start')).toContainText('Tree starts at move 1')
  const joseki = await nodes.count()
  // Moving back and forth inside the tree keeps the same tree.
  await nodes.last().click()
  expect(await nodes.count()).toBe(joseki)
  await nodes.nth(1).click()
  expect(await nodes.count()).toBe(joseki)
  // Everything: from the empty corner, other joseki included.
  await page.locator('.design').getByRole('button', { name: 'Everything' }).click()
  await expect(page.locator('.tree-start')).toHaveCount(0)
  expect(await nodes.count()).toBeGreaterThan(joseki)
  await page.locator('.design').getByRole('button', { name: 'This joseki' }).click()
  expect(await nodes.count()).toBe(joseki)
  // Only the next 3 moves after the selected one.
  await page.locator('.ahead select').selectOption('3')
  expect(await nodes.count()).toBeLessThan(joseki)
  await page.locator('.ahead select').selectOption('all')
  // Start the tree at a later move: fewer nodes; the joseki start comes back with one click.
  await nodes.nth(2).click({ button: 'right' })
  await page.locator('.ctx-menu').getByRole('menuitem', { name: /Start the tree here/ }).click()
  await expect(page.locator('.tree-start')).toContainText('move 3')
  expect(await nodes.count()).toBeLessThan(joseki)
  await page.locator('.tree-start').getByRole('button', { name: /Joseki start/ }).click()
  expect(await nodes.count()).toBe(joseki)
})
