import { expect, test } from '@playwright/test'
import { clickPoint, fresh } from './helpers'

test('a link opens a joseki at its first move', async ({ page }) => {
  await page.goto('./?open=joseki/3-4+point/Low+approach')
  await expect(page.locator('.status')).toContainText('3-4 point · low approach')
  await expect(page.locator('.status')).toContainText('Move 2: White') // the line starts at the empty corner
  await expect(page.locator('.crumbs')).toContainText('Empty corner')
})

test('the address bar follows the position, and that link opens the same position elsewhere', async ({ page, browser }) => {
  await fresh(page)
  for (const p of ['Q16', 'R17', 'Q17']) await clickPoint(page, p)
  await expect(page.locator('.status')).toContainText('Move 3: Black Q17')
  await expect(page).toHaveURL(/\?line=pd\.qc\.pc$/)
  const url = page.url()
  const other = await (await browser.newContext()).newPage()
  await other.goto(url)
  await expect(other.locator('.status')).toContainText('Move 3: Black Q17')
  await expect(other.locator('.status')).toContainText('3-3 invasion')
})

test('the orientation is part of the link', async ({ page }) => {
  await page.goto('./?open=joseki/3-3+point&view=bl-s')
  await expect(page.getByRole('button', { name: 'Bottom-left corner' })).toHaveClass(/on/)
  await expect(page.getByRole('button', { name: /Swap colors/ })).toHaveClass(/on/)
})

test('a link to an unknown joseki says so', async ({ page }) => {
  await page.goto('./?open=no-such-joseki')
  await expect(page.locator('.toast')).toContainText('not in the databases')
})

test('copy link buttons copy the link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./?open=joseki/4-4+point/Low+approach')
  await page.getByRole('button', { name: 'Copy link to this position' }).click()
  await expect(page.locator('.toast')).toContainText('Link to this position copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('?open=joseki/4-4+point/Low+approach')
  await page.locator('.position-info').getByRole('button', { name: 'Copy link to this sequence' }).click()
  await expect(page.locator('.toast')).toContainText('copied')
})
