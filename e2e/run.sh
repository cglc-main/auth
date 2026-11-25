#!/usr/bin/env bash
# The test stack (e2e/compose.yml), locally and in CI. Usage: e2e/run.sh up | test [args] | down | logs [service]
set -euo pipefail
cd "$(dirname "$0")"
compose=(docker compose -f compose.yml)

case "${1:-}" in
  up)
    # The forward-auth rules are the production rules on the test domain.
    sed 's/bulbashenko\.com/bulbashenko.test/g' ../ory/oathkeeper/rules.yml > ory/rules.test.yml
    # A certificate for *.bulbashenko.test. Chromium trusts exactly this key (--ignore-certificate-errors-spki-list,
    # see playwright.config.ts), so pages are secure contexts and WebAuthn works.
    if [ ! -f certs/tls.crt ]; then
      mkdir -p certs
      openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 3650 \
        -keyout certs/tls.key -out certs/tls.crt -subj "/CN=bulbashenko.test" \
        -addext "subjectAltName=DNS:bulbashenko.test,DNS:*.bulbashenko.test,DNS:*.int.bulbashenko.test" 2>/dev/null
      openssl x509 -in certs/tls.crt -pubkey -noout | openssl pkey -pubin -outform der \
        | openssl dgst -sha256 -binary | base64 > certs/spki.txt
    fi
    "${compose[@]}" up -d --build
    # `--wait` treats any exited container as a failure, even a one-shot that succeeded. Wait for the long-running
    # services, then check the client sync's exit code on its own.
    "${compose[@]}" up -d --wait --wait-timeout 300 sso-ui traefik oathkeeper mailpit whoami
    # `docker wait` also answers for a container that has already exited (`compose wait` does not).
    status=$(docker wait "$("${compose[@]}" ps -aq hydra-clients)")
    [ "$status" = "0" ] || { echo "hydra-clients exited with $status" >&2; exit 1; }
    ;;
  test)
    npx playwright test "${@:2}"
    ;;
  down)
    "${compose[@]}" down -v --remove-orphans
    ;;
  logs)
    "${compose[@]}" logs "${@:2}"
    ;;
  *)
    "${compose[@]}" "$@"
    ;;
esac
