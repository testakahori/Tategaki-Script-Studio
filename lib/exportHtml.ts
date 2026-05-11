import { getMarginPx, hydrateProject, layoutProject, PAGE, ScriptProject, verticalGlyph } from "./layout";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);
}

export function renderExportHtml(project: ScriptProject) {
  const hydrated = hydrateProject(project);
  const pages = layoutProject(hydrated);
  const settings = hydrated.settings;
  const margin = getMarginPx(settings);
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(hydrated.title)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Noto+Serif+JP:wght@400;700&display=swap');
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: white; }
body {
  color: #161616;
  font-family: "${settings.fontFamily}", "Noto Serif JP", "Yu Mincho", serif;
  font-feature-settings: "vert" 1, "vrt2" 1, "palt" 0;
  text-orientation: mixed;
  -webkit-font-smoothing: antialiased;
}
.page {
  position: relative;
  width: ${PAGE.width}px;
  height: ${PAGE.height}px;
  page-break-after: always;
  overflow: hidden;
  background: white;
}
.page:last-child { page-break-after: auto; }
.line-no {
  position: absolute;
  top: ${Math.max(10, margin.top - 24)}px;
  width: ${settings.baseFontSize * 1.5}px;
  text-align: center;
  color: #a89f96;
  font: 10px/1 monospace;
}
.char {
  position: absolute;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  writing-mode: vertical-rl;
  font-feature-settings: "vert" 1, "vrt2" 1, "palt" 0;
  text-orientation: mixed;
  white-space: pre;
  line-height: 1.15;
}
ruby { ruby-position: over; }
rt { font-size: 0.45em; }
</style>
</head>
<body>
${pages
  .map(
    (page) => `<section class="page">
${page.lines
  .map(
    (line) => `<div class="line-no" style="left:${line.x - 4}px">${line.number}</div>
${line.chars
  .map((char) => {
    const weight = char.style.bold ? 700 : 400;
    const display = verticalGlyph(char.char);
    const ruby = char.style.ruby ? `<ruby>${escapeHtml(display)}<rt>${escapeHtml(char.style.ruby)}</rt></ruby>` : escapeHtml(display);
    return `<span class="char" style="left:${char.x}px;top:${char.y}px;width:${settings.baseFontSize}px;height:${Math.max(settings.baseFontSize, char.style.fontSize * 1.15)}px;font-size:${char.style.fontSize}px;font-weight:${weight};color:${char.style.color}">${ruby}</span>`;
  })
  .join("")}`
  )
  .join("")}
</section>`
  )
  .join("")}
</body>
</html>`;
}
