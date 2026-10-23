#!/usr/bin/env bash
set -euo pipefail
export PHONE_LOCAL_BUILD=1 NEXT_PUBLIC_PHONE_LOCAL=1 NEXT_PUBLIC_SELF_HOSTED_MODE=1 NEXT_TELEMETRY_DISABLED=1
npm ci --no-audit --no-fund
npm run build
node scripts/package-phone-server.mjs
mkdir -p android-shell/app/libnode
curl -fL --retry 2 https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-android.zip -o "$RUNNER_TEMP/nodejs-mobile.zip"
unzip -q "$RUNNER_TEMP/nodejs-mobile.zip" -d android-shell/app/libnode
# Shipping only arm64 matches the vivo S17; don't package unused device runtimes.
test -f android-shell/app/libnode/bin/arm64-v8a/libnode.so
test -f android-shell/app/libnode/include/node/node.h
