#!/usr/bin/env python3
"""Turn the Project Gutenberg #26 text (1674, twelve books; public domain) into data/text.json.

Each book: {"n": 1, "roman": "I", "lines": [...], "paras": [line numbers that open a verse paragraph]}.
A line indented in the source opens a new verse paragraph. Line numbers are 1-based and match the
standard numbering (checked against the usual book lengths below)."""
import json, re, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / "source/pg26-1674.txt").read_text()
body = src[src.index("\nBook I\n"):src.index("Transcriber’s Notes")]
parts = re.split(r"\nBook ([IVX]+)\n", body)
STD = [798, 1055, 742, 1015, 907, 912, 640, 653, 1189, 1104, 901, 649]
books = []
for i in range(1, len(parts), 2):
    roman, raw = parts[i], parts[i + 1]
    lines, paras, prev_blank = [], [1], False
    for l in raw.split("\n"):
        if not l.strip():
            prev_blank = True
            continue
        if lines and (l.startswith(" ") or prev_blank) and len(lines) + 1 not in paras:
            paras.append(len(lines) + 1)
        lines.append(l.strip())
        prev_blank = False
    n = len(books) + 1
    if len(lines) != STD[n - 1]:
        sys.exit(f"Book {roman}: {len(lines)} lines, expected {STD[n - 1]}")
    books.append({"n": n, "roman": roman, "lines": lines, "paras": paras})
(ROOT / "data/text.json").write_text(json.dumps(books, ensure_ascii=False))
print("ok", sum(len(b["lines"]) for b in books), "lines")
if "--numbered" in sys.argv:
    out = pathlib.Path(sys.argv[sys.argv.index("--numbered") + 1]); out.mkdir(parents=True, exist_ok=True)
    for b in books:
        (out / f"book-{b['n']:02d}.txt").write_text("\n".join(f"{i+1:>5}{'¶' if i+1 in b['paras'] else ' '} {l}" for i, l in enumerate(b["lines"])))
