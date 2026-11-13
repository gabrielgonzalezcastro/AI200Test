"""raw.json (+ tools/transcribed.json overlay) -> site/data/questions.json"""
import json, re, os, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
raw = json.load(open(os.path.join(ROOT, "tools", "raw.json"), encoding="utf-8"))
import glob
EXPL = {}
for _p in sorted(glob.glob(os.path.join(ROOT, "tools", "explanations_*.json"))):
    EXPL.update(json.load(open(_p, encoding="utf-8")))
OVERRIDES = json.load(open(os.path.join(ROOT, "tools", "answer_overrides.json"), encoding="utf-8"))
trans = {}
for tp in sorted(glob.glob(os.path.join(ROOT, "tools", "transcribed*.json"))):
    trans.update(json.load(open(tp, encoding="utf-8")))


def paragraphs(lines):
    """merge hard-wrapped lines into paragraphs"""
    res = []
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        if (res and not ln.startswith("•") and not re.search(r"[.?!:)]$", res[-1])
                and (ln[0].islower() or len(res[-1]) > 70)):
            res[-1] += " " + ln
        else:
            res.append(ln)
    return res


for q in raw:
    q["lines"] = [re.sub(r"\s*Reveal Solution\s*$", "", l).strip() for l in q["lines"]]
    q["lines"] = [l for l in q["lines"] if l and l != "Reveal Solution"]

BOILER = re.compile(r"This is a case study\..*?return to the question\.\s*", re.S)
GENERIC = re.compile(
    r"NOTE: Each correct selection is worth one point\."
    r"|Each correct answer presents part of the\s+solution\."
    r"|You may use each [^.]*\."
    r"|You may need to move the split bar[^.]*\."
    r"|To answer, [^.]*\."
    r"|Note: This question is part of a series[^\n]*", re.S)
WORD = re.compile(r"\S+")


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


groups = {}
for q in raw:
    t = "\n".join(q["lines"])
    q["kind0"] = "dragdrop" if re.match(r"\s*DRAG DROP", t) else "hotspot" if re.match(r"\s*HOTSPOT", t) else None
    t = re.sub(r"^\s*(DRAG DROP|HOTSPOT)\s*", "", t)
    m = BOILER.search(t)
    q["case"] = None
    if m:
        body = t[m.end():]
        q["case_body"] = body
        key = re.search(r"Background\s+(\w+)", body)
        groups.setdefault(key.group(1) if key else body[:30], []).append(q)
    else:
        q["text_all"] = t

cases = {}
for i, (k, qs) in enumerate(groups.items(), 1):
    cnt = collections.Counter()
    info = []
    for q in qs:
        body = GENERIC.sub(lambda m: " " * len(m.group(0)), q["case_body"])
        toks = [(norm(m.group(0)), m.end()) for m in WORD.finditer(body)]
        toks = [(w, e) for w, e in toks if w]
        words = [w for w, e in toks]
        sh = [tuple(words[j:j + 8]) for j in range(len(words) - 7)]
        cnt.update(set(sh))
        info.append((q, toks, sh))
    best = None
    for q, toks, sh in info:
        last = -1
        for j, s_ in enumerate(sh):
            if cnt[s_] >= 3:
                last = j
        cut = toks[last + 7][1] if last >= 0 else 0
        tail = q["case_body"][max(0, cut - 60):cut]
        mt = list(re.finditer(r"You (need|plan|must|are)\b", tail))
        if mt:
            cut = max(0, cut - 60) + mt[-1].start()
        q["_cut"] = cut
        if best is None or cut > best[0]:
            best = (cut, q)
    cid = f"case{i}"
    cut, ref = best
    pre = ref["case_body"][:cut]
    for q, toks, sh in info:
        q["case"] = cid
        q["text_all"] = q["case_body"][q["_cut"]:].lstrip(" \n")
    cases[cid] = {"id": cid, "title": f"Case study - {k}", "paragraphs": paragraphs(pre.split("\n")),
                  "questions": [q["id"] for q in qs]}

out = []
for q in raw:
    t = q["text_all"]
    parts = re.split(r"\n(?=[A-F]\. )", t)
    stem_raw = parts[0]
    opts = []
    for p in parts[1:]:
        m = re.match(r"([A-F])\. (.*)", p, re.S)
        if m:
            opts.append({"key": m.group(1), "text": " ".join(x.strip() for x in m.group(2).split("\n") if x.strip())})
    # clean page-break artefacts in options: duplicated keys, and the next option's letter+text glued onto this one
    seen_k, clean = set(), []
    for o in opts:
        if o["key"] not in seen_k:
            seen_k.add(o["key"]); clean.append(o)
    opts = clean
    for o in opts:
        for o2 in opts:
            if o2["key"] == o["key"]:
                continue
            m = re.search(r"\s+" + o2["key"] + r"\s+" + re.escape(o2["text"][:10]), o["text"])
            if m:
                o["text"] = o["text"][:m.start()].strip()
        o["text"] = re.sub(r"\.\s+[A-F]\s+[A-Z][\w\- ]*$", ".", o["text"]).strip()
    stem = [s for s in paragraphs(stem_raw.split("\n")) if not s.startswith("NOTE: Each correct selection")]
    # drop paragraphs duplicated across a PDF page break (identical to the next one, ignoring final period)
    stem = [s for i, s in enumerate(stem)
            if not (i + 1 < len(stem) and s.rstrip(".").strip() == stem[i + 1].rstrip(".").strip())]
    kind = q["kind0"]
    ans = list(q["answer_text"]) if q["answer_text"] else None
    if str(q["id"]) in OVERRIDES:
        ans = OVERRIDES[str(q["id"])]["answer"]
    choose = None
    mm = re.search(r"Which (two|three|four|five)\b|Select (two|three|four) ", " ".join(stem), re.I)
    if mm:
        choose = {"two": 2, "three": 3, "four": 4, "five": 5}[(mm.group(1) or mm.group(2)).lower()]
    if not kind:
        kind = "multi" if (ans and len(ans) > 1) or choose else "single"
    if ans and not choose and len(ans) > 1:
        choose = len(ans)
    d = {"id": q["id"], "topic": q["topic"], "kind": kind, "text": stem, "options": opts,
         "answer": ans, "choose": choose, "case": q.get("case"),
         "images": q["ex"], "answerImages": q["ans"]}
    if str(q["id"]) in trans:
        t = trans[str(q["id"])]
        if t.get("type") == "mcq-options":
            d["options"] = t["options"]; d["images"] = []
        else:
            d["interactive"] = t
    if str(q["id"]) in EXPL:
        d["explanation"] = EXPL[str(q["id"])]
    out.append(d)

os.makedirs(os.path.join(ROOT, "site", "data"), exist_ok=True)
json.dump({"questions": out, "cases": cases},
          open(os.path.join(ROOT, "site", "data", "questions.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(collections.Counter(d["kind"] for d in out))
for k, v in cases.items():
    print(k, v["title"], v["questions"], len(" ".join(v["paragraphs"])))

# unencrypted LOCAL copy (gitignored): when present, the site skips the login screen
with open(os.path.join(ROOT, "site", "data", "questions.local.js"), "w", encoding="utf-8") as f:
    f.write("window.EXAM_DATA = " + json.dumps({"questions": out, "cases": cases}, ensure_ascii=False) + ";")
