#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${E2E_BASE_URL:-http://localhost:3000}"

cleanup() {
  playwright-cli close || true
}
trap cleanup EXIT

echo "==> Opening $BASE_URL/login"
playwright-cli open "$BASE_URL/login" >/dev/null
playwright-cli run-code "async (page) => { await page.setViewportSize({ width: 1440, height: 900 }); }" >/dev/null

# 1. Citizen flow: Login -> Dashboard -> Privacy Deletion Request
echo "==> Verifying Citizen flow"
playwright-cli run-code "async (page) => {
  await page.fill('#email', 'citizen@campus.demo');
  await page.fill('#password', 'demo1234');
  await page.click('button[type=\"submit\"]');
  await page.waitForURL('**/citizen**', { timeout: 15000 });
}"
playwright-cli goto "$BASE_URL/citizen/privacy" >/dev/null
playwright-cli run-code "async (page) => {
  await page.waitForSelector('text=Privacy and consent', { timeout: 10000 });
  const btn = page.locator('button:has-text(\"Request data deletion\")');
  await btn.click();
  await page.waitForSelector('text=Deletion request logged', { timeout: 10000 });
}"

# 2. Operator flow: Login -> Command Center -> Map + Queue
echo "==> Verifying Operator Command Center"
playwright-cli goto "$BASE_URL/login" >/dev/null
playwright-cli run-code "async (page) => {
  await page.fill('#email', 'operator@campus.demo');
  await page.fill('#password', 'demo1234');
  await page.click('button[type=\"submit\"]');
  await page.waitForURL('**/operator**', { timeout: 15000 });
  await page.waitForSelector('text=Live Dashboard', { timeout: 10000 });
  await page.waitForSelector('text=Live fleet', { timeout: 10000 });
}"

# 3. Responder flow: Login -> Responder Dashboard -> Status
echo "==> Verifying Responder workspace"
playwright-cli goto "$BASE_URL/login" >/dev/null
playwright-cli run-code "async (page) => {
  await page.fill('#email', 'responder@campus.demo');
  await page.fill('#password', 'demo1234');
  await page.click('button[type=\"submit\"]');
  await page.waitForURL('**/responder**', { timeout: 15000 });
  await page.waitForSelector('text=Live GPS telemetry', { timeout: 10000 });
}"
playwright-cli goto "$BASE_URL/responder/status" >/dev/null
playwright-cli run-code "async (page) => {
  await page.waitForSelector('text=Capabilities', { timeout: 10000 });
}"

# 4. Admin flow: Login -> Campus Geofence Boundary Editor
echo "==> Verifying Admin Campus Geofence Editor"
playwright-cli goto "$BASE_URL/login" >/dev/null
playwright-cli run-code "async (page) => {
  await page.fill('#email', 'admin@campus.demo');
  await page.fill('#password', 'demo1234');
  await page.click('button[type=\"submit\"]');
  await page.waitForURL('**/admin**', { timeout: 15000 });
}"
playwright-cli goto "$BASE_URL/admin/geofence" >/dev/null
playwright-cli run-code "async (page) => {
  await page.waitForSelector('text=Click-to-add', { timeout: 10000 });
  await page.waitForSelector('text=Save campus boundary', { timeout: 10000 });
}"

echo "==> Checking console errors"
ERR_OUT=$(playwright-cli console error || true)
echo "$ERR_OUT" | grep -q 'Returning 0 messages for level "error"' || {
  echo "Unexpected console errors detected:"
  echo "$ERR_OUT"
  exit 1
}

echo "PLAYWRIGHT_SMOKE_OK"
