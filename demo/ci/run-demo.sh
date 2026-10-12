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
  adb -s "$1" shell uiautomator dump /data/local/tmp/ui.xml >/dev/null 2>&1 && adb -s "$1" pull /data/local/tmp/ui.xml "$OUT/ui/$2.xml" >/dev/null 2>&1 || true
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

PIN=1234

unlock() { # unlock <serial>: setting a credential locks the device at once; wake it, open the bouncer, enter the PIN
  adb -s "$1" shell locksettings set-pin "$PIN"
  sleep 2
  adb -s "$1" shell input keyevent 224
  adb -s "$1" shell wm dismiss-keyguard
  sleep 2
  adb -s "$1" shell input text "$PIN"
  sleep 1
  adb -s "$1" shell input keyevent 66
  sleep 3
  adb -s "$1" shell input keyevent 3
  echo "$1 keyguard: $(adb -s "$1" shell dumpsys window policy | grep -iE 'showing' | head -2 | tr -s ' \n' ' ')"
}

prepare() {
  for s in $A $B; do
    adb -s $s install -r "$GITHUB_WORKSPACE/apks/app-release-x86_64.apk" >/dev/null || return 1
    adb -s $s install -r -g "$GITHUB_WORKSPACE/apks/mwallet.apk" >/dev/null || return 1
    for p in BLUETOOTH_SCAN BLUETOOTH_ADVERTISE BLUETOOTH_CONNECT POST_NOTIFICATIONS; do
      adb -s $s shell pm grant $APP android.permission.$p || true
    done
    adb -s $s shell svc power stayon true
    adb -s $s shell settings put system screen_off_timeout 2147483647
    adb -s $s shell settings put global hide_error_dialogs 1
    adb -s $s shell settings put secure show_ime_with_hard_keyboard 0
    adb -s $s shell input keyevent 82
    unlock $s
    adb -s $s shell cmd bluetooth_manager enable || true
    adb -s $s shell cmd bluetooth_manager wait-for-state:STATE_ON || true
    echo "$s bluetooth: $(adb -s $s shell dumpsys bluetooth_manager | grep -E '^\s+(enabled|state):' | tr -s ' \n' ' ')"
  done
}

wallet_auth() { # wallet_auth <serial> <who>: authenticate the mock wallet once with the device PIN
  adb -s "$1" logcat -G 16M
  adb -s "$1" logcat -c
  maestro --device "$1" test -e WHO="$2" -e SHOTS="$SHOTS" --test-output-dir "$OUT/maestro/$2_wallet-open" "$GITHUB_WORKSPACE/demo/flows/wallet-open.yaml" || return 1
  sleep 3
  adb -s "$1" exec-out screencap -p > "$SHOTS/${2}_00_pin_prompt.png" 2>/dev/null || true
  adb -s "$1" shell input text "$PIN"
  sleep 1
  adb -s "$1" shell input keyevent 66
  # the prompt window is FLAG_SECURE, so confirm from the system log: dismissed reason 7 = credential confirmed
  for _ in $(seq 1 45); do
    adb -s "$1" logcat -d | grep -q 'AuthSession.*Dismissed!.*Reason: 7' && { echo "$1 wallet credential confirmed"; adb -s "$1" shell input keyevent 3; return 0; }
    sleep 2
  done
  echo "$1 wallet credential never confirmed"
  return 1
}

watch_credential() { # watch_credential <serial>: if the wallet asks for the device credential again mid-flow, answer it
  adb -s "$1" logcat -T 1 -s AuthController:D | while read -r line; do
    case "$line" in
      *showAuthenticationDialog*)
        echo "$1 credential prompt shown again, entering PIN"
        (sleep 4; adb -s "$1" shell input text "$PIN"; adb -s "$1" shell input keyevent 66) &
        ;;
    esac
  done
}

record() { # record <serial> <label>: chained 170 s segments written on the device
  adb -s "$1" shell "echo 1 > /data/local/tmp/rec.run"
  nohup adb -s "$1" shell 'i=0; while [ -f /data/local/tmp/rec.run ]; do i=$((i+1)); screenrecord --bit-rate 8000000 --time-limit 170 /data/local/tmp/rec_$(printf %03d $i).mp4; done' \
    > "$OUT/logs/record_$2.log" 2>&1 &
}
stop_record() {
  for s in $A $B; do adb -s $s shell rm -f /data/local/tmp/rec.run; adb -s $s shell pkill -INT screenrecord; done
  sleep 8
  for pair in "$A a" "$B b"; do
    set -- $pair
    for f in $(adb -s "$1" shell ls /data/local/tmp/ | tr -d '\r' | grep '^rec_.*mp4$'); do
      adb -s "$1" pull "/data/local/tmp/$f" "$OUT/video/${2}_$f" >/dev/null
    done
  done
}

walletaddr() { # walletaddr <serial> <a|b>: last address the mock wallet logged on this device
  grep -h -o 'keypair (add=[1-9A-HJ-NP-Za-km-z]\{32,44\}' "$OUT/logs/logcat_$2.txt" | tail -1 | sed 's/.*add=//'
}

addresses() { # A is required (the fallback and the wave need it); B only matters for two-emulator BLE
  sleep 3
  WALLET_A=$(walletaddr $A a); WALLET_B=$(walletaddr $B b)
  echo "wallet A $WALLET_A"; echo "wallet B $WALLET_B"
  [ -n "$WALLET_A" ] && [ "$WALLET_A" != "$WALLET_B" ]
}

fund() {
  (cd "$GITHUB_WORKSPACE/demo" && node fund.mjs "$WALLET_A" ${WALLET_B:+"$WALLET_B"}) | tee "$OUT/logs/fund.txt"
}

session_of_a() { # reads the signed-in session out of app A's storage; the token is passed on in memory only
  adb -s $A pull /data/data/$APP/databases/RKStorage "$OUT/ui/RKStorage_a" >/dev/null 2>&1 || return 1
  python3 - "$OUT/ui/RKStorage_a" <<'PY'
import json, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
row = db.execute("select value from catalystLocalStorage where key = ?", ("passersby.session.v1",)).fetchone()
print(json.loads(row[0])["sessionToken"])
PY
}

fallback() {
  local tok
  tok=$(session_of_a) && [ -n "$tok" ] || return 1
  (cd "$GITHUB_WORKSPACE/demo" && W_SESSION="$tok" node fallback.mjs) | tee "$OUT/logs/fallback.txt"
}

ble_evidence() { # dumpsys snapshots under $TAG; the logcat streams already hold ReactNativeJS and bluetooth lines
  for pair in "$A a" "$B b"; do
    set -- $pair
    adb -s "$1" shell dumpsys bluetooth_manager > "$OUT/logs/dumpsys_bt_${2}_$TAG.txt" 2>&1
  done
}

for s in $A $B; do adb -s $s root >/dev/null 2>&1; timeout 60 adb -s $s wait-for-device; done # the fallback reads app storage, and adbd restarts on root
sleep 3
adb -s $A logcat -v threadtime > "$OUT/logs/logcat_a.txt" 2>&1 &
adb -s $B logcat -v threadtime > "$OUT/logs/logcat_b.txt" 2>&1 &
date +%s > "$OUT/rec_start.txt"
record $A a
record $B b
sleep 3

stage prepare prepare
watch_credential $A > "$OUT/logs/credential_a.txt" 2>&1 &
watch_credential $B > "$OUT/logs/credential_b.txt" 2>&1 &
stage wallet_auth_a wallet_auth $A a
stage wallet_auth_b wallet_auth $B b
stage signin_a flow $A a signin
stage signin_b flow $B b signin
stage addresses addresses
stage fund fund
TAG=after_signin ble_evidence
MODE=two-emulator-ble
stage passed_a flow $A a passed
if [[ " ${FAILED[*]:-} " == *" passed_a "* ]]; then
  echo "BLE: emulator A never showed a mutual encounter"
  TAG=ble_failed ble_evidence
  FAILED=($(printf '%s\n' "${FAILED[@]}" | grep -vx passed_a))
  MODE=fallback-second-identity-over-http
  stage fallback fallback
  stage passed_a_list flow $A a passed-list
else
  stage passed_b flow $B b passed
fi
echo "$MODE" > "$OUT/MODE.txt"
TAG=after_passed ble_evidence
stage wave_a flow $A a wave
stage passport_a flow $A a passport
sleep 5
snap $A final_a; snap $B final_b
TAG=final ble_evidence

stop_record
find "$SHOTS" -name '*.png' -printf '%T@ %f\n' | sort -n > "$OUT/shot_times.txt"
pkill -f 'adb -s emulator-.* logcat' || true
echo "failed stages: ${FAILED[*]:-none}"
printf '%s\n' "${FAILED[@]:-}" > "$OUT/failed-stages.txt"
[ ${#FAILED[@]} -eq 0 ]
