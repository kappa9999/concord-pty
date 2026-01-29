# Getting Started

This guide shows how to run two CLI agents in separate PTYs and have them iterate until they agree.

## 1) Install

```bash
npm install
```

## 2) Setup wizard (no manual edits)

```bash
node ./bin/concord-pty.js setup
```

This writes `concord.config.json` if you choose to save, or runs from in-memory settings.

## 3) Run a task

```bash
node ./bin/concord-pty.js --task "Design a minimal API and test plan"
```

## 4) Interactive roles (no config edits)

```bash
node ./bin/concord-pty.js --interactive --task "Create a UI spec and review it"
```

## 5) Using the same model twice

Copy the template and edit the command to your CLI:

```bash
copy examples\concord.config.same-model.json concord.config.json
```

```bash
node ./bin/concord-pty.js --task "Create a UI spec and review it"
```

## 6) Using two different CLIs

Copy the template and edit both commands:

```bash
copy examples\concord.config.two-clis.json concord.config.json
```

```bash
node ./bin/concord-pty.js --task "Draft a plan and critique it"
```

## 7) Logs

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

