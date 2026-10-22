#!/usr/bin/env python3
"""Synthetic-only Android native UI smoke on a disposable CI emulator.

This script MUST NOT be run against an owner's physical device: it installs,
launches and navigates the QA package. Screenshots contain no account data.
"""
import argparse
import os
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

PACKAGE = "com.goreecloud.workspaceai.nativeapp"
ACTIVITY = f"{PACKAGE}/.MainActivity"


def adb(*args, capture=True):
    return subprocess.run(["adb", *args], check=True,
                          stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.PIPE if capture else None,
                          text=True).stdout if capture else ""


def snapshot(folder, label):
    result = subprocess.run(["adb", "exec-out", "screencap", "-p"],
                            check=True, stdout=subprocess.PIPE)
    image = folder / (label + ".png")
    image.write_bytes(result.stdout)
    assert image.stat().st_size > 1000, f"Empty screenshot: {label}"
    print(f"PASS {label}: {image.stat().st_size} PNG bytes")


def hierarchy():
    for _ in range(4):
        try:
            adb("shell", "uiautomator", "dump", "/sdcard/native-qa-layout.xml")
            data = adb("exec-out", "cat", "/sdcard/native-qa-layout.xml")
            return ET.fromstring(data)
        except (ET.ParseError, subprocess.CalledProcessError):
            time.sleep(1)
    raise RuntimeError("Native UI hierarchy unavailable")


def find(root, label):
    for el in root.iter():
        d = el.attrib
        if d.get("content-desc") == label or d.get("text") == label:
            return el
    raise AssertionError(f"Missing accessible UI element: {label}")


def click(label):
    element = find(hierarchy(), label)
    coords = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]",
                      element.attrib.get("bounds", ""))
    assert coords, f"Missing accessible bounds for {label}"
    left, top, right, bottom = map(int, coords.groups())
    assert right > left and bottom > top, label
    adb("shell", "input", "tap", str((left + right)//2), str((top + bottom)//2))
    time.sleep(0.6)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", required=True)
    parser.add_argument("--out", required=True)
    a = parser.parse_args()
    folder = Path(a.out)
    folder.mkdir(parents=True, exist_ok=True)
    apk = Path(a.apk)
    assert apk.is_file(), apk

    # This is a disposable emulator CI environment, NEVER a physical phone.
    model = adb("shell", "getprop", "ro.kernel.qemu").strip()
    assert model == "1", "Refusing installation on non-emulator device"
    devices = adb("devices", "-l")
    assert "emulator-" in devices and devices.count("\tdevice ") == 1, "Unexpected ADB target"

    adb("logcat", "-c")
    adb("install", str(apk))
    launch = adb("shell", "am", "start", "-W", "-n", ACTIVITY)
    assert "Status: ok" in launch, launch
    time.sleep(1.5)
    assert adb("shell", "pidof", PACKAGE).strip(), "Native Activity did not remain running"
    find(hierarchy(), "Chat tab")
    find(hierarchy(), "Projects tab")
    find(hierarchy(), "Settings tab")
    find(hierarchy(), "Local message draft")
    snapshot(folder, "chat")

    click("Projects tab")
    find(hierarchy(), "Your projects will live here")
    snapshot(folder, "projects")

    click("Settings tab")
    find(hierarchy(), "Connection")
    find(hierarchy(), "Privacy")
    snapshot(folder, "settings")

    click("Chat tab")
    click("Local message draft")
    time.sleep(1)
    find(hierarchy(), "Send disabled until secure AI connection is available")
    snapshot(folder, "composer-keyboard")

    runtime = adb("logcat", "-d", "-s", "AndroidRuntime:E")
    assert f"Process: {PACKAGE}" not in runtime, "Native startup/navigation crash detected"
    print("PASS native emulator Chat/Projects/Settings, accessibility, composer and no crash")


if __name__ == "__main__":
    main()
