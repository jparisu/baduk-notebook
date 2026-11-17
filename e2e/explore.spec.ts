import { expect, test } from '@playwright/test'
import { clickPoint, fresh, openEntry } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

test('starts at the empty corner and recognizes the joseki as you play', async ({ page }) => {
  await expect(page.locator('.status')).toContainText('Empty corner')
  await expect(page.locator('.next-moves .mv')).toHaveCount(5)
  await clickPoint(page, 'Q16')
  await expect(page.locator('.status')).toContainText('4-4 point')
  await expect(page.locator('.next-moves .mv').first()).toBeVisible() // the 4-4 connector opens its joseki
  await clickPoint(page, 'R17')
  await expect(page.locator('.status')).toContainText('3-3 invasion')
  await expect(page.locator('.joseki-info')).toContainText('4-4 point · 3-3 invasion')
  await expect(page.locator('.why-card')).toContainText('Takes the corner')
  await expect(page.locator('.next-moves .mv').first()).toContainText('Q17')
})

test('opens a joseki from the library and navigates with the keyboard', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.status')).toContainText('Move 3: Black R15')
  await page.keyboard.press('End')
  await expect(page.locator('.status')).toContainText('Move 11')
})

test('reopens the last position after a reload', async ({ page }) => {
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R17')
  await expect(page.locator('.status')).toContainText('Move 2: White R17')
  await page.reload()
  await expect(page.locator('.status')).toContainText('Move 2: White R17')
})

test('hovering a reference draws its marks on the board', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  const before = await page.locator('svg.board polygon').count()
  await page.locator('.why-card .ref').first().hover()
  await expect.poll(() => page.locator('svg.board polygon').count()).toBeGreaterThan(before)
})

test('switching a database off hides its notes', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  for (const p of ['R17', 'Q17', 'R16', 'R15', 'Q18', 'P18']) await clickPoint(page, p) // the line of the jparisu notes
  await expect(page.locator('.pos-eval .note-card')).toContainText('Remember')
  await page.locator('.top .layer', { hasText: 'jparisu' }).locator('input').uncheck()
  await expect(page.locator('.pos-eval .note-card')).toHaveCount(0)
})

test('orientation controls move the corner', async ({ page }) => {
  await page.getByRole('button', { name: 'Bottom-left corner' }).click()
  await expect(page.locator('svg.board text', { hasText: /^A$/ }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Reset orientation' }).click()
  await expect(page.locator('svg.board text', { hasText: /^T$/ }).first()).toBeVisible()
})

test('theme and dark mode can be chosen in settings', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.locator('.theme-card', { hasText: 'Minimalist' }).click()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-style', 'minimal')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark')
})

test('shapes: Black plays first; a tenuki leads to White playing first', async ({ page }) => {
  await openEntry(page, 'Straight three')
  await expect(page.locator('.status')).toContainText('Black to play')
  await expect(page.locator('.next-moves .mv')).toHaveCount(3) // Black: correct, wrong, and tenuki
  await page.locator('.next-moves .mv', { hasText: 'Tenuki' }).click()
  await expect(page.locator('.status')).toContainText('White to play')
  await expect(page.locator('.next-moves .mv')).toHaveCount(1)
})

test('side panels can be hidden and folded', async ({ page }) => {
  await page.getByRole('button', { name: 'Hide left panel' }).click()
  await expect(page.locator('.side.left')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show left panel' }).click()
  await page.locator('[data-card="search"] .card-head').click()
  await expect(page.locator('[data-card="search"] .card-body')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('[data-card="search"] .card-body')).toHaveCount(0) // remembered
})

test('a good move that starts another variation is drawn dashed', async ({ page }) => {
  for (const p of ['Q16', 'R17', 'Q17', 'R16', 'R15', 'S15']) await clickPoint(page, p)
  await expect(page.locator('.next-moves .mv .mk.dash')).toHaveCount(1)
  await expect(page.locator('.next-moves .mv', { hasText: 'S14' })).toContainText('→ double hane')
  await expect(page.locator('svg.board circle[stroke-dasharray]')).toHaveCount(1)
})

test('the library folds by family and filters by tag', async ({ page }) => {
  await expect(page.locator('.library .lib-name', { hasText: 'Low approach' })).toHaveCount(0) // the tree starts folded
  await page.getByRole('button', { name: 'Open joseki' }).click()
  await page.getByRole('button', { name: 'Open 3-4 point' }).click()
  await expect(page.locator('.library .lib-name', { hasText: 'Low approach' })).toHaveCount(1)
  await page.getByRole('button', { name: /^Tags/ }).click()
  await page.locator('.tag-chips .chip', { hasText: 'invasion' }).click()
  await expect(page.locator('.library .lib-name:not(.fam-only)')).toContainText(['3-3 invasion'])
})

test('the tree has linear, proximity and complete modes, and a zoom', async ({ page }) => {
  await page.goto('./?line=pd.qc.pc.qd.qe.re')
  const nodes = () => page.locator('.tree-box .tree-node').count()
  await page.locator('.tree-toolbar').getByRole('button', { name: 'Linear' }).click()
  const linear = await nodes()
  await page.locator('.tree-toolbar').getByRole('button', { name: 'Proximity' }).click()
  const proximity = await nodes()
  await page.locator('.tree-toolbar').getByRole('button', { name: 'Complete' }).click()
  const complete = await nodes()
  expect(linear).toBeLessThan(proximity)
  expect(proximity).toBeLessThan(complete)
  const w = Number(await page.locator('.tree-box svg').getAttribute('width'))
  await page.getByRole('button', { name: 'Smaller tree' }).click()
  expect(Number(await page.locator('.tree-box svg').getAttribute('width'))).toBeLessThan(w)
  await page.reload()
  await expect(page.locator('.tree-toolbar').getByRole('button', { name: 'Complete' })).toHaveAttribute('aria-pressed', 'true') // remembered
})

test('clicking a move ahead in the linear tree goes there', async ({ page }) => {
  await page.goto('./?line=pd.qc')
  await page.locator('.tree-toolbar').getByRole('button', { name: 'Linear' }).click()
  await page.locator('.tree-box .tree-node.ahead').first().click()
  await expect(page.locator('.status')).toContainText('Move 3')
})

test('fits on a 1366×768 screen without scrolling the page', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(768)
})

test('proximity shows the line and only the other options after the current move', async ({ page }) => {
  // A-B-C… is the main line; at B the alternatives after it appear, but not their continuations.
  await page.goto('./?line=pd.qc.pc.qd.qe')
  await page.locator('.tree-toolbar').getByRole('button', { name: 'Proximity' }).click()
  const col = async (n: number) => page.locator('.tree-box .tree-node', { has: page.locator(`text="${n}"`) }).count()
  // Move 5 (B R15, hane) has one alternative at its depth in the database (W tenuki answers etc. are at 6):
  // nothing else may appear in column 5 besides the line itself.
  expect(await col(5)).toBe(1)
  // Column 6: the main move (S15) and the other White options after the hane.
  expect(await col(6)).toBeGreaterThan(1)
  // Nothing after the alternatives: column 7 only has the line.
  expect(await col(7)).toBe(1)
})

test('the tree keeps the lines you leave (the trail), and a branch can be hidden', async ({ page }) => {
  await page.locator('.tree-toolbar').getByRole('button', { name: 'Linear' }).click()
  for (const p of ['Q16', 'R17', 'Q17']) await clickPoint(page, p) // 3-3 invasion
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await clickPoint(page, 'R14') // low approach instead
  const nodes = page.locator('.tree-box .tree-node')
  await expect(page.locator('.tree-box .tree-node[data-key]', { has: page.locator('title', { hasText: 'White R17' }) })).toHaveCount(1) // the line you left
  const before = await nodes.count()
  await page.locator('.tree-box .tree-node', { has: page.locator('title', { hasText: 'White R17' }) }).click({ button: 'right' })
  await page.locator('.ctx-menu').getByRole('menuitem', { name: 'Hide this branch' }).click()
  await expect(page.locator('.tree-box .fold-badge')).toHaveCount(1)
  expect(await nodes.count()).toBeLessThan(before)
  await expect(page.locator('.status')).toContainText('low approach') // hiding another branch does not move you
})

test('selecting another child does not move the tree: the node stays where it was drawn', async ({ page }) => {
  for (const m of ['Linear', 'Proximity', 'Complete']) {
    await page.goto('./?open=joseki/4-4+point')
    await page.locator('.tree-toolbar').getByRole('button', { name: m }).click()
    if (m === 'Linear') {
      await clickPoint(page, 'R14') // low approach, then back: both lines are on the trail
      await page.keyboard.press('ArrowLeft')
      await clickPoint(page, 'R17')
      await page.keyboard.press('ArrowLeft')
    } else await page.locator('.tree-toolbar').getByRole('button', { name: m }).click()
    const node = page.locator('.tree-box .tree-node', { has: page.locator('title', { hasText: /^White R17/ }) }).first()
    // Its place in the drawing (not on the screen, which may scroll).
    const at = async () => [await node.locator('circle').last().getAttribute('cx'), await node.locator('circle').last().getAttribute('cy')]
    const before = await at()
    await node.click()
    await expect(page.locator('.status')).toContainText('Move')
    expect(await at(), m).toEqual(before)
  }
})

test('texts name the players with tokens, so Swap colors changes the words too', async ({ page }) => {
  for (const p of ['Q16', 'R17']) await clickPoint(page, p) // 3-3 invasion: the why talks about White
  const why = page.locator('.why-card .why-text').first()
  await expect(why).not.toContainText('{{')
  const before = await why.innerText()
  await page.getByRole('button', { name: /Swap colors/ }).click()
  const after = await why.innerText()
  expect(after).not.toBe(before)
  expect(after.replace(/Black/g, '§').replace(/White/g, 'Black').replace(/§/g, 'White')).toBe(before)
})
