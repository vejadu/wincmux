# WinCMux

**Voice-controlled command prompt manager for GitHub Copilot agent sessions**

WinCMux multiplexes multiple Copilot coding agent sessions across Windows Terminal panes, with a notification feed (GitHub, Teams, email) and always-on passive voice control so you can switch between sessions hands-free.

---

## Requirements

- **Windows 10 or later** (Windows Terminal required)
- **Node.js 22.5.0+**
- **Windows Terminal** (`wt.exe` in PATH)
- Optional: Picovoice AccessKey (wake-word detection)
- Optional: Azure Speech Services key (speech-to-text)
- Optional: Azure AD tenant + client ID (Teams integration)

---

## Usage

```sh
npx @vejadu/wincmux
```

Launches WinCMux with the TUI dashboard. On first run, creates `~/.wincmux/config.json` with defaults — fill in your tokens and restart.

```sh
npx @vejadu/wincmux --issues
```

Auto-spawns one Windows Terminal pane per open GitHub issue labelled `squad` (up to 9), then opens the dashboard. Requires `gh` CLI authenticated.

Or install globally:

```sh
npm install -g @vejadu/wincmux
wincmux [--issues]
```

---

## Configuration

WinCMux reads `~/.wincmux/config.json` on startup, creating it with defaults on first run. Fill in the fields you need and restart:

```json
{
  "_comment": "WinCMux configuration. Edit and restart wincmux to apply changes.",
  "githubToken": "ghp_...",
  "picovoiceAccessKey": "...",
  "azureSpeechKey": "...",
  "azureSpeechRegion": "eastus",
  "teams": { "tenantId": "...", "clientId": "..." },
  "notificationPollIntervalMs": 30000,
  "sessionMonitorIntervalMs": 2000,
  "maxPanes": 9,
  "wakeWord": "computer"
}
```

| Field | Description |
|---|---|
| `githubToken` | Personal access token for GitHub notification polling. Falls back to `GITHUB_TOKEN` env var. |
| `picovoiceAccessKey` | Porcupine wake-word key (free at console.picovoice.ai). Omit to disable voice. |
| `azureSpeechKey` / `azureSpeechRegion` | Azure Cognitive Services for speech-to-text. |
| `teams.tenantId` / `teams.clientId` | Azure AD app for Teams change notifications. |
| `notificationPollIntervalMs` | How often to poll GitHub (ms). Default: 30000. |
| `sessionMonitorIntervalMs` | How often to sample PTY buffer for status detection (ms). Default: 2000. |
| `maxPanes` | Maximum number of concurrent panes. Default: 9. |
| `wakeWord` | Wake-word phrase passed to Porcupine. Default: `"computer"`. |

---

## Voice Setup

1. **Wake word** — powered by [Porcupine](https://picovoice.ai/). Get a free AccessKey at https://console.picovoice.ai/ and set `voice.picovoiceAccessKey` in config.
2. **Speech-to-text** — powered by Azure Cognitive Services Speech SDK. Create a Speech resource in the Azure portal and set `voice.azureSpeechKey` + `voice.azureSpeechRegion`.

Voice commands (after wake word "Hey WinCMux"):
- `"switch to [N]"` — focus session N
- `"status"` — read latest notification aloud
- `"pause all"` — suspend all agent sessions

---

## Teams Setup

1. Register an Azure AD app with `ChangeNotifications.Read` permissions.
2. Set `teams.tenantId` and `teams.clientId` in `~/.wincmux/config.json`.
3. WinCMux will flash the feed panel badge on new Teams activity.

---

## Architecture

```
src/
├── index.ts              — entry point, session state, event bus
├── launcher.ts           — wt.exe pane spawning via node-pty
├── session-manager.ts    — track N sessions (pid, pty, xterm buffer, status, issue#)
├── notification-feed.ts  — poll GitHub events (@octokit/rest)
├── voice/
│   ├── wake-word.ts      — Porcupine passive listener (always-on)
│   ├── stt.ts            — Azure Speech SDK (triggered after wake word)
│   └── command-parser.ts — "switch to 2" → action dispatch
├── integrations/
│   ├── teams.ts          — Graph API change notifications → flash/badge alert
│   └── email-agent.ts    — hook for squad email-watcher agents → feed alerts
├── tui/
│   ├── dashboard.tsx     — Ink: session tiles grid
│   ├── feed-panel.tsx    — GitHub + Teams + email notifications sidebar
│   ├── voice-overlay.tsx — mic active / wake word detected indicator
│   └── alert-badge.tsx   — flash/badge for Teams/email pane
└── config.ts             — ~/.wincmux/config.json loader
```

---

## License

MIT
