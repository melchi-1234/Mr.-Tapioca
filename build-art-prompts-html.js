// Builds a styled, double-click-openable HTML version of a prompt markdown file,
// with copy-to-clipboard buttons on every prompt block.
// Run: node build-art-prompts-html.js [input.md] [output.html]
//   defaults: ART_PROMPTS.md -> ART_PROMPTS.html
const fs = require("fs");

const IN = process.argv[2] || "ART_PROMPTS.md";
const OUT = process.argv[3] || "ART_PROMPTS.html";

const md = fs.readFileSync(IN, "utf8")
  .replace(/<!--[\s\S]*?-->/g, "")   // drop HTML comments
  .replace(/\r\n/g, "\n");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// inline: `code` then **bold** (operate on already HTML-escaped text)
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

const lines = md.split("\n");
let html = "";
let inCode = false, codeBuf = [], codeId = 0;
let listOpen = false, quoteOpen = false, tableBuf = [];

const closeList = () => { if (listOpen) { html += "</ul>\n"; listOpen = false; } };
const closeQuote = () => { if (quoteOpen) { html += "</blockquote>\n"; quoteOpen = false; } };
const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes("-");
const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
function flushTable() {
  if (!tableBuf.length) return;
  const rows = tableBuf; tableBuf = [];
  let head = null, bodyRows = rows;
  if (rows.length >= 2 && isTableSep(rows[1])) { head = rows[0]; bodyRows = rows.slice(2); }
  html += "<table>\n";
  if (head) html += "<thead><tr>" + cells(head).map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead>\n";
  html += "<tbody>\n";
  for (const r of bodyRows) {
    if (isTableSep(r)) continue;
    html += "<tr>" + cells(r).map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>\n";
  }
  html += "</tbody></table>\n";
}

for (const line of lines) {
  if (line.trim().startsWith("```")) {
    flushTable();
    if (!inCode) { inCode = true; codeBuf = []; }
    else {
      inCode = false;
      const id = "c" + (codeId++);
      const body = esc(codeBuf.join("\n"));
      html += `<div class="codewrap"><button class="copy" data-target="${id}">Copy</button><pre id="${id}"><code>${body}</code></pre></div>\n`;
    }
    continue;
  }
  if (inCode) { codeBuf.push(line); continue; }

  // Accumulate consecutive table rows, flush when the block ends.
  if (isTableRow(line)) { closeList(); closeQuote(); tableBuf.push(line); continue; }
  if (tableBuf.length) flushTable();

  if (/^#{1,6}\s/.test(line)) {
    closeList(); closeQuote();
    const level = line.match(/^#+/)[0].length;
    html += `<h${level}>${inline(line.replace(/^#+\s/, ""))}</h${level}>\n`;
  } else if (/^>\s?/.test(line)) {
    closeList();
    if (!quoteOpen) { html += "<blockquote>\n"; quoteOpen = true; }
    html += `<p>${inline(line.replace(/^>\s?/, ""))}</p>\n`;
  } else if (/^[-*]\s/.test(line)) {
    closeQuote();
    if (!listOpen) { html += "<ul>\n"; listOpen = true; }
    let item = line.replace(/^[-*]\s/, "");
    let box = "";
    const m = item.match(/^\[( |x|X)\]\s(.*)$/);
    if (m) { box = `<input type="checkbox" disabled${m[1] === " " ? "" : " checked"}> `; item = m[2]; }
    html += `<li>${box}${inline(item)}</li>\n`;
  } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
    closeList(); closeQuote();
    html += "<hr>\n";
  } else if (line.trim() === "") {
    closeList(); closeQuote();
  } else {
    closeList(); closeQuote();
    html += `<p>${inline(line)}</p>\n`;
  }
}
flushTable();
closeList(); closeQuote();

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mr. Tapioca — Art Prompt Pack</title>
<style>
  :root{--bg:#fff7f0;--card:#fffdfa;--ink:#3c2018;--mid:#7a5a4c;--line:#eaddcf;--teal:#158f92;--mint:#dff3ef;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,Inter,system-ui,sans-serif;}
  .wrap{max-width:820px;margin:0 auto;padding:32px 20px 80px;}
  h1{font-size:1.9rem;line-height:1.2;margin:.4em 0 .3em;}
  h2{font-size:1.35rem;margin:1.6em 0 .4em;padding-top:.6em;border-top:2px solid var(--line);}
  h3{font-size:1.05rem;margin:1.4em 0 .3em;color:var(--teal);}
  p{margin:.5em 0;} strong{color:var(--ink);}
  code{background:var(--mint);padding:1px 6px;border-radius:6px;font:0.86em ui-monospace,Menlo,monospace;}
  blockquote{margin:.6em 0;padding:.4em 14px;border-left:4px solid var(--teal);background:#fff;border-radius:0 10px 10px 0;color:var(--mid);}
  ul{padding-left:22px;} li{margin:.25em 0;} input[type=checkbox]{margin-right:6px;}
  hr{border:none;border-top:2px dashed var(--line);margin:2em 0;}
  .codewrap{position:relative;margin:.5em 0 1.2em;}
  pre{background:var(--card);border:2px solid var(--line);border-radius:14px;padding:14px 16px;overflow-x:auto;
      white-space:pre-wrap;word-break:break-word;font:0.84rem/1.5 ui-monospace,Menlo,monospace;color:#46352c;}
  .copy{position:absolute;top:8px;right:8px;border:2px solid var(--teal);background:var(--mint);color:var(--teal);
        font-weight:800;font-size:.72rem;border-radius:999px;padding:5px 12px;cursor:pointer;}
  .copy.done{background:var(--teal);color:#fff;}
  .top{background:var(--mint);border:2px solid var(--line);border-radius:14px;padding:12px 16px;margin-bottom:18px;font-size:.92rem;color:var(--mid);}
  table{width:100%;border-collapse:collapse;margin:1em 0;font-size:.9rem;}
  th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top;}
  th{background:var(--mint);color:var(--ink);font-weight:800;}
  td:first-child{white-space:nowrap;color:var(--teal);font-weight:700;}
</style></head>
<body><div class="wrap">
<div class="top">🧋 Mr. Tapioca art prompt pack — click <strong>Copy</strong> on any block, paste into Leonardo AI. Generated automatically; edit <code>ART_PROMPTS.md</code> and re-run <code>node build-art-prompts-html.js</code> to refresh.</div>
${html}
</div>
<script>
document.querySelectorAll(".copy").forEach(b=>b.addEventListener("click",async()=>{
  const t=document.getElementById(b.dataset.target);
  try{await navigator.clipboard.writeText(t.innerText);}catch(e){
    const r=document.createRange();r.selectNode(t);getSelection().removeAllRanges();getSelection().addRange(r);document.execCommand("copy");getSelection().removeAllRanges();
  }
  const o=b.textContent;b.textContent="Copied!";b.classList.add("done");
  setTimeout(()=>{b.textContent=o;b.classList.remove("done");},1200);
}));
</script>
</body></html>`;

fs.writeFileSync(OUT, page);
console.log(`Wrote ${OUT}:`, page.length, "chars; code blocks:", codeId);
