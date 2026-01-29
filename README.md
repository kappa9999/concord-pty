# Concord-PTY

PTY-based two-agent orchestrator for CLI models. It launches two agent CLIs, assigns roles, and loops their feedback until both agree on a shared plan.

## Features
- Works with any CLI model by spawning it inside a PTY
- Role-based prompts with a simple agreement protocol
- Split-screen TUI (two live panes plus status)
- Plain mode with logs for external tailing
- Session transcripts and raw logs per agent

## Quick start
1) Install dependencies

```bash
npm install
```

2) Create a config

```bash
node ./bin/concord-pty.js init
```

3) Edit `concord.config.json` with your two agent commands and roles

4) Run a session

```bash
node ./bin/concord-pty.js --task "Design a minimal API and test plan"
```

For a step-by-step guide, see `docs/GETTING_STARTED.md`.

## CLI usage

```bash
node ./bin/concord-pty.js [options]

Options:
  -c, --config <path>     Config path (default: concord.config.json)
  -t, --task <text>       Task text
  --task-file <path>      Read task from file
  --no-tui                Disable split TUI
  --max-rounds <n>        Override max rounds
  --timeout-ms <n>        Override message hard timeout
  --idle-ms <n>           Override idle timeout
  --sentinel <string>     Override end-of-message sentinel
```

## Config
The `init` command writes `concord.config.json`. Example:

```json
{
  "session": {
    "maxRounds": 6,
    "timeoutMs": 120000,
    "idleMs": 1500
  },
  "tui": {
    "enabled": true
  },
  "agents": {
    "alpha": {
      "name": "Alpha",
      "role": "Planner",
      "command": "your-cli-a --your-args"
    },
    "beta": {
      "name": "Beta",
      "role": "Critic",
      "command": "your-cli-b --your-args"
    }
  }
}
```

You can also use `cmd` + `args` instead of `command` if you prefer exact argument splitting.

## Using the same model twice
You can run the same CLI/model in both slots with different roles. Example:

```json
{
  "session": {
    "maxRounds": 6,
    "timeoutMs": 120000,
    "idleMs": 1500
  },
  "tui": {
    "enabled": true
  },
  "agents": {
    "alpha": {
      "name": "Designer",
      "role": "Designer",
      "command": "codex --model gpt-5.2 --interactive"
    },
    "beta": {
      "name": "Reviewer",
      "role": "Reviewer/Critic",
      "command": "codex --model gpt-5.2 --interactive"
    }
  }
}
```

There is also a ready-made template at `examples/concord.config.same-model.json`.

For two different CLIs, use `examples/concord.config.two-clis.json`.

## Protocol
Concord-PTY sends a short bootstrap message that tells each agent to:
- Always answer with:
  - `AGREE: yes|no`
  - `PROPOSAL:` (the plan)
  - optional `NOTES:`
- End every response with the sentinel shown in the prompt

If a model fails to print the sentinel, Concord-PTY can fall back to idle detection.

## Logs
Each session writes to `sessions/<timestamp>/`:
- `agentA.log` and `agentB.log` (raw PTY output)
- `transcript.jsonl` (structured messages)
- `summary.json` (final agreement)

Open two terminals to tail logs if you prefer separate windows:

```bash
tail -f sessions/<timestamp>/agentA.log
```

```powershell
Get-Content -Wait sessions/<timestamp>/agentB.log
```

## Notes
- Some CLIs display prompts or extra text; the sentinel helps delimit responses.
- If you see premature cutoffs, increase `timeoutMs` or `idleMs` in config.
- For common issues, see `docs/TROUBLESHOOTING.md`.

