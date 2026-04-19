#!/usr/bin/env node

import { execFileSync } from 'child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(__dirname, 'dist');

function cleanDist() {
  if (!existsSync(DIST)) {
    return;
  }

  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', `if exist "${DIST}" rmdir /s /q "${DIST}"`], {
      stdio: 'inherit',
      cwd: __dirname,
    });
    return;
  }

  rmSync(DIST, { recursive: true, force: true });
}

async function buildViewer() {
  const studioDir = resolve(ROOT, 'rhwp-studio');
  const viteEntry = resolve(__dirname, 'node_modules', 'vite', 'dist', 'node', 'index.js');
  const { build } = await import(pathToFileURL(viteEntry).href);

  await build({
    configFile: false,
    root: studioDir,
    publicDir: false,
    resolve: {
      preserveSymlinks: true,
      alias: {
        '@': resolve(studioDir, 'src'),
        '@wasm': resolve(ROOT, 'pkg'),
      },
    },
    build: {
      outDir: DIST,
      emptyOutDir: true,
      minify: false,
      cssMinify: false,
      reportCompressedSize: false,
      rollupOptions: {
        input: {
          viewer: resolve(studioDir, 'index.html'),
        },
      },
      assetsInlineLimit: 0,
    },
  });
}

function copyPath(src, dest) {
  if (!existsSync(src)) {
    console.warn(`  SKIP: ${src}`);
    return;
  }

  const srcStat = statSync(src);
  if (srcStat.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src)) {
      copyPath(resolve(src, entry), resolve(dest, entry));
    }
    return;
  }

  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { force: true });
  console.log(`  COPY: ${src} -> ${dest}`);
}

function rewriteViewerHtml() {
  const indexHtml = resolve(DIST, 'index.html');
  const viewerHtml = resolve(DIST, 'viewer.html');

  if (existsSync(indexHtml)) {
    renameSync(indexHtml, viewerHtml);
    console.log('  RENAME: index.html -> viewer.html');
  }

  const viewerContent = readFileSync(viewerHtml, 'utf-8');
  const nextContent = viewerContent.includes('/dev-tools-inject.js')
    ? viewerContent
    : viewerContent.replace(
        '</head>',
        '  <script src="/dev-tools-inject.js"></script>\n</head>',
      );

  writeFileSync(viewerHtml, nextContent);
  console.log('  INJECT: dev-tools-inject.js -> viewer.html');

  if (!nextContent.includes('ai:create-table') || !nextContent.includes('ai:open-panel')) {
    console.warn('  WARN: AI toolbar buttons were not found in viewer.html.');
  } else {
    console.log('  OK: AI toolbar buttons found');
  }
}

console.log('=== rhwp-chrome build start ===\n');

console.log('[1/4] Vite build...');
cleanDist();
await buildViewer();
rewriteViewerHtml();

console.log('\n[2/4] Copy extension assets...');
copyPath(resolve(__dirname, 'manifest.json'), resolve(DIST, 'manifest.json'));
copyPath(resolve(__dirname, 'background.js'), resolve(DIST, 'background.js'));
copyPath(resolve(__dirname, 'content-script.js'), resolve(DIST, 'content-script.js'));
copyPath(resolve(__dirname, 'content-script.css'), resolve(DIST, 'content-script.css'));
copyPath(resolve(__dirname, 'dev-tools-inject.js'), resolve(DIST, 'dev-tools-inject.js'));
copyPath(resolve(__dirname, 'sw'), resolve(DIST, 'sw'));
copyPath(resolve(__dirname, 'options.html'), resolve(DIST, 'options.html'));
copyPath(resolve(__dirname, 'options.js'), resolve(DIST, 'options.js'));
copyPath(resolve(__dirname, 'ai'), resolve(DIST, 'ai'));
copyPath(resolve(__dirname, 'icons'), resolve(DIST, 'icons'));
copyPath(resolve(__dirname, '_locales'), resolve(DIST, '_locales'));
copyPath(
  resolve(ROOT, 'rhwp-studio', 'public', 'images', 'icon_small_ko.svg'),
  resolve(DIST, 'images', 'icon_small_ko.svg'),
);
copyPath(resolve(ROOT, 'rhwp-studio', 'public', 'favicon.ico'), resolve(DIST, 'favicon.ico'));

console.log('\n[3/4] Copy WASM...');
copyPath(resolve(ROOT, 'pkg', 'rhwp.js'), resolve(DIST, 'wasm', 'rhwp.js'));
copyPath(resolve(ROOT, 'pkg', 'rhwp.d.ts'), resolve(DIST, 'wasm', 'rhwp.d.ts'));
copyPath(resolve(ROOT, 'pkg', 'rhwp_bg.wasm'), resolve(DIST, 'wasm', 'rhwp_bg.wasm'));
copyPath(resolve(ROOT, 'pkg', 'rhwp_bg.wasm.d.ts'), resolve(DIST, 'wasm', 'rhwp_bg.wasm.d.ts'));

console.log('\n[4/4] Copy fonts...');
const essentialFonts = [
  'Pretendard-Regular.woff2',
  'Pretendard-Bold.woff2',
  'NotoSansKR-Regular.woff2',
  'NotoSansKR-Bold.woff2',
  'NotoSerifKR-Regular.woff2',
  'NotoSerifKR-Bold.woff2',
  'GowunBatang-Regular.woff2',
  'GowunBatang-Bold.woff2',
  'GowunDodum-Regular.woff2',
  'NanumGothic-Regular.woff2',
  'NanumGothic-Bold.woff2',
  'NanumMyeongjo-Regular.woff2',
  'NanumMyeongjo-Bold.woff2',
  'D2Coding-Regular.woff2',
];

for (const font of essentialFonts) {
  copyPath(resolve(ROOT, 'web', 'fonts', font), resolve(DIST, 'fonts', font));
}

console.log('\n=== Build complete ===');
console.log(`Output: ${DIST}`);
