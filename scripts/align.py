#!/usr/bin/env python3
"""Word-level forced alignment of a LibriVox reading to data/text.json.

Needs: a venv with torch + torchaudio + soundfile, and ffmpeg. See README "Read-along".
Usage: align.py <book 1-12> <audio.mp3>   -> data/audio/book-NN.json  {lines:[[word start secs...]...], dur}
Method: wav2vec2 (MMS_FA) emissions, greedy decode, anchor on unique 10-gram letter matches
between the decode and the poem, forced-align the letters between consecutive anchors.
"""
import json, re, subprocess, sys, os, bisect
import numpy as np, torch, torchaudio, torchaudio.functional as F
from torchaudio.pipelines import MMS_FA as bundle

K = 10
book, mp3 = int(sys.argv[1]), sys.argv[2]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
wav = mp3.rsplit('.', 1)[0] + '.16k.wav'
if not os.path.exists(wav):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ar', '16000', '-ac', '1', wav], check=True)
import soundfile as sf
audio, sr = sf.read(wav, dtype='float32'); assert sr == 16000
dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
model = bundle.get_model().to(dev).eval()
labels = bundle.get_labels(); L = {c: i for i, c in enumerate(labels)}

# emissions in 30 s windows
ems = []
step = 16000 * 30
with torch.inference_mode():
    for s in range(0, len(audio), step):
        x = torch.from_numpy(audio[s:s + step])[None].to(dev)
        if x.shape[1] < 4000: break
        e, _ = model(x); ems.append(e.cpu()[0])
em = torch.log_softmax(torch.cat(ems)[:, :28], -1)  # drop the wildcard class; (T, 28)
T = em.shape[0]; fps = T / (len(audio) / 16000)
print(f'book {book}: {len(audio)/16000/60:.1f} min, {T} frames', flush=True)

# reference letters
text = json.load(open(f'{root}/data/text.json'))[book - 1]['lines']
words = []  # (line, wordidx, letters)
nwords = []
for li, line in enumerate(text):
    ws = line.split(); nwords.append(len(ws))
    for wi, w in enumerate(ws):
        ltr = re.sub(r"[^a-z']", '', w.lower().replace('’', "'").replace('‘', "'"))
        ltr = ltr.replace("'", '')  # elisions: th' -> th; compare on letters only
        words.append((li, wi, ltr))
ref = ''.join(w[2] for w in words)
wstart = np.cumsum([0] + [len(w[2]) for w in words])  # char index of each word start

# greedy decode
am = em.argmax(-1).numpy()
dec, decf = [], []
prev = 0
for f, a in enumerate(am):
    if a != prev and a != 0 and labels[a] in L and labels[a] not in ('-', '*', "'"):
        dec.append(labels[a]); decf.append(f)
    prev = a
dec = ''.join(dec); decf = np.array(decf)

# unique K-gram anchors
def grams(s):
    d = {}
    for i in range(len(s) - K + 1):
        d.setdefault(s[i:i + K], []).append(i)
    return d
rg, dg = grams(ref), grams(dec)
pairs = sorted((dg[g][0], rg[g][0]) for g in dg if len(dg[g]) == 1 and g in rg and len(rg[g]) == 1)
# longest increasing subsequence on ref position
tails, idx, prevs = [], [], [-1] * len(pairs)
for i, (d, r) in enumerate(pairs):
    j = bisect.bisect_left(tails, r)
    if j == len(tails): tails.append(r); idx.append(i)
    else: tails[j] = r; idx[j] = i
    prevs[i] = idx[j - 1] if j else -1
chain = []; i = idx[-1] if idx else -1
while i >= 0: chain.append(pairs[i]); i = prevs[i]
chain.reverse()
print(f'anchors {len(chain)}; ref letters {len(ref)}, decoded {len(dec)}', flush=True)

# segment boundaries: (ref char, frame)
bounds = [(0, 0)] + [(r, int(decf[d])) for d, r in chain] + [(len(ref), T)]
# drop non-monotonic frame bounds
clean = [bounds[0]]
for r, f in bounds[1:]:
    if r > clean[-1][0] and f > clean[-1][1]: clean.append((r, f))
if clean[-1] != (len(ref), T): clean[-1] = (len(ref), T)
cf = np.zeros(len(ref) + 1); cf[len(ref)] = T  # start frame per ref char
bad = 0
for (r0, f0), (r1, f1) in zip(clean, clean[1:]):
    toks = [L[c] for c in ref[r0:r1]]
    # pad one second either side of the nominal frame window so the aligner can place edges
    a, b = max(0, f0 - 2), min(T, f1 + 2)
    est = int(1.8 * len(toks) * fps / 12)  # frames these letters could plausibly take (~12 letters/s, slack)
    if r0 == 0: a = max(a, b - est)      # unanchored head: don't let it float back into the preamble
    if r1 == len(ref): b = min(b, a + est)  # unanchored tail
    if b - a < len(toks) * 1.2:
        cf[r0:r1] = np.linspace(f0, f1, r1 - r0, endpoint=False); bad += 1; continue
    al, sc = F.forced_align(em[a:b][None], torch.tensor([toks], dtype=torch.int32), blank=0)
    sp = F.merge_tokens(al[0], sc[0].exp())
    if len(sp) != len(toks):
        cf[r0:r1] = np.linspace(f0, f1, r1 - r0, endpoint=False); bad += 1; continue
    cf[r0:r1] = [s.start + a for s in sp]
    if r1 == len(ref): cf[len(ref)] = sp[-1].end + a
print(f'segments {len(clean)-1}, fallback {bad}', flush=True)

# words -> start seconds per line
out = [[] for _ in nwords]
for k, (li, wi, ltr) in enumerate(words):
    out[li].append(round(float(cf[wstart[k]]) / fps, 2) if ltr else None)
# words with no letters (dashes) take the next word's start
for ln in out:
    nxt = None
    for i in range(len(ln) - 1, -1, -1):
        if ln[i] is None: ln[i] = nxt
        else: nxt = ln[i]
    # a trailing None (line ends with a dash): reuse last known
    last = None
    for i in range(len(ln)):
        if ln[i] is None: ln[i] = last
        else: last = ln[i]
os.makedirs(f'{root}/data/audio', exist_ok=True)
json.dump({'n': book, 'dur': round(len(audio) / 16000, 1), 'lines': out}, open(f'{root}/data/audio/book-{book:02d}.json', 'w'), separators=(',', ':'))
# sanity: monotonic, words per second
flat = [t for ln in out for t in ln if t is not None]
non = sum(1 for a, b in zip(flat, flat[1:]) if b < a)
print(f'words {len(flat)}, non-monotonic {non}, {len(flat)/(flat[-1]-flat[0]+1e-9):.2f} words/s, first {flat[0]}s last {flat[-1]}s')
