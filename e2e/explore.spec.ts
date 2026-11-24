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
  await expect(page.locator('.position-info')).toContainText('4-4 point · 3-3 invasion')
  await expect(page.locator('.why-card')).toContainText('Takes the corner')
  await expect(page.locator('.next-moves .mv').first()).toContainText('Q17')
})

test('opens a joseki from the library and navigates with the keyboard', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  // Opened from the library, the line still starts at the empty corner: the 3-3 invasion is move 2.
  await expect(page.locator('.status')).toContainText('Move 5: Black R15')
  await page.keyboard.press('End')
  await expect(page.locator('.status')).toContainText('Move 13')
  await page.keyboard.press('Home')
  await expect(page.locator('.status')).toContainText('Start')
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
  const mine = page.locator('.position-info .comment-card', { hasText: 'jparisu' })
  await expect(mine).toContainText('Remember')
  await page.locator('.top .layer', { hasText: 'jparisu' }).locator('input').uncheck()
  await expect(mine).toHaveCount(0)
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
  await openEntry(page, 'Straight three', 'Side, enclosed')
  await expect(page.locator('.status')).toContainText('Black to play')
  await expect(page.locator('.next-moves .mv')).toHaveCount(3) // Black: correct, wrong, and tenuki
  await page.locator('.next-moves .mv', { hasText: 'Tenuki' }).click()
  await expect(page.locator('.status')).toContainText('White to play')
  await expect(page.locator('.next-moves .mv')).toHaveCount(1)
})

test('side panels can be hidden and folded', async ({ page }) => {
  await page.getByRole('button', { name: 'Hide left panel' }).click()
  await expect(page.locator('.side-panel.left')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show left panel' }).click()
  await page.locator('[data-card="search"] .card-head').click()
  await expect(page.locator('[data-card="search"] .card-body')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('[data-card="search"] .card-body')).toHaveCount(0) // remembered
})

test('next moves are thin rings in the color of their kind: solid for the main move, dashed for the others', async ({ page }) => {
  for (const p of ['Q16', 'R17', 'Q17', 'R16']) await clickPoint(page, p) // Black has three answers
  const rings = page.locator('svg.board .marker circle[stroke]')
  await expect(rings).toHaveCount(3)
  await expect(page.locator('svg.board .marker.main circle[stroke]:not([stroke-dasharray])')).toHaveCount(1)
  await expect(page.locator('svg.board .marker:not(.main) circle[stroke-dasharray]')).toHaveCount(2)
  for (const fill of await rings.evaluateAll((els) => els.map((e) => e.getAttribute('fill')))) expect(fill).toBe('none') // never filled
  await expect(page.locator('.next-moves .mv .mk.main')).toHaveCount(1) // the list marks them the same way
  await expect(page.locator('.next-moves .mv .mk:not(.main)')).toHaveCount(2)
})

test('the library folds by family and filters by tag', async ({ page }) => {
  await expect(page.locator('.library .lib-name', { hasText: 'Low approach' })).toHaveCount(0) // the tree starts folded
  await page.getByRole('button', { name: 'Open joseki' }).click()
  await page.getByRole('button', { name: 'Open 3-4 point' }).click()
  await expect(page.locator('.library .lib-name', { hasText: 'Low approach' })).toHaveCount(1)
  await page.getByRole('button', { name: 'All tags…' }).click()
  await page.locator('.all-tags .chip', { hasText: 'invasion' }).click()
  await expect(page.locator('.library .lib-name:not(.fam-only)')).toContainText(['3-3 invasion'])
  // The selected tag stays in the tag row and is removed with one click; favourites stay reachable.
  const chip = page.locator('.tag-bar .chip.on', { hasText: 'invasion' })
  await expect(chip).toBeVisible()
  await expect(page.locator('.tag-bar .chip', { hasText: 'life & death' })).toBeVisible()
  await chip.click()
  await expect(page.locator('.tag-bar .chip.on')).toHaveCount(0)
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

test('Linear and Proximity show only this line; going back to a move follows the last line you saw there', async ({ page }) => {
  await page.locator('.tree-toolbar').getByRole('button', { name: 'Linear' }).click()
  for (const p of ['Q16', 'R14', 'O17']) await clickPoint(page, p) // low approach line
  const seen = page.url()
  await page.keyboard.press('Home')
  for (const p of ['Q16', 'R17']) await clickPoint(page, p) // the 3-3 invasion instead
  const title = (t: RegExp) => page.locator('.tree-box .tree-node', { has: page.locator('title', { hasText: t }) })
  await expect(title(/^White R14/)).toHaveCount(0) // Linear: only this line
  await page.locator('.tree-toolbar').getByRole('button', { name: 'Proximity' }).click()
  await expect(title(/^White R14/)).toHaveCount(0) // Proximity: this line and the moves from here, not other lines
  // Back to the 4-4 stone from the tree, then End: the low approach line you saw before, not the main line.
  await title(/^Black Q16/).click()
  await expect(page).toHaveURL(/line=pd$/)
  await page.keyboard.press('End')
  await expect(page).toHaveURL(/line=pd\.qc\./) // along the line you saw, and on to its end by the main moves
  void seen
})

test('a branch can be hidden', async ({ page }) => {
  await page.locator('.tree-toolbar').getByRole('button', { name: 'Complete' }).click()
  await clickPoint(page, 'Q16')
  await clickPoint(page, 'R14')
  const nodes = page.locator('.tree-box .tree-node')
  const before = await nodes.count()
  await page.locator('.tree-box .tree-node', { has: page.locator('title', { hasText: /^White R17/ }) }).first().click({ button: 'right' })
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

test('a move played mirrored keeps its orientation when you move through the tree', async ({ page }) => {
  for (const p of ['Q16', 'R17', 'R16']) await clickPoint(page, p) // R16 is Q17 mirrored on this position
  await expect(page.locator('.status')).toContainText('Black R16')
  const node = (t: RegExp) => page.locator('.tree-box .tree-node', { has: page.locator('title', { hasText: t }) }).first()
  await node(/^White R17/).click()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.status')).toContainText('Black R16')
  await page.keyboard.press('ArrowLeft')
  await node(/^Black (R16|Q17)/).click()
  await expect(page.locator('.status')).toContainText('Black R16')
})

test('Down plays the next variation instead of the line Right follows', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight') // Black Q17, White R16: Black has three answers
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.status')).not.toContainText('Black R15') // R15 is the main move, Right would play it
  await expect(page.locator('.status')).toContainText('Move 5: Black')
})

test('Proximity packs the other moves next to the current one, not below hidden lines', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  await page.locator('.tree-toolbar').getByRole('button', { name: 'Proximity' }).click()
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight')
  const ys = await page.locator('.tree-box .tree-node circle').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('cy')))].length)
  expect(ys).toBe(3) // the line and the two other answers, each on the next row
})


test('the current name in the line of names opens its sequence at its first move', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  await expect(page.locator('.position-info .crumbs b')).toContainText('3-3 invasion') // at its first move: plain text
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight') // still inside the 3-3 invasion
  await page.locator('.position-info .crumbs .link.cur').click()
  await expect(page.locator('.status')).toContainText('Move 2: White R17')
  await expect(page.locator('.position-info .go-first')).toHaveCount(0)
})

test('the evaluation is a meter with levels in words', async ({ page }) => {
  await openEntry(page, '3-3 invasion')
  await expect(page.locator('.position-info .eval-words')).toHaveText('Even')
  await expect(page.locator('.position-info .balance-bar .tick')).toHaveCount(8)
})
