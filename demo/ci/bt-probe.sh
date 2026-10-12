#!/usr/bin/env bash
set -uo pipefail
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
export PATH="$SDK/platform-tools:$PATH"
mkdir -p out
{
  emulator -version 2>/dev/null | head -2 || "$SDK/emulator/emulator" -version | head -2
  ls "$SDK/emulator" | tr '\n' ' '; echo
  for d in "${XDG_RUNTIME_DIR:-}" "${TMPDIR:-/tmp}" /tmp; do [ -f "$d/netsim.ini" ] && { echo "netsim.ini in $d"; cat "$d/netsim.ini"; }; done
  ps aux | grep -c '[q]emu-system'
  ps aux | grep '[n]etsimd' | head -2
  curl -s -m 5 localhost:7681/v1/devices | head -c 1500; echo
  for s in emulator-5554 emulator-5556; do
    echo "== $s"; adb -s "$s" shell dumpsys bluetooth_manager | head -12
    adb -s "$s" shell getprop ro.build.fingerprint
  done
} 2>&1 | tee out/bt-probe.txt
