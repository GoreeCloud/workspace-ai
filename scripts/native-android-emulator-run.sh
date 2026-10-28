#!/usr/bin/env bash
# Run only inside a disposable GitHub Actions Android emulator.
set -euo pipefail
test -f android-native/gradlew
test "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = "1"
bash android-native/gradlew -p android-native :app:assembleDebug --no-daemon
python3 scripts/native-android-emulator-smoke.py \
  --apk android-native/app/build/outputs/apk/debug/app-debug.apk \
  --out "${RUNNER_TEMP:?}/native-screen-qa"
