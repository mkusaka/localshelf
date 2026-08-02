/* global URL */

import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8");
}

test("builds the LocalShelf static shell", async () => {
  const [html, manifest, serviceWorker, ogImage] = await Promise.all([
    readProjectFile("dist/index.html"),
    readProjectFile("dist/manifest.webmanifest"),
    readProjectFile("dist/sw.js"),
    stat(new URL("dist/og-image.png", projectRoot)),
  ]);

  assert.match(html, /<title>LocalShelf — Private local file viewer<\/title>/i);
  assert.match(
    html,
    /<meta property="og:title" content="LocalShelf — Private local file viewer" \/>/i,
  );
  assert.match(html, /<meta property="og:type" content="website" \/>/i);
  assert.match(
    html,
    /<meta property="og:url" content="https:\/\/localshelf\.polyfill\.workers\.dev\/" \/>/i,
  );
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/localshelf\.polyfill\.workers\.dev\/og-image\.png" \/>/i,
  );
  assert.ok(ogImage.size > 0);
  assert.match(html, /id="root"/);
  assert.match(html, /src="\/assets\/index-[^"]+\.js"/);
  assert.match(html, /rel="manifest"/);
  assert.match(manifest, /"name":"LocalShelf"/);
  assert.match(manifest, /"display":"standalone"/);
  assert.match(manifest, /"src":"\/pwa-icon-192\.png"/);
  assert.match(manifest, /"src":"\/pwa-icon-512\.png"/);
  assert.match(serviceWorker, /precacheAndRoute/);
});

test("keeps the local file surface and URL routing in the client app", async () => {
  const [page, route, packageJson, indexHtml, wranglerConfig] = await Promise.all([
    readProjectFile("app/page.tsx"),
    readProjectFile("src/routes/index.tsx"),
    readProjectFile("package.json"),
    readProjectFile("index.html"),
    readProjectFile("wrangler.jsonc"),
  ]);

  assert.match(page, /showDirectoryPicker/);
  assert.match(page, /scanDirectory/);
  assert.match(page, /URL\.createObjectURL/);
  assert.match(page, /PDF_EXTENSIONS/);
  assert.match(page, /type="application\/pdf"/);
  assert.match(page, /<img src=\{previewUrl\}/);
  assert.match(page, /Files stay on this device/);
  assert.match(page, /No files found/);
  assert.match(page, /FolderTree/);
  assert.match(page, /Clear file selection/);
  assert.match(page, /file-list-preview/);
  assert.match(page, /Preview grid/);
  assert.match(page, /mobile-preview-dialog/);
  assert.match(page, /filter-pill-count/);
  assert.match(page, /Remove from library/);
  assert.match(page, /onDoubleClick/);
  assert.match(page, /resetPanelWidth/);
  assert.match(page, /const handleBrandPress = \(\) =>/);
  assert.match(page, /if \(activeDirectory\) \{[\s\S]*selectFolder\(""\);/);
  assert.match(page, /onPress=\{handleBrandPress\}/);
  assert.match(page, /dir: undefined, file: undefined/);
  assert.match(route, /validateSearch/);
  assert.match(route, /folder/);
  assert.match(route, /dir/);
  assert.match(route, /file/);
  assert.match(route, /view/);
  assert.match(route, /resetScroll:\s*false/);
  assert.match(packageJson, /"dev": "vite"/);
  assert.match(packageJson, /"build": "vite build"/);
  assert.match(packageJson, /"start": "vite preview"/);
  assert.match(packageJson, /"deploy": "pnpm build && wrangler deploy --config wrangler\.jsonc"/);
  assert.match(packageJson, /@tanstack\/react-router/);
  assert.match(packageJson, /react-aria-components/);
  assert.match(packageJson, /"wrangler": "\^4\.114\.0"/);
  assert.match(wranglerConfig, /"directory": "\.\/dist"/);
  assert.match(wranglerConfig, /"not_found_handling": "single-page-application"/);
  assert.match(indexHtml, /lang="en"/);
  assert.match(indexHtml, /name="description"/);
  assert.match(indexHtml, /property="og:description"/);
  assert.match(indexHtml, /property="og:image:alt"/);
  assert.match(indexHtml, /name="twitter:card" content="summary_large_image"/);
  assert.match(indexHtml, /og-image\.png/);
  assert.doesNotMatch(page, /フォルダ|ファイル|画像|動画|音声|文書|読み込み/);
});

test("configures PWA generation", async () => {
  const [packageJson, viteConfig] = await Promise.all([
    readProjectFile("package.json"),
    readProjectFile("vite.config.ts"),
  ]);

  assert.match(packageJson, /"vite-plugin-pwa": "\^1\.3\.0"/);
  assert.match(viteConfig, /VitePWA/);
  assert.match(viteConfig, /registerType: "autoUpdate"/);
});
