const fs = require('fs');
const path = require('path');

function resolveConfigPath(inputPath) {
  if (inputPath) return path.resolve(process.cwd(), inputPath);
  const defaultPath = path.resolve(process.cwd(), 'concord.config.json');
  if (fs.existsSync(defaultPath)) return defaultPath;
  return null;
}

function loadConfig(inputPath) {
  const resolved = resolveConfigPath(inputPath);
  if (!resolved || !fs.existsSync(resolved)) {
    throw new Error('Config not found. Run: node ./bin/concord-pty.js init or node ./bin/concord-pty.js setup');
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const cfg = JSON.parse(raw);
  validateConfig(cfg);
  cfg.__path = resolved;
  return cfg;
}

function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') {
    throw new Error('Config must be an object');
  }
  if (!cfg.agents || !cfg.agents.alpha || !cfg.agents.beta) {
    throw new Error('Config must define agents.alpha and agents.beta');
  }
  const a = cfg.agents.alpha;
  const b = cfg.agents.beta;
  if (!a.command && !a.cmd) {
    throw new Error('agents.alpha must define command or cmd');
  }
  if (!b.command && !b.cmd) {
    throw new Error('agents.beta must define command or cmd');
  }
}

function applyOverrides(cfg, opts) {
  cfg.session = cfg.session || {};
  cfg.tui = cfg.tui || {};

  if (typeof opts.maxRounds === 'number') cfg.session.maxRounds = opts.maxRounds;
  if (typeof opts.timeoutMs === 'number') cfg.session.timeoutMs = opts.timeoutMs;
  if (typeof opts.idleMs === 'number') cfg.session.idleMs = opts.idleMs;
  if (typeof opts.sentinel === 'string') cfg.session.sentinel = opts.sentinel;

  if (typeof opts.tui === 'boolean') cfg.tui.enabled = opts.tui;

  return cfg;
}

module.exports = {
  loadConfig,
  applyOverrides
};
