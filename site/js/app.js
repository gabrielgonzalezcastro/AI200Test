window.startApp = (DATA) => {
  const { h } = Renderers;
  const QS = DATA.questions, CASES = DATA.cases;
  const byId = Object.fromEntries(QS.map(q => [q.id, q]));
  const hasKey = q => (q.kind === "single" || q.kind === "multi") ? !!(q.answer && q.options.length) : !!q.interactive;
  const store = Store.get();
  const app = document.getElementById("app");
  const $ = id => document.getElementById(id);

  let S = null;       // active session { mode, order, idx, answers, endAt, finished, review }
  let view = null;    // current question view controller
  let timerId = null;

  // ---------- theme ----------
  function applyTheme() {
    const dark = store.settings.dark ?? matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }
  $("btn-theme").onclick = () => { store.settings.dark = document.documentElement.dataset.theme !== "dark"; Store.save(); applyTheme(); };
  applyTheme();

  // ---------- helpers ----------
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const kindLabel = q => q.kind === "multi" ? `Multiple choice (select ${q.choose || "all that apply"})`
    : q.kind === "single" ? "Multiple choice" : q.kind === "dragdrop" ? "Drag and drop" : "Hot area";
  function fmt(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
  function stats() {
    let ok = 0, bad = 0;
    for (const id in store.results) store.results[id] ? ok++ : bad++;
    return { ok, bad, total: QS.length, withKey: QS.filter(hasKey).length };
  }
  function setChrome(screen) {
    $("btn-home").hidden = screen === "home";
    $("btn-nav").hidden = screen !== "quiz";
    $("timer").hidden = !(S && S.mode === "exam" && !S.finished && screen === "quiz");
    if (screen !== "quiz") $("drawer").hidden = true;
  }
  $("btn-home").onclick = () => { if (S && S.mode === "exam" && !S.finished && !confirm("Leave the exam? Your exam progress will be lost.")) return; stopTimer(); S = null; home(); };
  $("btn-nav").onclick = () => { renderGrid(); $("drawer").hidden = false; };
  $("drawer-close").onclick = () => $("drawer").hidden = true;

  // ---------- home ----------
  function home() {
    setChrome("home"); const st = stats();
    const pct = st.ok + st.bad ? Math.round(100 * st.ok / (st.ok + st.bad)) : 0;
    const shufQ = h("input", { type: "checkbox" }), shufO = h("input", { type: "checkbox" });
    shufQ.checked = !!store.settings.shuffleQ; shufO.checked = !!store.settings.shuffleOpts;
    shufQ.onchange = () => { store.settings.shuffleQ = shufQ.checked; store.order = null; Store.save(); };
    shufO.onchange = () => { store.settings.shuffleOpts = shufO.checked; Store.save(); };
    const examN = h("input", { type: "number", min: 5, max: st.withKey, value: Math.min(40, st.withKey) });
    app.replaceChildren(
      h("section", { class: "card hero" },
        h("h1", {}, "Developing AI Cloud Solutions on Azure"),
        h("p", { class: "muted" }, "Microsoft AI-200 practice questions. Pick an answer, then reveal it: correct choices turn green, wrong ones red.")),
      h("section", { class: "stats" },
        stat(`${st.ok + st.bad}`, `answered of ${st.total}`), stat(`${st.ok}`, "correct", "ok"), stat(`${st.bad}`, "wrong", "bad"), stat(`${pct}%`, "accuracy")),
      st.withKey < st.total ? h("div", { class: "notice" }, `${st.total - st.withKey} questions don't have an answer key in the source PDFs yet. You can read them, but they can't be checked until the answers are added.`) : document.createComment(""),
      h("section", { class: "card" },
        h("h2", {}, "Practice mode"),
        h("p", { class: "muted" }, "Go through all questions with instant feedback. Progress is saved in this browser."),
        h("label", { class: "check" }, shufQ, " Shuffle question order"),
        h("label", { class: "check" }, shufO, " Shuffle answer options (multiple choice)"),
        h("div", { class: "btnrow" },
          h("button", { class: "primary", onclick: () => startPractice(true) }, store.last ? "Resume" : "Start practice"),
          h("button", { onclick: () => startPractice(false) }, "Start from the beginning"),
          h("button", { onclick: () => startRetry() }, `Retry wrong answers (${st.bad})`, ) )),
      h("section", { class: "card" },
        h("h2", {}, "Exam mode"),
        h("p", { class: "muted" }, "Timed, random questions, no feedback until you finish. Pass mark 70%."),
        h("label", { class: "check" }, "Number of questions ", examN, h("span", { class: "muted" }, ` (max ${st.withKey}, 1.5 min each)`)),
        h("div", { class: "btnrow" }, h("button", { class: "primary", onclick: () => startExam(Math.max(5, Math.min(st.withKey, +examN.value || 40))) }, "Start exam"))),
      h("div", { class: "footer" }, h("button", { class: "link", onclick: () => { if (confirm("Erase all saved progress?")) { Store.resetProgress(); home(); } } }, "Reset progress"))
    );
    function stat(v, l, c) { return h("div", { class: "stat " + (c || "") }, h("b", {}, v), h("span", {}, l)); }
  }

  // ---------- sessions ----------
  function practiceOrder() {
    if (!store.order || store.order.length !== QS.length) {
      const ids = QS.map(q => q.id);
      store.order = store.settings.shuffleQ ? shuffle(ids) : ids; Store.save();
    }
    return store.order;
  }
  function startPractice(resume) {
    const order = practiceOrder();
    if (!resume) { store.last = 0; Store.save(); }
    S = { mode: "practice", order, idx: Math.min(store.last || 0, order.length - 1) };
    quiz();
  }
  function startRetry() {
    const ids = QS.filter(q => store.results[q.id] === false).map(q => q.id);
    if (!ids.length) return alert("No wrong answers to retry yet.");
    ids.forEach(id => { delete store.results[id]; delete store.answers[id]; }); Store.save();
    S = { mode: "practice", order: ids, idx: 0, retry: true };
    quiz();
  }
  function startExam(n) {
    const ids = shuffle(QS.filter(hasKey).map(q => q.id)).slice(0, n);
    S = { mode: "exam", order: ids, idx: 0, answers: {}, endAt: Date.now() + n * 90000, finished: false };
    stopTimer(); timerId = setInterval(tick, 500); tick();
    quiz();
  }
  function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
  function tick() {
    if (!S || S.mode !== "exam" || S.finished) return stopTimer();
    const left = S.endAt - Date.now(); $("timer").textContent = fmt(left);
    $("timer").classList.toggle("low", left < 300000);
    if (left <= 0) finishExam();
  }

  // ---------- quiz ----------
  function status(id) {
    if (S.mode === "exam") return S.finished ? (S.results[id] ? "ok" : "bad") : (S.answers[id] != null && hasAnswerValue(S.answers[id]) ? "ans" : "");
    const r = store.results[id]; return r === true ? "ok" : r === false ? "bad" : "";
  }
  const hasAnswerValue = a => Array.isArray(a) ? a.some(x => x != null && x !== "") : a != null;

  function quiz() {
    setChrome("quiz");
    const id = S.order[S.idx], q = byId[id];
    if (S.mode === "practice" && !S.retry) { store.last = S.idx; Store.save(); }
    const reviewing = S.mode === "exam" && S.finished;
    const revealed = S.mode === "practice" ? store.results[id] !== undefined : reviewing;
    const saved = S.mode === "practice" ? store.answers[id] : S.answers[id];
    view = Renderers.build(q, {
      saved, shuffleOpts: store.settings.shuffleOpts,
      onChange: a => { if (S.mode === "practice") { store.answers[id] = a; Store.save(); } else S.answers[id] = a; }
    });
    const banner = h("div", { class: "banner", hidden: true });
    const explain = h("div", { class: "explain-wrap" });
    const btnCheck = h("button", { class: "primary", onclick: () => doCheck() }, "Show answer");
    const caseBox = q.case ? h("details", { class: "casebox" }, h("summary", {}, CASES[q.case].title + " (tap to read)"), CASES[q.case].paragraphs.map(p => p.startsWith("•") ? h("li", {}, p.replace(/^•\s*/, "")) : h("p", {}, p))) : null;
    const imgs = q.interactive ? (q.interactive.showImages || []) : q.images;
    const nonInteractive = !hasKey(q);
    app.replaceChildren(h("article", { class: "card question" },
      h("div", { class: "qhead" },
        h("span", { class: "pill" }, `${S.idx + 1} / ${S.order.length}`),
        h("span", { class: "pill kind" }, kindLabel(q)),
        h("span", { class: "muted small" }, `#${q.id} · ${q.topic.replace(/^Topic (\d+), /, "Topic $1: ")}`)),
      h("div", { class: "bar" }, h("i", { style: `width:${100 * (S.idx + 1) / S.order.length}%` })),
      caseBox,
      h("div", { class: "qtext" }, q.text.map(p => p.startsWith("•") ? h("li", {}, p.replace(/^•\s*/, "")) : h("p", {}, p)),
        q.interactive && q.interactive.extraCode ? h("pre", { class: "code" }, q.interactive.extraCode) : null),
      imgs.map(n => h("img", { class: "exhibit", src: "img/" + n, alt: "Exhibit", loading: "lazy" })),
      q.interactive && q.interactive.sourceNote ? null : null,
      view.el,
      nonInteractive ? h("div", { class: "notice" }, "No answer key is available for this question in the source PDF yet, so it can't be checked.") : null,
      banner, explain,
      h("div", { class: "btnrow nav" },
        h("button", { onclick: () => go(-1), disabled: S.idx === 0 }, "← Previous"),
        S.mode === "practice" ? (nonInteractive ? null : btnCheck) : (reviewing ? null : h("button", { class: "primary", onclick: () => { if (confirm("Finish the exam and see your score?")) finishExam(); } }, "Finish exam")),
        S.mode === "practice" && !nonInteractive ? h("button", { class: "ghost", id: "retry", hidden: true, onclick: retry }, "Try again") : null,
        h("button", { onclick: () => go(1), disabled: S.idx === S.order.length - 1 }, "Next →"))));
    if (revealed) showResult(true);

    function doCheck() { if (S.mode !== "practice") return; const g = view.grade(); store.results[id] = g.correct === true; Store.save(); showResult(false); }
    function showResult() {
      const g = view.grade(); view.reveal(); view.lock(); btnCheck.hidden = true;
      explain.replaceChildren(...[buildExplanation(q, view)].filter(Boolean));
      const r = $("retry"); if (r) r.hidden = false;
      if (g.correct === null) return;
      banner.hidden = false; banner.className = "banner " + (g.correct ? "ok" : "bad");
      const partial = g.total > 1 && !g.correct && g.got != null ? ` (${g.got}/${g.total} correct parts)` : "";
      banner.textContent = (g.correct ? "✓ Correct" : "✗ Incorrect") + partial;
    }
    function retry() { delete store.results[id]; delete store.answers[id]; Store.save(); quiz(); }
  }
  // "Explanation" block: Correct Answer / Incorrect Answers (MCQ: keyed by option letter; other types: lists)
  function buildExplanation(q, view) {
    const ex = q.explanation; if (!ex || !ex.correct) return null;
    const L = k => (view.letterOf && view.letterOf[k]) || k;
    const optText = k => ((q.options.find(o => o.key === k)) || {}).text || "";
    const byLetter = obj => Object.keys(obj || {}).sort((a, b) => L(a).localeCompare(L(b)));
    let correct, wrong;
    if (Array.isArray(ex.correct)) {
      correct = ex.correct.map((t, i) => h("div", { class: "ex-item" }, h("span", { class: "ex-k" }, (i + 1) + "."), h("span", {}, t)));
      wrong = (ex.incorrect || []).map(t => h("div", { class: "ex-item" }, h("span", { class: "ex-k" }, "•"), h("span", {}, t)));
    } else {
      correct = byLetter(ex.correct).map(k => h("div", { class: "ex-item" }, h("span", { class: "ex-k" }, L(k) + ":"), h("span", {}, ex.correct[k])));
      wrong = byLetter(ex.incorrect).map(k => h("div", { class: "ex-item" }, h("span", { class: "ex-k" }, L(k) + ":"), h("span", {}, h("b", {}, optText(k).replace(/[.:;]\s*$/, "") + ": "), ex.incorrect[k])));
    }
    return h("details", { class: "explain", open: true },
      h("summary", {}, "Explanation"),
      h("div", { class: "ex-h" }, "Correct Answer"), correct,
      wrong.length ? h("div", { class: "ex-h" }, "Incorrect Answers") : null, wrong,
      ex.note ? h("div", { class: "ex-note" }, ex.note) : null,
      h("div", { class: "ex-ai" }, "AI-written explanation: verify against Microsoft Learn before relying on it."));
  }
  function go(d) { S.idx = Math.max(0, Math.min(S.order.length - 1, S.idx + d)); quiz(); window.scrollTo(0, 0); }

  function renderGrid() {
    $("grid").replaceChildren(...S.order.map((id, i) => h("button", { class: "cell " + status(id) + (i === S.idx ? " cur" : ""), onclick: () => { S.idx = i; $("drawer").hidden = true; quiz(); window.scrollTo(0, 0); } }, i + 1)));
  }

  // ---------- exam finish / results ----------
  function finishExam() {
    if (!S || S.finished) return;
    stopTimer(); S.finished = true; S.results = {};
    let ok = 0;
    for (const id of S.order) {
      const v = Renderers.build(byId[id], { saved: S.answers[id], onChange() {} });
      const g = v.grade(); S.results[id] = g.correct === true; if (g.correct) ok++;
    }
    S.score = ok; results();
  }
  function results() {
    setChrome("results");
    const n = S.order.length, pct = Math.round(100 * S.score / n), pass = pct >= 70;
    app.replaceChildren(
      h("section", { class: "card hero" }, h("h1", {}, pass ? "Passed 🎉" : "Not passed yet"),
        h("p", { class: "bigscore " + (pass ? "ok" : "bad") }, `${S.score} / ${n}  (${pct}%)`),
        h("p", { class: "muted" }, "Pass mark: 70%. Click a question below to review it with the correct answer.")),
      h("section", { class: "card" }, h("div", { class: "grid" }, ...S.order.map((id, i) =>
        h("button", { class: "cell " + (S.results[id] ? "ok" : "bad"), onclick: () => { S.idx = i; quiz(); window.scrollTo(0, 0); } }, i + 1)))),
      h("div", { class: "btnrow" }, h("button", { class: "primary", onclick: () => { S = null; home(); } }, "Back to home")));
  }

  home();
};
