import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../playwright.config';

test('Dashboard → Incident-Liste → Incident öffnen → Status ändern → nach Reload prüfen', async ({ page }) => {
  // Dashboard
  await page.goto('/?range=24h');
  await expect(page.getByRole('heading', { name: 'Lagebild' })).toBeVisible();
  await expect(page.getByTestId('health-panel')).toContainText('/100');
  await page.getByRole('button', { name: 'Formel' }).click();
  await expect(page.getByTestId('health-formula')).toContainText('25×kritisch');
  await expect(page.getByTestId('topology-panel').locator('.react-flow__node').first()).toBeVisible();

  // Incident list via the dashboard link
  await page.getByTestId('all-incidents').click();
  await expect(page).toHaveURL(/\/incidents\?/);
  const list = page.getByTestId('incident-list');
  await expect(list.getByTestId('incident-link').first()).toBeVisible();

  // open the first incident with status New
  await page.getByLabel('Status').selectOption('new');
  const first = list.getByTestId('incident-link').first();
  const key = (await first.textContent())!.trim();
  await first.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(key);
  await expect(page.getByTestId('current-status')).toHaveText('Neu');

  // writing requires login
  await expect(page.getByTestId('to-investigating')).toBeDisabled();
  await page.getByRole('button', { name: 'Anmelden' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Benutzer').fill('admin');
  await dialog.getByLabel('Passwort').fill(E2E_PASSWORD);
  await dialog.getByRole('button', { name: 'Anmelden' }).click();
  await expect(dialog).toBeHidden();

  // change status with a note
  await page.getByLabel('Notiz').fill('E2E: Analyse gestartet');
  await page.getByTestId('to-investigating').click();
  await expect(page.getByTestId('current-status')).toHaveText('In Bearbeitung');

  // persisted after reload (SQLite), including the history entry
  await page.reload();
  await expect(page.getByTestId('current-status')).toHaveText('In Bearbeitung');
  await expect(page.getByTestId('history')).toContainText('Untersuchung gestartet');
  await expect(page.getByTestId('history')).toContainText('E2E: Analyse gestartet');

  // the list reflects the new status as well
  await page.goto('/incidents?range=24h&status=investigating');
  await expect(page.getByTestId('incident-list')).toContainText(key);
});
