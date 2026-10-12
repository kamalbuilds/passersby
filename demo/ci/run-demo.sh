#!/usr/bin/env bash
# Drives the two-emulator demo. Every stage runs even when an earlier one failed, so one CI run
# reports as much as it can; the exit code is nonzero if any stage failed.
set -uo pipefail
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
export PATH="$SDK/platform-tools:$PATH"
A=emulator-5554
B=emulator-5556
OUT="$PWD/out"
SHOTS="$OUT/shots"
mkdir -p "$SHOTS" "$OUT/video" "$OUT/logs" "$OUT/ui" "$OUT/maestro"
FAILED=()
APP=xyz.passersby.app

snap() { # snap <serial> <name>: screenshot plus UI tree, for stages that fail
  adb -s "$1" exec-out screencap -p > "$SHOTS/$2.png" 2>/dev/null || true
  adb -s "$1" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb -s "$1" pull /sdcard/ui.xml "$OUT/ui/$2.xml" >/dev/null 2>&1 || true
}
stage() {
  local name=$1; shift
  echo "::group::$name"
  if "$@"; then echo "stage $name: ok"; else echo "::error::stage $name failed"; FAILED+=("$name"); snap $A "fail_${name}_a"; snap $B "fail_${name}_b"; fi
  echo "::endgroup::"
}
flow() { # flow <serial> <who> <name>
  maestro --device "$1" test -e WHO="$2" -e SHOTS="$SHOTS" --test-output-dir "$OUT/maestro/$2_$3" "$GITHUB_WORKSPACE/demo/flows/$3.yaml"
}

prepare() {
  for s in $A $B; do
    adb -s $s install -r "$GITHUB_WORKSPACE/apks/app-release-x86_64.apk" >/dev/null || return 1
    adb -s $s install -r "$GITHUB_WORKSPACE/apks/mwallet.apk" >/dev/null || return 1
    for p in BLUETOOTH_SCAN BLUETOOTH_ADVERTISE BLUETOOTH_CONNECT POST_NOTIFICATIONS; do
      adb -s $s shell pm grant $APP android.permission.$p || true
    done
    adb -s $s shell svc power stayon true
    adb -s $s shell settings put system screen_off_timeout 2147483647
    adb -s $s shell input keyevent 82
    adb -s $s shell cmd bluetooth_manager enable || true
    adb -s $s shell cmd bluetooth_manager wait-for-state:STATE_ON || true
    echo "$s bluetooth: $(adb -s $s shell dumpsys bluetooth_manager | grep -E '^\s+(enabled|state):' | tr -s ' \n' ' ')"
  done
}

record() { # record <serial> <label>: chained 170 s segments written on the device
  adb -s "$1" shell "touch /sdcard/rec.run"
  nohup adb -s "$1" shell 'i=0; while [ -f /sdcard/rec.run ]; do i=$((i+1)); screenrecord --bit-rate 8000000 --time-limit 170 /sdcard/rec_$(printf %03d $i).mp4; done' \
    > "$OUT/logs/record_$2.log" 2>&1 &
}
stop_record() {
  for s in $A $B; do adb -s $s shell rm -f /sdcard/rec.run; adb -s $s shell pkill -INT screenrecord; done
  sleep 8
  for pair in "$A a" "$B b"; do
    set -- $pair
    adb -s "$1" shell ls /sdcard/ | grep '^rec_.*mp4$' | tr -d '\r' | while read -r f; do
      adb -s "$1" pull "/sdcard/$f" "$OUT/video/${2}_$f" >/dev/null
    done
  done
}

walletaddr() { # walletaddr <serial> <a|b>: last address the mock wallet logged on this device
  grep -h -o 'keypair (add=[1-9A-HJ-NP-Za-km-z]\{32,44\}' "$OUT/logs/logcat_$2.txt" | tail -1 | sed 's/.*add=//'
}

addresses() {
  WALLET_A=$(walletaddr $A a); WALLET_B=$(walletaddr $B b)
  echo "wallet A $WALLET_A"; echo "wallet B $WALLET_B"
  [ -n "$WALLET_A" ] && [ -n "$WALLET_B" ] && [ "$WALLET_A" != "$WALLET_B" ]
}

fund() {
  (cd "$GITHUB_WORKSPACE/demo" && node fund.mjs "$WALLET_A" "$WALLET_B") | tee "$OUT/logs/fund.txt"
}

ble_evidence() { # dumpsys snapshots under $TAG; the logcat streams already hold ReactNativeJS and bluetooth lines
  for pair in "$A a" "$B b"; do
    set -- $pair
    adb -s "$1" shell dumpsys bluetooth_manager > "$OUT/logs/dumpsys_bt_${2}_$TAG.txt" 2>&1
  done
}

adb -s $A logcat -v threadtime > "$OUT/logs/logcat_a.txt" 2>&1 &
adb -s $B logcat -v threadtime > "$OUT/logs/logcat_b.txt" 2>&1 &
record $A a
record $B b
sleep 3

stage prepare prepare
stage signin_a flow $A a signin
stage signin_b flow $B b signin
stage addresses addresses
stage fund fund
TAG=after_signin ble_evidence
stage passed_a flow $A a passed
stage passed_b flow $B b passed
TAG=after_passed ble_evidence
stage wave_a flow $A a wave
sleep 5
snap $A final_a; snap $B final_b
TAG=final ble_evidence

stop_record
pkill -f 'adb -s emulator-.* logcat' || true
echo "failed stages: ${FAILED[*]:-none}"
printf '%s\n' "${FAILED[@]:-}" > "$OUT/failed-stages.txt"
[ ${#FAILED[@]} -eq 0 ]
