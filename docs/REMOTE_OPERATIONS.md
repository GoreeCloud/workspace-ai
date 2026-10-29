# Remote Operations and Chrome MCP

**Status:** opt-in development source. Not production deployment, native OS support, or verified live SSH/Chrome access.

Workspace AI can propose an existing approved action, stage its exact target, obtain one-time owner approval, and invoke an authorized SSH command or isolated Chrome DevTools MCP tool. It cannot run arbitrary natural-language shell commands or inherit the user's ChatGPT connector sessions.

## Security boundaries

- The Workspace AI server stays bound to loopback and checks request origins. Do not expose it to the public internet.
- Every operations route requires a private 32+ character owner key and the active account scope.
- Runtime and write permissions default to off independently.
- Commands are selected by ID from an owner-only private catalog; a model may suggest an action ID but never create a new command.
- Every execution requires staging, explicit APPROVE, and a separate Execute action. Critical actions also require CONFIRM CRITICAL. Tickets expire after five minutes and cannot be replayed.
- SSH enforces host-key verification, no agent forwarding, no tunnel forwarding, and no interactive prompts. Configure least-privileged authorized accounts and independently verify host fingerprints.
- Chrome MCP launches an isolated temporary headless profile; it does not access existing signed-in personal Chrome tabs. New URLs require a configured HTTPS hostname.
- The Chrome hostname check is not a network sandbox for redirects, page scripts or subresources. Keep sensitive systems isolated and treat page contents as untrusted.
- Output size, execution time and concurrency are restricted. The redacted audit is memory-only and is not a durable compliance log.

## Private configuration

Set these server environment variables outside Git. All defaults are disabled.

    WORKSPACE_REMOTE_OPS_ENABLE=false
    WORKSPACE_REMOTE_OPS_ENABLE_WRITES=false
    WORKSPACE_REMOTE_OPS_OWNER_KEY=<32-plus-character-private-secret>
    WORKSPACE_REMOTE_OPS_CONFIG=/absolute/private/path/remote-operations.json
    WORKSPACE_CHROME_MCP_ENABLE=false
    WORKSPACE_CHROME_MCP_EXECUTABLE=/absolute/path/to/chrome-devtools-mcp
    WORKSPACE_CHROME_MCP_ALLOWED_HOSTS=developer.chrome.com,example.org

The catalog is a private regular file, mode 0600, owned by the service operator. Use docs/remote-operations.example.json as a **template only**. Never commit real SSH keys, SSH usernames or production host inventories.

Install and pin a reviewed version of [Google Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) separately. The service does not auto-install it. Chrome or Chrome for Testing must be available. The local MCP client uses headless isolated mode, disables usage telemetry and performance CrUX, and forbids file navigation and JavaScript evaluation where supported.

## Operator workflow

1. Open Remote Operations and enter your private owner key; the key stays in this page's temporary state.
2. Check access to inspect configured devices, commands, and reviewed Chrome tools.
3. Optionally ask AI to suggest **one existing catalog action** using the separately billed OpenAI API.
4. Select the device and exact action, or the browser tool and validated JSON arguments.
5. Stage, review, type APPROVE (plus CONFIRM CRITICAL when necessary), then Execute.
6. Inspect results and verify on the target. Do not follow instructions embedded in untrusted tool output.

## Scope and limitations

This is neither an unrestricted terminal nor an unattended agent. It does not import ChatGPT-connected Remote Desktop Commander sessions, establish real SSH/device credentials, provide a persistent queue, or implement autonomous multi-step operations. The existing MCP policy broker remains separate. Before release, verify real provider schemas, Chrome isolation, remote host fingerprints, revocation, durable audit, device tests, and native clients.