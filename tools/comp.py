import json, os, sys
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(ROOT, "site", "data", "questions.json"), encoding="utf-8"))
lo, hi = int(sys.argv[1]), int(sys.argv[2])
for q in d["questions"]:
    if not (lo <= q["id"] <= hi) or q["kind"] not in ("dragdrop", "hotspot"): continue
    parts = []
    for role, names in (("EXHIBIT", q["images"]), ("ANSWER", q["answerImages"])):
        for n in names:
            im = Image.open(os.path.join(ROOT, "site", "img", n)).convert("RGB")
            w = 760
            im = im.resize((w, int(im.height * w / im.width)))
            parts.append((role + " " + n, im))
    if not parts: print("no images", q["id"]); continue
    H = sum(i.height + 22 for _, i in parts) + 6
    canvas = Image.new("RGB", (770, H), "white")
    dr = ImageDraw.Draw(canvas); y = 0
    for lab, im in parts:
        dr.rectangle([0, y, 770, y + 20], fill=(30, 30, 120)); dr.text((4, y + 4), lab, fill="white"); y += 22
        canvas.paste(im, (5, y)); y += im.height
    canvas.save(os.path.join(ROOT, "tools", "comp", f"q{q['id']}.png"))
