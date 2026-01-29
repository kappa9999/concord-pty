const blessed = require('blessed');
const { stripAnsi } = require('./utils');

class Tui {
  constructor(enabled) {
    this.enabled = enabled;
    this.screen = null;
    this.boxA = null;
    this.boxB = null;
    this.status = null;
    this.buffers = { A: [], B: [] };
    this.maxLines = 1200;
  }

  start(agentAName, agentBName) {
    if (!this.enabled) return;
    this.screen = blessed.screen({ smartCSR: true, title: 'Concord-PTY' });

    this.boxA = blessed.box({
      top: 0,
      left: 0,
      width: '50%',
      height: '85%',
      label: ` ${agentAName} `,
      border: 'line',
      scrollable: true,
      alwaysScroll: true
    });

    this.boxB = blessed.box({
      top: 0,
      left: '50%',
      width: '50%',
      height: '85%',
      label: ` ${agentBName} `,
      border: 'line',
      scrollable: true,
      alwaysScroll: true
    });

    this.status = blessed.box({
      top: '85%',
      left: 0,
      width: '100%',
      height: '15%',
      label: ' Status ',
      border: 'line',
      scrollable: true
    });

    this.screen.append(this.boxA);
    this.screen.append(this.boxB);
    this.screen.append(this.status);

    this.screen.key(['C-c', 'q'], () => {
      this.screen.destroy();
      process.exit(0);
    });

    this.screen.render();
  }

  append(id, text) {
    if (!this.enabled) return;
    const clean = stripAnsi(text).replace(/\r/g, '');
    const lines = clean.split('\n');
    const key = id === 'A' ? 'A' : 'B';
    this.buffers[key].push(...lines);
    if (this.buffers[key].length > this.maxLines) {
      this.buffers[key] = this.buffers[key].slice(-this.maxLines);
    }
    const target = id === 'A' ? this.boxA : this.boxB;
    target.setContent(this.buffers[key].join('\n'));
    target.setScrollPerc(100);
    this.screen.render();
  }

  setStatus(text) {
    if (!this.enabled) return;
    this.status.setContent(text);
    this.status.setScrollPerc(100);
    this.screen.render();
  }

  stop() {
    if (this.screen) this.screen.destroy();
  }
}

module.exports = Tui;
