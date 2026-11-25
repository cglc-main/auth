import { expect, test } from "@playwright/test"
import { AUTH } from "./env"

// @smoke: read-only checks that also run against production after every deploy (deploy/smoke). They create
// nobody and change nothing. The rest of the suite needs the admin APIs and runs only against the test stack.

test("@smoke the OpenID Connect discovery document names this issuer", async ({ page }) => {
  const response = await page.goto("/.well-known/openid-configuration")
  expect(response?.status()).toBe(200)
  const discovery = JSON.parse(await page.locator("body").innerText())
  expect(discovery.issuer).toBe(AUTH)
  expect(discovery.end_session_endpoint).toBe(`${AUTH}/oauth2/sessions/logout`)
  expect(discovery.backchannel_logout_supported).toBe(true)
})

test("@smoke the login page starts a flow and shows the form", async ({ page }) => {
  await page.goto("/login")
  await expect(page).toHaveURL(/\/login\?flow=/)
  await expect(page.locator("form").first()).toBeVisible()
})

test("@smoke the UI reports healthy", async ({ page }) => {
  const response = await page.goto("/api/health")
  expect(response?.status()).toBe(200)
})
