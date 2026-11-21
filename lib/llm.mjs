// Chat backends. "api": the Anthropic Messages API over fetch (no SDK), billed to the API key's owner.
// "cli": headless `claude -p` on the host's own login, for local use and the private deployment only.
import { streamClaude } from './claude.mjs';
import { transcript } from './chat.mjs';

export const MODEL = process.env.PL_MODEL || 'claude-haiku-5-5';
const KEY = process.env.ANTHROPIC_API_KEY || '';
const MAX_OUT = Number(process.env.PL_MAX_OUTPUT_TOKENS) || 700;
// USD per million tokens, used only for the estimate that drives the caps. Console's spend limit is the real backstop.
const PRICE = { in: Number(process.env.PL_PRICE_IN) || 1, out: Number(process.env.PL_PRICE_OUT) || 5 };

export const backend = KEY ? 'api' : 'cli';
export const costMicro = (u) => Math.round(u.input * PRICE.in + u.cacheWrite * PRICE.in * 1.25 + u.cacheRead * PRICE.in * 0.1 + u.output * PRICE.out);

// → { done: Promise<usage>, cancel() }. onText gets each text delta.
// `key`: a reader's own Anthropic key for this one request (never stored or logged); forces the API path.
export function streamReply({ system, context, messages, onText, key }) {
  if (!key && backend === 'cli') {
    const job = streamClaude({ system: `${system}\n\n${context}`, prompt: transcript(messages), onText });
    return { done: job.done.then(() => ({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0 })), cancel: job.cancel };
  }
  const ac = new AbortController();
  const done = (async () => {
    const timer = setTimeout(() => ac.abort(), 120_000);
    try {
      const res = await fetch(process.env.PL_API_URL || 'https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ac.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key || KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: MODEL, max_tokens: MAX_OUT, stream: true, messages,
          system: [{ type: 'text', text: system }, { type: 'text', text: context, cache_control: { type: 'ephemeral' } }],
        }),
      });
      if (!res.ok || !res.body) throw Object.assign(new Error(`anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status });
      const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
      const dec = new TextDecoder();
      let buf = '';
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('');
          if (!data) continue;
          let m; try { m = JSON.parse(data); } catch { continue; }
          if (m.type === 'message_start') {
            const u = m.message?.usage || {};
            usage.input = u.input_tokens || 0; usage.cacheWrite = u.cache_creation_input_tokens || 0; usage.cacheRead = u.cache_read_input_tokens || 0;
          } else if (m.type === 'content_block_delta' && m.delta?.type === 'text_delta') onText(m.delta.text);
          else if (m.type === 'message_delta') usage.output = m.usage?.output_tokens ?? usage.output;
          else if (m.type === 'error') throw new Error(`anthropic stream error: ${m.error?.type}`);
        }
      }
      return usage;
    } catch (e) {
      if (ac.signal.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true });
      throw e;
    } finally { clearTimeout(timer); }
  })();
  return { done, cancel: () => ac.abort() };
}
