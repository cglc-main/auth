import { defineConfig, devices } from "@playwright/test"
import { AUTH, DOMAIN, EDGE, SPKI } from "./tests/env"

// Two ways to run:
// - the full suite against the test stack (e2e/run.sh up): *.bulbashenko.test on 127.0.0.1:443, self-made certificate;
// - the smoke tests (@smoke, read-only) against production after every deploy (deploy/smoke), E2E_* set by the Job.

export default defineConfig({
  testDir: "./tests",
  // One stack, shared state (rate limits, people): run in order.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // freshTotp waits for the next 30-second window (up to 31 s) before each code, and a test may enter two.
  timeout: 120_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  grep: process.env.E2E_SMOKE === "1" ? /@smoke/ : undefined,
  // Writable scratch for results in the read-only smoke container.
  outputDir: process.env.E2E_OUTPUT_DIR || "test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: AUTH,
    locale: "ru-RU",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The test stack's rate limiter keys on this header instead of the address (e2e/traefik/routes.yml): every
    // request comes from 127.0.0.1. Production ignores it.
    extraHTTPHeaders: { "X-Test-Client-IP": `198.51.100.${1 + Math.floor(Math.random() * 250)}` },
    launchOptions: {
      args: [
        ...(EDGE === "dns" ? [] : [`--host-resolver-rules=MAP *.${DOMAIN} ${EDGE}`]),
        ...(SPKI ? [`--ignore-certificate-errors-spki-list=${SPKI}`] : []),
      ],
    },
  },
})
