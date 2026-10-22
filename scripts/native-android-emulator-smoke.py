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
    visible = [(el.attrib.get("text") or el.attrib.get("content-desc") or "") for el in root.iter()]
    labels = [value for value in visible if value][:40]
    raise AssertionError(f"Missing accessible UI element: {label}; hierarchy labels={labels!r}")


def click(label):
    element = find(hierarchy(), label)
    coords = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]",
                      element.attrib.get("bounds", ""))
    assert coords, f"Missing accessible bounds for {label}"
    left, top, right, bottom = map(int, coords.groups())
    assert right > left and bottom > top, label
    adb("shell", "input", "tap", str((left + right)//2), str((top + bottom)//2))
    time.sleep(0.6)


def await_chat_tab(folder):
    # Retry only Pixel Launcher's explicitly identified cold-boot ANR.
    # This never suppresses a crashed Workspace AI process or missing controls.
    for attempt in range(4):
        layout = hierarchy()
        ET.ElementTree(layout).write(folder / "startup-hierarchy.xml", encoding="unicode")
        labels = {(node.attrib.get("text") or node.attrib.get("content-desc") or "")
                  for node in layout.iter()}
        if "Chat tab" in labels:
            return layout
        if "Pixel Launcher isn't responding" not in labels or "Wait" not in labels:
            find(layout, "Chat tab")
        print(f"Emulator launcher ANR on attempt {attempt + 1}; selecting Wait")
        click("Wait")
        time.sleep(2)
        resumed = adb("shell", "am", "start", "-W", "-n", ACTIVITY)
        assert "Status: ok" in resumed, resumed
        assert adb("shell", "pidof", PACKAGE).strip(), "Native Activity exited during emulator startup"
    find(layout, "Chat tab")
    raise AssertionError("Native Chat tab never became available")


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
    connected = [line.split() for line in devices.splitlines() if line.startswith("emulator-")]
    assert len(connected) == 1 and connected[0][1] == "device", "Unexpected ADB target"

    adb("logcat", "-c")
    adb("install", str(apk))
    launch = adb("shell", "am", "start", "-W", "-n", ACTIVITY)
    assert "Status: ok" in launch, launch
    time.sleep(1.5)
    assert adb("shell", "pidof", PACKAGE).strip(), "Native Activity did not remain running"
    # Capture a diagnostic before validating accessibility, so UI failures
    # produce inspectable screenshots rather than empty CI artifacts.
    snapshot(folder, "startup")
    layout = await_chat_tab(folder)
    find(layout, "Chat tab")
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
    adb("shell", "input", "text", "GoreeNativeDraft42")
    find(hierarchy(), "GoreeNativeDraft42")
    find(hierarchy(), "Send disabled until secure AI connection is available")
    snapshot(folder, "composer-keyboard")

    # Changing system theme recreates an Activity on a stock emulator. Verify
    # the current pane and unsent draft survive only this configuration change.
    adb("shell", "input", "keyevent", "4")
    click("Projects tab")
    adb("shell", "cmd", "uimode", "night", "yes")
    time.sleep(2)
    assert adb("shell", "pidof", PACKAGE).strip(), "Native Activity crashed during theme transition"
    await_chat_tab(folder)
    find(hierarchy(), "Your projects will live here")
    click("Chat tab")
    find(hierarchy(), "GoreeNativeDraft42")
    snapshot(folder, "chat-dark")
    click("Settings tab")
    find(hierarchy(), "Dark · follows system")
    snapshot(folder, "settings-dark")
    adb("shell", "cmd", "uimode", "night", "no")
    time.sleep(2)
    assert adb("shell", "pidof", PACKAGE).strip(), "Native Activity crashed restoring light theme"
    find(hierarchy(), "Light · follows system")
    click("Chat tab")
    find(hierarchy(), "GoreeNativeDraft42")

    # A force stop is a process lifetime boundary, not a configuration change.
    # The offline preview must not persist this synthetic draft to local storage.
    adb("shell", "am", "force-stop", PACKAGE)
    assert "Status: ok" in adb("shell", "am", "start", "-W", "-n", ACTIVITY)
    assert adb("shell", "pidof", PACKAGE).strip(), "Native Activity failed clean restart"
    after_restart = hierarchy()
    find(after_restart, "Local message draft")
    assert not any(n.attrib.get("text") == "GoreeNativeDraft42" for n in after_restart.iter()), \
        "Unsent draft unexpectedly survived process stop"

    runtime = adb("logcat", "-d", "-s", "AndroidRuntime:E")
    assert f"Process: {PACKAGE}" not in runtime, "Native startup/navigation crash detected"
    print("PASS native emulator Chat/Projects/Settings, theme-change draft retention, process-stop privacy and no crash")


if __name__ == "__main__":
    main()
