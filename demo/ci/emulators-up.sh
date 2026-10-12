#!/usr/bin/env bash
# Boots two API 34 x86_64 emulators (5554, 5556) on one host and turns Bluetooth on in both.
set -euo pipefail
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
export PATH="$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$SDK/emulator:$PATH"
IMG="system-images;android-34;google_apis;x86_64"
mkdir -p out "$HOME/.android"
# The root disk of a stock runner cannot hold two userdata partitions; /mnt is a separate, larger disk.
df -h / /mnt | tail -2
sudo mkdir -p /mnt/avd && sudo chown "$(id -u):$(id -g)" /mnt/avd
export ANDROID_USER_HOME="$HOME/.android" ANDROID_AVD_HOME=/mnt/avd
set +o pipefail; yes | sdkmanager --licenses >/dev/null 2>&1; set -o pipefail
sdkmanager --install emulator platform-tools "$IMG" | tail -3
for n in a b; do
  echo no | avdmanager create avd -n "demo_$n" -k "$IMG" -d pixel_6 --force >/dev/null
  C="$ANDROID_AVD_HOME/demo_$n.avd/config.ini"
  for kv in hw.ramSize=2048 hw.cpu.ncore=2 hw.lcd.width=720 hw.lcd.height=1600 hw.lcd.density=320 hw.gpu.enabled=yes hw.gpu.mode=swiftshader_indirect; do
    sed -i "/^${kv%%=*}=/d" "$C"; echo "$kv" >> "$C"
  done
done
declare -A PID
start() {
  nohup emulator -avd "demo_$1" -port "$2" -no-window -no-audio -no-boot-anim -no-snapshot -partition-size 3072 \
    -gpu swiftshader_indirect -accel on -camera-back none -camera-front none \
    > "out/emulator_$1.log" 2>&1 &
  PID[$2]=$!
}
alive() { kill -0 "${PID[$1]}" 2>/dev/null || { echo "emulator on port $1 exited"; tail -15 "out/emulator_${2}.log"; exit 1; }; }
start a 5554
sleep 15
start b 5556
df -h / /mnt | tail -2
wait_boot() { # wait_boot <port> <a|b>
  local s=emulator-$1 t=$((SECONDS + 600))
  until adb devices | grep -q "^$s[[:space:]]*device"; do alive $1 $2; [ $SECONDS -lt $t ] || { echo "$s never reached adb"; exit 1; }; sleep 3; done
  until [ "$(timeout 20 adb -s "$s" shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do
    alive $1 $2; [ $SECONDS -lt $t ] || { echo "$s did not boot"; tail -30 "out/emulator_$2.log"; exit 1; }; sleep 5
  done
  t=$((SECONDS + 120))
  until timeout 20 adb -s "$s" shell service check bluetooth_manager | grep -q ': found'; do
    [ $SECONDS -lt $t ] || { echo "$s has no bluetooth_manager"; exit 1; }; sleep 3
  done
  timeout 30 adb -s "$s" shell cmd bluetooth_manager enable || true
  timeout 90 adb -s "$s" shell cmd bluetooth_manager wait-for-state:STATE_ON || echo "$s: bluetooth did not reach STATE_ON in 90 s"
  timeout 20 adb -s "$s" shell settings put global hide_error_dialogs 1 # two software-rendered emulators starve System UI into an ANR dialog that blocks every tap
  echo "$(date +%T) $s up, bluetooth_on=$(timeout 20 adb -s "$s" shell settings get global bluetooth_on | tr -d '\r')"
}
wait_boot 5554 a
wait_boot 5556 b

# Let first-boot work (dexopt, Play services) drain before any flow runs: a busy System UI misses its ANR deadline.
settle() { # settle <serial>: wait for the 1-minute load average to drop under 3.5
  local t=$((SECONDS + 240)) l
  while :; do
    l=$(timeout 20 adb -s "$1" shell cat /proc/loadavg | cut -d' ' -f1)
    echo "$(date +%T) $1 load $l"
    awk -v l="${l:-99}" 'BEGIN{exit !(l < 3.5)}' && break
    [ $SECONDS -lt $t ] || { echo "$1 still busy, continuing"; break; }
    sleep 10
  done
}
settle emulator-5554
settle emulator-5556
