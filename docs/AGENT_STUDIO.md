# Agent Studio — first integrated runtime

**Status:** Development source; deployment and real-device acceptance are not verified.

## Features

- Create, edit, delete up to 60 browser-local agents assigned to an existing project.
- Role and instruction configuration per agent, with the project's enabled private memory and reference context selected at run time.
- Select up to four agents in a single project and run them concurrently through the existing model-only /api/chat endpoint. Each agent receives the task, its instructions, and a bounded context from *only* the selected project (the existing optional reference-file sharing policy still applies).
- Optional coordinator synthesis using a separate coordinator agent assigned to the same project; canceled runs are not represented as successful.
- Validated workspace backup/restore includes agent definitions. Orphan agents are dropped. Merging backups does not import agents from colliding project identities.
- A separately opt-in local scheduler supports model-only jobs using a **server environment OpenAI API key** and owner-key authentication. Scheduling is off by default, with 60-minute minimum interval, maximum 20 jobs, a cap of eight runs per 24 hours, a private JSON state file and bounded result history. Jobs can pause, run manually or be deleted.

## Scheduling setup

Set WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS=true and a random owner secret in WORKSPACE_AI_AGENT_OWNER_KEY with at least 32 characters on an isolated local server. Also set the separately billed OPENAI_API_KEY server environment variable. Do not save these values in browser project files, agent definitions or exported backups. Open Agents and authorize scheduling with the local owner key; it remains in the tab's React state and is not written to localStorage. Unattended runs always use the configured OpenAI API model, never plan credentials.

**Important:** A scheduled job stores an agent/task snapshot independently on the local server. Deleting or changing the browser project does not automatically revoke already registered jobs; pause/remove jobs before deleting projects. Scheduled tasks never receive browser project memory or attached files and have no connectors or tools. This is a single-process local scheduler, not a distributed durable job service. Treat provider billing, host sleep/offline gaps, upgrades and data recovery as operational risks.

## MCP and account security

Agents cannot invoke MCP tools or provider writes through the model endpoint, even if project MCP account profiles and risk preferences exist. The separately approved MCP execution subsystem is independent, default off, and requires trusted server review and explicit operator approval. Browser account labels are not verified identities or authorization grants. Do not automatically pass account tokens or sensitive external resource context to agents.

## Limits and remaining verification

- Need real browser and mobile accessibility tests, project rename/delete/restore acceptance, UI state and multiple-tab conflict coverage, cancellation and long-response behavior.
- Need actual provider authorization and cost tracking, context injection hardening, user-controlled run history export and deletion, concurrency/race tests, scheduler lifecycle revocation on project deletion, secure durable multi-process jobs, and explicit event-trigger support.
- Successful CI is evidence of synthetic checks, not of a production rollout or working external provider access.
