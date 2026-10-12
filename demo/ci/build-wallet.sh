#!/usr/bin/env bash
# Builds solana-mobile/mock-mwa-wallet at a pinned commit into $GITHUB_WORKSPACE/mwallet.apk.
# One source edit: the wallet's key store demands a fresh device credential every 15 minutes,
# which a headless emulator without a lock screen cannot give, so the key is created without it.
set -euo pipefail
REF=d444aff0c72dadd0f5c442ea2bc3559b62916e01
OUT="${GITHUB_WORKSPACE:-$PWD}/mwallet.apk"
git clone https://github.com/solana-mobile/mock-mwa-wallet /tmp/wallet
cd /tmp/wallet
git checkout "$REF"
F=app/src/main/java/com/solana/mwallet/usecase/EncryptionUseCase.kt
grep -q 'setUserAuthenticationRequired(true)' "$F"
sed -i 's/setUserAuthenticationRequired(true)/setUserAuthenticationRequired(false)/' "$F"
! grep -q 'setUserAuthenticationRequired(true)' "$F"
echo "sdk.dir=$ANDROID_HOME" > local.properties
chmod +x gradlew
./gradlew :app:assembleDebug --no-daemon
cp app/build/outputs/apk/debug/app-debug.apk "$OUT"
