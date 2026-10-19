#!/usr/bin/env node
/**
 * render-pele.mjs — render Mermaid source to a themed, self-contained HTML
 * fragment using Pele (https://pele.run/), for inline display in ZCode chats.
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

function wrapHtml(svg, { title, theme, type }) {
  const palette = theme === 'dark' ? DARK : theme === 'light' ? LIGHT : HOST;
  const caption = title ? `\n  <figcaption class="text-small text-muted">${escapeHtml(title)}</figcaption>` : '';
  return `<!-- Rendered with Pele (https://pele.run/) | diagram type: ${escapeHtml(type)}${title ? ' | ' + escapeHtml(title) : ''} -->
<style>
.pele-fig{${varsCss(palette)}}
.pele-fig svg{display:block;margin:0 auto;}
.pele-fig figcaption{margin-top:6px;text-align:center;}
</style>
<figure class="pele-fig">
  ${svg}${caption}
</figure>
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
    writeFileSync(out, wrapHtml(result.svg, { title: opts.title, theme: opts.theme, type: result.type }), 'utf8');
  } catch (e) {
    fail('io', `cannot write output: ${e.message}`);
  }

  process.stdout.write(JSON.stringify({ ok: true, path: out, type: result.type, width: result.width, height: result.height }) + '\n');
}

main();
