import type { Page } from '@playwright/test'

const COLS = 'ABCDEFGHJKLMNOPQRST'

/** Clicks an intersection of the main board, given as "Q16". */
export async function clickPoint(page: Page, name: string) {
  const svg = page.locator('svg.board').first()
  const box = (await svg.boundingBox())!
  const vb = (await svg.getAttribute('viewBox'))!.split(' ').map(Number)
  const x = COLS.indexOf(name[0]), y = 19 - Number(name.slice(1))
  await page.mouse.click(box.x + ((x - vb[0]) / vb[2]) * box.width, box.y + ((y - vb[1]) / vb[3]) * box.height)
}

export async function fresh(page: Page) {
  await page.goto('./')
  await page.evaluate(async () => {
    localStorage.clear()
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase('keyval-store')
      r.onsuccess = r.onerror = r.onblocked = () => resolve()
    })
  })
  await page.reload()
  await page.locator('svg.board').waitFor()
}

/** Opens a library entry by (part of) its name. On a phone the library sits in the drawer. */
export async function openEntry(page: Page, name: string, pick = name) {
  const menu = page.getByRole('button', { name: 'Open library and menu' })
  if ((await menu.isVisible()) && !(await page.locator('.drawer').count())) await menu.click()
  // Search narrows the family tree and opens it, then the entry is clicked.
  await page.locator('.library input.search').first().fill(name)
  await page.locator('.library .lib-name:not(.fam-only)', { hasText: pick }).first().click()
}
