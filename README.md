# AI-200 Practice Exam site

Open `site/index.html` directly, or serve the folder: `python -m http.server --directory site`.

## Regenerating the data
```
python tools/extract.py    # PDFs in Questions/ -> tools/raw.json + site/img/
python tools/build.py      # raw.json + tools/transcribed_*.json -> site/data/questions.json(.js)
python tools/validate.py   # sanity checks
```
- Drag-drop / hotspot answers are stored by hand in `tools/transcribed_*.json` (keyed by question id), because the PDFs only contain them as images.
- Q101-174: the PDFs were saved with "Reveal Solution" closed, so they have no answers. Re-export them with answers
  visible into `Questions/`, run the three commands above, then transcribe the new drag-drop/hotspot answers.

## Login / encryption
The deployed site ships `site/data/questions.enc.json` (AES-256-GCM, key from username + password via PBKDF2) and decrypts it in the browser.
The unencrypted copy (`site/data/questions.json` and `questions.local.js`) is gitignored and stays on your machine;
when `questions.local.js` exists, the site opens without a login.
```
python tools/build.py      # regenerate the unencrypted data
python tools/encrypt.py    # prompts for username/password -> site/data/questions.enc.json
```
Commit `questions.enc.json` and push. Username is case-insensitive. The images in `site/img/` are not encrypted.


Note: `tools/transcribed_*.json`, `tools/answer_overrides.json` and `tools/explanations_*.json` hold the hand-written answers and explanations. They are gitignored (not in the repo), so keep your own backup copy of them.
