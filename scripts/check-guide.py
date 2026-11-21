#!/usr/bin/env python3
"""Check data/guide/book-NN.json against the text: sections cover the book in order, every gloss
word appears in its line, famous passages are in range. Usage: check-guide.py [NN ...]"""
import json, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
books = json.loads((ROOT / "data/text.json").read_text())
want = [int(a) for a in sys.argv[1:]] or range(1, 13)
bad = 0
def err(n, m):
    global bad; bad += 1; print(f"book {n}: {m}")
for n in want:
    p = ROOT / f"data/guide/book-{n:02d}.json"
    if not p.exists():
        print(f"book {n}: missing"); continue
    g = json.loads(p.read_text()); L = books[n - 1]["lines"]; total = len(L)
    for k in ("n", "title", "summary", "sections", "glosses", "famous", "themes", "characters", "setting"):
        if k not in g: err(n, f"missing key {k}")
    at = 1
    for s in g.get("sections", []):
        if s["from"] != at: err(n, f"section '{s['title']}' starts at {s['from']}, expected {at}")
        if s["to"] < s["from"]: err(n, f"section '{s['title']}' ends before it starts")
        at = s["to"] + 1
    if at != total + 1: err(n, f"sections end at {at - 1}, book has {total} lines")
    for gl in g.get("glosses", []):
        ln = gl["line"]
        if not 1 <= ln <= total: err(n, f"gloss line {ln} out of range"); continue
        if gl["word"] not in L[ln - 1]: err(n, f"gloss '{gl['word']}' not in line {ln}: {L[ln-1]}")
    for f in g.get("famous", []):
        if not (1 <= f["from"] <= f["to"] <= total): err(n, f"famous {f} out of range")
print("ok" if not bad else f"{bad} problems")
sys.exit(1 if bad else 0)
