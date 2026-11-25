# auth

Single sign-on for a small group of people: one account (a passkey or password, plus an authenticator app) for
every service on bulbashenko.com. It runs at `auth.bulbashenko.com`.

- **[Ory Kratos](https://www.ory.com/docs/kratos/ory-kratos-intro)** holds the people and runs sign-in: passkeys,
  passwords, TOTP, one-time recovery codes, email recovery and sessions.
- **[Ory Hydra](https://www.ory.com/docs/hydra/)** is the OpenID Connect provider the apps sign in with.
- **[Ory Keto](https://www.ory.com/docs/keto/)** stores group membership. Nothing else does.
- **[Ory Oathkeeper](https://www.ory.com/docs/oathkeeper/)** is the forward-auth for admin UIs that have no login of
  their own.
- **`ui/`** is a Next.js app with the look of bulbashenko.com. It renders the sign-in, settings, recovery, consent
  and logout pages, and the admin page. It is a thin layer: Kratos drives every form (fields, CSRF, redirects,
  passkey script) and the UI only draws it. Only the consent step, the logout step and the admin page call admin
  APIs.

The whole stack needs about 300 MB of RAM.

## Layout

| Path | What it is |
|---|---|
| `kustomization.yaml`, `deploy/` | The Kubernetes base: the services, routes, NetworkPolicies, disruption budgets. |
| `deploy/smoke/` | The read-only smoke Job that runs against production after every deploy. |
| `ory/kratos/` | Kratos config, the identity schema (`username`, `email`, `name`) and the email templates. |
| `ory/hydra/` | Hydra config, and one JSON file per OIDC client in `clients/`. |
| `ory/keto/` | Keto config and the permission model (`Group#members`). |
| `ory/oathkeeper/` | Forward-auth config and its rules. |
| `ui/` | The Next.js app, plus the admin scripts (`ui/scripts/`). |
| `e2e/` | The test stack (`compose.yml`) and the Playwright suite. |
| `thunderbird-addon/` | Add-on that makes Thunderbird sign in to `@bulbashenko.com` through this provider. |
| `scripts/` | Secret generator. |
| `docs/design/` | The design mockup the UI follows. |

## Sign-in

- **Every sign-in takes two factors.** The first is a passkey or the password. The second is a code from the
  authenticator app, or a one-time recovery code. Kratos counts a passkey as one factor (`aal1`), so TOTP follows
  it just as it follows the password (`required_aal: highest_available`).
- **The consent step checks again.** It rejects any sign-in whose methods (`amr`) include no second factor, so an
  account without TOTP gets no tokens at all.
- **No self-registration.** An admin creates people on the admin page and gives them a one-time recovery link and
  code in person. With those they set a password, add a passkey, link an authenticator app and save their
  recovery codes.
- **Sessions last 7 days.** They extend while in use. Changing credentials or using the admin page needs a sign-in
  from the last 15 minutes.
- **People cannot edit their own profile.** The username and email feed the tokens and the mailbox mapping, so
  only admins change them.

Groups decide access. Each OIDC client names one group in `metadata.required_group`, and the consent step refuses
everyone outside it. A client without a group refuses everyone.

| Group | Grants |
|---|---|
| `infra-admins` | The `*.int` admin UIs (forward-auth), Grafana, Flux web UI, the admin page |
| `site-admins` | The bulbashenko.com admin panel |
| `mail-users` | Mail clients and the Stalwart web UI |
| `matrix-users` | Matrix (through the Matrix Authentication Service) |
| `vpn-users` | Joining the VPN mesh (Headscale) |
| `cloud-users` | Nextcloud |

## How apps use it

Two rules keep single sign-on predictable.

**One sign-in layer per app.** An app that speaks OpenID Connect signs in through Hydra, and nothing else stands
in front of it. Only an app with no login at all goes behind Oathkeeper's forward-auth. Putting both in front of
one app makes people sign in twice.

**Signing out ends everything.** Signing out anywhere ends the session at the provider, and the apps that support
it end theirs at once.

1. The app's "sign out" sends the browser to Hydra's end-session endpoint (`/oauth2/sessions/logout`) with
   `id_token_hint`. This is OpenID Connect RP-initiated logout. The portal's own "sign out" link goes there too.
2. Hydra asks the UI (`/logout?logout_challenge=…`), which accepts. Hydra then:
   - ends its login session;
   - POSTs a logout token to every client that has a `backchannel_logout_uri` (the site, Nextcloud, Matrix).
3. The UI also ends the Kratos session, so the next app asks to sign in again.
4. Hydra sends the browser to the app's `post_logout_redirect_uris`, or to `/logout?done=1` (the default), which
   clears the Kratos cookie and lands on `/login`.

Apps without back-channel logout (Grafana, Flux, Stalwart) keep their own session until it expires. Keep those
sessions short. The admin page can end everyone's sessions at once.

## Deploy

[cglc-main/infra](https://github.com/cglc-main/infra) deploys `kustomization.yaml` into the namespace `auth` at the
released version. What the cluster provides (the Secret `auth` and its keys, Postgres, the Gateway) and how to add
the first person: [cglc-main/docs, contracts/auth.md](https://github.com/cglc-main/docs/blob/main/contracts/auth.md).

## Add a service

The checklist (OIDC client here, routes and secrets in infra):
[cglc-main/docs, contracts/adding-a-service.md](https://github.com/cglc-main/docs/blob/main/contracts/adding-a-service.md).
People and groups are managed on the admin page at `https://users.int.bulbashenko.com` (needs `infra-admins`, the
mesh and a recent sign-in).

## Tests and updates

Every pull request runs two checks:
- `ui`: typecheck, unit tests, build, audit;
- `e2e`: the whole stack in Docker (`e2e/compose.yml`) with the Playwright suite against it.

The suite covers:
- passkey sign-in;
- password plus TOTP;
- recovery codes and email recovery;
- tokens and their claims;
- group refusals;
- forward-auth;
- the admin page;
- logout;
- rate limits.

Locally:

```sh
e2e/run.sh up                 # builds and starts the stack on 127.0.0.1:443 (*.bulbashenko.test)
cd e2e && npm ci && npx playwright install chromium && npx playwright test
e2e/run.sh down
```

Renovate opens the version bumps. The Ory images move together, and so do Next.js and React. The policy is the
org's (`cglc-main/.github`): non-major updates merge themselves when the checks pass; majors wait for a person.

Pull request titles are Conventional Commits (`feat:`, `fix:`, ...; checked by `pr-title`). A merge into `main` is a
release `vX.Y.Z` with `ghcr.io/cglc-main/auth-ui` and `auth-e2e` of that version; from there it reaches production on
its own, smoke tests included, and is reverted if they fail
([delivery.md](https://github.com/cglc-main/docs/blob/main/delivery.md)).

Ory's open-source releases come one or two times a year, without backports. Security fixes reach the paid OEL
builds first. Watch the security advisories of ory/kratos, ory/hydra, ory/keto and ory/oathkeeper, and upgrade as
soon as an OSS release appears.

## Security

- **The admin APIs of Kratos, Hydra and Keto have no authentication.** They are not routed. The NetworkPolicies
  (`deploy/network-policy.yaml`) accept traffic into the namespace only:
  - from its own pods;
  - on the public ports (Kratos 4433, Hydra 4444, Oathkeeper 4456, UI 3000).
- **Brute force.** Kratos has no lockout. Traefik limits the POSTs that carry secrets (sign-in, recovery,
  settings, the token endpoint) per client address and for everyone together. Traefik sits on the host network
  with no proxy in front, so the address it sees is the client's. Kratos hashes with argon2 at most four at a time.
- **The UI sends a strict CSP with a per-request nonce.**
  - It loads no third-party resources: the fonts and three.js are bundled.
  - It blocks framing.
  - The admin page answers only on `users.int`, from the mesh. Its actions check the session, the group and
    freshness again on every call.
- **Credential data is encrypted at rest** (`ciphers: xchacha20-poly1305`). Anonymous usage statistics to Ory are
  off (`SQA_OPT_OUT`).

## Thunderbird

Thunderbird 155+ supports OAuth for any mail server, but it has to be told the provider. The add-on does exactly
that for `@bulbashenko.com`.

1. Build it with `thunderbird-addon/build.sh`.
2. Install it: Add-ons and Themes → ⚙ → Install Add-on From File.
3. Add the account, or switch an existing one to OAuth2 for both IMAP and SMTP. Thunderbird opens the sign-in page
   in the system browser (an existing sign-in there is reused) and takes the code back on a loopback port
   (RFC 8252; Hydra accepts any port of `http://127.0.0.1`).

The add-on asks for `urn:ietf:params:oauth:scope:mail`: Stalwart accepts a token on IMAP and SMTP only with that
scope. Use version 1.5.1 or later.

Not Thunderbird's own window: its engine upgrades the `http://127.0.0.1` redirect to HTTPS before Thunderbird
can catch it, so the code never arrives (and passkeys don't work there).

The add-on sets no `issuerIdentifier`: Thunderbird would then require the RFC 9207 `iss` parameter in the
response, and Hydra does not send it.

To sign in again (another account, a changed password):
1. Open Add-ons and Themes → the add-on → Options.
2. Click **Remove OAuth tokens**.

This clears the saved refresh token, the access token in memory and the open connections, and optionally the
sign-in cookies.

Phones (Thunderbird for Android, Apple Mail, FairEmail) cannot use custom OAuth yet. For them, create an app
password in the mail server's account settings (`https://mail.bulbashenko.com/account`).

## Notes

- The issuer is `https://auth.bulbashenko.com`. Apps that use discovery find every endpoint there.
- Group changes reach tokens at the next sign-in. Saving groups on the admin page revokes existing tokens for that
  reason.
- Fonts: IBM Plex Mono and Tiny5, both under the SIL Open Font License 1.1.

## License

MIT.
