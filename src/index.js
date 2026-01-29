const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Command } = require('commander');
const Orchestrator = require('./orchestrator');
const Tui = require('./tui');
const { loadConfig, applyOverrides } = require('./config');

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
  if (opts.taskFile) return fs.readFileSync(path.resolve(process.cwd(), opts.taskFile), 'utf8').trim();
  if (!process.stdin.isTTY) return await readAllStdin();
  return await promptTask();
}

function initConfig() {
  const target = path.resolve(process.cwd(), 'concord.config.json');
  if (fs.existsSync(target)) {
    console.error('concord.config.json already exists');
    process.exit(1);
  }
  const source = path.resolve(__dirname, '..', 'examples', 'concord.config.json');
  fs.copyFileSync(source, target);
  console.log('Wrote concord.config.json');
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
    .option('--max-rounds <n>', 'Override max rounds', (v) => parseInt(v, 10))
    .option('--timeout-ms <n>', 'Override message hard timeout', (v) => parseInt(v, 10))
    .option('--idle-ms <n>', 'Override idle timeout', (v) => parseInt(v, 10))
    .option('--sentinel <string>', 'Override end-of-message sentinel')
    .argument('[cmd]', 'Command')
    .parse(argv);

  const opts = program.opts();
  const cmd = program.args[0];

  if (cmd === 'init') {
    initConfig();
    return;
  }

  const config = loadConfig(opts.config);
  applyOverrides(config, {
    maxRounds: opts.maxRounds,
    timeoutMs: opts.timeoutMs,
    idleMs: opts.idleMs,
    sentinel: opts.sentinel,
    tui: opts.tui
  });

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
