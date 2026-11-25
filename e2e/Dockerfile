# The suite as an image, for the smoke Job that runs after every production deploy (deploy/smoke): Playwright with
# Chromium, the tests and the config. Built by .github/workflows/release.yml next to auth-ui, same tag (the release version).
FROM mcr.microsoft.com/playwright:v1.64.0-noble
ARG REVISION=unknown
WORKDIR /e2e
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY playwright.config.ts ./
COPY tests ./tests
COPY run-in-cluster.sh ./
# Plain `list` output into the Job log (CI=1 would also write an HTML report into the read-only image).
ENV HOME=/tmp E2E_OUTPUT_DIR=/tmp/results E2E_REVISION=$REVISION
USER pwuser
CMD ["/e2e/run-in-cluster.sh"]
