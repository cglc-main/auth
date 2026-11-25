#!/usr/bin/env bash
# Generates an OIDC client secret: give it to the application and put the same value under OIDC_<NAME>_CLIENT_SECRET
# in the Secret `auth` (cglc-main/infra, SOPS). Hydra stores only a hash of it. Never commit it.
set -euo pipefail
openssl rand -base64 48 | tr -d '\n=' | tr '+/' '-_'
echo
