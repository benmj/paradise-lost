// Headless Claude with no tools, no MCP servers and no settings, in an empty folder: it can only
// write text back. Same sandbox as the Fitness coach and Mailroom's sorter, but streamed.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const MODEL = process.env.PL_MODEL || 'claude-sonnet-5-5';
const CLAUDE = process.env.CLAUDE_BIN || 'claude';

// → { done: Promise<string>, cancel() }. onText gets each text delta as it arrives.
export function streamClaude({ system, prompt, onText, timeoutSec = 180 }) {
  const cwd = path.join(os.tmpdir(), 'paradise-claude-cwd');
  fs.mkdirSync(cwd, { recursive: true, mode: 0o700 });
  const args = ['-p', '--model', MODEL, '--tools', '', '--strict-mcp-config', '--setting-sources', '',
    '--no-session-persistence', '--exclude-dynamic-system-prompt-sections', '--system-prompt', system,
    '--output-format', 'stream-json', '--include-partial-messages', '--verbose'];
  const child = spawn(CLAUDE, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let cancelled = false;
  const done = new Promise((resolve, reject) => {
    let buf = '', err = '', text = '', result = null;
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timed out')); }, timeoutSec * 1000);
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        const delta = m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.type === 'text_delta' ? m.event.delta.text : '';
        if (delta) { text += delta; onText(delta); }
        if (m.type === 'result') result = m;
      }
    });
    child.stderr.on('data', (d) => (err += d));
    child.stdin.on('error', () => {});
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (cancelled) return reject(Object.assign(new Error('cancelled'), { cancelled: true }));
      if (result && !result.is_error) return resolve(text || result.result || '');
      reject(new Error(`claude failed (exit ${code}): ${result?.subtype || ''} ${err.slice(0, 200)}`));
    });
    child.stdin.end(prompt);
  });
  return { done, cancel() { if (child.exitCode === null) { cancelled = true; child.kill('SIGTERM'); } } };
}
