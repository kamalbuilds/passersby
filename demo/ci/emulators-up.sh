#!/usr/bin/env bash
# Boots two API 34 x86_64 emulators (5554, 5556) on one host and turns Bluetooth on in both.
set -euo pipefail
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
export PATH="$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$SDK/emulator:$PATH"
IMG="system-images;android-34;google_apis;x86_64"
mkdir -p out "$HOME/.android/avd"
export ANDROID_USER_HOME="$HOME/.android" ANDROID_AVD_HOME="$HOME/.android/avd"
df -h / | tail -1
set +o pipefail; yes | sdkmanager --licenses >/dev/null 2>&1; set -o pipefail
sdkmanager --install emulator platform-tools "$IMG" | tail -3
for n in a b; do
  echo no | avdmanager create avd -n "demo_$n" -k "$IMG" -d pixel_6 --force >/dev/null
  C="$HOME/.android/avd/demo_$n.avd/config.ini"
  for kv in hw.ramSize=2048 hw.cpu.ncore=2 hw.lcd.width=720 hw.lcd.height=1600 hw.lcd.density=320 hw.gpu.enabled=yes hw.gpu.mode=swiftshader_indirect disk.dataPartition.size=3G; do
    sed -i "/^${kv%%=*}=/d" "$C"; echo "$kv" >> "$C"
  done
done
start() {
  nohup emulator -avd "demo_$1" -port "$2" -no-window -no-audio -no-boot-anim -no-snapshot \
    -gpu swiftshader_indirect -accel on -camera-back none -camera-front none \
    > "out/emulator_$1.log" 2>&1 &
}
start a 5554
sleep 15
start b 5556
df -h / | tail -1
for s in emulator-5554 emulator-5556; do
  timeout 600 adb -s "$s" wait-for-device || { echo "$s never reached adb"; adb devices; tail -5 out/emulator_*.log; exit 1; }
  t=$((SECONDS + 600))
  until [ "$(timeout 20 adb -s "$s" shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do
    [ $SECONDS -lt $t ] || { echo "$s did not boot"; tail -30 out/emulator_*.log; exit 1; }
    sleep 5
  done
  t=$((SECONDS + 120))
  until timeout 20 adb -s "$s" shell service check bluetooth_manager | grep -q ': found'; do
    [ $SECONDS -lt $t ] || { echo "$s has no bluetooth_manager"; exit 1; }
    sleep 3
  done
  timeout 30 adb -s "$s" shell cmd bluetooth_manager enable || true
  timeout 90 adb -s "$s" shell cmd bluetooth_manager wait-for-state:STATE_ON || echo "$s: bluetooth did not reach STATE_ON in 90 s"
  echo "$(date +%T) $s up, bluetooth_on=$(timeout 20 adb -s "$s" shell settings get global bluetooth_on | tr -d '\r')"
done
