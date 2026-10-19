#!/usr/bin/env node
/**
 * render-pele.mjs — render Mermaid source to a themed, self-contained HTML
 * fragment using Pele (https://pele.run/), for inline display in ZCode chats.
 *
 * The fragment embeds the original Mermaid source and a toolbar above the
 * diagram: "复制 Mermaid 代码" (navigator.clipboard first, execCommand fallback,
 * and if both are blocked the source textarea is revealed with its content
 * selected for a manual Ctrl+C) plus zoom controls — -/+ step buttons, a
 * percentage dropdown (50/100/200%, fit-to-window, reset), 25%..400% clamp.
 * All CSS/JS is scoped to a unique per-render root id, so multiple fragments
 * (even with different themes) never interfere.
 *
 * Usage:
 *   node render-pele.mjs [input.mmd|-] [--dir <out-dir>] [--name <slug>]
 *                        [--out <file.html>] [--title <text>]
 *                        [--theme host|dark|light]
 *
 * Mermaid source: positional file path, or stdin when omitted or "-".
 * Success: single-line JSON on stdout, exit 0:
 *   {"ok":true,"path":"...","type":"flowchart","width":233,"height":64}
 * Failure: single-line JSON on stderr, exit 1 (usage/io) or 2 (Mermaid parse).
 *
 * The pele dependency is resolved from <plugin-root>/node_modules.
 * Default theme maps Pele onto the ZCode host theme variables so the diagram
 * follows the conversation's appearance; --theme dark|light pins a fixed
 * palette (for standalone browser viewing).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { PeleError, render } from 'pele';

const USAGE = 'usage: node render-pele.mjs [input.mmd|-] [--dir <dir>] [--name <slug>] [--out <file.html>] [--title <text>] [--theme host|dark|light]';

function fail(stage, message, code = 1) {
  process.stderr.write(JSON.stringify({ ok: false, stage, error: message }) + '\n');
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { input: null, dir: null, name: null, out: null, title: null, theme: 'host' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => (i + 1 < argv.length ? argv[++i] : fail('usage', `missing value for ${a}`));
    if (a === '--dir') opts.dir = next();
    else if (a === '--name') opts.name = next();
    else if (a === '--out') opts.out = next();
    else if (a === '--title') opts.title = next();
    else if (a === '--theme') opts.theme = next();
    else if (a === '--help' || a === '-h') { process.stdout.write(USAGE + '\n'); process.exit(0); }
    else if (a.startsWith('--')) fail('usage', `unknown option ${a}`);
    else if (opts.input === null) opts.input = a;
    else fail('usage', `unexpected extra argument ${a}`);
  }
  if (!['host', 'auto', 'dark', 'light'].includes(opts.theme)) fail('usage', `invalid --theme ${opts.theme} (host|dark|light)`);
  if (opts.theme === 'auto') opts.theme = 'host';
  return opts;
}

function readSource(input) {
  if (input && input !== '-') return readFileSync(input, 'utf8');
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Default (host): map Pele's theme variables onto the ZCode host theme tokens
// so diagrams follow the conversation's appearance. The value after each comma
// is the fallback for standalone browser viewing outside the host sandbox.
// Solid bg keeps contrast-critical fills (e.g. sequence numbers painted with
// var(--pele-bg)) visible.
const HOST = {
  bg: 'var(--background,#ffffff)',
  fg: 'var(--foreground,#1f1f1f)',
  muted: 'var(--muted-foreground,#6e6e6e)',
  line: 'var(--foreground,#1f1f1f)',
  surface: 'var(--muted,#f3f3f3)',
  'surface-alt': 'var(--secondary,#ececee)',
  border: 'var(--border,#d6d6dc)',
  accent: 'var(--primary,#3b6ef5)',
  radius: '6px',
  font: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  'font-mono': 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace',
};
const LIGHT = {
  ...HOST,
  bg: '#ffffff',
  fg: '#1f1f1f',
  muted: '#6e6e6e',
  line: '#1f1f1f',
  surface: '#f3f3f3',
  'surface-alt': '#e9e9ee',
  border: '#d6d6dc',
  accent: '#3b6ef5',
};
const DARK = {
  ...LIGHT,
  bg: '#1f1f26',
  fg: '#e8e8ec',
  muted: '#9b9ba6',
  line: '#e8e8ec',
  surface: '#2a2a32',
  'surface-alt': '#26262e',
  border: '#3d3d48',
  accent: '#82aaff',
};

function varsCss(palette) {
  return Object.entries(palette)
    .map(([k, v]) => `--pele-${k}:${v};`)
    .join('');
}

// Inline runtime for the copy button and zoom controls. Plain ES5 (string
// concat, no template literals) so it survives verbatim inside the bundle's
// template literal. Zoom scales the SVG against its viewBox width (Pele output
// always carries one) and clamps to 25%..400%; "fit" never upscales.
const RUNTIME_JS = `
(function () {
  var root = document.getElementById('__PELE_ID__');
  if (!root || root.dataset.peleBound) return;
  root.dataset.peleBound = '1';

  function bindCopy() {
    var btn = root.querySelector('.pele-copy');
    var box = root.querySelector('.pele-src');
    if (!btn || !box) return;
    var idle = btn.textContent;
    var timer = null;
    function flash(state, label) {
      btn.dataset.state = state;
      btn.textContent = label;
      clearTimeout(timer);
      timer = setTimeout(function () {
        btn.dataset.state = '';
        btn.textContent = idle;
      }, 1800);
    }
    function legacyCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
      document.documentElement.appendChild(ta);
      ta.focus();
      ta.select();
      if (typeof ta.setSelectionRange === 'function') ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.parentNode.removeChild(ta);
      return ok;
    }
    btn.addEventListener('click', function () {
      var text = box.value;
      var write = navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); })
        : Promise.resolve(legacyCopy(text));
      write.then(function (ok) {
        if (ok) {
          box.hidden = true;
          flash('ok', '已复制');
        } else {
          box.hidden = false;
          box.focus();
          box.select();
          if (typeof box.setSelectionRange === 'function') box.setSelectionRange(0, text.length);
          btn.dataset.state = 'fail';
          btn.textContent = '请手动复制';
        }
      });
    });
  }

  function bindZoom() {
    var canvas = root.querySelector('.pele-canvas');
    var svg = canvas ? canvas.querySelector('svg') : null;
    var zval = root.querySelector('.pele-zval');
    var znum = root.querySelector('.pele-znum');
    var menu = root.querySelector('.pele-zmenu');
    if (!canvas || !svg || !zval || !menu) return;
    var MIN = 0.25, MAX = 4, STEP = 0.1;
    var scale = 1, natural = 0;
    function naturalWidth() {
      if (!natural) {
        var vb = svg.viewBox && svg.viewBox.baseVal;
        natural = (vb && vb.width) || parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width;
      }
      return natural;
    }
    function setZoom(next) {
      var k = Math.min(MAX, Math.max(MIN, next));
      scale = k;
      svg.style.maxWidth = 'none';
      svg.style.width = (naturalWidth() * k) + 'px';
      svg.style.height = 'auto';
      if (znum) znum.textContent = Math.round(k * 100) + '%';
      menuSpace();
    }
    function fit() {
      var w = canvas.clientWidth;
      if (w && naturalWidth()) setZoom(Math.min(1, w / naturalWidth()));
    }
    // The menu floats over the diagram; while it is open, temporarily pad the
    // figure so short cards grow to reveal the whole menu (cleared on close).
    function menuSpace() {
      if (!menu.classList.contains('open')) { root.style.paddingBottom = ''; return; }
      var need = Math.ceil(menu.getBoundingClientRect().bottom - root.getBoundingClientRect().bottom) + 8;
      root.style.paddingBottom = need > 0 ? need + 'px' : '';
    }
    function openMenu() {
      menu.classList.add('open');
      zval.setAttribute('aria-expanded', 'true');
      menuSpace();
    }
    function closeMenu() {
      menu.classList.remove('open');
      zval.setAttribute('aria-expanded', 'false');
      root.style.paddingBottom = '';
    }
    zval.addEventListener('click', function () {
      if (menu.classList.contains('open')) closeMenu();
      else openMenu();
    });
    var zbtns = root.querySelectorAll('.pele-zbtn');
    for (var i = 0; i < zbtns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          setZoom(scale + (b.dataset.z === '-1' ? -STEP : STEP));
        });
      })(zbtns[i]);
    }
    var items = menu.querySelectorAll('.pele-zitem');
    for (var j = 0; j < items.length; j++) {
      (function (it) {
        it.addEventListener('click', function () {
          if (it.dataset.k) setZoom(parseFloat(it.dataset.k));
          else if (it.dataset.act === 'fit') fit();
          else if (it.dataset.act === 'reset') setZoom(1);
          closeMenu();
        });
      })(items[j]);
    }
    document.addEventListener('click', function (e) {
      if (menu.classList.contains('open') && !root.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  bindCopy();
  bindZoom();
})();
`;

function wrapHtml(svg, { title, theme, type, source }) {
  const palette = theme === 'dark' ? DARK : theme === 'light' ? LIGHT : HOST;
  const id = 'pele-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const caption = title ? `\n    <div class="pele-title text-small text-muted">${escapeHtml(title)}</div>` : '';
  return `<!-- Rendered with Pele (https://pele.run/) | diagram type: ${escapeHtml(type)}${title ? ' | ' + escapeHtml(title) : ''} -->
<style>
#${id}{${varsCss(palette)}}
#${id} .pele-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;position:relative;}
#${id} .pele-title{min-width:0;overflow-wrap:anywhere;}
#${id} .pele-tools{display:flex;align-items:center;gap:8px;margin-left:auto;}
#${id} .pele-canvas{overflow-x:auto;}
#${id} .pele-canvas>svg{display:block;margin:0 auto;transition:width .15s ease;}
@media (prefers-reduced-motion:reduce){#${id} .pele-canvas>svg{transition:none;}}
#${id} .pele-zoom{display:inline-flex;align-items:center;gap:6px;}
#${id} .pele-zbtn{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border-radius:50%;background:transparent;color:var(--pele-muted);border:1px solid var(--pele-border);cursor:pointer;}
#${id} .pele-zbtn:hover{color:var(--pele-fg);background:var(--pele-surface);}
#${id} .pele-zbtn:focus-visible{outline:2px solid var(--pele-accent);outline-offset:1px;}
#${id} .pele-zbtn svg{width:14px;height:14px;display:block;}
#${id} .pele-zbtn i,#${id} .pele-zval i{font-style:normal;}
#${id} .pele-zval{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:24px;min-width:60px;padding:0 8px;border-radius:12px;background:transparent;border:1px solid var(--pele-border);color:var(--pele-fg);font-family:inherit;font-size:12px;line-height:1;font-variant-numeric:tabular-nums;cursor:pointer;}
#${id} .pele-zval:hover{background:var(--pele-surface);}
#${id} .pele-zval:focus-visible{outline:2px solid var(--pele-accent);outline-offset:1px;}
#${id} .pele-zval svg{width:12px;height:12px;display:block;}
#${id} .pele-zmenu{display:none;}
#${id} .pele-zmenu.open{position:absolute;top:calc(100% + 4px);right:0;z-index:10;display:flex;flex-direction:column;width:max-content;max-width:100%;padding:4px;background:var(--pele-bg);border:1px solid var(--pele-border);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.18);}
#${id} .pele-zitem{appearance:none;background:transparent;border:0;border-radius:6px;padding:6px 10px;font-family:inherit;font-size:12px;line-height:1.2;color:var(--pele-fg);text-align:left;white-space:nowrap;cursor:pointer;}
#${id} .pele-zitem:hover{background:var(--pele-surface);}
#${id} .pele-zitem:focus-visible{outline:2px solid var(--pele-accent);outline-offset:-2px;}
#${id} .pele-zsep{height:1px;margin:4px 2px;background:var(--pele-border);}
#${id} .pele-copy{appearance:none;background:transparent;color:var(--pele-muted);border:1px solid var(--pele-border);border-radius:6px;padding:4px 10px;font-family:inherit;font-size:12px;line-height:1.2;cursor:pointer;}
#${id} .pele-copy:hover{color:var(--pele-fg);background:var(--pele-surface);}
#${id} .pele-copy:focus-visible{outline:2px solid var(--pele-accent);outline-offset:1px;}
#${id} .pele-copy[data-state="ok"]{color:var(--pele-accent);border-color:var(--pele-accent);}
#${id} .pele-copy[data-state="fail"]{color:var(--pele-fg);border-color:var(--pele-fg);}
#${id} .pele-src{display:block;box-sizing:border-box;width:100%;min-height:96px;margin-top:6px;padding:8px;font-family:var(--pele-font-mono);font-size:12px;line-height:1.5;color:var(--pele-fg);background:var(--pele-surface);border:1px solid var(--pele-border);border-radius:6px;resize:vertical;}
#${id} .pele-src[hidden]{display:none;}
</style>
<figure class="pele-fig" id="${id}">
  <div class="pele-head">${caption}
    <div class="pele-tools">
      <button type="button" class="pele-copy">复制 Mermaid 代码</button>
      <span class="pele-zoom">
        <button type="button" class="pele-zbtn" data-z="-1" aria-label="缩小"><i data-lucide="minus">−</i></button>
        <button type="button" class="pele-zval" aria-haspopup="menu" aria-expanded="false"><span class="pele-znum">100%</span><i data-lucide="chevron-down" aria-hidden="true">▾</i></button>
        <button type="button" class="pele-zbtn" data-z="1" aria-label="放大"><i data-lucide="plus">+</i></button>
      </span>
    </div>
    <div class="pele-zmenu" role="menu" aria-label="缩放选项">
      <button type="button" class="pele-zitem" role="menuitem" data-k="0.5">缩放到 50%</button>
      <button type="button" class="pele-zitem" role="menuitem" data-k="1">缩放到 100%</button>
      <button type="button" class="pele-zitem" role="menuitem" data-k="2">缩放到 200%</button>
      <div class="pele-zsep" role="separator"></div>
      <button type="button" class="pele-zitem" role="menuitem" data-act="fit">适应窗口</button>
      <button type="button" class="pele-zitem" role="menuitem" data-act="reset">重置缩放</button>
    </div>
  </div>
  <div class="pele-canvas">
  ${svg}
  </div>
  <textarea class="pele-src" hidden spellcheck="false" aria-label="Mermaid 源码">${escapeHtml(source)}</textarea>
</figure>
<script>${RUNTIME_JS.replace('__PELE_ID__', id)}</script>
`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  let source;
  try {
    source = readSource(opts.input);
  } catch (e) {
    fail('io', `cannot read input: ${e.message}`);
  }
  if (!source.trim()) fail('usage', 'empty Mermaid source (pass a file or pipe text on stdin)');

  let result;
  try {
    result = render(source);
  } catch (e) {
    if (e instanceof PeleError || e?.name === 'PeleError') fail('parse', e.message, 2);
    throw e;
  }

  let out;
  if (opts.out) {
    out = resolve(opts.out);
  } else {
    const dir = opts.dir ?? join(tmpdir(), 'pele-mermaid');
    const name = opts.name ?? `pele-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    out = isAbsolute(name) ? name : join(resolve(dir), `${name}.html`);
  }

  try {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, wrapHtml(result.svg, { title: opts.title, theme: opts.theme, type: result.type, source }), 'utf8');
  } catch (e) {
    fail('io', `cannot write output: ${e.message}`);
  }

  process.stdout.write(JSON.stringify({ ok: true, path: out, type: result.type, width: result.width, height: result.height }) + '\n');
}

main();
