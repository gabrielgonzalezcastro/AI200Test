// Progress persistence (localStorage, wrapped so the app still works if storage is blocked)
const Store = (() => {
  const KEY = "ai200-practice-v1";
  const blank = () => ({ results: {}, answers: {}, settings: { shuffleQ: false, shuffleOpts: false, dark: null }, last: 0, order: null });
  let mem = null;
  function load() {
    if (mem) return mem;
    try { mem = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); }
    catch (e) { mem = blank(); }
    return mem;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* ignore */ } }
  return {
    get: load,
    save,
    reset() { mem = blank(); save(); },
    resetProgress() { const s = load(); s.results = {}; s.answers = {}; s.last = 0; save(); }
  };
})();
