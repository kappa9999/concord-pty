const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Command } = require('commander');
const Orchestrator = require('./orchestrator');
const Tui = require('./tui');
const { loadConfig, applyOverrides } = require('./config');

function resolveConfigPath(inputPath) {
  return path.resolve(process.cwd(), inputPath || 'concord.config.json');
}

function configExists(inputPath) {
  const resolved = resolveConfigPath(inputPath);
  return fs.existsSync(resolved) ? resolved : null;
}

async function readAllStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}

async function promptTask() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Enter task: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getTask(opts) {
  if (opts.task) return opts.task;
  if (process.env.CONCORD_TASK) return process.env.CONCORD_TASK.trim();
  if (opts.taskFile) return fs.readFileSync(path.resolve(process.cwd(), opts.taskFile), 'utf8').trim();
  if (!process.stdin.isTTY) return await readAllStdin();
  return await promptTask();
}

function initConfig() {
  const target = resolveConfigPath();
  if (fs.existsSync(target)) {
    console.error('concord.config.json already exists');
    process.exit(1);
  }
  const source = path.resolve(__dirname, '..', 'examples', 'concord.config.json');
  fs.copyFileSync(source, target);
  console.log('Wrote concord.config.json');
}

function createPrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (label, defaultValue) =>
    new Promise((resolve) => {
      const suffix = defaultValue ? ` [${defaultValue}]` : '';
      rl.question(`${label}${suffix}: `, (answer) => {
        const trimmed = String(answer || '').trim();
        if (!trimmed && defaultValue !== undefined) return resolve(String(defaultValue));
        resolve(trimmed);
      });
    });

  const askYesNo = async (label, defaultValue) => {
    const suffix = defaultValue ? 'Y/n' : 'y/N';
    const answer = await ask(`${label} (${suffix})`, '');
    if (!answer) return defaultValue;
    return ['y', 'yes'].includes(answer.toLowerCase());
  };

  return { rl, ask, askYesNo };
}

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitArgs(text) {
  if (!text) return [];
  const re = /"([^"]*)"|'([^']*)'|\S+/g;
  const args = [];
  let match = re.exec(text);
  while (match) {
    args.push(match[1] || match[2] || match[0]);
    match = re.exec(text);
  }
  return args;
}

async function runSetupWizard(options) {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive setup requires a TTY');
  }

  const prompt = createPrompt();
  const askRequired = async (label) => {
    let value = '';
    while (!value) {
      value = await prompt.ask(label, '');
    }
    return value;
  };

  const sameCommand = await prompt.askYesNo('Use the same command for both agents?', true);
  const commandA = await askRequired('Command for Agent A');
  let commandB = commandA;
  if (!sameCommand) {
    commandB = await askRequired('Command for Agent B');
  }

  const nameA = await prompt.ask('Name for Agent A', 'Alpha');
  const nameB = await prompt.ask('Name for Agent B', 'Beta');
  const roleA = await prompt.ask('Role for Agent A', 'Planner');
  const roleB = await prompt.ask('Role for Agent B', 'Critic');
  const sessionName = await prompt.ask('Session name (optional)', '');
  const maxRounds = toInt(await prompt.ask('Max rounds', '6'), 6);
  const timeoutMs = toInt(await prompt.ask('Timeout ms', '120000'), 120000);
  const idleMs = toInt(await prompt.ask('Idle ms', '1500'), 1500);
  const enableTui = await prompt.askYesNo('Enable TUI?', true);

  const config = {
    session: {
      maxRounds,
      timeoutMs,
      idleMs
    },
    tui: {
      enabled: enableTui
    },
    agents: {
      alpha: {
        name: nameA,
        role: roleA,
        command: commandA
      },
      beta: {
        name: nameB,
        role: roleB,
        command: commandB
      }
    }
  };

  if (sessionName) config.session.name = sessionName;

  let saveConfig = options.saveConfig;
  if (saveConfig === undefined) {
    saveConfig = await prompt.askYesNo(`Save config to ${options.configPath}?`, false);
  }

  prompt.rl.close();

  if (saveConfig) {
    fs.writeFileSync(options.configPath, JSON.stringify(config, null, 2));
    console.log(`Wrote ${path.basename(options.configPath)}`);
  }

  return config;
}

function applyCommand(agent, command) {
  if (!command) return;
  agent.command = command;
  delete agent.cmd;
  delete agent.args;
}

function applyCmdArgs(agent, cmd, argsText) {
  if (!cmd) return;
  agent.cmd = cmd;
  agent.args = splitArgs(argsText);
  delete agent.command;
}

function applyAgentOverrides(config, overrides) {
  if (!config || !config.agents) return;
  const alpha = config.agents.alpha;
  const beta = config.agents.beta;

  if (overrides.nameA) alpha.name = overrides.nameA;
  if (overrides.nameB) beta.name = overrides.nameB;
  if (overrides.roleA) alpha.role = overrides.roleA;
  if (overrides.roleB) beta.role = overrides.roleB;

  if (overrides.commandA) applyCommand(alpha, overrides.commandA);
  if (overrides.commandB) applyCommand(beta, overrides.commandB);

  if (overrides.cmdA) applyCmdArgs(alpha, overrides.cmdA, overrides.argsA || '');
  if (overrides.cmdB) applyCmdArgs(beta, overrides.cmdB, overrides.argsB || '');

  if (overrides.sessionName) {
    config.session = config.session || {};
    config.session.name = overrides.sessionName;
  }
}

function collectOverrides(opts) {
  const env = process.env;
  const overrides = {
    nameA: env.CONCORD_AGENT_A_NAME,
    nameB: env.CONCORD_AGENT_B_NAME,
    roleA: env.CONCORD_AGENT_A_ROLE,
    roleB: env.CONCORD_AGENT_B_ROLE,
    commandA: env.CONCORD_AGENT_A_COMMAND,
    commandB: env.CONCORD_AGENT_B_COMMAND,
    sessionName: env.CONCORD_SESSION_NAME
  };

  if (opts.name) {
    overrides.nameA = opts.name;
    overrides.nameB = opts.name;
  }
  if (opts.role) {
    overrides.roleA = opts.role;
    overrides.roleB = opts.role;
  }
  if (opts.command) {
    overrides.commandA = opts.command;
    overrides.commandB = opts.command;
  }

  if (opts.nameA) overrides.nameA = opts.nameA;
  if (opts.nameB) overrides.nameB = opts.nameB;
  if (opts.roleA) overrides.roleA = opts.roleA;
  if (opts.roleB) overrides.roleB = opts.roleB;
  if (opts.commandA) overrides.commandA = opts.commandA;
  if (opts.commandB) overrides.commandB = opts.commandB;
  if (opts.cmdA) overrides.cmdA = opts.cmdA;
  if (opts.cmdB) overrides.cmdB = opts.cmdB;
  if (opts.argsA) overrides.argsA = opts.argsA;
  if (opts.argsB) overrides.argsB = opts.argsB;
  if (opts.sessionName) overrides.sessionName = opts.sessionName;

  return overrides;
}

function buildConfigFromOverrides(overrides, defaults) {
  const commandA = overrides.commandA;
  const commandB = overrides.commandB;
  const hasCommand = commandA && commandB;
  const hasCmdArgs = overrides.cmdA && overrides.cmdB;
  if (!hasCommand && !hasCmdArgs) return null;

  const config = {
    session: {
      maxRounds: defaults.maxRounds,
      timeoutMs: defaults.timeoutMs,
      idleMs: defaults.idleMs
    },
    tui: {
      enabled: defaults.tuiEnabled
    },
    agents: {
      alpha: {
        name: overrides.nameA || 'Alpha',
        role: overrides.roleA || 'Planner'
      },
      beta: {
        name: overrides.nameB || 'Beta',
        role: overrides.roleB || 'Critic'
      }
    }
  };

  if (hasCommand) {
    config.agents.alpha.command = commandA;
    config.agents.beta.command = commandB;
  } else {
    config.agents.alpha.cmd = overrides.cmdA;
    config.agents.alpha.args = splitArgs(overrides.argsA || '');
    config.agents.beta.cmd = overrides.cmdB;
    config.agents.beta.args = splitArgs(overrides.argsB || '');
  }

  if (overrides.sessionName) config.session.name = overrides.sessionName;
  return config;
}

async function promptInteractiveOverrides(config) {
  if (!process.stdin.isTTY) return config;

  const prompt = createPrompt();

  const roleA = await prompt.ask('Role for Agent A', config.agents.alpha.role || 'Planner');
  const roleB = await prompt.ask('Role for Agent B', config.agents.beta.role || 'Critic');
  if (roleA) config.agents.alpha.role = roleA;
  if (roleB) config.agents.beta.role = roleB;

  const changeNames = await prompt.askYesNo('Override agent names?', false);
  if (changeNames) {
    const nameA = await prompt.ask('Name for Agent A', config.agents.alpha.name || 'Alpha');
    const nameB = await prompt.ask('Name for Agent B', config.agents.beta.name || 'Beta');
    if (nameA) config.agents.alpha.name = nameA;
    if (nameB) config.agents.beta.name = nameB;
  }

  const changeCommands = await prompt.askYesNo('Override commands for this session?', false);
  if (changeCommands) {
    const same = await prompt.askYesNo('Use the same command for both agents?', true);
    const commandA = await prompt.ask('Command for Agent A', config.agents.alpha.command || '');
    let commandB = commandA;
    if (!same) {
      commandB = await prompt.ask('Command for Agent B', config.agents.beta.command || '');
    }
    if (commandA) applyCommand(config.agents.alpha, commandA);
    if (commandB) applyCommand(config.agents.beta, commandB);
  }

  const sessionName = await prompt.ask('Session name (optional)', config.session && config.session.name ? config.session.name : '');
  if (sessionName) {
    config.session = config.session || {};
    config.session.name = sessionName;
  }

  prompt.rl.close();
  return config;
}

async function main(argv) {
  const program = new Command();
  program
    .name('concord-pty')
    .description('PTY-based two-agent orchestrator for CLI models')
    .option('-c, --config <path>', 'Config path (default: concord.config.json)')
    .option('-t, --task <text>', 'Task text')
    .option('--task-file <path>', 'Read task from file')
    .option('--no-tui', 'Disable split TUI')
    .option('--interactive', 'Prompt for roles/names/commands at runtime')
    .option('--save-config', 'Save config when using setup/interactive')
    .option('--print-config', 'Print resolved config and exit')
    .option('--session-name <name>', 'Label session log folder')
    .option('--name <text>', 'Name for both agents')
    .option('--name-a <text>', 'Name for agent A')
    .option('--name-b <text>', 'Name for agent B')
    .option('--role <text>', 'Role for both agents')
    .option('--role-a <text>', 'Role for agent A')
    .option('--role-b <text>', 'Role for agent B')
    .option('--command <text>', 'Command for both agents')
    .option('--command-a <text>', 'Command for agent A')
    .option('--command-b <text>', 'Command for agent B')
    .option('--cmd-a <text>', 'Executable for agent A (use with --args-a)')
    .option('--args-a <text>', 'Args for agent A (quoted string)')
    .option('--cmd-b <text>', 'Executable for agent B (use with --args-b)')
    .option('--args-b <text>', 'Args for agent B (quoted string)')
    .option('--max-rounds <n>', 'Override max rounds', (v) => parseInt(v, 10))
    .option('--timeout-ms <n>', 'Override message hard timeout', (v) => parseInt(v, 10))
    .option('--idle-ms <n>', 'Override idle timeout', (v) => parseInt(v, 10))
    .option('--sentinel <string>', 'Override end-of-message sentinel')
    .argument('[cmd]', 'Command')
    .parse(argv);

  const opts = program.opts();
  const cmd = program.args[0];
  const isSetup = cmd === 'setup' || cmd === 'wizard';

  if (cmd === 'init') {
    initConfig();
    return;
  }

  const configPath = resolveConfigPath(opts.config);
  const overrides = collectOverrides(opts);

  let config = null;
  const defaults = {
    maxRounds: 6,
    timeoutMs: 120000,
    idleMs: 1500,
    tuiEnabled: opts.tui
  };

  if (isSetup) {
    config = await runSetupWizard({ configPath, saveConfig: opts.saveConfig });
  } else if (configExists(opts.config)) {
    config = loadConfig(opts.config);
  } else {
    config = buildConfigFromOverrides(overrides, defaults);
    if (!config && opts.interactive) {
      config = await runSetupWizard({ configPath, saveConfig: opts.saveConfig });
    }
  }

  if (!config) {
    console.error('Config not found. Run: node ./bin/concord-pty.js init or node ./bin/concord-pty.js setup');
    process.exit(1);
  }

  applyOverrides(config, {
    maxRounds: opts.maxRounds,
    timeoutMs: opts.timeoutMs,
    idleMs: opts.idleMs,
    sentinel: opts.sentinel,
    tui: opts.tui
  });

  applyAgentOverrides(config, overrides);

  if (opts.interactive) {
    await promptInteractiveOverrides(config);
  }

  if (opts.printConfig) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  const task = await getTask(opts);
  if (!task) {
    console.error('Task is required');
    process.exit(1);
  }

  const tui = new Tui(config.tui && typeof config.tui.enabled === 'boolean' ? config.tui.enabled : true);
  tui.start(config.agents.alpha.name || 'Alpha', config.agents.beta.name || 'Beta');

  const orch = new Orchestrator(config, { task, tui });
  const summary = await orch.run();

  if (!tui.enabled) {
    console.log(JSON.stringify(summary, null, 2));
  }
}

module.exports = { main };

if (require.main === module) {
  main(process.argv).catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}
