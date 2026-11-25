import { expect, test, type Page } from "@playwright/test"
import { signIn, twoFactorPerson } from "./fixtures"
import { APP_CALLBACK, AUTH, authorize, pkce, tokenRequest, type Person } from "./helpers"
import { DOMAIN } from "./env"

const LOGGED_OUT = `https://app.${DOMAIN}/logged-out`

/** Signs in to the test app through Hydra; returns the ID token. */
async function signInToApp(page: Page, person: Person) {
  const { verifier, challenge } = pkce()
  const { callback } = await authorize(page, "e2e", "openid profile email groups", challenge)
  await signIn(page, person)
  const code = (await callback).searchParams.get("code")!
  const { body } = await tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: APP_CALLBACK, code_verifier: verifier },
    ["e2e", "e2e-secret"],
  )
  return body.id_token as string
}

/** After a full logout, a new authorization request asks to sign in again instead of passing silently. */
async function expectSignInAsked(page: Page) {
  const { challenge } = pkce()
  const query = new URLSearchParams({
    client_id: "e2e",
    response_type: "code",
    scope: "openid",
    redirect_uri: APP_CALLBACK,
    state: "after-logout-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  })
  await page.goto(`${AUTH}/oauth2/auth?${query}`)
  await expect(page).toHaveURL(new RegExp(`^${AUTH}/login`))
}

test("signing out of an app ends the session at the provider (RP-initiated logout)", async ({ page }) => {
  test.setTimeout(120_000)
  const person = await twoFactorPerson(page, ["mail-users"])
  const idToken = await signInToApp(page, person)

  const query = new URLSearchParams({ id_token_hint: idToken, post_logout_redirect_uri: LOGGED_OUT, state: "logout-state-1" })
  await page.goto(`${AUTH}/oauth2/sessions/logout?${query}`)
  await page.waitForURL((url) => url.href.startsWith(LOGGED_OUT))
  expect(new URL(page.url()).searchParams.get("state")).toBe("logout-state-1")

  await page.goto(`${AUTH}/settings`)
  await expect(page).toHaveURL(new RegExp(`^${AUTH}/login`))
  await expectSignInAsked(page)
})

test("signing out on the portal ends the apps' single sign-on too", async ({ page }) => {
  test.setTimeout(120_000)
  const person = await twoFactorPerson(page, ["mail-users"])
  await signInToApp(page, person)

  await page.goto(`${AUTH}/`)
  await page.getByRole("link", { name: /Выйти/i }).first().click()
  // Through Hydra and back: the sessions are gone by now, so the page just confirms it.
  await page.waitForURL(`${AUTH}/logout?done=1`)
  await expect(page.getByRole("heading", { name: "Выход" })).toBeVisible()

  await expectSignInAsked(page)
})
