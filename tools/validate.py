import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(ROOT, "site", "data", "questions.json"), encoding="utf-8"))
qs = d["questions"]; err = []; pending = []
assert len({q["id"] for q in qs}) == len(qs) == 174, "need 174 unique ids"
for q in qs:
    i = q["id"]
    if q["kind"] in ("single", "multi"):
        keys = [o["key"] for o in q["options"]]
        pass
        if not q["answer"] or not keys: pending.append(i); continue
        if any(a not in keys for a in q["answer"]): err.append(f"{i}: answer not in options")
        if q["kind"] == "single" and len(q["answer"]) != 1: err.append(f"{i}: single w/ multiple answers")
        if q["choose"] and q["choose"] != len(q["answer"]): err.append(f"{i}: choose {q['choose']} vs {q['answer']}")
    else:
        t = q.get("interactive")
        if not t: pending.append(i); continue
        if t["type"] == "ordering":
            if any(a not in t["items"] for a in t["answer"]) or len(set(t["answer"])) != len(t["answer"]): err.append(f"{i}: ordering answer")
        elif t["type"] == "match":
            if any(r["answer"] not in t["items"] for r in t["rows"]): err.append(f"{i}: match answer")
        elif "rows" in t:
            if any(r["answer"] not in r["options"] for r in t["rows"]): err.append(f"{i}: hotspot answer")
        else:
            for s in t["segments"]:
                if isinstance(s, dict) and s["answer"] not in s["options"]: err.append(f"{i}: segment answer")
noex = [q["id"] for q in qs if not q.get("explanation")]
for q in qs:
    e = q.get("explanation")
    if not e: continue
    if q["kind"] in ("single", "multi"):
        if not isinstance(e["correct"], dict) or set(e["correct"]) != set(q["answer"]): err.append(f"{q['id']}: explanation correct keys != answer")
        wrong = {o["key"] for o in q["options"]} - set(q["answer"])
        if set(e.get("incorrect", {})) != wrong: err.append(f"{q['id']}: explanation incorrect keys != wrong options {sorted(wrong)}")
    elif not isinstance(e["correct"], list): err.append(f"{q['id']}: non-MCQ explanation.correct must be a list")
print("missing explanations:", len(noex), noex[:10])
print("errors:", err); print("pending answers (no source answer):", len(pending), pending[:3], "...", pending[-1:] )
sys.exit(1 if err else 0)
