import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

async function loadEsbuild() {
  try {
    const mod = await import('esbuild');
    return mod.default || mod;
  } catch {
    if (process.env.BUILD_NODE_MODULES) {
      const p = path.join(process.env.BUILD_NODE_MODULES, 'esbuild', 'lib', 'main.js');
      const mod = await import(pathToFileURL(p).href);
      return mod.default || mod;
    }
    throw new Error('esbuild not found. Run "npm install" first.');
  }
}

async function buildUi(esbuild, nodePaths) {
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, 'web', 'app.js')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2020'],
    nodePaths,
    write: false,
  });

  const bundledJs = result.outputFiles[0].text;
  const template = fs.readFileSync(path.join(ROOT, 'web', 'template.html'), 'utf8');
  const finalHtml = template.replace(
    '<!-- INLINE_APP_SCRIPT -->',
    () => `<script>${bundledJs}</script>`,
  );

  const distDir = path.join(ROOT, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const outPath = path.join(distDir, 'app.html');
  fs.writeFileSync(outPath, finalHtml, 'utf8');
  console.log(`Built ${outPath} (${(Buffer.byteLength(finalHtml, 'utf8') / 1024).toFixed(1)} KiB)`);
}

async function buildServer(esbuild, nodePaths) {
  const distDir = path.join(ROOT, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const outPath = path.join(distDir, 'server.cjs');

  await esbuild.build({
    entryPoints: [path.join(ROOT, 'server', 'index.mjs')],
    bundle: true,
    minify: true,
    platform: 'node',
    format: 'cjs',
    target: ['node20'],
    logOverride: { 'empty-import-meta': 'silent' },
    nodePaths,
    outfile: outPath,
  });

  const sizeKiB = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`Built ${outPath} (${sizeKiB} KiB)`);
}

async function main() {
  const esbuild = await loadEsbuild();
  const nodePaths = process.env.BUILD_NODE_MODULES ? [process.env.BUILD_NODE_MODULES] : [];
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice('--only='.length) : 'all';

  if (only === 'all' || only === 'ui') {
    await buildUi(esbuild, nodePaths);
  }
  if (only === 'all' || only === 'server') {
    await buildServer(esbuild, nodePaths);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
