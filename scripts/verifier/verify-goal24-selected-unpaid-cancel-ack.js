#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = [
  'docs/orchestrator/GOAL-24-selected-unpaid-orders-cancellation-notifications-ack.md',
  'reports/validation/GOAL-24-selected-unpaid-orders-cancellation-notifications-ack.md',
  'docs/IMPLEMENTATION_STATE.md',
  'docs/orchestrator/STATUS.md',
  'package.json',
];

const selectedHash = '04d7d08c82a07853';
const requiredDocMarkers = [
  'GOAL24-NOTIFICATIONS-SELECTED-UNPAID-CANCEL-ACK',
  'sideEffectsHandled.notification=true',
  'requires no pre-route notification send',
  'No runtime source was changed',
  'Notifications support remains downstream event ownership',
  '[MISSING: owner-approved runtime packet for any future live Orders cancellation route invocation]',
];
const forbiddenPatterns = [
  /POST\s+\/notifications\/send\s+(?:was|is|has been|completed|executed|called)/i,
  /\/notifications\/send\s+(?:was|is|has been|completed|executed|called)/i,
  /provider\s+(?:dispatch|send|call)\s+(?:was|is|has been|completed|executed|called)/i,
  /channel_registry\s+(?:was|is|has been)\s+(?:mutated|updated|inserted|seeded)/i,
  /broker\s+(?:mutation|write|publish)\s+(?:was|is|has been|completed|executed|called)/i,
  /DB\s+write\s+(?:was|is|has been|completed|executed|called)/i,
  /deploy(?:ed|ment)\s+(?:was|is|has been|completed|executed|run)/i,
  /secret\s+(?:value|token)\s*[:=]/i,
];

function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing required file: ${rel}`);
  }
  return fs.readFileSync(abs, 'utf8');
}

function assertIncludes(text, marker, rel) {
  if (!text.includes(marker)) {
    throw new Error(`${rel} missing marker: ${marker}`);
  }
}

function assertForbiddenAbsent(text, rel) {
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) {
      throw new Error(`${rel} contains forbidden runtime-send/mutation wording: ${pattern}`);
    }
  }
}

for (const rel of files.slice(0, 2)) {
  assertForbiddenAbsent(read(rel), rel);
}

const ackDoc = read(files[0]);
for (const marker of requiredDocMarkers) {
  assertIncludes(ackDoc, marker, files[0]);
}
assertIncludes(ackDoc, selectedHash, files[0]);

const report = read(files[1]);
assertIncludes(report, selectedHash, files[1]);
assertIncludes(report, 'Notifications requires no pre-route notification send', files[1]);
assertIncludes(report, 'No `/notifications/send` call', files[1]);
assertIncludes(report, 'No `/notifications/validate` call', files[1]);

const implementationState = read(files[2]);
assertIncludes(implementationState, '2026-07-04: Goal 24 selected unpaid Orders cancellation Notifications acknowledgement', files[2]);
assertIncludes(implementationState, selectedHash, files[2]);
assertIncludes(implementationState, 'sideEffectsHandled.notification=true', files[2]);

const status = read(files[3]);
assertIncludes(status, '2026-07-04 - Goal 24 Selected Unpaid Orders Cancellation Notifications Ack', files[3]);
assertIncludes(status, selectedHash, files[3]);

const pkg = JSON.parse(read(files[4]));
if (pkg.scripts?.['verify:goal24-selected-unpaid-cancel-ack'] !== 'node scripts/verifier/verify-goal24-selected-unpaid-cancel-ack.js') {
  throw new Error('package.json missing verify:goal24-selected-unpaid-cancel-ack script');
}

console.log('Goal 24 Notifications selected unpaid cancellation ack verifier passed.');
