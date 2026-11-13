// Per-question-type renderers.
// Renderers.build(q, {saved, shuffleOpts, onChange}) -> { el, get(), grade(), reveal(), lock() }
//   grade()  -> { correct: true|false|null, got, total }   (null = no answer key available)
const Renderers = (() => {
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, "");
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  }
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffled(arr, seed) { const a = arr.slice(), r = rng(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  // ---------- multiple choice (single / multi) ----------
  function mcq(q, o) {
    const multi = q.kind === "multi";
    const max = multi ? (q.choose || (q.answer ? q.answer.length : 99)) : 1;
    let sel = Array.isArray(o.saved) ? o.saved.slice() : [];
    let locked = false;
    const opts = o.shuffleOpts ? shuffled(q.options, q.id * 7919) : q.options;
    const el = h("div", { class: "options" });
    if (multi) el.append(h("div", { class: "hint" }, `Select ${q.choose || (q.answer ? q.answer.length : "all that apply")}.`));
    const rows = {};
    opts.forEach((opt, i) => {
      const row = h("button", { type: "button", class: "opt", onclick: () => toggle(opt.key) },
        h("span", { class: multi ? "mark box" : "mark radio" }),
        h("span", { class: "letter" }, String.fromCharCode(65 + i) + "."),
        h("span", { class: "otext" }, opt.text));
      rows[opt.key] = row; el.append(row);
    });
    function paint() { for (const k in rows) rows[k].classList.toggle("sel", sel.includes(k)); }
    function toggle(k) {
      if (locked) return;
      if (sel.includes(k)) sel = sel.filter(x => x !== k);
      else if (!multi) sel = [k];
      else if (sel.length < max) sel = [...sel, k];
      paint(); o.onChange(sel);
    }
    paint();
    return {
      el, get: () => sel,
      grade() {
        if (!q.answer || !q.options.length) return { correct: null };
        const ok = same([...sel].sort(), [...q.answer].sort());
        return { correct: ok, got: sel.filter(k => q.answer.includes(k)).length, total: q.answer.length };
      },
      reveal() {
        if (!q.answer) return;
        for (const k in rows) {
          const isAns = q.answer.includes(k), isSel = sel.includes(k);
          rows[k].classList.toggle("ok", isAns && isSel);
          rows[k].classList.toggle("bad", !isAns && isSel);
          rows[k].classList.toggle("missed", isAns && !isSel);
          if (isAns) rows[k].append(h("span", { class: "tag" }, isSel ? "Correct" : "Correct answer"));
        }
      },
      lock() { locked = true; el.classList.add("locked"); }
    };
  }

  // ---------- ordering ----------
  function ordering(q, t, o) {
    const n = t.answer.length;
    let slots = Array.isArray(o.saved) && o.saved.length === n ? o.saved.slice() : Array(n).fill(null);
    let locked = false, dragged = null;
    const pool = h("div", { class: "pool" }), area = h("div", { class: "slots" });
    const el = h("div", { class: "dd" + (t.mono ? " mono" : "") },
      h("div", { class: "col" }, h("div", { class: "col-title" }, "Actions"), pool),
      h("div", { class: "col" }, h("div", { class: "col-title" }, "Answer area"), area));
    const slotEls = [];
    for (let i = 0; i < n; i++) {
      const s = h("div", { class: "slot", "data-i": i },
        h("span", { class: "num" }, i + 1 + "."), h("span", { class: "sv" }));
      s.addEventListener("dragover", e => { if (!locked) e.preventDefault(); });
      s.addEventListener("drop", e => { e.preventDefault(); if (!locked) drop(i); });
      s.addEventListener("click", () => { if (!locked && slots[i]) { slots[i] = null; render(); o.onChange(slots); } });
      slotEls.push(s); area.append(s);
    }
    function chip(text, from) {
      const c = h("div", { class: "chip", draggable: !locked, tabindex: 0 }, text);
      c.addEventListener("dragstart", () => { dragged = { text, from }; });
      c.addEventListener("click", () => { if (locked || from !== "pool") return; const i = slots.indexOf(null); if (i >= 0) { slots[i] = text; render(); o.onChange(slots); } });
      return c;
    }
    function drop(i) {
      if (!dragged) return;
      const { text, from } = dragged; dragged = null;
      if (from === "pool") { const prev = slots[i]; slots[i] = text; if (prev && false) {} }
      else { const j = from; const tmp = slots[i]; slots[i] = slots[j]; slots[j] = tmp; }
      render(); o.onChange(slots);
    }
    function render() {
      pool.replaceChildren(...t.items.filter(x => !slots.includes(x)).map(x => chip(x, "pool")));
      slotEls.forEach((s, i) => {
        const v = s.querySelector(".sv"); v.replaceChildren();
        if (slots[i]) v.append(chip(slots[i], i));
        s.classList.toggle("filled", !!slots[i]);
      });
    }
    // pool also accepts drops (return item)
    pool.addEventListener("dragover", e => { if (!locked) e.preventDefault(); });
    pool.addEventListener("drop", e => { e.preventDefault(); if (locked || !dragged) return; if (dragged.from !== "pool") { slots[dragged.from] = null; dragged = null; render(); o.onChange(slots); } });
    render();
    return {
      el, get: () => slots,
      grade() { const got = slots.filter((x, i) => x === t.answer[i]).length; return { correct: got === n, got, total: n }; },
      reveal() {
        slotEls.forEach((s, i) => {
          const ok = slots[i] === t.answer[i];
          s.classList.add(ok ? "ok" : "bad");
          if (!ok) s.append(h("div", { class: "correct-line" }, "Correct: ", h("b", {}, t.answer[i])));
        });
      },
      lock() { locked = true; el.classList.add("locked"); el.querySelectorAll(".chip").forEach(c => c.draggable = false); }
    };
  }

  // ---------- match (drag items onto rows, items reusable) ----------
  function match(q, t, o) {
    const n = t.rows.length;
    let vals = Array.isArray(o.saved) && o.saved.length === n ? o.saved.slice() : Array(n).fill(null);
    let selected = null, locked = false, dragged = null;
    const pool = h("div", { class: "pool" });
    const table = h("div", { class: "rows" });
    const slotEls = [];
    t.rows.forEach((r, i) => {
      const slot = h("div", { class: "slot wide" }, h("span", { class: "sv" }));
      slot.addEventListener("dragover", e => { if (!locked) e.preventDefault(); });
      slot.addEventListener("drop", e => { e.preventDefault(); if (!locked && dragged) { vals[i] = dragged; dragged = null; render(); o.onChange(vals); } });
      slot.addEventListener("click", () => {
        if (locked) return;
        if (selected) { vals[i] = selected; selected = null; } else vals[i] = null;
        render(); o.onChange(vals);
      });
      slotEls.push(slot);
      table.append(h("div", { class: "row" }, h("div", { class: "rlabel" }, r.label), slot));
    });
    const head = h("div", { class: "row head" }, h("div", {}, t.labelHeader || "Requirement"), h("div", {}, t.valueHeader || "Answer"));
    function render() {
      pool.replaceChildren(...t.items.map(x => {
        const c = h("div", { class: "chip" + (selected === x ? " picked" : ""), draggable: !locked, tabindex: 0 }, x);
        c.addEventListener("dragstart", () => { dragged = x; });
        c.addEventListener("click", () => { if (!locked) { selected = selected === x ? null : x; render(); } });
        return c;
      }));
      slotEls.forEach((s, i) => { s.querySelector(".sv").textContent = vals[i] || ""; s.classList.toggle("filled", !!vals[i]); s.classList.toggle("target", !!selected && !locked); });
    }
    render();
    const el = h("div", { class: "dd match" + (t.mono ? " mono" : "") },
      h("div", { class: "col" }, h("div", { class: "col-title" }, "Choices (drag, or click then click a slot)"), pool),
      h("div", { class: "col grow" }, h("div", { class: "col-title" }, t.title || "Answer area"), head, table));
    return {
      el, get: () => vals,
      grade() { const got = vals.filter((v, i) => v === t.rows[i].answer).length; return { correct: got === n, got, total: n }; },
      reveal() {
        slotEls.forEach((s, i) => {
          const ok = vals[i] === t.rows[i].answer;
          s.classList.remove("target"); s.classList.add(ok ? "ok" : "bad");
          if (!ok) s.parentElement.append(h("div", { class: "correct-line" }, "Correct: ", h("b", {}, t.rows[i].answer)));
        });
      },
      lock() { locked = true; selected = null; render(); el.classList.add("locked"); }
    };
  }

  // ---------- hotspot (dropdowns / yes-no, rows or inline segments) ----------
  function control(opts, value, change) {
    const yn = opts.length === 2 && opts[0] === "Yes" && opts[1] === "No";
    const wrap = h("div", { class: "ctl" });
    if (yn) {
      const btns = opts.map(v => h("button", { type: "button", class: "yn", onclick: () => { if (wrap.classList.contains("locked")) return; set(v); change(v); } }, v));
      const set = v => btns.forEach(b => b.classList.toggle("sel", b.textContent === v));
      btns.forEach(b => wrap.append(b)); set(value);
      wrap.setValue = set; wrap.getValue = () => (btns.find(b => b.classList.contains("sel")) || {}).textContent || null;
    } else {
      const s = h("select", { onchange: () => change(s.value || null) }, h("option", { value: "" }, "— select —"), opts.map(v => h("option", { value: v }, v)));
      if (value) s.value = value;
      wrap.append(s); wrap.setValue = v => { s.value = v || ""; }; wrap.getValue = () => s.value || null;
      wrap.disable = () => s.disabled = true;
    }
    return wrap;
  }
  function hotspot(q, t, o) {
    const items = t.segments ? t.segments.filter(s => typeof s === "object") : t.rows;
    const n = items.length;
    const vals = Array.isArray(o.saved) && o.saved.length === n ? o.saved.slice() : Array(n).fill(null);
    const ctls = [];
    const ch = i => v => { vals[i] = v; o.onChange(vals); };
    let el;
    if (t.segments) {
      let k = 0;
      const pre = h("div", { class: "code inline" });
      t.segments.forEach(s => {
        if (typeof s === "string") pre.append(document.createTextNode(s));
        else { const c = control(s.options, vals[k], ch(k)); ctls.push(c); pre.append(c); k++; }
      });
      el = h("div", { class: "hs" }, pre);
    } else {
      const rows = h("div", { class: "rows" }, h("div", { class: "row head" }, h("div", {}, t.labelHeader || "Requirement"), h("div", {}, t.valueHeader || "Answer")));
      t.rows.forEach((r, i) => {
        const c = control(r.options, vals[i], ch(i)); ctls.push(c);
        rows.append(h("div", { class: "row" }, h("div", { class: "rlabel" }, r.label), c));
      });
      el = h("div", { class: "hs" }, rows);
    }
    return {
      el, get: () => vals,
      grade() { const got = items.filter((r, i) => vals[i] === r.answer).length; return { correct: got === n, got, total: n }; },
      reveal() {
        items.forEach((r, i) => {
          const ok = vals[i] === r.answer;
          ctls[i].classList.add(ok ? "ok" : "bad");
          if (!ok) ctls[i].append(h("div", { class: "correct-line" }, "Correct: ", h("b", {}, r.answer)));
        });
      },
      lock() { el.classList.add("locked"); ctls.forEach(c => c.disable && c.disable()); }
    };
  }

  // ---------- no interactive version available (answer only in an image / not provided) ----------
  function unavailable(q, o) {
    return { el: h("div", { class: "hint warn" }, q.images && q.images.length ? "This question's options are in the image(s) above." : ""), get: () => null, grade: () => ({ correct: null }), reveal() {}, lock() {} };
  }

  function build(q, o) {
    if (q.kind === "single" || q.kind === "multi") return q.options.length ? mcq(q, o) : unavailable(q, o);
    const t = q.interactive;
    if (!t) return unavailable(q, o);
    if (t.type === "ordering") return ordering(q, t, o);
    if (t.type === "match") return match(q, t, o);
    return hotspot(q, t, o);
  }
  return { build, h };
})();
