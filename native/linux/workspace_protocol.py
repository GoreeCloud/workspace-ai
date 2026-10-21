"""Bounded client protocol for the genuine GTK4 desktop application.

This never reads browser localStorage, OAuth credentials, or external addresses.
A separate local Workspace AI backend must already be running.
"""
import json
import re
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:3031"
ACCOUNT_ID = re.compile(r"^[0-9a-f]{24}$")
MAX_TEXT = 10000
MAX_HISTORY = 16
MAX_RESPONSE = 60000


class BackendError(Exception):
    pass


def account_identity(status):
    if not isinstance(status, dict) or not isinstance(status.get("connected"), bool):
        raise BackendError("Unverified server identity")
    if not status["connected"]:
        return None
    value = status.get("accountId")
    if not isinstance(value, str) or not ACCOUNT_ID.fullmatch(value):
        raise BackendError("Invalid account identity")
    return value


def headers(identity=None):
    value = {"Accept": "application/json", "Cache-Control": "no-store"}
    if identity is not None:
        if not ACCOUNT_ID.fullmatch(identity):
            raise BackendError("Invalid account identifier")
        value["X-Workspace-Account-Id"] = identity
    return value


def prepare_messages(history, prompt):
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > MAX_TEXT:
        raise BackendError("Message must be 1–10,000 characters")
    if not isinstance(history, list):
        raise BackendError("Invalid conversation history")
    safe = []
    for entry in history[-MAX_HISTORY:]:
        if (not isinstance(entry, dict) or entry.get("role") not in ("user", "assistant")
                or not isinstance(entry.get("content"), str)
                or len(entry["content"]) > MAX_TEXT):
            raise BackendError("Invalid history")
        safe.append({"role": entry["role"], "content": entry["content"]})
    safe.append({"role": "user", "content": prompt.strip()})
    return safe


def fetch_status(base=BASE):
    if base != BASE:
        raise BackendError("Only the configured loopback backend is permitted")
    request = urllib.request.Request(base + "/api/status", headers=headers())
    with urllib.request.urlopen(request, timeout=8) as response:
        if response.status != 200:
            raise BackendError("Workspace backend not available")
        raw = response.read(16000)
    value = json.loads(raw)
    identity = account_identity(value)
    return value, identity


def stream_chat(messages, identity=None, base=BASE):
    if base != BASE:
        raise BackendError("Only the configured loopback backend is permitted")
    h = {**headers(identity), "Content-Type": "application/json"}
    data = json.dumps({"messages": messages, "preference": "api",
                       "images": [], "allowApiFallback": False}).encode("utf-8")
    request = urllib.request.Request(base + "/api/chat", data=data, headers=h, method="POST")
    try:
        response = urllib.request.urlopen(request, timeout=180)
    except urllib.error.HTTPError as error:
        raise BackendError("Request refused (HTTP " + str(error.code) + "). Check your account and API settings.") from None
    with response:
        if response.status != 200:
            raise BackendError("Request failed (HTTP " + str(response.status) + ")")
        amount = 0
        complete = False
        for line in response:
            amount += len(line)
            if amount > MAX_RESPONSE:
                raise BackendError("Model output exceeds client safety limit")
            try:
                event = json.loads(line)
            except (ValueError, UnicodeDecodeError):
                raise BackendError("Invalid response stream") from None
            if not isinstance(event, dict):
                raise BackendError("Invalid response event")
            kind = event.get("type")
            if kind == "delta":
                chunk = event.get("text")
                if not isinstance(chunk, str):
                    raise BackendError("Invalid response text")
                yield chunk
            elif kind == "error":
                raise BackendError("Model request was interrupted")
            elif kind == "complete":
                complete = True
        if not complete:
            raise BackendError("Model response ended unexpectedly")
