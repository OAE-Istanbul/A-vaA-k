// Tek dosyalık, sunucusuz önizleme üretir: dist/preview/istanbul-onizleme.html
// Pazar kodu tarayıcıda çalışır, rakip oteller bot olarak teklif verir.
// --standalone: doğrudan tarayıcıda açılabilen tam HTML belgesi üretir.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const standalone = process.argv.includes('--standalone');

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('preview/main.js', root))],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  write: false,
});
const script = outputFiles[0].text.replaceAll('</script', '<\\/script');

const indexHtml = read('public/index.html');
const body = indexHtml.slice(indexHtml.indexOf('<body>') + '<body>'.length, indexHtml.indexOf('</body>')).trim();
const title = /<title>(.*?)<\/title>/.exec(indexHtml)[1];
// Fontlar data URI olarak gömülür; önizleme tek dosyadır.
const css = `${read('public/style.css')}\n${read('preview/preview.css')}`.replace(
  /url\((fonts\/[\w.-]+\.woff2)\)/g,
  (_, path) => `url(data:font/woff2;base64,${readFileSync(new URL(`public/${path}`, root)).toString('base64')})`,
);

const content = `<title>${title}</title>
<style>
${css}
</style>
${body}
<script>
${script}
</script>
`;

const html = standalone
  ? `<!doctype html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${content}</body>\n</html>\n`
  : content;

const outDir = new URL('dist/preview/', root);
mkdirSync(outDir, { recursive: true });
const file = new URL(standalone ? 'istanbul-onizleme-tam.html' : 'istanbul-onizleme.html', outDir);
writeFileSync(file, html);
console.log(`Önizleme yazıldı: ${fileURLToPath(file)} (${Math.round(html.length / 1024)} KB)`);
