/* global URL */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8");
}

test("builds the LocalShelf static shell", async () => {
  const html = await readProjectFile("dist/index.html");

  assert.match(html, /<title>LocalShelf — Private local file viewer<\/title>/i);
  assert.match(html, /id="root"/);
  assert.match(html, /src="\/assets\/index-[^"]+\.js"/);
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
  assert.match(page, /onDoubleClick/);
  assert.match(page, /resetPanelWidth/);
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
  assert.match(packageJson, /"wrangler": "\^4\.118\.0"/);
  assert.match(wranglerConfig, /"directory": "\.\/dist"/);
  assert.match(wranglerConfig, /"not_found_handling": "single-page-application"/);
  assert.match(indexHtml, /lang="en"/);
  assert.doesNotMatch(page, /フォルダ|ファイル|画像|動画|音声|文書|読み込み/);
});
