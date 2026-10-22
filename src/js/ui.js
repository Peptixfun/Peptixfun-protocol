/* Interface behaviour: views, progress, spotlight, parallax, copy, scroller. */
(() => {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const live = $("#live");

  /* views */
  function setView(v, push) {
    if (v !== "overview" && v !== "market") v = "overview";
    document.body.dataset.view = v;
    $$(".switch button").forEach((b) => { const on = b.dataset.view === v; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
    $("#panel-overview").hidden = v !== "overview";
    $("#panel-market").hidden = v !== "market";
    if (push) { history.replaceState(null, "", "#" + v); window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" }); }
  }
  $(".switch").addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (b) setView(b.dataset.view, true); });
  $(".switch").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = document.body.dataset.view === "overview" ? "market" : "overview";
    setView(next, true); $("#tab-" + next).focus();
  });
  document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) { e.preventDefault(); setView(g.dataset.go, true); } });
  window.addEventListener("hashchange", () => setView(location.hash.slice(1)));
  setView(location.hash.slice(1));

  /* scroll progress */
  const bar = $("#progress");
  let pend = false;
  function prog() {
    pend = false;
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = "scaleX(" + (h > 0 ? Math.min(1, scrollY / h) : 0).toFixed(4) + ")";
  }
  addEventListener("scroll", () => { if (!pend) { pend = true; requestAnimationFrame(prog); } }, { passive: true });
  addEventListener("resize", prog); prog();

  /* spotlight */
  if (!reduced()) {
    document.addEventListener("pointermove", (e) => {
      const s = e.target.closest && e.target.closest(".spot");
      if (!s) return;
      const r = s.getBoundingClientRect();
      s.style.setProperty("--mx", (e.clientX - r.left) + "px");
      s.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
  }

  /* parallax: pointer + scroll, smoothed */
  const hero = $(".hero"), layers = $$(".layer[data-depth]");
  if (!reduced() && hero) {
    let tx = 0, ty = 0, cx = 0, cy = 0, sy = 0, csy = 0, run = false;
    const loop = () => {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08; csy += (sy - csy) * 0.1;
      layers.forEach((l) => {
        const d = +l.dataset.depth;
        l.style.transform = "translate3d(" + (-cx * d).toFixed(2) + "px," + (-cy * d - csy * d * 0.25).toFixed(2) + "px,0)";
      });
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 || Math.abs(sy - csy) > 0.05) requestAnimationFrame(loop); else run = false;
    };
    const kick = () => { if (!run) { run = true; requestAnimationFrame(loop); } };
    addEventListener("pointermove", (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; kick(); }, { passive: true });
    addEventListener("scroll", () => { sy = Math.min(scrollY, innerHeight); kick(); }, { passive: true });
  }

  /* copy */
  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
    return new Promise((res, rej) => {
      const a = document.createElement("textarea"); a.value = t; a.setAttribute("readonly", ""); a.style.position = "fixed"; a.style.opacity = "0";
      document.body.appendChild(a); a.select();
      try { document.execCommand("copy") ? res() : rej(); } catch (e) { rej(e); } finally { a.remove(); }
    });
  }
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy], [data-addr]");
    if (!b || b.getAttribute("aria-disabled") === "true") return;
    const val = b.dataset.copy || b.dataset.addr;
    copyText(val).then(() => {
      live.textContent = "Copied";
      if (b.classList.contains("ca-value")) {
        const act = $(".ca-act", b), old = act.textContent;
        b.classList.add("is-copied"); act.textContent = "Copied";
        setTimeout(() => { b.classList.remove("is-copied"); act.textContent = old; }, 1600);
      } else {
        const old = b.innerHTML; b.classList.add("ok"); b.innerHTML = CHECK;
        setTimeout(() => { b.classList.remove("ok"); b.innerHTML = old; }, 1400);
      }
    }).catch(() => { live.textContent = "Copy failed"; });
  });

  /* scroller arrows */
  const cards = $("#cards"), prev = $(".arrow.prev"), next = $(".arrow.next");
  if (cards) {
    const step = () => Math.max(280, cards.clientWidth * 0.8);
    prev.addEventListener("click", () => cards.scrollBy({ left: -step(), behavior: "smooth" }));
    next.addEventListener("click", () => cards.scrollBy({ left: step(), behavior: "smooth" }));
    const upd = () => {
      prev.classList.toggle("hide", cards.scrollLeft <= 0);
      next.classList.toggle("hide", cards.scrollLeft >= cards.scrollWidth - cards.clientWidth - 1);
    };
    cards.addEventListener("scroll", upd, { passive: true }); addEventListener("resize", upd); upd();
  }

  initReveal();
  MKT.start();
})();
