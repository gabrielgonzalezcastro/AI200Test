"""Extract text + images per question from the 4 PDFs into tools/raw.json and site/img/."""
import pymupdf, re, json, os, glob, warnings
warnings.filterwarnings("ignore")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "site", "img")
os.makedirs(IMG, exist_ok=True)
qre = re.compile(r"^Question #(\d+)\s*\(Topic:\s*(.*?)\)?\s*$", re.S)
questions = {}
cur = None
state = "pre"
seen_xref = set()
seen_hash = set()
pending_hdr = None
for pdf in sorted(glob.glob(os.path.join(ROOT, "Questions", "*.pdf"))):
    d = pymupdf.open(pdf)
    for pno, page in enumerate(d):
        items = []
        for b in page.get_text("blocks"):
            if b[6] != 0: continue
            items.append((b[1], b[0], "T", b))
        for im in page.get_image_info(xrefs=True):
            x0, y0, x1, y1 = im["bbox"]
            if (x1 - x0) < 40 or (y1 - y0) < 20: continue
            items.append((y0, x0, "I", im))
        items.sort(key=lambda t: (round(t[0]), t[1]))
        for y, x, kind, obj in items:
            if kind == "T":
                txt = obj[4].strip()
                if obj[1] < 14 or obj[3] > 778: continue  # header/footer
                txt = txt.replace("�", "•").replace("", "•")
                if not txt: continue
                # split off 'Next Question'
                parts = [p for p in re.split(r"\n?\s*Next Question\s*", txt) if p.strip()]
                if not parts: continue
                for part in parts:
                    part = part.strip()
                    if pending_hdr:
                        part = pending_hdr + " " + part; pending_hdr = None
                    if re.match(r"Question #\d+\s*\(Topic:", part) and part.count(")") == 0:
                        pending_hdr = part; continue
                    # may contain "Question #N" at start (header merged with previous lines)
                    m = re.search(r"Question #(\d+)\s*\(Topic:\s*(.*?)\s*\)", part, re.S)
                    if m:
                        n = int(m.group(1))
                        cur = questions.setdefault(n, {"id": n, "topic": re.sub(r"\s+", " ", m.group(2)), "lines": [], "ex": [], "ans": [], "answer_text": None, "pages": []})
                        state = "pre"
                        rest = part[m.end():].strip()
                        if rest: cur["lines"].append(rest)
                        continue
                    if cur is None: continue
                    if cur["pages"][-1:] != [pno] and False: pass
                    ma = re.match(r"^Answer:\s*([A-F]{1,6})?\s*$", part)
                    if ma:
                        state = "ans"
                        if ma.group(1): cur["answer_text"] = ma.group(1)
                        continue
                    if re.fullmatch(r"A\s+[A-F]+", part) or re.fullmatch(r"\d+ of \d+.*", part): continue
                    if state == "pre":
                        cur["lines"].append(part)
            else:
                if cur is None: continue
                xref = obj["xref"]
                key = (cur["id"], xref) if xref else None
                if key and key in seen_xref: continue
                if key: seen_xref.add(key)
                role = "ans" if state == "ans" else "ex"
                idx = len(cur[role]) + 1
                name = f"q{cur['id']}-{role}{idx}.png"
                path = os.path.join(IMG, name)
                if xref:
                    pix = pymupdf.Pixmap(d, xref)
                    if pix.n - pix.alpha >= 4: pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                    pix.save(path)
                else:
                    pix = page.get_pixmap(clip=pymupdf.Rect(obj["bbox"]), dpi=220)
                    pix.save(path)
                import hashlib
                h = hashlib.md5(open(path, "rb").read()).hexdigest()
                if (cur["id"], h) in seen_hash:
                    os.remove(path); continue
                seen_hash.add((cur["id"], h))
                cur[role].append(name)
json.dump(sorted(questions.values(), key=lambda q: q["id"]), open(os.path.join(ROOT, "tools", "raw.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(len(questions), "questions; images:", len(os.listdir(IMG)))
