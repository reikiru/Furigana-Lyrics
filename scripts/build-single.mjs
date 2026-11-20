import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const css = [read('src/styles/tokens.css'), read('src/styles/main.css')].join('\n\n');
const js = [
  read('src/js/config.js'),
  read('src/js/ruby.js'),
  read('src/js/api.js'),
  read('src/js/exporter.js'),
  read('src/js/app.js'),
].join('\n\n');

const html = read('index.html')
  .replace(
    /<link rel="stylesheet" href="\.\/src\/styles\/tokens\.css">\s*<link rel="stylesheet" href="\.\/src\/styles\/main\.css">/,
    `<style>\n${css}\n</style>`
  )
  .replace(
    /(?:\s*<script defer src="\.\/src\/js\/[^"]+"><\/script>)+/,
    `\n  <script>\n${js}\n  </script>`
  );

mkdirSync(resolve(root, 'dist'), { recursive: true });
const outPath = resolve(root, 'dist/furigana.html');
writeFileSync(outPath, html, 'utf8');
console.log(`Built standalone HTML -> ${outPath}`);
