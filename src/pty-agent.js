const pty = require('node-pty');
const { stripAnsi } = require('./utils');

class PtyAgent {
  constructor(id, cfg, options) {
    this.id = id;
    this.name = cfg.name || id;
    this.role = cfg.role || '';
    this.command = cfg.command || null;
    this.cmd = cfg.cmd || null;
    this.args = Array.isArray(cfg.args) ? cfg.args : [];
    this.cwd = cfg.cwd || process.cwd();
    this.env = cfg.env || {};
    this.cols = cfg.cols || 120;
    this.rows = cfg.rows || 40;
    this.readyDelayMs = cfg.readyDelayMs || 1000;
    this.onData = options.onData;
    this.rawLogStream = options.rawLogStream || null;

    this.pty = null;
    this.pending = null;
    this.messageBuffer = '';
    this.lastDataAt = 0;
  }

  start() {
    const spawnConfig = {
      name: 'xterm-color',
      cols: this.cols,
      rows: this.rows,
      cwd: this.cwd,
      env: { ...process.env, ...this.env }
    };

    if (this.command) {
      const isWin = process.platform === 'win32';
      const shell = isWin ? process.env.COMSPEC || 'cmd.exe' : '/bin/sh';
      const shellArgs = isWin
        ? ['/d', '/s', '/c', this.command]
        : ['-lc', this.command];
      this.pty = pty.spawn(shell, shellArgs, spawnConfig);
    } else {
      this.pty = pty.spawn(this.cmd, this.args, spawnConfig);
    }

    this.pty.onData((data) => {
      this.lastDataAt = Date.now();
      if (this.rawLogStream) this.rawLogStream.write(data);
      if (this.onData) this.onData(this.id, data);
      if (this.pending) {
        this.messageBuffer += data;
        const idx = this.messageBuffer.indexOf(this.pending.sentinel);
        if (idx !== -1) {
          const message = this.messageBuffer.slice(0, idx);
          this.messageBuffer = '';
          this._resolvePending(message, 'sentinel');
        }
      }
    });

    this.pty.onExit(() => {
      if (this.pending) {
        this._rejectPending(new Error('PTY exited')); 
      }
    });
  }

  stop() {
    if (this.pty) {
      try {
        this.pty.kill();
      } catch (_) {
        // ignore
      }
    }
  }

  write(text) {
    if (!this.pty) throw new Error('PTY not started');
    this.pty.write(text);
  }

  async sendMessage(prompt, options) {
    const { sentinel, idleMs, timeoutMs, endStrategy } = options;
    if (!this.pty) throw new Error('PTY not started');

    if (this.pending) throw new Error('Message already pending');

    this.messageBuffer = '';
    this.lastDataAt = Date.now();

    return new Promise((resolve, reject) => {
      const hardTimer = setTimeout(() => {
        this._rejectPending(new Error('Message timeout'));
      }, timeoutMs);

      const idleTimer = setInterval(() => {
        if (!this.pending) return;
        if (endStrategy === 'sentinel') return;
        const idleFor = Date.now() - this.lastDataAt;
        if (idleFor >= idleMs && this.messageBuffer.trim().length > 0) {
          const message = this.messageBuffer;
          this.messageBuffer = '';
          this._resolvePending(message, 'idle');
        }
      }, 200);

      this.pending = {
        sentinel,
        resolve: (message) => {
          clearTimeout(hardTimer);
          clearInterval(idleTimer);
          resolve(message);
        },
        reject: (err) => {
          clearTimeout(hardTimer);
          clearInterval(idleTimer);
          reject(err);
        }
      };

      this.write(prompt + '\r');
    }).then((message) => stripAnsi(message));
  }

  _resolvePending(message) {
    const pending = this.pending;
    this.pending = null;
    if (pending) pending.resolve(message);
  }

  _rejectPending(err) {
    const pending = this.pending;
    this.pending = null;
    if (pending) pending.reject(err);
  }
}

module.exports = PtyAgent;
