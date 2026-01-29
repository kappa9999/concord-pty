const crypto = require('crypto');

function stripAnsi(input) {
  if (!input) return '';
  return input.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

function normalizeProposal(text) {
  if (!text) return '';
  return text.replace(/\r/g, '').trim().replace(/\s+/g, ' ');
}

function hashText(text) {
  return crypto.createHash('sha256').update(text || '', 'utf8').digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeName(input) {
  if (!input) return '';
  const clean = String(input)
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return clean.slice(0, 48);
}

module.exports = {
  stripAnsi,
  normalizeProposal,
  hashText,
  nowIso,
  sleep,
  sanitizeName
};
