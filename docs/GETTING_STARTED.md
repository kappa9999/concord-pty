# Getting Started

This guide shows how to run two CLI agents in separate PTYs and have them iterate until they agree.

## 1) Install

```bash
npm install
```

## 2) Create a config

```bash
node ./bin/concord-pty.js init
```

This writes `concord.config.json`. Edit it to point at your two CLI commands.

## 3) Run a task

```bash
node ./bin/concord-pty.js --task "Design a minimal API and test plan"
```

## 4) Using the same model twice

Copy the template and edit the command to your CLI:

```bash
copy examples\concord.config.same-model.json concord.config.json
```

```bash
node ./bin/concord-pty.js --task "Create a UI spec and review it"
```

## 5) Using two different CLIs

Copy the template and edit both commands:

```bash
copy examples\concord.config.two-clis.json concord.config.json
```

```bash
node ./bin/concord-pty.js --task "Draft a plan and critique it"
```

## 6) Logs

Each run creates `sessions/<timestamp>/` with:
- `agentA.log`
- `agentB.log`
- `transcript.jsonl`
- `summary.json`

On Windows, tail logs like this:

```powershell
Get-Content -Wait sessions\<timestamp>\agentA.log
```

## Tips
- If responses cut off, increase `timeoutMs` or `idleMs` in config.
- If a CLI prints extra banners, the sentinel helps detect message boundaries.
- For common issues, see `docs/TROUBLESHOOTING.md`.

