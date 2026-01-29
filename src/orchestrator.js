const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PtyAgent = require('./pty-agent');
const { normalizeProposal, hashText, nowIso, sleep, sanitizeName } = require('./utils');

function generateSentinel() {
  const id = crypto.randomBytes(4).toString('hex');
  return `<<END_OF_MESSAGE_${id}>>`;
}

function buildBootstrap(agent, sentinel, extra) {
  const extraText = extra ? `\nExtra instructions:\n${extra}\n` : '';
  return (
    `You are ${agent.name}. Role: ${agent.role}.\n` +
    'You will collaborate with another agent.\n' +
    'Always respond in this exact format:\n' +
    'AGREE: yes|no\n' +
    'PROPOSAL:\n' +
    '<plan or steps>\n' +
    'NOTES:\n' +
    '<optional>\n\n' +
    `End every response with this sentinel on its own line:\n${sentinel}\n` +
    extraText +
    'For this bootstrap only, reply:\n' +
    'AGREE: yes\n' +
    'PROPOSAL:\n' +
    'READY\n' +
    'NOTES:\n' +
    'OK\n' +
    `${sentinel}\n`
  );
}

function buildProposalRequest(task, sentinel) {
  return (
    'Task:\n' +
    task +
    '\n\nPropose a plan. Use the required format.\n' +
    `End with:\n${sentinel}\n`
  );
}

function buildReviewRequest(task, proposal, counterpartMsg, sentinel) {
  return (
    'Task:\n' +
    task +
    '\n\nCurrent proposal to review:\n' +
    proposal +
    '\n\nMost recent message from your counterpart:\n' +
    counterpartMsg +
    '\n\nIf you agree, set AGREE: yes and restate the proposal under PROPOSAL.\n' +
    'If you disagree, set AGREE: no and provide a revised PROPOSAL.\n' +
    `End with:\n${sentinel}\n`
  );
}

function parseResponse(text) {
  const agreeMatch = text.match(/AGREE\s*:\s*(yes|no)/i);
  const agree = agreeMatch ? agreeMatch[1].toLowerCase() === 'yes' : false;

  let proposal = '';
  const proposalIndex = text.search(/PROPOSAL\s*:/i);
  if (proposalIndex !== -1) {
    const after = text.slice(proposalIndex).replace(/^[\s\S]*?PROPOSAL\s*:\s*/i, '');
    proposal = after.split(/NOTES\s*:/i)[0].trim();
  } else {
    proposal = text.trim();
  }

  return { agree, proposal, raw: text.trim() };
}

class Orchestrator {
  constructor(config, options) {
    this.config = config;
    this.task = options.task;
    this.tui = options.tui;

    this.sessionDir = null;
    this.transcriptStream = null;

    this.sentinel = config.session && config.session.sentinel ? config.session.sentinel : generateSentinel();
    this.maxRounds = (config.session && config.session.maxRounds) || 6;
    this.timeoutMs = (config.session && config.session.timeoutMs) || 120000;
    this.idleMs = (config.session && config.session.idleMs) || 1500;
    this.endStrategy = (config.session && config.session.endStrategy) || 'sentinel_or_idle';
  }

  _initLogs() {
    const ts = nowIso().replace(/[:.]/g, '-');
    const label = this.config.session && this.config.session.name ? sanitizeName(this.config.session.name) : '';
    const dirName = label ? `${ts}_${label}` : ts;
    const dir = path.resolve(process.cwd(), 'sessions', dirName);
    fs.mkdirSync(dir, { recursive: true });
    this.sessionDir = dir;
    this.transcriptStream = fs.createWriteStream(path.join(dir, 'transcript.jsonl'), { flags: 'a' });
    return dir;
  }

  _logMessage(entry) {
    if (!this.transcriptStream) return;
    this.transcriptStream.write(JSON.stringify(entry) + '\n');
  }

  async run() {
    const logDir = this._initLogs();

    const agentA = new PtyAgent('A', this.config.agents.alpha, {
      onData: (id, data) => this.tui.append(id, data),
      rawLogStream: fs.createWriteStream(path.join(logDir, 'agentA.log'), { flags: 'a' })
    });

    const agentB = new PtyAgent('B', this.config.agents.beta, {
      onData: (id, data) => this.tui.append(id, data),
      rawLogStream: fs.createWriteStream(path.join(logDir, 'agentB.log'), { flags: 'a' })
    });

    agentA.start();
    agentB.start();

    this.tui.setStatus('Starting agents...');
    await sleep(Math.max(agentA.readyDelayMs, agentB.readyDelayMs));

    const bootA = buildBootstrap(agentA, this.sentinel, this.config.agents.alpha.bootstrap);
    const bootB = buildBootstrap(agentB, this.sentinel, this.config.agents.beta.bootstrap);
    await agentA.sendMessage(bootA, this._messageOptions());
    await agentB.sendMessage(bootB, this._messageOptions());

    this.tui.setStatus('Bootstrap complete. Requesting initial proposal...');

    const firstA = await agentA.sendMessage(buildProposalRequest(this.task, this.sentinel), this._messageOptions());
    const parsedFirstA = parseResponse(firstA);

    let proposal = parsedFirstA.proposal || firstA;
    let proposalHash = hashText(normalizeProposal(proposal));

    this._logMessage({ ts: nowIso(), agent: 'A', phase: 'proposal', agree: parsedFirstA.agree, proposalHash, text: firstA });

    let lastA = firstA;
    let lastB = '';

    let agreedA = false;
    let agreedB = false;

    for (let round = 1; round <= this.maxRounds; round += 1) {
      this.tui.setStatus(`Round ${round} - awaiting Beta review`);

      const msgB = await agentB.sendMessage(
        buildReviewRequest(this.task, proposal, lastA, this.sentinel),
        this._messageOptions()
      );
      const parsedB = parseResponse(msgB);
      const proposalB = parsedB.proposal || proposal;
      const hashB = hashText(normalizeProposal(proposalB));
      if (parsedB.agree && hashB === proposalHash) {
        agreedB = true;
      } else {
        agreedB = false;
        proposal = proposalB;
        proposalHash = hashB;
      }
      this._logMessage({ ts: nowIso(), agent: 'B', phase: 'review', agree: parsedB.agree, proposalHash, text: msgB });
      lastB = msgB;

      this.tui.setStatus(`Round ${round} - awaiting Alpha review`);

      const msgA = await agentA.sendMessage(
        buildReviewRequest(this.task, proposal, lastB, this.sentinel),
        this._messageOptions()
      );
      const parsedA = parseResponse(msgA);
      const proposalA = parsedA.proposal || proposal;
      const hashA = hashText(normalizeProposal(proposalA));
      if (parsedA.agree && hashA === proposalHash) {
        agreedA = true;
      } else {
        agreedA = false;
        proposal = proposalA;
        proposalHash = hashA;
      }
      this._logMessage({ ts: nowIso(), agent: 'A', phase: 'review', agree: parsedA.agree, proposalHash, text: msgA });
      lastA = msgA;

      if (agreedA && agreedB) {
        this.tui.setStatus('Agreement reached.');
        break;
      }

      if (round === this.maxRounds) {
        this.tui.setStatus('Max rounds reached without agreement.');
      }
    }

    const summary = {
      ts: nowIso(),
      task: this.task,
      agreed: agreedA && agreedB,
      proposal
    };
    fs.writeFileSync(path.join(logDir, 'summary.json'), JSON.stringify(summary, null, 2));

    agentA.stop();
    agentB.stop();

    this.tui.setStatus(`Session complete. Logs: ${logDir} (press q to exit)`);
    return summary;
  }

  _messageOptions() {
    return {
      sentinel: this.sentinel,
      idleMs: this.idleMs,
      timeoutMs: this.timeoutMs,
      endStrategy: this.endStrategy
    };
  }
}

module.exports = Orchestrator;
