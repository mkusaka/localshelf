"use client";

/* Local file previews require a native img element for blob URLs. */

import { useEffect, useMemo, useRef, useState } from "react";

type FileKind = "image" | "video" | "audio" | "document" | "other";
export type FilterKind = "all" | FileKind;

export type LibrarySearch = {
  folder?: string;
  dir?: string;
  file?: string;
  q?: string;
  filter: FilterKind;
  view: "list" | "preview";
};

type HomeProps = {
  search: LibrarySearch;
  updateSearch: (updates: Partial<LibrarySearch>) => void;
};

type LocalFile = {
  id: string;
  name: string;
  path: string;
  extension: string;
  kind: FileKind;
  mimeType?: string;
  handle?: FileSystemFileHandle;
  file?: File;
};

type LocalLibrary = {
  id: string;
  name: string;
  files: LocalFile[];
};

type FolderNode = {
  name: string;
  path: string;
  count: number;
  children: FolderNode[];
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?:
      | "desktop"
      | "documents"
      | "downloads"
      | "music"
      | "pictures"
      | "videos";
  }) => Promise<FileSystemDirectoryHandle>;
};

type DirectoryHandleWithValues = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>;
};

const TEXT_EXTENSIONS = new Set([
  "c", "cpp", "css", "csv", "go", "html", "js", "json", "jsx", "log",
  "md", "mjs", "py", "rb", "rs", "sh", "sql", "ts", "tsx", "txt", "xml",
  "yaml", "yml",
]);
const IMAGE_EXTENSIONS = new Set([
  "avif", "bmp", "gif", "heic", "heif", "ico", "jpeg", "jpg", "jxl",
  "png", "svg", "tif", "tiff", "webp",
]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const VIDEO_EXTENSIONS = new Set(["avi", "m4v", "mkv", "mov", "mp4", "webm"]);
const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"]);
const FILTERS: { value: FilterKind; label: string }[] = [
  { value: "all", label: "All files" },
  { value: "image", label: "Images" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "document", label: "Documents" },
];
const EMPTY_FILES: LocalFile[] = [];

function FileTypeFilters({
  filter,
  onSelect,
  className = "",
}: {
  filter: FilterKind;
  onSelect: (value: FilterKind) => void;
  className?: string;
}) {
  return (
    <div className={`filter-pills ${className}`} aria-label="Filter by file type">
      {FILTERS.map((item) => (
        <button className={`filter-pill ${filter === item.value ? "is-active" : ""}`} type="button" key={item.value} onClick={() => onSelect(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function LibrarySelector({
  libraries,
  selectedId,
  count,
  subtitle,
  onSelect,
  className = "",
}: {
  libraries: LocalLibrary[];
  selectedId: string;
  count: number;
  subtitle?: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const selectedLibrary = libraries.find((library) => library.id === selectedId);
  const selectedName = selectedLibrary?.name ?? (selectedId || "Selected folder");

  return (
    <label className={`library-selector ${className}`}>
      <span className="folder-glyph" aria-hidden="true">▰</span>
      <span className={`library-selector-copy ${subtitle ? "has-subtitle" : ""}`}>
        <span className="library-selector-name">{selectedName}</span>
        {subtitle && <small>{subtitle}</small>}
      </span>
      <span className="library-selector-chevron" aria-hidden="true">⌄</span>
      <span className="item-count">{count}</span>
      <select className="library-selector-control" value={selectedId} onChange={(event) => onSelect(event.target.value)} aria-label="Select root folder">
        {libraries.map((library) => <option value={library.id} key={library.id}>{library.name}</option>)}
      </select>
    </label>
  );
}

function getExtension(name: string): string {
  return name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
}

function getFileKind(name: string, mimeType = ""): FileKind {
  const extension = getExtension(name);
  if (mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) return "image";
  if (mimeType.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) return "video";
  if (mimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (
    mimeType === "application/pdf" || PDF_EXTENSIONS.has(extension) || mimeType.startsWith("text/") ||
    TEXT_EXTENSIONS.has(extension) ||
    ["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(extension)
  ) return "document";
  return "other";
}

function getKindLabel(kind: FileKind): string {
  return { image: "Image", video: "Video", audio: "Audio", document: "Document", other: "Other" }[kind];
}

function getKindAbbreviation(kind: FileKind): string {
  return { image: "IMG", video: "VID", audio: "AUD", document: "DOC", other: "FILE" }[kind];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function getDirectoryPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? "" : path.slice(0, separator);
}

function buildFolderTree(files: LocalFile[]): FolderNode[] {
  const root: FolderNode = { name: "", path: "", count: 0, children: [] };

  for (const file of files) {
    const directoryPath = getDirectoryPath(file.path);
    if (!directoryPath) continue;

    let parent = root;
    for (const [index, name] of directoryPath.split("/").entries()) {
      const path = directoryPath.split("/").slice(0, index + 1).join("/");
      let node = parent.children.find((child) => child.name === name);
      if (!node) {
        node = { name, path, count: 0, children: [] };
        parent.children.push(node);
      }
      node.count += 1;
      parent = node;
    }
  }

  const sortNodes = (nodes: FolderNode[]): FolderNode[] => nodes
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .map((node) => ({ ...node, children: sortNodes(node.children) }));

  return sortNodes(root.children);
}

function flattenFolderTree(nodes: FolderNode[], flattened: FolderNode[] = []): FolderNode[] {
  for (const node of nodes) {
    flattened.push(node);
    flattenFolderTree(node.children, flattened);
  }
  return flattened;
}

function FolderTree({
  nodes,
  selectedPath,
  onSelect,
}: {
  nodes: FolderNode[];
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  return <ul className="folder-tree">{nodes.map((node) => <FolderTreeNode key={node.path} node={node} selectedPath={selectedPath} onSelect={onSelect} />)}</ul>;
}

function FolderTreeNode({
  node,
  selectedPath,
  onSelect,
}: {
  node: FolderNode;
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <li className="folder-tree-item">
      <div className="folder-tree-row">
        {node.children.length > 0 ? <button className="folder-toggle" type="button" onClick={() => setIsExpanded((expanded) => !expanded)} aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`} aria-expanded={isExpanded}>{isExpanded ? "⌄" : "›"}</button> : <span className="folder-toggle-spacer" aria-hidden="true" />}
        <button className={`folder-tree-button ${selectedPath === node.path ? "is-selected" : ""}`} type="button" onClick={() => onSelect(node.path)} aria-pressed={selectedPath === node.path}><span className="folder-glyph folder-glyph-small" aria-hidden="true">▱</span><span className="folder-name">{node.name}</span><span className="item-count">{node.count}</span></button>
      </div>
      {isExpanded && node.children.length > 0 && <FolderTree nodes={node.children} selectedPath={selectedPath} onSelect={onSelect} />}
    </li>
  );
}

function FilePreviewTile({
  file,
  isSelected,
  onSelect,
}: {
  file: LocalFile;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (file.kind !== "image" && file.kind !== "video") return undefined;
    let active = true;
    let objectUrl = "";

    void (async () => {
      const source = file.file ?? (await file.handle?.getFile());
      if (!active || !source) return;
      objectUrl = URL.createObjectURL(source);
      setPreviewUrl(objectUrl);
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return (
    <li className="preview-tile-item">
      <button className={`preview-tile ${isSelected ? "is-selected" : ""}`} type="button" onClick={onSelect}>
        <span className="preview-tile-media">
          {previewUrl && file.kind === "image" ? <img src={previewUrl} alt="" loading="lazy" /> : previewUrl && file.kind === "video" ? <video src={previewUrl} muted playsInline preload="metadata" /> : <span className={`preview-tile-type preview-tile-type-${file.kind}`}>{file.extension === "pdf" ? "PDF" : getKindAbbreviation(file.kind)}</span>}
        </span>
        <span className="preview-tile-copy"><strong>{file.name}</strong><span>{file.path}</span></span>
      </button>
    </li>
  );
}

async function scanDirectory(
  directory: FileSystemDirectoryHandle,
  parentPath = "",
  files: LocalFile[] = [],
): Promise<LocalFile[]> {
  for await (const entry of (directory as DirectoryHandleWithValues).values()) {
    const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      await scanDirectory(entry as FileSystemDirectoryHandle, path, files);
      continue;
    }
    files.push({
      id: path,
      name: entry.name,
      path,
      extension: getExtension(entry.name),
      kind: getFileKind(entry.name),
      handle: entry as FileSystemFileHandle,
    });
  }
  return files;
}

function fileFromFallback(file: File): LocalFile {
  const fallbackFile = file as File & { webkitRelativePath?: string };
  const path = fallbackFile.webkitRelativePath || file.name;
  return {
    id: path,
    name: file.name,
    path,
    extension: getExtension(file.name),
    kind: getFileKind(file.name, file.type),
    mimeType: file.type,
    file,
  };
}

export default function Home({ search, updateSearch }: HomeProps) {
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [libraries, setLibraries] = useState<LocalLibrary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const selectedId = search.file ?? null;
  const filter = search.filter;
  const query = search.q ?? "";
  const view = search.view;

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const activeRootId = search.folder ?? "";
  const activeLibrary = useMemo(
    () => libraries.find((library) => library.id === activeRootId) ?? null,
    [activeRootId, libraries],
  );
  const files = activeLibrary?.files ?? EMPTY_FILES;
  const rootName = activeLibrary?.name ?? activeRootId;
  const rootLibraries = useMemo(
    () => libraries.length > 0 ? libraries : rootName ? [{ id: rootName, name: rootName, files: [] }] : [],
    [libraries, rootName],
  );
  const hasLibrary = libraries.length > 0 || Boolean(activeRootId);
  const activeDirectory = search.dir ?? "";
  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedId) ?? null,
    [files, selectedId],
  );

  useEffect(() => {
    if (!selectedFile || !window.matchMedia("(max-width: 700px)").matches) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [selectedFile]);
  const activeFiles = useMemo(
    () => activeDirectory
      ? files.filter((file) => file.path === activeDirectory || file.path.startsWith(`${activeDirectory}/`))
      : files,
    [files, activeDirectory],
  );
  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return activeFiles
      .filter((file) => {
        const matchesKind = filter === "all" || file.kind === filter;
        const matchesQuery = !normalizedQuery || file.name.toLowerCase().includes(normalizedQuery) || file.path.toLowerCase().includes(normalizedQuery);
        return matchesKind && matchesQuery;
      })
      .sort((a, b) => a.path.localeCompare(b.path, "ja"));
  }, [activeFiles, filter, query]);
  const folderTree = useMemo(() => buildFolderTree(files), [files]);
  const mobileFolderNodes = useMemo(() => flattenFolderTree(folderTree), [folderTree]);

  const openFolder = async () => {
    setError("");
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      fallbackInputRef.current?.click();
      return;
    }
    setIsLoading(true);
    try {
      const directory = await picker({ id: "localshelf-library", mode: "read", startIn: "downloads" });
      const nextFiles = await scanDirectory(directory);
      nextFiles.sort((a, b) => a.path.localeCompare(b.path, "ja"));
      const nextLibrary = { id: directory.name, name: directory.name, files: nextFiles };
      setLibraries((currentLibraries) => {
        const existing = currentLibraries.some((library) => library.id === nextLibrary.id);
        return existing
          ? currentLibraries.map((library) => library.id === nextLibrary.id ? nextLibrary : library)
          : [...currentLibraries, nextLibrary];
      });
      updateSearch({ folder: directory.name, dir: undefined, file: undefined, filter: "all", q: undefined });
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
        setError("Folder selection was canceled or blocked by the browser. Try a regular subfolder.");
      } else {
        setError("We could not read this folder. Please try another one.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFallbackChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []).map(fileFromFallback);
    nextFiles.sort((a, b) => a.path.localeCompare(b.path, "ja"));
    const nextRootName = nextFiles[0]?.path.split("/")[0] ?? "Selected folder";
    const nextLibrary = { id: nextRootName, name: nextRootName, files: nextFiles };
    setLibraries((currentLibraries) => {
      const existing = currentLibraries.some((library) => library.id === nextLibrary.id);
      return existing
        ? currentLibraries.map((library) => library.id === nextLibrary.id ? nextLibrary : library)
        : [...currentLibraries, nextLibrary];
    });
    updateSearch({ folder: nextRootName, dir: undefined, file: undefined, filter: "all", q: undefined });
    event.target.value = "";
  };

  const selectRoot = (id: string) => {
    if (!libraries.some((library) => library.id === id)) return;
    updateSearch({ folder: id, dir: undefined, file: undefined, q: undefined, filter: "all" });
  };

  const selectFolder = (path: string) => {
    updateSearch({ dir: path || undefined, file: undefined, q: undefined, filter: "all" });
  };

  const resetLibrary = () => {
    setLibraries([]);
    setError("");
    updateSearch({ folder: undefined, dir: undefined, file: undefined, q: undefined, filter: "all", view: "list" });
  };

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!selectedFile) {
      setPreviewUrl("");
      setPreviewText("");
      setPreviewFile(null);
      setPreviewLoading(false);
      return () => { active = false; };
    }

    const loadPreview = async () => {
      setPreviewUrl("");
      setPreviewText("");
      setPreviewFile(null);
      setPreviewLoading(true);
      try {
        const file = selectedFile.file ?? (await selectedFile.handle?.getFile());
        if (!active || !file) return;

        const resolvedKind = getFileKind(selectedFile.name, file.type);
        objectUrl = URL.createObjectURL(file);
        if (!active) return;
        setPreviewFile(file);
        setPreviewUrl(objectUrl);

        if (
          resolvedKind === "document" && selectedFile.extension !== "pdf" &&
          (TEXT_EXTENSIONS.has(selectedFile.extension) || file.type.startsWith("text/"))
        ) {
          const text = (await file.text()).slice(0, 16000);
          if (!active) return;
          setPreviewText(text);
        }
      } finally {
        if (active) setPreviewLoading(false);
      }
    };
    loadPreview().catch(() => {
      if (active) setError("We could not load this file's preview.");
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const totalSize = previewFile ? formatBytes(previewFile.size) : "—";
  const previewKind = selectedFile
    ? getFileKind(selectedFile.name, previewFile?.type ?? selectedFile.mimeType ?? "")
    : "other";
  const isPdfPreview = Boolean(selectedFile && (selectedFile.extension === "pdf" || previewFile?.type === "application/pdf"));
  const isTextPreview = Boolean(previewText) && previewKind === "document" && !isPdfPreview;
  const isEmpty = !hasLibrary;

  return (
    <main className="app-shell">
      <input ref={(element) => { fallbackInputRef.current = element; element?.setAttribute("webkitdirectory", ""); }} className="visually-hidden" type="file" multiple onChange={handleFallbackChange} aria-label="Choose a folder" />
      <header className="topbar">
        <button className="brand-lockup brand-link" type="button" onClick={resetLibrary} aria-label="Return to LocalShelf home"><span className="brand-mark" aria-hidden="true">L</span><span className="brand-name">LocalShelf</span><span className="brand-version">LOCAL VIEWER</span></button>
        <div className="topbar-actions">
          <span className="privacy-note"><span className="status-dot" aria-hidden="true" />Files stay on this device</span>
          <button className="button button-primary button-small" type="button" onClick={openFolder} disabled={isLoading}><span aria-hidden="true">＋</span>{isLoading ? "Loading…" : "Open folder"}</button>
        </div>
      </header>

      {isEmpty ? (
        <section className="empty-landing" aria-labelledby="empty-title">
          <div className="landing-copy">
            <p className="eyebrow">YOUR PRIVATE FILE SHELF</p>
            <h1 id="empty-title">Your files,<br />all in one shelf.</h1>
            <p className="landing-description">Browse images, video, audio, documents, and PDFs directly in your browser. Nothing is uploaded, and your files stay on this device.</p>
            <button className="button button-primary button-large" type="button" onClick={openFolder} disabled={isLoading}><span className="button-icon" aria-hidden="true">↗</span>{isLoading ? "Loading folder…" : "Choose your first folder"}</button>
            <p className="support-note">Chrome / Edge recommended · Read-only access</p>
            {error && <p className="error-message" role="alert">{error}</p>}
          </div>
          <div className="landing-art" aria-hidden="true">
            <div className="art-glow" /><div className="shelf-card shelf-card-back"><span className="art-label">ARCHIVE</span><span className="art-line art-line-short" /><span className="art-line" /></div>
            <div className="shelf-card shelf-card-front"><span className="art-folder">◒</span><strong>your files</strong><span className="art-caption">stays on your device</span></div>
            <div className="art-sticker">PRIVATE<br />BY DEFAULT</div>
          </div>
        </section>
      ) : (
        <section className="workspace" aria-label="Local file workspace">
          <aside className="sidebar">
            <div className="sidebar-heading"><span className="sidebar-label">LIBRARY</span><button className="icon-button" type="button" onClick={openFolder} aria-label="Open another folder">＋</button></div>
            <LibrarySelector libraries={rootLibraries} selectedId={activeRootId} count={files.length} onSelect={selectRoot} />
            {folderTree.length > 0 && <div className="sidebar-section folder-section"><span className="sidebar-label">FOLDERS</span><FolderTree nodes={folderTree} selectedPath={activeDirectory} onSelect={(path) => updateSearch({ dir: path, file: undefined, q: undefined, filter: "all" })} /></div>}
            <div className="sidebar-section file-type-section"><span className="sidebar-label">FILTER BY TYPE</span><FileTypeFilters filter={filter} onSelect={(value) => updateSearch({ filter: value })} className="sidebar-filter-pills" /></div>
            <div className="sidebar-footer"><span className="status-dot" aria-hidden="true" />Safe local preview</div>
          </aside>

          <div className="file-area">
            <div className="mobile-library-nav"><div className="mobile-library-heading"><LibrarySelector libraries={rootLibraries} selectedId={activeRootId} count={files.length} subtitle={activeDirectory || "All folders"} onSelect={selectRoot} className="mobile-library-root" /><button className="icon-button" type="button" onClick={openFolder} aria-label="Open another folder">＋</button></div>{mobileFolderNodes.length > 0 && <div className="mobile-folder-strip">{mobileFolderNodes.map((node) => <button className={`mobile-folder-chip ${activeDirectory === node.path ? "is-selected" : ""}`} type="button" key={node.path} onClick={() => selectFolder(node.path)}><span aria-hidden="true">▱</span><span>{node.path}</span></button>)}</div>}</div>
            <div className="content-header"><div><p className="eyebrow">{activeDirectory || rootName || "LOCAL LIBRARY"}</p><h1>{query ? `Files matching “${query}”` : activeDirectory ? activeDirectory.split("/").pop() : "Files"}</h1></div><div className="view-meta"><span>{filteredFiles.length} / {activeFiles.length} files</span><button className={`view-button ${view === "list" ? "is-active" : ""}`} type="button" onClick={() => updateSearch({ view: "list" })} aria-label="List view" aria-pressed={view === "list"}>☷</button><button className={`view-button ${view === "preview" ? "is-active" : ""}`} type="button" onClick={() => updateSearch({ view: "preview" })} aria-label="Preview grid" aria-pressed={view === "preview"}>▦</button></div></div>
            <div className="toolbar"><label className="search-box"><span aria-hidden="true">⌕</span><input ref={searchInputRef} type="search" value={query} onChange={(event) => updateSearch({ q: event.target.value || undefined })} placeholder="Search files and folders" aria-label="Search files and folders" /><kbd>⌘ K</kbd></label><FileTypeFilters filter={filter} onSelect={(value) => updateSearch({ filter: value })} className="mobile-filter-pills" /></div>
            {error && <p className="error-message error-inline" role="alert">{error}</p>}
            <ul className={`file-list ${view === "preview" ? "file-list-preview" : ""}`} aria-label={view === "preview" ? "Preview grid" : "File list"}>
              {activeFiles.length === 0 ? (
                <li className="file-list-message">
                  <div className="no-results"><span className="no-results-icon" aria-hidden="true">⌂</span><strong>No files found</strong><span>This folder does not contain any files yet.</span></div>
                </li>
              ) : filteredFiles.length > 0 ? (
                view === "preview" ? filteredFiles.map((file) => (
                  <FilePreviewTile key={file.id} file={file} isSelected={selectedId === file.id} onSelect={() => updateSearch({ file: selectedId === file.id ? undefined : file.id })} />
                )) : filteredFiles.map((file) => (
                  <li className="file-list-item" key={file.id}>
                    <button className={`file-row ${selectedId === file.id ? "is-selected" : ""}`} type="button" onClick={() => updateSearch({ file: selectedId === file.id ? undefined : file.id })}>
                      <span className={`file-type file-type-${file.kind}`}>{getKindAbbreviation(file.kind)}</span>
                      <span className="file-row-copy"><strong>{file.name}</strong><span>{file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "Root"}</span></span>
                      <span className="file-row-kind">{getKindLabel(file.kind)}</span>
                      <span className="file-row-chevron" aria-hidden="true">›</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="file-list-message">
                  <div className="no-results"><span className="no-results-icon" aria-hidden="true">⌕</span><strong>No matching files</strong><span>Try changing your search or filter.</span></div>
                </li>
              )}
            </ul>
          </div>

          <aside className={`preview-panel ${selectedFile ? "is-modal-open" : ""}`} aria-label="File preview" aria-modal={selectedFile ? "true" : undefined} role={selectedFile ? "dialog" : undefined}>
            {selectedFile ? <><div className="preview-heading"><div><span className={`file-type file-type-${previewKind}`}>{getKindAbbreviation(previewKind)}</span><p className="eyebrow">PREVIEW</p></div><div className="preview-actions">{previewUrl && <a className="download-button" href={previewUrl} download={selectedFile.name} aria-label={`Download ${selectedFile.name}`}>↓</a>}<button className="download-button clear-button" type="button" onClick={() => updateSearch({ file: undefined })} aria-label="Clear file selection">×</button></div></div><div className={`preview-canvas preview-${previewKind}`}>{previewLoading ? <div className="preview-placeholder">Loading preview…</div> : previewKind === "image" && previewUrl ? <img src={previewUrl} alt={selectedFile.name} /> : previewKind === "video" && previewUrl ? <video src={previewUrl} controls playsInline /> : previewKind === "audio" && previewUrl ? <div className="audio-preview"><span className="audio-disc" aria-hidden="true">◖</span><audio src={previewUrl} controls /></div> : isPdfPreview && previewUrl ? <object data={previewUrl} type="application/pdf" aria-label={`PDF preview of ${selectedFile.name}`}><div className="preview-fallback"><span>This browser cannot embed PDFs.</span><a href={previewUrl} target="_blank" rel="noreferrer">Open PDF</a></div></object> : isTextPreview ? <pre>{previewText}</pre> : <div className="preview-placeholder"><span className="large-file-type">{getKindAbbreviation(previewKind)}</span><span>Preview is not available for this file type.</span></div>}</div><div className="preview-details"><h2 title={selectedFile.name}>{selectedFile.name}</h2><p>{selectedFile.path}</p><dl><div><dt>Type</dt><dd>{getKindLabel(previewKind)}</dd></div><div><dt>Size</dt><dd>{totalSize}</dd></div></dl></div></> : <div className="preview-empty"><span className="preview-empty-mark" aria-hidden="true">✦</span><strong>Choose a file</strong><span>Select a file from the list to see its preview here.</span></div>}
          </aside>
        </section>
      )}
    </main>
  );
}
