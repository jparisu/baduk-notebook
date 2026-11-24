import { expect, test, type Page } from '@playwright/test'
import { fresh, openEntry } from './helpers'

test.beforeEach(async ({ page }) => fresh(page))

const openTags = async (page: Page) => {
  await page.locator('.top .modes').getByText('Tags').click()
  await expect(page.locator('.tags-list')).toBeVisible()
}
const card = (page: Page, name: string) => page.locator('.tag-card', { has: page.locator('.tag-card-text b', { hasText: new RegExp(`^${name}$`) }) })

test('the Tags tab chooses which tags Explore shows: one, none or all', async ({ page }) => {
  await openEntry(page, 'Straight three', 'Side, enclosed')
  const values = page.locator('.pos-values')
  await expect(values).toContainText('Black plays first')
  await openTags(page)
  await card(page, 'Black plays first').getByRole('button', { name: 'Hide Black plays first in Explore' }).click()
  await page.locator('.top .modes').getByText('Explore').click()
  await expect(values).not.toContainText('Black plays first')
  await expect(values).toContainText('White plays first')
  await openTags(page)
  await page.getByRole('button', { name: 'Show none' }).click()
  await page.locator('.top .modes').getByText('Explore').click()
  await expect(page.locator('.pos-values .f', { hasText: 'plays first' })).toHaveCount(0)
  await openTags(page)
  await page.getByRole('button', { name: 'Show all' }).click()
  await page.locator('.top .modes').getByText('Explore').click()
  await expect(values).toContainText('Black plays first')
})

test('a new number tag with a range, step and unit is created in a database and used in the editor', async ({ page }) => {
  await openTags(page)
  await page.getByRole('button', { name: 'New tag' }).click()
  await page.locator('#te-label').fill('Outside liberties count')
  await expect(page.locator('#te-key')).toHaveValue('outside-liberties-count')
  await page.locator('.tag-editor').getByRole('button', { name: 'Positions' }).click()
  await page.locator('.type-card', { hasText: 'Number' }).click()
  await page.locator('#te-min').fill('0')
  await page.locator('#te-max').fill('20')
  await page.locator('#te-step').fill('1')
  await page.locator('#te-unit').fill('liberties')
  await page.locator('#te-save').click()
  await expect(page.locator('.toast')).toContainText('Tag "Outside liberties count" saved in jparisu')
  await expect(card(page, 'Outside liberties count')).toBeVisible()
  // Use it on a position.
  await page.goto('./?open=joseki/4-4+point/3-3+invasion')
  await page.locator('.top .modes').getByText('Design').click()
  await page.locator('.design-info').getByRole('tab', { name: 'Position' }).click()
  await page.locator('.add-tag-chips').getByRole('button', { name: '+ Outside liberties count' }).click()
  await expect(page.locator('#f-pos-outside-liberties-count')).toHaveAttribute('max', '20')
  await page.locator('#f-pos-outside-liberties-count').fill('3')
  await page.locator('#f-pos-outside-liberties-count').blur()
  await page.locator('.top .modes').getByText('Explore').click()
  await expect(page.locator('.pos-values')).toContainText('3 liberties')
  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.locator('.file-list')).toContainText('db/jparisu/tags.json')
})

test('a database adds an option to a tag another database defines', async ({ page }) => {
  await openTags(page)
  await card(page, 'Intention').locator('.tag-card-main').click()
  await expect(page.locator('.tag-editor')).toContainText('Defined in general')
  await page.getByLabel('Database that receives the tag').selectOption('jparisu')
  await expect(page.locator('#te-label')).toBeDisabled() // jparisu can only add options
  await page.getByRole('button', { name: 'Add an option' }).click()
  await page.locator('.opt-card').last().getByLabel('Option name').fill('Tricky')
  await page.locator('.opt-card').last().getByLabel('Meaning').fill('Sets a trap.')
  await page.locator('#te-save').click()
  await expect(page.locator('.toast')).toContainText('saved in jparisu')
  await expect(page.locator('.opt-card', { hasText: 'general' })).toHaveCount(3) // the options of general stay where they are
  // The new option is offered in the editor.
  await page.goto('./?open=joseki/4-4+point/3-3+invasion')
  await page.locator('.top .modes').getByText('Design').click()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.design-info .chip', { hasText: 'Tricky' })).toHaveAttribute('title', /Sets a trap/)
  await page.getByRole('button', { name: /Export/ }).click()
  await expect(page.locator('.file-list')).toContainText('db/jparisu/tags.json')
  await expect(page.locator('.file-list')).not.toContainText('db/general/tags.json')
})
