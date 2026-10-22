/* Peptix build. Zero dependencies. Output: dist/ (drag this folder to Cloudflare Pages).
   usage: node scripts/build.mjs [--register <file>] [--out <dir>] [--quiet] */
import fs from "node:fs";
import path from "node:path";
import { decodePng, encodePng, resizePremul } from "./png.mjs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 ? process.argv[i + 1] : d; };
const QUIET = process.argv.includes("--quiet");
const log = (...a) => { if (!QUIET) console.log(...a); };
const REGISTER = path.resolve(arg("register", path.join(ROOT, "src/register.json")));
const OUT = path.resolve(arg("out", path.join(ROOT, "dist")));
const rel = (p) => path.relative(ROOT, p);

/* ---------- inputs ---------- */
const reg = JSON.parse(fs.readFileSync(REGISTER, "utf8"));
const R = reg.records;
const tokens = fs.readFileSync(path.join(ROOT, "src/styles/tokens.css"), "utf8");
const tok = (n) => { const m = tokens.match(new RegExp("--" + n + ":\\s*(#[0-9a-fA-F]{6})")); if (!m) throw new Error("token missing " + n); return m[1]; };

for (const [id, r] of Object.entries(R)) {
  if (!["stated", "absent", "unconfirmed"].includes(r.state)) throw new Error(id + ": bad state");
  if (r.state !== "stated") for (const k of ["value", "url", "rpc", "boosts", "pairs"]) if (k in r) throw new Error(id + ": inert record carries " + k);
}
const stated = (id) => R[id] && R[id].state === "stated";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const handle = (url) => { try { return "@" + new URL(url).pathname.split("/").filter(Boolean)[0]; } catch { return ""; } };

/* ---------- logo ---------- */
const LOGO_SRC = path.join(ROOT, "brand", "LOGO PEPTIX PNG...png");
const logo = decodePng(fs.readFileSync(LOGO_SRC));
{
  const hist = { zero: 0, full: 0, part: 0 }; let blackT = 0, nT = 0;
  for (let i = 0; i < logo.px.length; i += 4) {
    const a = logo.px[i + 3];
    if (a === 0) { hist.zero++; nT++; if (!logo.px[i] && !logo.px[i + 1] && !logo.px[i + 2]) blackT++; } else if (a === 255) hist.full++; else hist.part++;
  }
  log(`logo ${rel(LOGO_SRC)}: IHDR ${logo.w}x${logo.h} bitdepth=${logo.bd} colortype=${logo.ct} | alpha 0:${hist.zero} 255:${hist.full} partial:${hist.part} | transparent px pure black: ${(100 * blackT / nT).toFixed(1)}% -> premultiplied resize`);
}
const CROP = { x: 500, y: 499, s: 1000 }; /* opaque bbox 503,500..1499,1498 plus margin */
const LOGO_PX = 512;
const logoOut = encodePng(LOGO_PX, LOGO_PX, resizePremul(logo, CROP.x, CROP.y, CROP.s, CROP.s, LOGO_PX, LOGO_PX));

/* ---------- favicon traced from the real pixel grid ---------- */
function favicon() {
  const N = 52; /* 52 cells of 0.5 units = 26 of 32 */
  const g = resizePremul(logo, CROP.x, CROP.y, CROP.s, CROP.s, N, N);
  const rows = [];
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      if (g[(y * N + x) * 4 + 3] >= 128) {
        let e = x; while (e < N && g[(y * N + e) * 4 + 3] >= 128) e++;
        rows.push(`M${3 + x / 2} ${3 + y / 2}h${(e - x) / 2}v.5h${-(e - x) / 2}z`);
        x = e;
      } else x++;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${tok("c-panel")}"/><path fill="${tok("c-white")}" d="${rows.join("")}"/></svg>\n`;
}

/* ---------- register -> markup ---------- */
const X_PATH = "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z";
const GH_PATH = "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z";
const social = (id, name, vb, d) => {
  const svg = `<svg viewBox="${vb}" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  const r = R[id];
  if (r && r.state === "stated") return `      <a class="soc" data-social="${id}" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(name + " " + handle(r.url))}">${svg}</a>`;
  return `      <span class="soc" data-social="${id}" role="img" aria-disabled="true" aria-label="${esc(name)} pending">${svg}</span>`;
};
const SOCIALS = [social("x", "X", "0 0 24 24", X_PATH), social("github", "GitHub", "0 0 16 16", GH_PATH)].join("\n");

const CA = (() => {
  const r = R.ca;
  if (r && r.state === "stated") {
    const v = esc(r.value);
    return `    <div class="ca" data-ca data-state="stated"><span class="ca-label">${esc(r.label)}</span><button class="ca-value" type="button" data-copy="${v}" aria-label="Copy contract address"><span class="ca-text">${v}</span><span class="ca-act">Copy</span></button></div>`;
  }
  return `    <div class="ca" data-ca data-state="${esc(r ? r.state : "absent")}"><span class="ca-label">${esc(r ? r.label : "Contract address")}</span><div class="ca-value" aria-disabled="true"><span class="ca-text">pending</span></div></div>`;
})();

const ICONS = {
  "path-hub": '<circle cx="12" cy="12" r="3.5"/><path d="M4 12c1.6-4.4 4.3-6.6 8-6.6S18.4 7.6 20 12c-1.6 4.4-4.3 6.6-8 6.6S5.6 16.4 4 12Z"/>',
  "path-desk": '<rect x="5" y="7" width="14" height="10" rx="3"/><path d="M12 7V4M9.5 12h.01M14.5 12h.01M9 20h6"/>',
  "path-mesh": '<circle cx="6" cy="8" r="2.2"/><circle cx="18" cy="7" r="2.2"/><circle cx="12" cy="17" r="2.2"/><path d="m7.9 9.2 2.7 6M16.1 8.2l-2.7 6M8.2 8h7.6"/>',
};
const BLURB = {
  "path-hub": "A shared bench for questions, replications and peer notes.",
  "path-desk": "Software assistants that sketch theories and chase leads.",
  "path-mesh": "Many small helpers passing results along one pipeline.",
};
const PATHS = Object.keys(ICONS).map((id) => {
  const r = R[id], ok = r && r.state === "stated" && r.url;
  const tail = ok ? `<a class="chip-pending" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.label)} &rarr;</a>` : `<span class="chip-pending">${esc(r ? r.label : id)} <i>pending</i></span>`;
  return `    <article class="path spot reveal"><span class="mark"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id]}</svg></span><div><h3>${esc(r ? r.label : id)}</h3><p>${BLURB[id]}</p></div>${tail}</article>`;
}).join("\n");

const TAGS = [
  stated("chain") ? `      <span class="tag">${esc(R.chain.value)}</span>` : "",
  stated("domain") ? `      <a class="tag" href="${esc(R.domain.url)}" rel="noopener">${esc(R.domain.value)}</a>` : "",
].filter(Boolean).join("\n");

/* runtime register: dates are data only and never ship */
const runtime = { records: {} };
for (const [id, r] of Object.entries(R)) { const { checked, ...rest } = r; runtime.records[id] = rest; }

/* ---------- assemble ---------- */
if (OUT === ROOT || ROOT.startsWith(OUT + path.sep) || path.dirname(OUT) === OUT) throw new Error("refusing to write to " + OUT);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });

let html = fs.readFileSync(path.join(ROOT, "src/index.html"), "utf8");
const fill = { THEME: tok("c-night-1"), CHAIN: stated("chain") ? esc(R.chain.value) : "Solana", SOCIALS, CA, PATHS, TAGS, REGISTER: JSON.stringify(runtime).replace(/</g, "\\u003c") };
for (const [k, v] of Object.entries(fill)) html = html.split(`{{${k}}}`).join(v);
if (/\{\{[A-Z]+\}\}/.test(html)) throw new Error("unfilled placeholder");
fs.writeFileSync(path.join(OUT, "index.html"), html);
fs.writeFileSync(path.join(OUT, "styles.css"), fs.readFileSync(path.join(ROOT, "src/styles/tokens.css"), "utf8") + "\n" + fs.readFileSync(path.join(ROOT, "src/styles/app.css"), "utf8"));
fs.writeFileSync(path.join(OUT, "app.js"), ["spring", "market", "ui"].map((f) => fs.readFileSync(path.join(ROOT, "src/js", f + ".js"), "utf8")).join("\n"));
fs.writeFileSync(path.join(OUT, "favicon.svg"), favicon());
fs.writeFileSync(path.join(OUT, "assets", "peptix-logo.png"), logoOut);

log(`built ${rel(OUT)}/ : ` + fs.readdirSync(OUT, { recursive: true }).filter((f) => fs.statSync(path.join(OUT, f)).isFile()).join(", "));
