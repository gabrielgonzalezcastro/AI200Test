// Login gate: questions ship encrypted (data/questions.enc.json) and are decrypted in the browser.
// If a local unencrypted copy exists (data/questions.local.js, gitignored), the login is skipped.
(() => {
  const app = document.getElementById("app");
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const SKEY = "ai200-session";
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  try { const s = JSON.parse(localStorage.getItem("ai200-practice-v1") || "{}"); document.documentElement.dataset.theme = (s.settings && s.settings.dark != null ? s.settings.dark : dark) ? "dark" : "light"; } catch (e) { document.documentElement.dataset.theme = dark ? "dark" : "light"; }

  async function decrypt(enc, user, pw) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(user.trim().toLowerCase() + "\n" + pw), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(enc.salt), iterations: enc.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(enc.iv) }, key, b64(enc.ct));
    return JSON.parse(new TextDecoder().decode(buf));
  }

  function form(enc) {
    const err = document.createElement("div"); err.className = "login-err";
    const f = document.createElement("form"); f.className = "card login";
    f.innerHTML = `<h1>AI-200 Practice</h1><p class="muted">Sign in to continue.</p>
      <label>Username<input name="u" autocomplete="username" required autofocus></label>
      <label>Password<input name="p" type="password" autocomplete="current-password" required></label>
      <button class="primary" type="submit">Sign in</button>`;
    f.append(err);
    f.onsubmit = async e => {
      e.preventDefault(); err.textContent = ""; const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Checking…";
      const u = f.u.value, p = f.p.value;
      try {
        const data = await decrypt(enc, u, p);
        try { sessionStorage.setItem(SKEY, JSON.stringify({ u, p })); } catch (x) { /* ignore */ }
        window.startApp(data);
      } catch (x) { err.textContent = "Wrong username or password."; btn.disabled = false; btn.textContent = "Sign in"; }
    };
    app.replaceChildren(f);
  }

  async function boot() {
    if (window.EXAM_DATA) return window.startApp(window.EXAM_DATA);      // local unencrypted copy
    if (!window.crypto || !crypto.subtle) { app.textContent = "This page needs a secure context (https or localhost)."; return; }
    let enc;
    try { const r = await fetch("data/questions.enc.json", { cache: "no-cache" }); if (!r.ok) throw 0; enc = await r.json(); }
    catch (e) { app.textContent = "Question data not found."; return; }
    try { const s = JSON.parse(sessionStorage.getItem(SKEY) || "null"); if (s) return window.startApp(await decrypt(enc, s.u, s.p)); } catch (e) { /* fall through to login */ }
    form(enc);
  }
  boot();
})();
