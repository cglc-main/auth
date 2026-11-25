// Where the suite runs. Defaults: the local and CI test stack (e2e/run.sh): *.bulbashenko.test on 127.0.0.1 with a
// self-made certificate, admin APIs on loopback. The production smoke Job (deploy/smoke) sets E2E_DOMAIN=bulbashenko.com,
// E2E_EDGE=dns (plain DNS, no address mapping) and E2E_TEST_CERT=0, and runs only the @smoke tests.
import { readFileSync } from "node:fs"

const env = (name: string, fallback: string) => process.env[name] || fallback

export const DOMAIN = env("E2E_DOMAIN", "bulbashenko.test")
/** Where the *.DOMAIN hosts are served (the browser and the token client connect here); "dns" resolves normally. */
export const EDGE = env("E2E_EDGE", "127.0.0.1")
/** The test stack's certificate; production has a publicly trusted one. */
export const TEST_CERT = env("E2E_TEST_CERT", "1") === "1"
export const KRATOS_ADMIN = env("E2E_KRATOS_ADMIN", "http://127.0.0.1:4434")
export const KETO_WRITE = env("E2E_KETO_WRITE", "http://127.0.0.1:4467")
export const MAILPIT = env("E2E_MAILPIT", "http://127.0.0.1:8025")

export const AUTH = `https://auth.${DOMAIN}`
export const APP_CALLBACK = `https://app.${DOMAIN}/callback`
export const USERS = `https://users.int.${DOMAIN}/`
export const GARAGE = `https://garage.int.${DOMAIN}/`
/** DOMAIN as a regular expression fragment. */
export const DOMAIN_RE = DOMAIN.replace(/\./g, "\\.")

export const CA = TEST_CERT ? readFileSync(new URL("../certs/tls.crt", import.meta.url)) : undefined
export const SPKI = TEST_CERT ? readFileSync(new URL("../certs/spki.txt", import.meta.url), "utf8").trim() : undefined
