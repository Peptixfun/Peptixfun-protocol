/* Damped spring solver (semi-implicit Euler, fixed 1/120s substeps). */
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
const reduced = () => REDUCED.matches;

function spring(from, to, onFrame, onDone, opt) {
  const k = (opt && opt.k) || 170, c = (opt && opt.c) || 22;
  if (reduced()) { onFrame(to, 1); if (onDone) onDone(); return { cancel() {} }; }
  let x = from, v = 0, last = performance.now(), raf = 0, dead = false;
  /* failsafe: starved frame loops (background panes) still land on the target */
  const guard = setTimeout(() => { if (dead) return; dead = true; cancelAnimationFrame(raf); onFrame(to, 1); if (onDone) onDone(); }, (opt && opt.max) || 1600);
  const step = (now) => {
    if (dead) return;
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    while (dt > 0) {
      const h = Math.min(dt, 1 / 120);
      v += (-k * (x - to) - c * v) * h;
      x += v * h; dt -= h;
    }
    const span = to - from || 1;
    onFrame(x, (x - from) / span);
    if (Math.abs(x - to) < Math.abs(span) * 0.002 && Math.abs(v) < Math.abs(span) * 0.02) {
      dead = true; clearTimeout(guard); onFrame(to, 1); if (onDone) onDone(); return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { cancel() { dead = true; clearTimeout(guard); cancelAnimationFrame(raf); } };
}

function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (reduced() || !("IntersectionObserver" in window)) {
    els.forEach((e) => { e.style.opacity = 1; e.style.transform = "none"; e.classList.add("done"); });
    return;
  }
  const io = new IntersectionObserver((entries) => {
    const hit = entries.filter((e) => e.isIntersecting);
    hit.forEach((e, i) => {
      io.unobserve(e.target);
      setTimeout(() => {
        const el = e.target;
        spring(0, 1, (_, p) => {
          const q = Math.max(0, Math.min(1.08, p));
          el.style.opacity = Math.min(1, q * 1.4);
          el.style.transform = "translateY(" + ((1 - q) * 24).toFixed(2) + "px)";
        }, () => { el.style.opacity = 1; el.style.transform = "none"; el.classList.add("done"); }, { k: 170, c: 20 });
      }, i * 70);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  els.forEach((e) => io.observe(e));
}
