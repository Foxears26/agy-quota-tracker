import fs from 'node:fs';
import { appendEvent, resolveDataDir } from '../server/storage.mjs';

function main() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    // stdin unavailable
  }

  let payload = {};
  if (raw && raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }
  }

  try {
    const dataDir = resolveDataDir();
    const hookName = payload.hookEventName || '';
    if (hookName === 'Stop') {
      appendEvent(dataDir, {
        event: 'turn_end',
        model: payload.modelName || 'unknown',
        conversationId: payload.conversationId || '',
        terminationReason: payload.terminationReason || null,
        source: 'hook',
      });
    } else {
      appendEvent(dataDir, {
        event: 'invocation',
        model: payload.modelName || 'unknown',
        conversationId: payload.conversationId || '',
        invocationNum: payload.invocationNum ?? null,
        source: 'hook',
      });
    }
  } catch {
    // Never block or fail the agent turn if local logging fails
  }

  process.stdout.write('{}\n');
}

main();
