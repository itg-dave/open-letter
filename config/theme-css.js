// Builds the :root CSS-variable overrides for a letter's theme. Used by the
// frontend (src/main.jsx injects it into <head>) and the admin entry point, so
// colours, fonts and style tokens all come from config/letter.config.js. The
// base values live in src/index.css; this only overrides the themeable ones.

export function themeCss(theme) {
  const c = theme.colors || {};
  const f = theme.fonts || {};
  const s = theme.style || {};
  const decls = [
    ["--rot", c.rot],
    ["--rot-text", c.rotText],
    ["--akzent", c.akzent],
    ["--weiss", c.weiss],
    ["--fond", c.fond],
    ["--grau", c.grau],
    ["--grau-stark", c.grauStark],
    ["--grau-hell", c.grauHell],
    ["--erfolg", c.erfolg],
    ["--fehler", c.fehler],
    ["--font-display", f.display],
    ["--font-body", f.body],
    ["--shadow-offset", s.shadowOffset],
    ["--radius", s.radius],
    ["--border-width", s.borderWidth],
  ]
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `:root {\n${decls}\n}`;
}

export function injectThemeCss(theme, doc = document) {
  const style = doc.createElement("style");
  style.setAttribute("data-theme", "letter-config");
  style.textContent = themeCss(theme);
  doc.head.appendChild(style);
}
