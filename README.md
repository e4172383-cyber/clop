<p align="center">
  <img src="build/icon.png" width="128" alt="clop icon">
</p>

<h1 align="center">clop</h1>

<p align="center">
  <b>Agentic IDE with your own AI provider — liquid glass design, local agents, 100+ integrations</b><br>
  <sub>Агентная IDE со своим ИИ-провайдером: Claude Code, OpenAI-совместимые API и локальные модели Ollama</sub>
</p>

---

## Features

- **Claude-style chat UI** — full-screen chat, collapsible sidebar with chat history, liquid-glass design with animated background
- **Bring your own AI**:
  - **Claude Code** (uses your existing subscription) with model picker: Fable 5, Opus 5, Sonnet 5, Haiku 4.5 and more
  - any **OpenAI-compatible API** (OpenAI, OpenRouter, your own proxy) with reasoning-effort control
  - **local models via Ollama** — no API key needed
- **Real agent workflow** — live thinking stream (like Claude Code), tool activity log with elapsed time and token usage, stop button, message queue, parallel chats
- **IDE panel** — file tree, editor with tabs, built-in PowerShell terminal, Git tab (status, diff, one-click commit)
- **Artifacts** — files the agent creates are collected with live HTML/image preview and version history with rollback
- **Agent asks you back** — the agent can ask a question with clickable options right in the chat
- **Web sources** — pages the agent browsed are shown as clickable chips under the answer
- **100+ integrations (MCP)** — GitHub, Notion, Slack, Stripe, Postgres, Figma, Playwright and dozens more; thousands of apps via Zapier / Composio / Pipedream; any custom MCP server
- **Permission levels** — auto / by permissions / everything allowed
- **50 UI languages**, English by default
- **Auto-update** from GitHub releases; chats and settings survive updates (with automatic backup)

## Install

Download the latest `clop Setup x.x.x.exe` from [Releases](../../releases) and run it.

## Development

```bash
npm install
npm start        # run
npm run dist     # build the Windows installer
```

## Stack

Electron · vanilla JS · no frameworks · NSIS installer · electron-updater
