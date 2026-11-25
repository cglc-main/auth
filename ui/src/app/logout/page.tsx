import { redirect } from "next/navigation"
import { Panel, Shell } from "@/components/Shell"
import { env } from "@/lib/env"
import { cookieHeader, logoutUrl, type SearchParams } from "@/lib/flows"
import { getT } from "@/lib/locale"
import { frontend, identities, oauth2 } from "@/lib/ory"

/**
 * Signing out ends everything, wherever it starts:
 *
 * 1. An app's "sign out" sends the browser to Hydra's end-session endpoint (RP-initiated logout); the portal's own
 *    "sign out" link sends it there too (no challenge, no `done`).
 * 2. Hydra comes back here with ?logout_challenge=. Accepting it ends Hydra's login session and notifies every app
 *    that has a back-channel logout URL. The Kratos session is ended here as well, so the next app asks to sign in.
 * 3. Hydra continues to the app's post-logout URL, or (portal, or an app without one) to urls.post_logout_redirect:
 *    this page with ?done=1, which clears the Kratos cookie through Kratos' own logout and lands on /login.
 */
export default async function LogoutPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const challenge = typeof params.logout_challenge === "string" ? params.logout_challenge : undefined
  if (challenge) {
    const { redirect_to } = await oauth2().acceptOAuth2LogoutRequest({ logoutChallenge: challenge })
    await endKratosSession()
    redirect(redirect_to)
  }
  if (params.done === undefined) redirect(`${env.publicUrl}/oauth2/sessions/logout`)

  const url = await logoutUrl()
  if (url) redirect(url)

  const { t } = await getT()
  return (
    <Shell eye="ok">
      <Panel path="~/identity/logout" step="SIGN OUT" title={t("logout.title")} desc={t("logout.desc")}>
        <a className="btn btn-secondary" href="/login" style={{ alignSelf: "flex-start" }}>
          <span>{t("error.back")}</span>
        </a>
      </Panel>
    </Shell>
  )
}

/** Revokes this browser's Kratos session, if it still has one. */
async function endKratosSession() {
  try {
    const session = await frontend().toSession({ cookie: await cookieHeader() })
    await identities().disableSession({ id: session.id })
  } catch {
    // No session (already ended, or the browser never had one here): nothing to end.
  }
}
