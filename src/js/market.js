/* Live market. Reads ONLY the market-source register record. Nothing here knows the contract state. */
const MKT = (() => {
  const REG = JSON.parse(document.getElementById("register-data").textContent).records;
  const SRC = REG["market-source"];
  const POLL = 60000, BACK0 = 2000, TIMEOUT = 12000;
  const state = { list: [], ok: false, sort: "vol", q: "" };
  const vals = new Map();
  const $ = (s) => document.querySelector(s);
  const el = { cards: $("#cards"), rows: $("#rows"), ticker: $("#ticker"), pill: $("#status"), ptext: $("#status-text"), err: $("#err") };
  let timer = 0, fails = 0, inflight = false, builtKey = "", cardKey = "", tickKey = "";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => (typeof n === "number" && isFinite(n) ? n : null);

  function fmtUsd(n) {
    if (n == null) return "—";
    const a = Math.abs(n);
    if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toFixed(0);
  }
  function fmtPrice(p) {
    if (p == null) return "—";
    if (p >= 1000) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (p >= 1) return "$" + p.toFixed(p >= 100 ? 2 : 4);
    if (p === 0) return "$0";
    const d = Math.min(12, Math.max(4, 3 - Math.floor(Math.log10(p))));
    return "$" + p.toFixed(d);
  }
  function fmtChg(c) {
    if (c == null) return "—";
    return (c > 0 ? "▲ +" : c < 0 ? "▼ " : "") + c.toFixed(2) + "%";
  }
  const FMT = { price: fmtPrice, chg: fmtChg, vol: fmtUsd, liq: fmtUsd };

  async function getJSON(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
      if (!r.ok) throw new Error("http " + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  async function fetchBoard() {
    const boosts = await getJSON(SRC.boosts);
    if (!Array.isArray(boosts)) throw new Error("shape");
    const addrs = [], icon = {};
    for (const b of boosts) {
      if (b && b.chainId === "solana" && b.tokenAddress && !(b.tokenAddress in icon)) {
        icon[b.tokenAddress] = b.icon || null; addrs.push(b.tokenAddress);
      }
    }
    if (!addrs.length) throw new Error("empty");
    const pairs = await getJSON(SRC.pairs + addrs.slice(0, 30).join(","));
    if (!Array.isArray(pairs)) throw new Error("shape");
    const by = new Map();
    for (const p of pairs) {
      const a = p && p.baseToken && p.baseToken.address;
      if (!a || !(a in icon)) continue;
      const liq = num(p.liquidity && p.liquidity.usd) || 0, vol = num(p.volume && p.volume.h24) || 0;
      let t = by.get(a);
      if (!t) { t = { addr: a, name: p.baseToken.name, sym: p.baseToken.symbol, img: (p.info && p.info.imageUrl) || icon[a] || null, price: null, chg: null, vol: 0, liq: 0, best: -1 }; by.set(a, t); }
      t.vol += vol; t.liq += liq;
      if (liq > t.best) { t.best = liq; t.price = num(parseFloat(p.priceUsd)); t.chg = num(p.priceChange && p.priceChange.h24); }
    }
    return [...by.values()].sort((a, b) => b.vol - a.vol).slice(0, 10);
  }

  /* number cell with spring count-up and change flash */
  function setNum(node, key, value, field) {
    const fmt = FMT[field];
    if (value == null) { node.textContent = "—"; vals.delete(key); return; }
    const prev = node._v != null ? node._v : vals.get(key);
    vals.set(key, value);
    if (prev === value && node._v === value) return;
    if (node._anim) node._anim.cancel();
    const from = prev == null ? 0 : prev;
    node._v = value;
    if (prev != null && prev !== value && !reduced()) {
      const host = node.closest(".cell") || node;
      const cls = value > prev ? "flash-up" : "flash-dn";
      host.classList.remove("flash-up", "flash-dn"); void host.offsetWidth; host.classList.add(cls);
    }
    node._anim = spring(from, value, (x) => { node.textContent = fmt(x); }, () => { node.textContent = fmt(value); }, { k: 120, c: 20 });
  }

  const logo = (t, cls) => '<span class="tok ' + cls + '"><span>' + esc((t.sym || t.name || "?").trim().charAt(0).toUpperCase()) + "</span>" +
    (t.img ? '<img src="' + esc(t.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : "") + "</span>";
  const copyBtn = (t) => '<button class="copy" type="button" data-addr="' + esc(t.addr) + '" aria-label="Copy address of ' + esc(t.sym || t.name) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg></button>';
  const chgCls = (c) => (c > 0 ? "up" : c < 0 ? "dn" : "");

  function visible() {
    const q = state.q.trim().toLowerCase();
    const list = state.list.filter((t) => !q || (t.name || "").toLowerCase().includes(q) || (t.sym || "").toLowerCase().includes(q));
    const k = state.sort;
    return list.sort((a, b) => (b[k] == null ? -Infinity : b[k]) - (a[k] == null ? -Infinity : a[k]));
  }

  function fillCells(root, t, ctx) {
    root.querySelectorAll("[data-f]").forEach((n) => {
      const f = n.dataset.f;
      setNum(n, t.addr + ":" + f + ":" + ctx, t[f], f);
      if (f === "chg") n.className = "chg " + chgCls(t.chg);
    });
  }

  function renderRows() {
    const list = visible();
    const key = list.map((t) => t.addr).join(",") + "|" + state.q;
    if (!list.length) {
      el.rows.innerHTML = '<div class="empty">' + (state.list.length ? "Nothing fits that filter." : "—") + "</div>"; builtKey = ""; return;
    }
    if (key !== builtKey) {
      builtKey = key;
      el.rows.innerHTML = list.map((t, i) =>
        '<div class="tr spot fadein" role="row" style="--i:' + i + '" data-a="' + esc(t.addr) + '">' +
        '<span class="rank" role="cell">' + (i + 1) + "</span>" +
        '<span class="who" role="cell">' + logo(t, "sm") + "<span><b>" + esc(t.name) + "</b><small>" + esc(t.sym) + "</small></span></span>" +
        '<span class="cell r c-price" role="cell"><small class="m">Price</small><span data-f="price"></span></span>' +
        '<span class="cell r c-chg" role="cell"><small class="m">24h</small><span data-f="chg"></span></span>' +
        '<span class="cell r c-vol" role="cell"><small class="m">Volume</small><span data-f="vol"></span></span>' +
        '<span class="cell r c-liq" role="cell"><small class="m">Liquidity</small><span data-f="liq"></span></span>' +
        '<span class="r c-copy" role="cell">' + copyBtn(t) + "</span></div>").join("");
      setTimeout(() => el.rows.querySelectorAll(".fadein").forEach((n) => n.classList.add("in")), 40);
    }
    list.forEach((t) => { const r = el.rows.querySelector('[data-a="' + CSS.escape(t.addr) + '"]'); if (r) fillCells(r, t, "row"); });
  }

  function renderCards() {
    const list = state.list;
    const key = list.map((t) => t.addr).join(",");
    if (key !== cardKey) {
      cardKey = key;
      el.cards.innerHTML = list.map((t, i) =>
        '<article class="mcard spot fadein" style="--i:' + i + '" data-a="' + esc(t.addr) + '"><div class="top2"><span>#' + (i + 1) + "</span><span>Solana</span></div>" +
        logo(t, "lg") + "<h3>" + esc(t.name) + '</h3><div class="sym">' + esc(t.sym) + "</div>" +
        '<dl><div class="cell"><dt>Price</dt><dd data-f="price"></dd></div><div class="cell"><dt>24h</dt><dd data-f="chg"></dd></div><div class="cell"><dt>Volume</dt><dd data-f="vol"></dd></div><div class="cell"><dt>Liquidity</dt><dd data-f="liq"></dd></div></dl>' +
        '<div class="row"><span class="label">Address</span>' + copyBtn(t) + "</div></article>").join("");
      setTimeout(() => el.cards.querySelectorAll(".fadein").forEach((n) => n.classList.add("in")), 40);
      el.cards.dispatchEvent(new Event("scroll"));
    }
    list.forEach((t) => { const c = el.cards.querySelector('[data-a="' + CSS.escape(t.addr) + '"]'); if (c) fillCells(c, t, "card"); });
  }

  function renderTicker() {
    const list = state.list;
    if (!list.length) return;
    const inner = list.map((t) => '<span class="tk">' + logo(t, "xs") + "<em>" + esc(t.sym) + "</em><span>" + fmtPrice(t.price) + '</span><span class="chg ' + chgCls(t.chg) + '">' + fmtChg(t.chg) + "</span></span>").join("");
    if (inner === tickKey) return;
    tickKey = inner;
    el.ticker.innerHTML = inner + inner;
  }

  function renderTiles() {
    const L = state.list;
    if (!L.length) return;
    $("#t-count").textContent = String(L.length);
    const vol = L.reduce((s, t) => s + t.vol, 0), liq = Math.max.apply(null, L.map((t) => t.liq));
    setNum($("#t-vol"), "tile:vol", vol, "vol"); setNum($("#t-liq"), "tile:liq", liq, "liq");
  }

  function renderSkeleton() {
    el.rows.innerHTML = Array.from({ length: 10 }, () =>
      '<div class="tr" aria-hidden="true"><span class="rank sk">00</span><span class="who"><span class="tok sm sk round"></span><span class="sk" style="width:120px">name</span></span>' +
      '<span class="r"><span class="sk">$0.0000</span></span><span class="r"><span class="sk">+0.00%</span></span><span class="r"><span class="sk">$0.00M</span></span><span class="r"><span class="sk">$0.00M</span></span><span class="r"></span></div>').join("");
    el.cards.innerHTML = Array.from({ length: 4 }, () =>
      '<article class="mcard" aria-hidden="true"><div class="top2"><span class="sk">#0</span></div><span class="tok lg sk round"></span><h3 class="sk">token name</h3><div class="sym sk" style="width:60px">SYM</div><dl><div><dt class="sk">Price</dt><dd class="sk">$0.0000</dd></div><div><dt class="sk">24h</dt><dd class="sk">+0.00%</dd></div><div><dt class="sk">Volume</dt><dd class="sk">$0.00M</dd></div></dl></article>').join("");
  }

  function setStatus(s) {
    el.pill.dataset.s = s;
    el.ptext.textContent = { live: "Live", sync: "Syncing", retry: "Retrying", err: "Source down" }[s];
    el.err.hidden = !(s === "err");
  }

  function renderAll() { renderTicker(); renderCards(); renderRows(); renderTiles(); }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }

  async function tick() {
    if (document.hidden || inflight) return;
    inflight = true; setStatus(state.list.length ? "live" : "sync");
    try {
      state.list = await fetchBoard();
      fails = 0; state.ok = true;
      renderAll(); setStatus("live"); schedule(POLL);
    } catch (e) {
      fails++;
      const wait = Math.min(POLL, BACK0 * Math.pow(2, fails - 1)) * (0.85 + Math.random() * 0.3);
      if (!state.list.length) { markDashes(); setStatus("err"); } else setStatus("retry");
      schedule(wait);
    } finally { inflight = false; }
  }

  function markDashes() {
    ["#t-count", "#t-vol", "#t-liq"].forEach((s) => { $(s).textContent = "—"; });
    el.rows.innerHTML = '<div class="empty">—</div>';
    el.cards.innerHTML = '<div class="empty" style="flex:1">—</div>';
    el.ticker.innerHTML = '<span class="tk">—</span>';
    builtKey = cardKey = tickKey = "";
  }

  function start() {
    renderSkeleton();
    document.addEventListener("visibilitychange", () => {
      clearTimeout(timer);
      if (!document.hidden) tick();
    });
    $("#q").addEventListener("input", (e) => { state.q = e.target.value; renderRows(); });
    $("#sorts").addEventListener("click", (e) => {
      const b = e.target.closest("[data-sort]"); if (!b) return;
      state.sort = b.dataset.sort;
      document.querySelectorAll("#sorts .chip").forEach((c) => c.classList.toggle("on", c === b));
      builtKey = ""; renderRows();
    });
    if (!document.hidden) tick();
  }
  return { start };
})();
