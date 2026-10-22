/* Peptix gates. Builds dist/ and mutated variants, then checks every rule.
   Mutation anchors are state-independent: each one reads the CURRENT register record at runtime and flips it,
   so the harness keeps proving both branches whatever state the record is in.
   usage: node scripts/gates.mjs   (exit 0 = every gate passed) */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decodePng } from "./png.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const REG_PATH = path.join(ROOT, "src/register.json");
const read = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);
const walk = (d, o = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p, o) : o.push(p); } return o; };
const relp = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const TEXT = /\.(html|css|js|mjs|json|svg|md|txt)$/i;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "peptix-gates-"));
process.on("exit", () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

function build(registerObj, tag) {
  const out = path.join(TMP, tag, "dist");
  let reg = REG_PATH;
  if (registerObj) { reg = path.join(TMP, tag + ".register.json"); fs.writeFileSync(reg, JSON.stringify(registerObj, null, 2)); }
  execFileSync(process.execPath, [path.join(ROOT, "scripts/build.mjs"), "--quiet", "--register", reg, "--out", out], { stdio: "pipe" });
  return out;
}

/* ---------- state-independent mutation ---------- */
const FACT_KEYS = ["value", "url", "rpc", "boosts", "pairs"];
const TEST = {
  ca: { value: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" },
  x: { url: "https://x.com/peptix_test" },
  github: { url: "https://github.com/peptix-test" },
};
function flip(registerObj, id) {
  const o = JSON.parse(JSON.stringify(registerObj));
  const rec = o.records[id];
  if (rec.state === "stated") { rec.state = "absent"; for (const k of FACT_KEYS) delete rec[k]; }
  else { rec.state = "stated"; Object.assign(rec, TEST[id]); }
  return o;
}

/* ---------- html helpers ---------- */
const stripTags = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/gi, " ");
const attrs = (h) => [...h.matchAll(/\b(?:aria-label|title|alt|placeholder|content)="([^"]*)"/g)].map((m) => m[1]);
const jsStrings = (js) => [...js.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2]);
const words = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) || []);
const grams = (s) => { const w = words(s), g = new Set(); for (let i = 0; i < w.length - 1; i++) g.add(w[i] + " " + w[i + 1]); return g; };
const between = (h, open, close) => { const a = h.indexOf(open); if (a < 0) return ""; const b = h.indexOf(close, a); return h.slice(a, b < 0 ? undefined : b); };

/* ---------- address scanner (rule 3) ---------- */
const B58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const HEX = /0x[0-9a-fA-F]{40}\b/g;
function registryValues(reg) {
  const set = new Set();
  for (const r of Object.values(reg.records)) if (r.state === "stated") for (const v of Object.values(r)) if (typeof v === "string") { set.add(v); (v.match(B58) || []).forEach((m) => set.add(m)); (v.match(HEX) || []).forEach((m) => set.add(m.toLowerCase())); }
  return set;
}
function scanAddresses(text, reg) {
  const ok = registryValues(reg), bad = [];
  for (const m of text.match(B58) || []) if (/\d/.test(m) && /[A-Z]/.test(m) && /[a-z]/.test(m) && !ok.has(m)) bad.push(m);
  for (const m of text.match(HEX) || []) if (!ok.has(m.toLowerCase()) && !ok.has(m)) bad.push(m);
  return bad;
}
const caLineExempt = (html) => html.replace(/<div class="ca"[\s\S]*?<\/div>\s*(?=<\/div>)/, "");

/* ---------- gate runner ---------- */
const results = [];
function gate(name, fn) {
  let ok = false, detail = "";
  try { const r = fn(); ok = r === true || (Array.isArray(r) && r[0] === true); detail = Array.isArray(r) ? r[1] || "" : ""; if (!ok && !detail) detail = String(r); if (Array.isArray(r) && r[0] !== true) detail = r[1]; }
  catch (e) { detail = "threw: " + e.message; }
  results.push({ name, ok, detail });
  console.log((ok ? "PASS " : "FAIL ") + String(results.length).padStart(2, "0") + "  " + name + (detail ? "  [" + detail + "]" : ""));
}

/* ---------- builds ---------- */
console.log("building dist/ ...");
execFileSync(process.execPath, [path.join(ROOT, "scripts/build.mjs"), "--quiet"], { stdio: "pipe" });
const reg0 = JSON.parse(read(REG_PATH));
const html = read(path.join(DIST, "index.html")), css = read(path.join(DIST, "styles.css")), js = read(path.join(DIST, "app.js"));
const tokensCss = read(path.join(ROOT, "src/styles/tokens.css"));
const tokenHex = new Set((tokensCss.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase()));

const mutCA = flip(reg0, "ca");
const mutSoc = flip(flip(reg0, "x"), "github");
const outCA = build(mutCA, "mut-ca");
const outSoc = build(mutSoc, "mut-soc");
const outBack = build(flip(mutCA, "ca"), "mut-ca-back");
const htmlCA = read(path.join(outCA, "index.html")), htmlSoc = read(path.join(outSoc, "index.html"));

/* A. structure and assets */
gate("dist/ holds the deploy set and nothing from the repo root", () => {
  const files = walk(DIST).map((f) => path.relative(DIST, f).split(path.sep).join("/")).sort();
  const need = ["index.html", "styles.css", "app.js", "favicon.svg", "assets/peptix-logo.png"];
  const miss = need.filter((n) => !files.includes(n));
  const leak = files.filter((f) => /^(readme|license|package|docs\/|brand\/|reference\/|register\.json)/i.test(f));
  return [!miss.length && !leak.length, `missing=${miss} leaked=${leak} files=${files.join(",")}`];
});
gate("logo is copied into dist/ and index.html references it by the right relative path", () => {
  const refs = [...html.matchAll(/(?:src|href|content)="([^"]*peptix-logo\.png)"/g)].map((m) => m[1]);
  const okPath = refs.length >= 3 && refs.every((r) => r === "assets/peptix-logo.png" && exists(path.join(DIST, r)));
  const buf = fs.readFileSync(path.join(DIST, "assets/peptix-logo.png"));
  const png = decodePng(buf);
  return [okPath && png.w === 512 && png.h === 512 && png.ct === 6 && /<img src="assets\/peptix-logo\.png" alt="" width="34" height="34">/.test(html), `refs=${refs.length} ${png.w}x${png.h} ct=${png.ct}`];
});
gate("logo resize was premultiplied: no near-black fringe on partial-alpha pixels", () => {
  const png = decodePng(fs.readFileSync(path.join(DIST, "assets/peptix-logo.png")));
  let part = 0, dark = 0, zero = 0;
  for (let i = 0; i < png.px.length; i += 4) {
    const a = png.px[i + 3];
    if (a === 0) zero++; else if (a < 255) { part++; if (a >= 8 && Math.max(png.px[i], png.px[i + 1], png.px[i + 2]) < 64) dark++; }
  }
  return [part > 100 && zero > 1000 && dark === 0, `partial=${part} dark=${dark} transparent=${zero}`];
});
gate("favicon: 32x32 SVG, traced from the pixel grid, no XML comments, no double hyphen", () => {
  const s = read(path.join(DIST, "favicon.svg"));
  const hexes = (s.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase());
  return [/^<svg [^>]*width="32" height="32" viewBox="0 0 32 32"/.test(s) && s.trim().endsWith("</svg>") && !s.includes("<!--") && !s.includes("--") && /<path [^>]*d="M[\d. ]+h/.test(s) && hexes.length >= 2 && hexes.every((h) => tokenHex.has(h)) && /rel="icon" type="image\/svg\+xml" href="favicon\.svg"/.test(html), `bytes=${s.length}`];
});
gate("every local reference in index.html and styles.css resolves inside dist/", () => {
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]).filter((r) => !/^(https?:|mailto:|\/\/)/.test(r));
  const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]).filter((r) => !/^(https?:|data:)/.test(r));
  const miss = [...refs, ...urls].filter((r) => !exists(path.join(DIST, r)));
  return [!miss.length, "missing=" + miss.join(",")];
});
gate("build is deterministic (two builds hash identically)", () => {
  const h = (d) => walk(d).sort().map((f) => path.relative(d, f) + ":" + crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex")).join("|");
  return [h(DIST) === h(build(null, "again")), ""];
});

/* B. palette */
gate("palette rule: colour literals live in tokens.css only", () => {
  const srcFiles = walk(path.join(ROOT, "src")).filter((f) => /\.(css|js|html)$/.test(f) && !f.endsWith("tokens.css"));
  const strays = srcFiles.flatMap((f) => (read(f).match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter((m) => !/^#[0-9a-fA-F]{3,8}$/.test(m) || /^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{8}$/.test(m)).map((m) => relp(f) + ":" + m));
  const colorFns = srcFiles.filter((f) => !f.endsWith(".html")).flatMap((f) => (read(f).match(/\b(rgba?|hsla?)\(/g) || []).map((m) => relp(f) + ":" + m));
  return [!strays.length && !colorFns.length, strays.concat(colorFns).slice(0, 6).join(" ")];
});
gate("palette rule: every shipped hex is a token, every token has pixel provenance in a real asset", () => {
  const shipped = [html, css, js, read(path.join(DIST, "favicon.svg"))].flatMap((t) => t.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase());
  const foreign = shipped.filter((h) => !tokenHex.has(h));
  const lines = tokensCss.split("\n").filter((l) => /--c-[a-z0-9-]+:\s*#[0-9a-fA-F]{6}/.test(l));
  const bad = lines.filter((l) => { const m = l.match(/\/\*\s*([^@]+?)\s*@\s*(\d+),(\d+)/); return !m || !(exists(path.join(ROOT, m[1].trim().replace(/^(brand|reference)\/?/, "$1/") + ".png")) || fs.readdirSync(path.join(ROOT, m[1].trim().split("/")[0])).some((f) => f.startsWith(m[1].trim().split("/")[1]))); });
  return [!foreign.length && lines.length >= 10 && !bad.length, `foreign=${foreign.join(",")} tokens=${lines.length} unprovenanced=${bad.length}`];
});

/* C. register rules */
gate("register: valid states, inert records carry no value and no url", () => {
  const bad = Object.entries(reg0.records).filter(([, r]) => !["stated", "absent", "unconfirmed"].includes(r.state) || (r.state !== "stated" && FACT_KEYS.some((k) => k in r)));
  return [!bad.length && Object.keys(reg0.records).length >= 8, bad.map(([k]) => k).join(",")];
});
gate("register: dates stay in register.json and never reach dist/", () => {
  const dated = Object.values(reg0.records).every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.checked));
  const runtime = JSON.parse(between(html, '<script type="application/json" id="register-data">', "</script>").replace(/^[^>]*>/, ""));
  const leaked = Object.values(runtime.records).some((r) => "checked" in r);
  return [dated && !leaked, `dated=${dated} leaked=${leaked}`];
});
gate("link rule: no href exists for any unstated record (baseline dist)", () => {
  const issues = [];
  for (const id of ["x", "github"]) {
    const tag = html.match(new RegExp(`<(a|span) class="soc" data-social="${id}"[^>]*>`));
    if (!tag) { issues.push(id + " missing"); continue; }
    const stated = reg0.records[id].state === "stated";
    if (stated !== (tag[1] === "a" && /href="https?:/.test(tag[0]))) issues.push(id + " href/state mismatch");
    if (!stated && /href=/.test(tag[0])) issues.push(id + " inert has href");
  }
  const paths = [...html.matchAll(/<article class="path[^>]*>[\s\S]*?<\/article>/g)].map((m) => m[0]);
  for (const p of paths) if (/<a /.test(p) && !/href="https?:/.test(p)) issues.push("path anchor without url");
  const anyAnchorBlank = [...html.matchAll(/<a [^>]*href="(?:#?|)"/g)].length;
  return [!issues.length && !anyAnchorBlank && paths.length === 3, issues.join("; ")];
});
gate("link rule: inert records show label and pending only", () => {
  const ca = html.match(/<div class="ca"[\s\S]*?<\/div>\s*<\/div>/)[0];
  const inertCA = reg0.records.ca.state !== "stated";
  const socials = ["x", "github"].every((id) => { const t = html.match(new RegExp(`data-social="${id}"[^>]*>`))[0]; return reg0.records[id].state === "stated" || (/aria-label="[^"]+ pending"/.test(t) && !/href=/.test(t)); });
  return [(!inertCA || (/pending/.test(ca) && !/data-copy|<button/.test(ca))) && socials, ""];
});

/* D. social and CA placement */
gate("social: top-right at every breakpoint, icon only, both present, official marks", () => {
  const nav = between(html, '<nav class="socials"', "</nav>");
  const items = [...nav.matchAll(/<(a|span) class="soc"[^>]*>([\s\S]*?)<\/\1>/g)];
  const noText = items.every((m) => stripTags(m[2]).trim() === "");
  const X = "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z";
  const G = "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38";
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /\.soc\b|\.socials\b/.test(m[1]));
  const hidden = rules.some((m) => /display:\s*none|visibility:\s*hidden/.test(m[2]));
  const right = /\.socials \{[^}]*margin-left: auto/.test(css) && /\.bar \{[^}]*justify-content: space-between/.test(css);
  const inHeader = /<div class="container bar">[\s\S]*<nav class="socials"/.test(html.split('<div class="strip">')[0]);
  return [items.length === 2 && noText && nav.includes(X) && nav.includes(G) && !hidden && right && inHeader, `icons=${items.length} noText=${noText} hidden=${hidden} right=${right}`];
});
gate("CA slot: top of page, always visible, large mono, click-to-copy when stated, inert otherwise", () => {
  const top = between(html, '<div class="top">', '<div class="strip">');
  const firstInBody = html.indexOf('<div class="top">') < html.indexOf("<main");
  const sticky = /\.top \{[^}]*position: sticky; top: 0/.test(css);
  const size = (css.match(/\.ca-value \{[^}]*font-size: clamp\([^,]+,[^,]+,\s*(\d+)px\)/) || [])[1];
  const mono = /\.ca-value \{[^}]*font-family: var\(--font-mono\)/.test(css);
  const wrap = /\.ca-value \{[^}]*overflow-wrap: anywhere/.test(css);
  const st = reg0.records.ca.state === "stated";
  const branch = st ? new RegExp(`data-copy="${reg0.records.ca.value}"[^>]*>\\s*<span class="ca-text">${reg0.records.ca.value}</span>`).test(top) : /data-state="(absent|unconfirmed)"/.test(top) && !/data-copy/.test(top);
  const fb = /is-copied/.test(js) && /Copied/.test(js);
  return [firstInBody && sticky && +size >= 28 && mono && wrap && branch && fb, `size=${size} stated=${st}`];
});

/* E. both gate branches, proven by state-independent mutation */
function caView(h) { const t = between(h, '<div class="top">', '<div class="strip">'); return { stated: /data-state="stated"/.test(t), copy: (t.match(/data-copy="([^"]*)"/) || [])[1], text: (t.match(/<span class="ca-text">([^<]*)</) || [])[1], button: /<button/.test(t) }; }
gate("branch proof: flipping the CA record flips the slot (inert <-> copyable, full address)", () => {
  const a = caView(html), b = caView(htmlCA), want = mutCA.records.ca;
  const flipped = a.stated !== b.stated && b.stated === (want.state === "stated");
  const good = b.stated ? b.copy === want.value && b.text === want.value && b.button : !b.copy && b.text === "pending" && !b.button;
  return [flipped && good, `baseline=${a.stated ? "stated" : "inert"} mutated=${b.stated ? "stated" : "inert"}`];
});
gate("branch proof: flipping X and GitHub flips both icons (inert <-> href + derived handle)", () => {
  const report = [];
  for (const id of ["x", "github"]) {
    const want = mutSoc.records[id], t = htmlSoc.match(new RegExp(`<(a|span) class="soc" data-social="${id}"[^>]*>`));
    if (want.state === "stated") {
      const h = "@" + new URL(want.url).pathname.split("/").filter(Boolean)[0];
      if (!(t[1] === "a" && t[0].includes(`href="${want.url}"`) && t[0].includes(h) && /rel="noopener noreferrer"/.test(t[0]))) report.push(id + " stated branch wrong");
    } else if (!(t[1] === "span" && !/href=/.test(t[0]) && /pending/.test(t[0]))) report.push(id + " inert branch wrong");
  }
  return [!report.length, report.join("; ")];
});
gate("branch proof: flipping twice returns byte-identical output (both directions deterministic)", () => [read(path.join(outBack, "index.html")) === html && read(path.join(outBack, "app.js")) === js, ""]);
gate("market independence: CA state has zero effect on market code, markup and source record", () => {
  const sec = (h) => ["id=\"cards\"", "id=\"rows\"", "id=\"ticker\"", "id=\"status\"", "id=\"t-vol\""].map((k) => { const i = h.indexOf(k); return h.slice(i, i + 160); }).join("|");
  const mj = read(path.join(ROOT, "src/js/market.js"));
  const touchesCA = /records\.ca\b|\["ca"\]|\['ca'\]|data-ca|\.ca-|getElementById\("ca/.test(mj.replace(/\/\*[\s\S]*?\*\//g, ""));
  const same = read(path.join(outCA, "app.js")) === js && sec(htmlCA) === sec(html);
  const rt = (h) => JSON.parse(between(h, '<script type="application/json" id="register-data">', "</script>").replace(/^[^>]*>/, "")).records["market-source"];
  return [!touchesCA && same && JSON.stringify(rt(html)) === JSON.stringify(rt(htmlCA)), `touchesCA=${touchesCA} same=${same}`];
});

/* F. gate warning / address scanner */
gate("address scanner: no unregistered address-shaped string anywhere (CA slot exempt)", () => {
  const files = [...walk(DIST), ...walk(path.join(ROOT, "src")), path.join(ROOT, "README.md"), ...walk(path.join(ROOT, "docs"))].filter((f) => TEXT.test(f));
  const bad = files.flatMap((f) => scanAddresses(f.startsWith(DIST) && f.endsWith("index.html") ? caLineExempt(read(f)) : read(f), reg0).map((a) => relp(f) + ":" + a));
  const badCA = scanAddresses(caLineExempt(htmlCA), mutCA);
  return [!bad.length && !badCA.length, bad.concat(badCA).slice(0, 4).join(" ")];
});
gate("gate warning self-test: 0x hex is never blanket-rejected, only unregistered address shapes are", () => {
  const addr0x = "0x" + "AbC123".repeat(6) + "abcd";
  const registry = { records: { ca: { state: "stated", value: addr0x } } };
  const solFake = "9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT";
  const cases = [
    scanAddresses("color 0x1F and mask 0x7fffffff", registry).length === 0,
    scanAddresses(`registered ${addr0x}`, registry).length === 0,
    scanAddresses(`stray ${"0x" + "1a2b3c".repeat(6) + "1a2b"}`, registry).length === 1,
    scanAddresses(`stray ${solFake}`, registry).length === 1,
    scanAddresses(`stray ${solFake}`, { records: { ca: { state: "stated", value: solFake } } }).length === 0,
    scanAddresses(`stray ${solFake}`, { records: { ca: { state: "absent" } } }).length === 1,
  ];
  return [cases.every(Boolean), cases.map((c) => (c ? 1 : 0)).join("")];
});

/* G. no dates */
gate("no dates anywhere: no date, time, clock or 'as of' strings in dist/, no date APIs in code", () => {
  const files = walk(DIST).filter((f) => TEXT.test(f));
  const visible = (f) => { const t = read(f); return f.endsWith(".html") ? stripTags(t) + " " + attrs(t).join(" ") : f.endsWith(".js") ? jsStrings(t).join(" ") : f.endsWith(".css") ? [...t.matchAll(/content:\s*"([^"]*)"/g)].map((m) => m[1]).join(" ") : ""; };
  const pats = [/\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/, /\b\d{1,2}[-/.]\d{1,2}[-/.](19|20)?\d{2}\b/, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}\b/i, /\b\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i, /\b(19|20)\d{2}\b/, /\b\d{1,2}:\d{2}(:\d{2})?\s?(am|pm)?\b/i, /\bas of\b|\bchecked\b|\blast updated\b|\bupdated (at|on)\b|\btimestamp\b/i, /toLocale(Date|Time)String|toISOString|toUTCString|toDateString|getFullYear|getTimezoneOffset|Intl\.DateTimeFormat|new Date\(/];
  const hits = files.flatMap((f) => pats.map((p, i) => ((i === pats.length - 1 ? p.test(read(f)) : p.test(visible(f))) ? relp(f) + "#" + i : null)).filter(Boolean));
  return [!hits.length, hits.join(",")];
});

/* H. motion */
gate("prefers-reduced-motion: CSS kills every animation and transition, JS has instant paths", () => {
  const block = between(css, "@media (prefers-reduced-motion: reduce)", "\n}\n");
  const cssOK = /animation: none !important/.test(block) && /transition: none !important/.test(block) && /\.reveal \{[^}]*opacity: 1/.test(block) && /scroll-behavior: auto/.test(block);
  const jsOK = /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/.test(js) && /if \(reduced\(\)\) \{ onFrame\(to, 1\)/.test(js) && /if \(!reduced\(\)\) \{[\s\S]*?pointermove/.test(js) && /!reduced\(\)\) \{\s*const host/.test(js);
  return [cssOK && jsOK, `css=${cssOK} js=${jsOK}`];
});
gate("visual system present: spring reveal, parallax, mesh, spotlight, progress, live dot, skeleton, count-up flash, marquee", () => {
  const chk = {
    spring: /function spring\(/.test(js) && /v \+= \(-k \* \(x - to\) - c \* v\) \* h/.test(js),
    stagger: /i \* 70/.test(js) && /--i,/.test(css),
    parallax: /data-depth/.test(html) && /translate3d/.test(js) && /pointermove/.test(js) && /scrollY/.test(js),
    mesh: /\.mesh \{/.test(css) && /\.blob/.test(css) && /@keyframes drift1/.test(css),
    spotlight: /\.spot::before \{[^}]*radial-gradient/.test(css) && /--mx/.test(js),
    progress: /class="progress"/.test(html) && /scaleX\(/.test(js),
    liveDot: /@keyframes ping/.test(css) && /id="status"/.test(html),
    skeleton: /@keyframes shimmer/.test(css) && /class="sk/.test(js) && /\.fadein\.in/.test(css),
    countup: /function setNum/.test(js) && /flash-up/.test(js) && /@keyframes flashUp/.test(css),
    marquee: /@keyframes ticker/.test(css) && /inner \+ inner/.test(js),
  };
  const miss = Object.entries(chk).filter(([, v]) => !v).map(([k]) => k);
  return [!miss.length, "missing=" + miss.join(",")];
});

/* I. market data contract */
gate("market: both DexScreener endpoints from the register, Solana only, top 10 by 24h volume", () => {
  const rt = JSON.parse(between(html, '<script type="application/json" id="register-data">', "</script>").replace(/^[^>]*>/, "")).records["market-source"];
  const eps = rt.boosts === "https://api.dexscreener.com/token-boosts/top/v1" && rt.pairs === "https://api.dexscreener.com/tokens/v1/solana/" && rt.state === "stated";
  return [eps && /chainId === "solana"/.test(js) && /\.slice\(0, 10\)/.test(js) && /b\.vol - a\.vol/.test(js) && /imageUrl/.test(js) && /liquidity/.test(js) && /data-addr/.test(js), ""];
});
gate("market: 60s poll, pause while hidden, immediate fetch on visible, exponential backoff, last good data kept, dash on failure", () => {
  const chk = [/POLL = 60000/, /document\.hidden \|\| inflight\) return/, /visibilitychange/, /if \(!document\.hidden\) tick\(\)/, /BACK0 \* Math\.pow\(2, fails - 1\)/, /AbortController/, /if \(!state\.list\.length\) \{ markDashes\(\)/, /state\.list = await fetchBoard\(\)/, /—|\\u2014/];
  const miss = chk.filter((r) => !r.test(js)).map(String);
  return [!miss.length, miss.join(" ")];
});
gate("market: letter-tile fallback, copy-per-address, skeleton to fade-in stagger", () => [/onerror="this\.remove\(\)"/.test(js) && /charAt\(0\)\.toUpperCase\(\)/.test(js) && /class="copy"/.test(js) && /renderSkeleton/.test(js) && /calc\(var\(--i, 0\) \* 60ms\)/.test(css), ""]);

/* J. copy */
const corpus = read(path.join(ROOT, "gates/reference-corpus.txt"));
const ownCopy = () => [stripTags(html), ...attrs(html), ...jsStrings(js).filter((s) => /[a-z]{3,} [a-z]{2,}|^[A-Z][a-z]{3,}$/.test(s) && !/[<>{}=()]/.test(s)), ...[...read(path.join(ROOT, "scripts/build.mjs")).matchAll(/"([A-Z][^"]{20,})"/g)].map((m) => m[1])].join(" \n ");
gate("copy: zero 2-grams shared with the reference site", () => {
  const ref = grams(corpus), shared = [...grams(ownCopy())].filter((g) => ref.has(g));
  return [!shared.length, shared.slice(0, 8).join(" | ")];
});
gate("copy: zero distinctive words shared with the reference site", () => {
  const STOP = new Set("a an the and or but of to in on at by for with from as is it its be are was were that this these those you your we our us who what which when where how not no so if then than can will would could should may might have has had do does did into over under up down out about via per all any each more most other some such only own same too very just also".split(" "));
  const ref = new Set(words(corpus).filter((w) => !STOP.has(w) && w.length > 1 && !/^\d+$/.test(w)));
  const own = new Set(words(ownCopy()));
  const shared = [...ref].filter((w) => own.has(w));
  return [!shared.length, shared.join(",")];
});

/* K. mobile and measurement rules */
gate("no ch units anywhere in CSS or inline styles", () => [!/\d(\.\d+)?ch\b/.test(css) && !/style="[^"]*\d(\.\d+)?ch\b/.test(html + js), ""]);
gate("tap targets: every interactive class is sized from the 44px token", () => {
  const tap = /--tap:\s*44px/.test(css);
  const need = [".soc", ".switch button", ".chip", ".copy", ".arrow", ".cta", ".brand", ".search input", ".ca-value", ".pill"];
  const miss = need.filter((sel) => { const re = new RegExp("(^|\\n|\\})\\s*" + sel.replace(/[.\s]/g, (c) => "\\" + c) + " \\{([^}]*)\\}"); const m = css.match(re); return !m || !/(min-height|height|width|min-width): (var\(--tap\)|4[4-9]px|[5-9]\d px|\d{3}px)/.test(m[2]); });
  return [tap && !miss.length, "miss=" + miss.join(",")];
});
gate("mobile layout rules: breakpoints for 360/390/430 widths, no horizontal overflow guard, viewport meta", () => [/name="viewport" content="width=device-width, initial-scale=1"/.test(html) && /overflow-x: hidden/.test(css) && /@media \(max-width: 560px\)/.test(css) && /@media \(max-width: 720px\)/.test(css) && /@media \(max-width: 900px\)/.test(css), ""]);

/* L. repo hygiene and content */
const NAMES = ["cla" + "ude", "anthro" + "pic", "co-authored", "generated with", "\\bA" + "I\\b", "artificial intelligence", "chat" + "gpt", "\\bll" + "m\\b", "copi" + "lot"];
gate("repo hygiene: no agent config files, no attribution of any kind in any text file", () => {
  const all = walk(ROOT).filter((f) => !/[\\/](node_modules|\.git)[\\/]/.test(f));
  const rx = new RegExp(NAMES.join("|"), "i");
  const files = all.filter((f) => TEXT.test(f) && !/[\\/](brand|reference)[\\/]/.test(f) && !f.endsWith("gates.mjs"));
  const hits = files.filter((f) => rx.test(read(f))).map(relp);
  const forbidden = all.filter((f) => /[\\/]\.(cla|anth)[a-z]*[\\/]/i.test(f) || new RegExp("^" + NAMES[0] + "\\.md$", "i").test(path.basename(f)) || /^\.(cursor|windsurf)/.test(path.basename(f))).map(relp);
  return [!hits.length && !forbidden.length, "hits=" + hits.join(",") + " forbidden=" + forbidden.join(",")];
});
gate("repo content: README, whitepaper, MIT LICENSE exist at the root and stay out of dist/", () => {
  const rd = read(path.join(ROOT, "README.md")), wp = read(path.join(ROOT, "docs/whitepaper.md")), lic = read(path.join(ROOT, "LICENSE"));
  const phases = (wp.match(/\*\*Phase \d/g) || []).length;
  return [/^# Peptix/m.test(rd) && /shields\.io\/badge\/live-peptix\.fun/.test(rd) && /Solana/.test(rd) && /pending/.test(rd) && /## Overview/.test(rd) && /## Features/.test(rd) && /## Links/.test(rd) && /Vision/.test(wp) && /Tokenomics/.test(wp) && phases >= 3 && phases <= 4 && /Team/.test(wp) && /^MIT License/.test(lic) && /Copyright \(c\) 2026 Peptix/.test(lic) && !exists(path.join(DIST, "README.md")) && !exists(path.join(DIST, "LICENSE")) && !exists(path.join(DIST, "docs")), `phases=${phases}`];
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} gates, ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
