# LocalShelf

LocalShelf is a private, browser-based viewer for files in a local folder.
Images, video, audio, PDFs, and text files are previewed without uploading the
original files to a server.

## Development

```bash
pnpm install
pnpm dev
```

Open the local URL in Chrome or Edge and choose a folder with **Open folder**.
The File System Access API requires a user gesture and a secure context such
as `localhost` or HTTPS.

The production-style local preview is available after a build:

```bash
pnpm build
pnpm start
```

`pnpm start` runs Vite's static preview server. The generated `dist` directory
can be deployed as a static site.

## Features

- Recursive folder listing
- Editor-style folder tree with folder selection
- Search by file name or relative path
- File-type filters
- List and preview-grid views
- Clearable file selection
- Image, video, audio, PDF, and text previews
- URL state for the selected folder name, file path, search query, and filter
- Responsive layout that keeps the preview available on mobile
- `webkitdirectory` fallback for browsers without File System Access API

The URL describes the current view, but never contains an absolute OS path or
the contents of a local file. Reloading a page may require choosing the folder
again because browser file permissions are user-controlled.
