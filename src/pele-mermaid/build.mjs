// Bundle src/pele-mermaid/render-pele.src.mjs together with the pele
// dependency into a self-contained script inside the install side
// (plugins/pele-mermaid/scripts/render-pele.mjs), so the plugin works from a
// fresh clone without node_modules. Also syncs pele's MIT license text next
// to the bundle. Run from this directory: npm install && npm run build
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const OUT_DIR = here('../../plugins/pele-mermaid/scripts');
const peleVersion = JSON.parse(readFileSync(here('node_modules/pele/package.json'), 'utf8')).version;

await build({
  entryPoints: [here('render-pele.src.mjs')],
  outfile: `${OUT_DIR}/render-pele.mjs`,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  minify: false,
  banner: {
    js: `/*! pele-mermaid render bundle | includes pele ${peleVersion} (MIT) (c) Obsidian — https://pele.run | license text: scripts/vendor/pele-LICENSE.txt | rebuild: cd src/pele-mermaid && npm run build */`,
  },
  logLevel: 'info',
});

mkdirSync(`${OUT_DIR}/vendor`, { recursive: true });
copyFileSync(here('node_modules/pele/LICENSE'), `${OUT_DIR}/vendor/pele-LICENSE.txt`);
console.log(`bundled pele ${peleVersion} -> plugins/pele-mermaid/scripts/render-pele.mjs (+ license)`);
