#!/usr/bin/env python3
"""GoreeCloud Workspace AI native Linux companion (GTK4, no WebView).

Start the existing localhost Workspace AI server separately. This first native
client offers in-memory chat through the explicitly billed API connection.
Browser project data and sync are intentionally not accessed or represented.
"""
import threading
import gi

gi.require_version("Gtk", "4.0")
from gi.repository import Gtk, GLib

from workspace_protocol import BackendError, fetch_status, prepare_messages, stream_chat


class WorkspaceWindow(Gtk.ApplicationWindow):
    def __init__(self, app):
        super().__init__(application=app, title="GoreeCloud Workspace AI — Native Linux")
        self.set_default_size(780, 650)
        self.identity = None
        self.history = []
        self.working = False
        column = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        column.set_margin_top(16)
        column.set_margin_bottom(16)
        column.set_margin_start(16)
        column.set_margin_end(16)
        self.set_child(column)
        header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        column.append(header)
        self.account = Gtk.Label(label="Checking local account…")
        self.account.set_xalign(0)
        self.account.set_hexpand(True)
        header.append(self.account)
        self.refresh = Gtk.Button(label="Refresh account")
        self.refresh.connect("clicked", self.refresh_status)
        header.append(self.refresh)
        note = Gtk.Label(label="Native GTK4 • in-memory chats • separately billed OpenAI API • localhost only")
        note.set_xalign(0)
        note.set_wrap(True)
        column.append(note)
        scroller = Gtk.ScrolledWindow()
        scroller.set_vexpand(True)
        column.append(scroller)
        self.transcript = Gtk.TextView()
        self.transcript.set_editable(False)
        self.transcript.set_cursor_visible(False)
        self.transcript.set_wrap_mode(Gtk.WrapMode.WORD_CHAR)
        self.transcript.set_left_margin(12)
        self.transcript.set_right_margin(12)
        scroller.set_child(self.transcript)
        input_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        column.append(input_row)
        self.entry = Gtk.Entry()
        self.entry.set_hexpand(True)
        self.entry.set_placeholder_text("Ask Workspace AI using the separately billed API…")
        self.entry.connect("activate", self.send)
        input_row.append(self.entry)
        self.send_button = Gtk.Button(label="Send")
        self.send_button.connect("clicked", self.send)
        input_row.append(self.send_button)
        self.status = Gtk.Label(label="")
        self.status.set_xalign(0)
        self.status.set_wrap(True)
        column.append(self.status)
        self.refresh_status()

    def append(self, text):
        buffer = self.transcript.get_buffer()
        end = buffer.get_end_iter()
        buffer.insert(end, text)

    def refresh_status(self, *_):
        self.send_button.set_sensitive(False)
        self.status.set_text("Verifying the local backend and selected account…")

        def query():
            try:
                status, identity = fetch_status()
                GLib.idle_add(self.accept_status, status, identity)
            except Exception:
                GLib.idle_add(self.reject_status, "Local backend unavailable or account identity unverified")

        threading.Thread(target=query, daemon=True).start()

    def accept_status(self, status, identity):
        if identity != self.identity and self.history:
            self.history.clear()
            self.transcript.get_buffer().set_text("")
        self.identity = identity
        label = status.get("displayName") or status.get("email") or ("Local guest" if identity is None else "ChatGPT account")
        self.account.set_text("Account: " + str(label)[:100])
        ready = status.get("apiConfigured") is True
        self.send_button.set_sensitive(ready and not self.working)
        self.status.set_text("Ready (separately billed API)" if ready else "Configure an OpenAI API key in Workspace AI settings")
        return False

    def reject_status(self, message):
        self.identity = None
        self.send_button.set_sensitive(False)
        self.account.set_text("Account not verified")
        self.status.set_text(message)
        return False

    def send(self, *_):
        if self.working or not self.send_button.get_sensitive():
            return
        prompt = self.entry.get_text()
        try:
            outbound = prepare_messages(self.history, prompt)
        except BackendError as error:
            self.status.set_text(str(error))
            return
        self.entry.set_text("")
        self.append("\nYou: " + prompt.strip() + "\nWorkspace AI: ")
        self.working = True
        self.send_button.set_sensitive(False)
        self.status.set_text("Generating…")
        original_identity = self.identity

        def request():
            result = []
            try:
                for delta in stream_chat(outbound, original_identity):
                    result.append(delta)
                    GLib.idle_add(self.append, delta)
                GLib.idle_add(self.finish, original_identity, prompt.strip(), "".join(result), None)
            except Exception as error:
                GLib.idle_add(self.finish, original_identity, prompt.strip(), "", str(error))

        threading.Thread(target=request, daemon=True).start()

    def finish(self, original_identity, prompt, reply, error):
        self.working = False
        if original_identity != self.identity:
            self.reject_status("Account changed during response. Refresh to continue.")
            return False
        if error:
            self.status.set_text("Response failed: " + error[:160])
            self.append("\n[Response failed]\n")
        else:
            self.history.extend(({"role": "user", "content": prompt}, {"role": "assistant", "content": reply}))
            self.status.set_text("Response complete. History remains in this window only.")
            self.append("\n")
        self.send_button.set_sensitive(True)
        return False


class WorkspaceApplication(Gtk.Application):
    def __init__(self):
        super().__init__(application_id="cloud.goree.workspaceai.native.linux")

    def do_activate(self):
        win = WorkspaceWindow(self)
        win.present()


if __name__ == "__main__":
    WorkspaceApplication().run()
