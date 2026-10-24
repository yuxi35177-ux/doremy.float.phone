#!/usr/bin/env bash
set -euo pipefail
recovery_certificate="$1"
brand="$2"
umask 077
if [ -z "${SHELL_KEYSTORE_FILE:-}" ]; then
  phone_password=$(openssl rand -hex 24)
  echo "::add-mask::$phone_password"
  keytool -genkeypair -keystore "$RUNNER_TEMP/phone-test.keystore" -storepass "$phone_password" -keypass "$phone_password" -alias phone-local -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=Float Local Android"
  printf '%s' "$phone_password" > "$RUNNER_TEMP/phone-test.password"
  {
    echo "SHELL_KEYSTORE_FILE=$RUNNER_TEMP/phone-test.keystore"
    echo "SHELL_KEYSTORE_PASSWORD=$phone_password"
    echo "SHELL_KEY_PASSWORD=$phone_password"
    echo "SHELL_KEY_ALIAS=phone-local"
  } >> "$GITHUB_ENV"
  mkdir -p release-assets
  tar -C "$RUNNER_TEMP" -czf "$RUNNER_TEMP/phone-signing.tar.gz" phone-test.keystore phone-test.password
  openssl cms -encrypt -binary -aes-256-cbc -in "$RUNNER_TEMP/phone-signing.tar.gz" -outform DER -out "release-assets/$brand-signing-recovery.p7m" "$recovery_certificate"
  rm -f "$RUNNER_TEMP/phone-signing.tar.gz" "$RUNNER_TEMP/phone-test.password"
fi
