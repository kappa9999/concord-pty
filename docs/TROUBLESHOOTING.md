# Troubleshooting

## No output or immediate exit
- Verify the command runs standalone in your terminal.
- If the CLI needs a shell, use `command` instead of `cmd` + `args`.
- On Windows, confirm your CLI is in `PATH`.

## Responses cut off early
- Increase `timeoutMs` or `idleMs` in `concord.config.json`.
- Some CLIs buffer output; try a larger `idleMs` (e.g. 3000).

## Sentinel not detected
- Ensure the CLI is not stripping or wrapping the sentinel line.
- If a model does not follow instructions, set `session.endStrategy` to `idle` in config.

## CLI prints banners or prompts in output
- This is normal for many tools. The sentinel is used to delimit responses.
- If banners are too noisy, add a `bootstrap` note to the agent to reduce chatter.

## Windows-specific PTY issues
- `node-pty` uses ConPTY. If you see broken characters, try a different terminal font.
- If the CLI uses ANSI-less output, it still works; Concord-PTY strips ANSI codes.

## Logs are empty
- Check `sessions/<timestamp>/agentA.log` and `agentB.log` for raw PTY output.
- Make sure the process is still running and the PTY did not exit early.

## Still stuck?
- Share the `summary.json` and the raw logs for both agents.

