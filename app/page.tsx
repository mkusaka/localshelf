"use client";

/* Local file previews require a native img element for blob URLs. */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { MediaPlayer, MediaProvider } from "@vidstack/react";
import { defaultLayoutIcons, DefaultVideoLayout } from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

import { Button } from "../components/ui/button";
import { buttonVariants } from "../components/ui/button-variants";
import { Dialog, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Toggle } from "../components/ui/toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { cn } from "../lib/utils";

type FileKind = "image" | "video" | "audio" | "document" | "other";
export type FilterKind = "all" | FileKind;
type FilterValue = Exclude<FilterKind, "other">;

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
  resetSearch: () => void;
};

type LocalFile = {
  id: string;
  name: string;
  path: string;
  size: number | null;
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
    startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
  }) => Promise<FileSystemDirectoryHandle>;
};

type DirectoryHandleWithValues = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>;
};

const TEXT_EXTENSIONS = new Set([
  "c",
  "cpp",
  "css",
  "csv",
  "go",
  "html",
  "js",
  "json",
  "jsx",
  "log",
  "md",
  "mjs",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);
const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "ico",
  "jpeg",
  "jpg",
  "jxl",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const VIDEO_EXTENSIONS = new Set(["avi", "m4v", "mkv", "mov", "mp4", "webm"]);
const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"]);
const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All files" },
  { value: "image", label: "Images" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "document", label: "Documents" },
];
type FilterCounts = Record<FilterValue, number>;
const EMPTY_FILES: LocalFile[] = [];
const PANEL_LIMITS = {
  sidebar: { min: 180, max: 360 },
  preview: { min: 280, max: 520 },
} as const;
const DEFAULT_PANEL_WIDTHS = { sidebar: 220, preview: 360 };
type ResizeSide = keyof typeof DEFAULT_PANEL_WIDTHS;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function ResizeHandle({
  side,
  width,
  isActive,
  onPointerDown,
  onKeyDown,
  onDoubleClick,
}: {
  side: ResizeSide;
  width: number;
  isActive: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
}) {
  const label = side === "sidebar" ? "library navigation" : "preview panel";
  const limits = PANEL_LIMITS[side];

  return (
    <div
      className={cn("resize-handle", `resize-handle-${side}`, isActive && "is-resizing")}
      role="separator"
      aria-label={`Resize ${label}. Double-click to reset width.`}
      aria-orientation="vertical"
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
    />
  );
}

function FileTypeFilters({
  filter,
  counts,
  onSelect,
  className = "",
}: {
  filter: FilterKind;
  counts: FilterCounts;
  onSelect: (value: FilterValue) => void;
  className?: string;
}) {
  return (
    <ToggleGroup
      className={`filter-pills ${className}`}
      selectionMode="single"
      selectedKeys={new Set([filter])}
      onSelectionChange={(keys) => {
        const next = Array.from(keys)[0];
        if (typeof next === "string") onSelect(next as FilterValue);
      }}
      aria-label="Filter by file type"
    >
      {FILTERS.map((item) => (
        <ToggleGroupItem className="filter-pill" id={item.value} key={item.value}>
          <span>{item.label}</span>
          <span className="filter-pill-count">{counts[item.value]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function LibrarySelector({
  libraries,
  selectedId,
  count,
  subtitle,
  onSelect,
  onRemove,
  className = "",
}: {
  libraries: LocalLibrary[];
  selectedId: string;
  count: number;
  subtitle?: string;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  className?: string;
}) {
  const selectedLibrary = libraries.find((library) => library.id === selectedId);
  const selectedName = selectedLibrary?.name ?? (selectedId || "Selected folder");

  return (
    <div className="library-selector-wrap">
      <Select
        className={`library-selector-select ${className}`}
        selectedKey={selectedId}
        onSelectionChange={(key) => onSelect(String(key))}
        aria-label="Select root folder"
      >
        <SelectTrigger className="library-selector">
          <span className="folder-glyph" aria-hidden="true">
            ▰
          </span>
          <span className={`library-selector-copy ${subtitle ? "has-subtitle" : ""}`}>
            <SelectValue className="library-selector-name">{selectedName}</SelectValue>
            {subtitle && <small>{subtitle}</small>}
          </span>
          <span className="item-count">{count}</span>
        </SelectTrigger>
        <SelectContent className="library-selector-menu">
          {libraries.map((library) => (
            <SelectItem id={library.id} key={library.id} textValue={library.name}>
              {library.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onRemove && (
        <Button
          variant="ghost"
          className="library-remove-button"
          onPress={() => onRemove(selectedId)}
          aria-label={`Remove ${selectedName} from library`}
        >
          Remove from library
        </Button>
      )}
    </div>
  );
}

function getExtension(name: string): string {
  return name.includes(".") ? (name.split(".").pop()?.toLowerCase() ?? "") : "";
}

function getFileKind(name: string, mimeType = ""): FileKind {
  const extension = getExtension(name);
  if (mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) return "image";
  if (mimeType.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) return "video";
  if (mimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (
    mimeType === "application/pdf" ||
    PDF_EXTENSIONS.has(extension) ||
    mimeType.startsWith("text/") ||
    TEXT_EXTENSIONS.has(extension) ||
    ["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(extension)
  )
    return "document";
  return "other";
}

function getKindLabel(kind: FileKind): string {
  return { image: "Image", video: "Video", audio: "Audio", document: "Document", other: "Other" }[
    kind
  ];
}

function getKindAbbreviation(kind: FileKind): string {
  return { image: "IMG", video: "VID", audio: "AUD", document: "DOC", other: "FILE" }[kind];
}

function useFilePreviewUrl(file: LocalFile): string {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    setPreviewUrl("");
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

  return previewUrl;
}

function FileThumbnail({ file }: { file: LocalFile }) {
  const previewUrl = useFilePreviewUrl(file);
  const hasPreview = Boolean(previewUrl);

  return (
    <span
      className={`file-type file-type-${file.kind}${hasPreview ? " file-type-has-preview" : ""}`}
    >
      {previewUrl && file.kind === "image" ? (
        <img src={previewUrl} alt="" loading="lazy" />
      ) : previewUrl && file.kind === "video" ? (
        <video src={previewUrl} muted playsInline preload="metadata" aria-hidden="true" />
      ) : (
        <span aria-hidden="true">{getKindAbbreviation(file.kind)}</span>
      )}
    </span>
  );
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
      const path = directoryPath
        .split("/")
        .slice(0, index + 1)
        .join("/");
      let node = parent.children.find((child) => child.name === name);
      if (!node) {
        node = { name, path, count: 0, children: [] };
        parent.children.push(node);
      }
      node.count += 1;
      parent = node;
    }
  }

  const sortNodes = (nodes: FolderNode[]): FolderNode[] =>
    nodes
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
  return (
    <ul className="folder-tree">
      {nodes.map((node) => (
        <FolderTreeNode
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
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
        {node.children.length > 0 ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="folder-toggle"
            onPress={() => setIsExpanded((expanded) => !expanded)}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`}
            aria-expanded={isExpanded}
          >
            {isExpanded ? "⌄" : "›"}
          </Button>
        ) : (
          <span className="folder-toggle-spacer" aria-hidden="true" />
        )}
        <Button
          variant="ghost"
          className={`folder-tree-button ${selectedPath === node.path ? "is-selected" : ""}`}
          onPress={() => onSelect(node.path)}
          aria-pressed={selectedPath === node.path}
        >
          <span className="folder-glyph folder-glyph-small" aria-hidden="true">
            ▱
          </span>
          <span className="folder-name">{node.name}</span>
          <span className="item-count">{node.count}</span>
        </Button>
      </div>
      {isExpanded && node.children.length > 0 && (
        <FolderTree nodes={node.children} selectedPath={selectedPath} onSelect={onSelect} />
      )}
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
  const previewUrl = useFilePreviewUrl(file);

  return (
    <li className="preview-tile-item">
      <Button
        variant="ghost"
        className={`preview-tile ${isSelected ? "is-selected" : ""}`}
        onPress={onSelect}
      >
        <span className="preview-tile-media">
          {previewUrl && file.kind === "image" ? (
            <img src={previewUrl} alt="" loading="lazy" />
          ) : previewUrl && file.kind === "video" ? (
            <video src={previewUrl} muted playsInline preload="metadata" />
          ) : (
            <span className={`preview-tile-type preview-tile-type-${file.kind}`}>
              {file.extension === "pdf" ? "PDF" : getKindAbbreviation(file.kind)}
            </span>
          )}
        </span>
        <span className="preview-tile-copy">
          <strong>{file.name}</strong>
          <span>{file.path}</span>
        </span>
      </Button>
    </li>
  );
}

function VideoPreview({ src, title }: { src: string; title: string }) {
  const [videoAspectRatio, setVideoAspectRatio] = useState({ width: 16, height: 9 });
  const aspectRatio = `${videoAspectRatio.width} / ${videoAspectRatio.height}`;
  const style = {
    "--video-aspect-ratio": aspectRatio,
    "--video-width-ratio": videoAspectRatio.width / videoAspectRatio.height,
  } as CSSProperties & { [name: `--${string}`]: string | number };

  return (
    <MediaPlayer
      className="video-preview-player"
      src={src}
      viewType="video"
      title={title}
      playsInline
      preload="metadata"
      load="eager"
      aspectRatio={aspectRatio}
      style={style}
      onLoadedMetadata={(event) => {
        const video = event.trigger?.target;
        if (!(video instanceof HTMLVideoElement) || !video.videoWidth || !video.videoHeight) {
          return;
        }
        setVideoAspectRatio({ width: video.videoWidth, height: video.videoHeight });
      }}
    >
      <MediaProvider />
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
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
    const fileHandle = entry as FileSystemFileHandle;
    let size: number | null = null;
    try {
      size = (await fileHandle.getFile()).size;
    } catch {
      // Keep the file in the list when its metadata is no longer available.
    }
    files.push({
      id: path,
      name: entry.name,
      path,
      size,
      extension: getExtension(entry.name),
      kind: getFileKind(entry.name),
      handle: fileHandle,
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
    size: file.size,
    extension: getExtension(file.name),
    kind: getFileKind(file.name, file.type),
    mimeType: file.type,
    file,
  };
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const onChange = () => setMatches(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

function useResizablePanels() {
  const [panelWidths, setPanelWidths] = useState(DEFAULT_PANEL_WIDTHS);
  const [resizing, setResizing] = useState<ResizeSide | null>(null);
  const resizeStartRef = useRef<{ side: ResizeSide; clientX: number; width: number } | null>(null);

  const adjustPanelWidth = (side: ResizeSide, amount: number) => {
    setPanelWidths((current) => ({
      ...current,
      [side]: clamp(current[side] + amount, PANEL_LIMITS[side].min, PANEL_LIMITS[side].max),
    }));
  };

  const beginResize = (side: ResizeSide, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeStartRef.current = { side, clientX: event.clientX, width: panelWidths[side] };
    setResizing(side);
  };

  const handleResizeKeyDown = (side: ResizeSide, event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustPanelWidth(side, -16);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustPanelWidth(side, 16);
    } else if (event.key === "Home") {
      event.preventDefault();
      setPanelWidths((current) => ({ ...current, [side]: PANEL_LIMITS[side].min }));
    } else if (event.key === "End") {
      event.preventDefault();
      setPanelWidths((current) => ({ ...current, [side]: PANEL_LIMITS[side].max }));
    }
  };

  const resetPanelWidth = (side: ResizeSide) => {
    setPanelWidths((current) => ({ ...current, [side]: DEFAULT_PANEL_WIDTHS[side] }));
  };

  useEffect(() => {
    if (!resizing) return undefined;
    const start = resizeStartRef.current;
    if (!start) return undefined;

    const onPointerMove = (event: PointerEvent) => {
      const delta = event.clientX - start.clientX;
      const direction = start.side === "sidebar" ? 1 : -1;
      const nextWidth = clamp(
        start.width + delta * direction,
        PANEL_LIMITS[start.side].min,
        PANEL_LIMITS[start.side].max,
      );
      setPanelWidths((current) => ({ ...current, [start.side]: nextWidth }));
    };
    const stopResize = () => {
      resizeStartRef.current = null;
      setResizing(null);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, [resizing]);

  return { panelWidths, resizing, beginResize, handleResizeKeyDown, resetPanelWidth };
}

function PreviewContent({
  selectedFile,
  previewKind,
  previewUrl,
  previewText,
  previewFile,
  previewLoading,
  title,
  onClear,
}: {
  selectedFile: LocalFile;
  previewKind: FileKind;
  previewUrl: string;
  previewText: string;
  previewFile: File | null;
  previewLoading: boolean;
  title: ReactNode;
  onClear: () => void;
}) {
  const totalSize = previewFile ? formatBytes(previewFile.size) : "—";
  const isPdfPreview = selectedFile.extension === "pdf" || previewFile?.type === "application/pdf";
  const isTextPreview = Boolean(previewText) && previewKind === "document" && !isPdfPreview;

  return (
    <>
      <div className="preview-heading">
        <div>
          <span className={`file-type file-type-${previewKind}`}>
            {getKindAbbreviation(previewKind)}
          </span>
          <p className="eyebrow">PREVIEW</p>
        </div>
        <div className="preview-actions">
          {previewUrl && (
            <a
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "download-button")}
              href={previewUrl}
              download={selectedFile.name}
              aria-label={`Download ${selectedFile.name}`}
            >
              ↓
            </a>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="download-button clear-button"
            onPress={onClear}
            aria-label="Clear file selection"
          >
            ×
          </Button>
        </div>
      </div>
      <div className={`preview-canvas preview-${previewKind}`}>
        {previewLoading ? (
          <div className="preview-placeholder">Loading preview…</div>
        ) : previewKind === "image" && previewUrl ? (
          <img src={previewUrl} alt={selectedFile.name} />
        ) : previewKind === "video" && previewUrl ? (
          <VideoPreview src={previewUrl} title={selectedFile.name} />
        ) : previewKind === "audio" && previewUrl ? (
          <div className="audio-preview">
            <span className="audio-disc" aria-hidden="true">
              ◖
            </span>
            <audio src={previewUrl} controls />
          </div>
        ) : isPdfPreview && previewUrl ? (
          <object
            data={previewUrl}
            type="application/pdf"
            aria-label={`PDF preview of ${selectedFile.name}`}
          >
            <div className="preview-fallback">
              <span>This browser cannot embed PDFs.</span>
              <a href={previewUrl} target="_blank" rel="noreferrer">
                Open PDF
              </a>
            </div>
          </object>
        ) : isTextPreview ? (
          <pre>{previewText}</pre>
        ) : (
          <div className="preview-placeholder">
            <span className="large-file-type">{getKindAbbreviation(previewKind)}</span>
            <span>Preview is not available for this file type.</span>
          </div>
        )}
      </div>
      <div className="preview-details">
        {title}
        <p>{selectedFile.path}</p>
        <dl>
          <div>
            <dt>Type</dt>
            <dd>{getKindLabel(previewKind)}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{totalSize}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}

function LandingSection({
  isLoading,
  error,
  onOpenFolder,
}: {
  isLoading: boolean;
  error: string;
  onOpenFolder: () => void;
}) {
  return (
    <section className="empty-landing" aria-labelledby="empty-title">
      <div className="landing-copy">
        <p className="eyebrow">YOUR PRIVATE FILE SHELF</p>
        <h1 id="empty-title">
          Your files,
          <br />
          all in one shelf.
        </h1>
        <p className="landing-description">
          Browse images, video, audio, documents, and PDFs directly in your browser. Nothing is
          uploaded, and your files stay on this device.
        </p>
        <Button
          className="button button-primary button-large"
          onPress={onOpenFolder}
          isDisabled={isLoading}
        >
          <span className="button-icon" aria-hidden="true">
            ↗
          </span>
          {isLoading ? "Loading folder…" : "Choose your first folder"}
        </Button>
        <p className="support-note">Chrome / Edge recommended · Read-only access</p>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="landing-art" aria-hidden="true">
        <div className="art-glow" />
        <div className="shelf-card shelf-card-back">
          <span className="art-label">ARCHIVE</span>
          <span className="art-line art-line-short" />
          <span className="art-line" />
        </div>
        <div className="shelf-card shelf-card-front">
          <span className="art-folder">◒</span>
          <strong>your files</strong>
          <span className="art-caption">stays on your device</span>
        </div>
        <div className="art-sticker">
          PRIVATE
          <br />
          BY DEFAULT
        </div>
      </div>
    </section>
  );
}

function WorkspaceSidebar({
  libraries,
  activeRootId,
  fileCount,
  folderTree,
  activeDirectory,
  filter,
  filterCounts,
  onOpenFolder,
  onSelectRoot,
  onRemoveRoot,
  onSelectFolder,
  onFilterSelect,
}: {
  libraries: LocalLibrary[];
  activeRootId: string;
  fileCount: number;
  folderTree: FolderNode[];
  activeDirectory: string;
  filter: FilterKind;
  filterCounts: FilterCounts;
  onOpenFolder: () => void;
  onSelectRoot: (id: string) => void;
  onRemoveRoot: (id: string) => void;
  onSelectFolder: (path: string) => void;
  onFilterSelect: (value: FilterValue) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-heading">
        <span className="sidebar-label">LIBRARY</span>
        <Button
          variant="ghost"
          size="icon"
          className="icon-button"
          onPress={onOpenFolder}
          aria-label="Open another folder"
        >
          ＋
        </Button>
      </div>
      <LibrarySelector
        libraries={libraries}
        selectedId={activeRootId}
        count={fileCount}
        onSelect={onSelectRoot}
        onRemove={onRemoveRoot}
      />
      {folderTree.length > 0 && (
        <div className="sidebar-section folder-section">
          <span className="sidebar-label">FOLDERS</span>
          <FolderTree nodes={folderTree} selectedPath={activeDirectory} onSelect={onSelectFolder} />
        </div>
      )}
      <div className="sidebar-section file-type-section">
        <span className="sidebar-label">FILTER BY TYPE</span>
        <FileTypeFilters
          filter={filter}
          counts={filterCounts}
          onSelect={onFilterSelect}
          className="sidebar-filter-pills"
        />
      </div>
      <div className="sidebar-footer">
        <span className="status-dot" aria-hidden="true" />
        Safe local preview
      </div>
    </aside>
  );
}

function FileList({
  activeFiles,
  filteredFiles,
  view,
  selectedId,
  onSelectFile,
}: {
  activeFiles: LocalFile[];
  filteredFiles: LocalFile[];
  view: LibrarySearch["view"];
  selectedId: string | null;
  onSelectFile: (fileId: string | undefined) => void;
}) {
  return (
    <ul
      className={`file-list ${view === "preview" ? "file-list-preview" : ""}`}
      aria-label={view === "preview" ? "Preview grid" : "File list"}
    >
      {activeFiles.length === 0 ? (
        <li className="file-list-message">
          <div className="no-results">
            <span className="no-results-icon" aria-hidden="true">
              ⌂
            </span>
            <strong>No files found</strong>
            <span>This folder does not contain any files yet.</span>
          </div>
        </li>
      ) : filteredFiles.length > 0 ? (
        view === "preview" ? (
          filteredFiles.map((file) => (
            <FilePreviewTile
              key={file.id}
              file={file}
              isSelected={selectedId === file.id}
              onSelect={() => onSelectFile(selectedId === file.id ? undefined : file.id)}
            />
          ))
        ) : (
          filteredFiles.map((file) => (
            <li className="file-list-item" key={file.id}>
              <Toggle
                className={`file-row ${selectedId === file.id ? "is-selected" : ""}`}
                isSelected={selectedId === file.id}
                onChange={(isSelected) => onSelectFile(isSelected ? file.id : undefined)}
              >
                <FileThumbnail file={file} />
                <span className="file-row-copy">
                  <strong>{file.name}</strong>
                  <span>
                    {file.path.includes("/")
                      ? file.path.slice(0, file.path.lastIndexOf("/"))
                      : "Root"}
                  </span>
                </span>
                <span className="file-row-kind">{getKindLabel(file.kind)}</span>
                <span className="file-row-size">
                  {file.size === null ? "—" : formatBytes(file.size)}
                </span>
                <span className="file-row-chevron" aria-hidden="true">
                  ›
                </span>
              </Toggle>
            </li>
          ))
        )
      ) : (
        <li className="file-list-message">
          <div className="no-results">
            <span className="no-results-icon" aria-hidden="true">
              ⌕
            </span>
            <strong>No matching files</strong>
            <span>Try changing your search or filter.</span>
          </div>
        </li>
      )}
    </ul>
  );
}

function WorkspaceFileArea({
  rootLibraries,
  activeRootId,
  fileCount,
  activeDirectory,
  mobileFolderNodes,
  rootName,
  query,
  filter,
  filterCounts,
  filteredFiles,
  activeFiles,
  view,
  selectedId,
  error,
  searchInputRef,
  onOpenFolder,
  onSelectRoot,
  onRemoveRoot,
  onSelectFolder,
  onQueryChange,
  onFilterSelect,
  onViewChange,
  onSelectFile,
}: {
  rootLibraries: LocalLibrary[];
  activeRootId: string;
  fileCount: number;
  activeDirectory: string;
  mobileFolderNodes: FolderNode[];
  rootName: string;
  query: string;
  filter: FilterKind;
  filterCounts: FilterCounts;
  filteredFiles: LocalFile[];
  activeFiles: LocalFile[];
  view: LibrarySearch["view"];
  selectedId: string | null;
  error: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onOpenFolder: () => void;
  onSelectRoot: (id: string) => void;
  onRemoveRoot: (id: string) => void;
  onSelectFolder: (path: string) => void;
  onQueryChange: (query: string) => void;
  onFilterSelect: (value: FilterValue) => void;
  onViewChange: (view: LibrarySearch["view"]) => void;
  onSelectFile: (fileId: string | undefined) => void;
}) {
  return (
    <div className="file-area">
      <div className="mobile-library-nav">
        <div className="mobile-library-heading">
          <LibrarySelector
            libraries={rootLibraries}
            selectedId={activeRootId}
            count={fileCount}
            subtitle={activeDirectory || "All folders"}
            onSelect={onSelectRoot}
            onRemove={onRemoveRoot}
            className="mobile-library-root"
          />
          <Button
            variant="ghost"
            size="icon"
            className="icon-button"
            onPress={onOpenFolder}
            aria-label="Open another folder"
          >
            ＋
          </Button>
        </div>
        {mobileFolderNodes.length > 0 && (
          <div className="mobile-folder-strip">
            {mobileFolderNodes.map((node) => (
              <Button
                variant="ghost"
                className={`mobile-folder-chip ${activeDirectory === node.path ? "is-selected" : ""}`}
                key={node.path}
                onPress={() => onSelectFolder(node.path)}
              >
                <span aria-hidden="true">▱</span>
                <span>{node.path}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
      <div className="content-header">
        <div>
          <p className="eyebrow">{activeDirectory || rootName || "LOCAL LIBRARY"}</p>
          <h1>
            {query
              ? `Files matching “${query}”`
              : activeDirectory
                ? activeDirectory.split("/").pop()
                : "Files"}
          </h1>
        </div>
        <div className="view-meta">
          <span>
            {filteredFiles.length} / {activeFiles.length} files
          </span>
          <Tabs
            className="view-tabs"
            selectedKey={view}
            onSelectionChange={(key) => {
              if (key === "list" || key === "preview") onViewChange(key);
            }}
          >
            <TabsList className="view-tabs-list" aria-label="File view">
              <TabsTrigger className="view-button" id="list" aria-label="List view">
                ☷
              </TabsTrigger>
              <TabsTrigger className="view-button" id="preview" aria-label="Preview grid">
                ▦
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      <div className="toolbar">
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <Input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder="Search files and folders"
            aria-label="Search files and folders"
          />
          <kbd>⌘ K</kbd>
        </label>
        <FileTypeFilters
          filter={filter}
          counts={filterCounts}
          onSelect={onFilterSelect}
          className="mobile-filter-pills"
        />
      </div>
      {error && (
        <p className="error-message error-inline" role="alert">
          {error}
        </p>
      )}
      <FileList
        activeFiles={activeFiles}
        filteredFiles={filteredFiles}
        view={view}
        selectedId={selectedId}
        onSelectFile={onSelectFile}
      />
    </div>
  );
}

function PreviewPanel({
  selectedFile,
  isMobile,
  previewKind,
  previewUrl,
  previewText,
  previewFile,
  previewLoading,
  onClearFile,
}: {
  selectedFile: LocalFile | null;
  isMobile: boolean;
  previewKind: FileKind;
  previewUrl: string;
  previewText: string;
  previewFile: File | null;
  previewLoading: boolean;
  onClearFile: () => void;
}) {
  return (
    <>
      <aside className="preview-panel" aria-label="File preview">
        {selectedFile ? (
          <PreviewContent
            selectedFile={selectedFile}
            previewKind={previewKind}
            previewUrl={previewUrl}
            previewText={previewText}
            previewFile={previewFile}
            previewLoading={previewLoading}
            title={<h2 title={selectedFile.name}>{selectedFile.name}</h2>}
            onClear={onClearFile}
          />
        ) : (
          <div className="preview-empty">
            <span className="preview-empty-mark" aria-hidden="true">
              ✦
            </span>
            <strong>Choose a file</strong>
            <span>Select a file from the list to see its preview here.</span>
          </div>
        )}
      </aside>
      {selectedFile && isMobile && (
        <Dialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) onClearFile();
          }}
          className="mobile-preview-dialog"
          showCloseButton={false}
        >
          <PreviewContent
            selectedFile={selectedFile}
            previewKind={previewKind}
            previewUrl={previewUrl}
            previewText={previewText}
            previewFile={previewFile}
            previewLoading={previewLoading}
            title={
              <DialogTitle title={selectedFile.name} className="preview-title">
                {selectedFile.name}
              </DialogTitle>
            }
            onClear={onClearFile}
          />
        </Dialog>
      )}
    </>
  );
}

function WorkspaceView({
  style,
  panelWidths,
  resizing,
  rootLibraries,
  activeRootId,
  fileCount,
  folderTree,
  activeDirectory,
  mobileFolderNodes,
  rootName,
  filter,
  filterCounts,
  query,
  filteredFiles,
  activeFiles,
  view,
  selectedId,
  selectedFile,
  error,
  isMobile,
  previewKind,
  previewUrl,
  previewText,
  previewFile,
  previewLoading,
  searchInputRef,
  onOpenFolder,
  onSelectRoot,
  onRemoveRoot,
  onSelectFolder,
  onFilterSelect,
  onQueryChange,
  onViewChange,
  onSelectFile,
  onClearFile,
  beginResize,
  handleResizeKeyDown,
  resetPanelWidth,
}: {
  style: CSSProperties;
  panelWidths: typeof DEFAULT_PANEL_WIDTHS;
  resizing: ResizeSide | null;
  rootLibraries: LocalLibrary[];
  activeRootId: string;
  fileCount: number;
  folderTree: FolderNode[];
  activeDirectory: string;
  mobileFolderNodes: FolderNode[];
  rootName: string;
  filter: FilterKind;
  filterCounts: FilterCounts;
  query: string;
  filteredFiles: LocalFile[];
  activeFiles: LocalFile[];
  view: LibrarySearch["view"];
  selectedId: string | null;
  selectedFile: LocalFile | null;
  error: string;
  isMobile: boolean;
  previewKind: FileKind;
  previewUrl: string;
  previewText: string;
  previewFile: File | null;
  previewLoading: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onOpenFolder: () => void;
  onSelectRoot: (id: string) => void;
  onRemoveRoot: (id: string) => void;
  onSelectFolder: (path: string) => void;
  onFilterSelect: (value: FilterValue) => void;
  onQueryChange: (query: string) => void;
  onViewChange: (view: LibrarySearch["view"]) => void;
  onSelectFile: (fileId: string | undefined) => void;
  onClearFile: () => void;
  beginResize: (side: ResizeSide, event: ReactPointerEvent<HTMLDivElement>) => void;
  handleResizeKeyDown: (side: ResizeSide, event: ReactKeyboardEvent<HTMLDivElement>) => void;
  resetPanelWidth: (side: ResizeSide) => void;
}) {
  return (
    <section className="workspace" style={style} aria-label="Local file workspace">
      <WorkspaceSidebar
        libraries={rootLibraries}
        activeRootId={activeRootId}
        fileCount={fileCount}
        folderTree={folderTree}
        activeDirectory={activeDirectory}
        filter={filter}
        filterCounts={filterCounts}
        onOpenFolder={onOpenFolder}
        onSelectRoot={onSelectRoot}
        onRemoveRoot={onRemoveRoot}
        onSelectFolder={onSelectFolder}
        onFilterSelect={onFilterSelect}
      />
      <ResizeHandle
        side="sidebar"
        width={panelWidths.sidebar}
        isActive={resizing === "sidebar"}
        onPointerDown={(event) => beginResize("sidebar", event)}
        onKeyDown={(event) => handleResizeKeyDown("sidebar", event)}
        onDoubleClick={() => resetPanelWidth("sidebar")}
      />
      <WorkspaceFileArea
        rootLibraries={rootLibraries}
        activeRootId={activeRootId}
        fileCount={fileCount}
        activeDirectory={activeDirectory}
        mobileFolderNodes={mobileFolderNodes}
        rootName={rootName}
        query={query}
        filter={filter}
        filterCounts={filterCounts}
        filteredFiles={filteredFiles}
        activeFiles={activeFiles}
        view={view}
        selectedId={selectedId}
        error={error}
        searchInputRef={searchInputRef}
        onOpenFolder={onOpenFolder}
        onSelectRoot={onSelectRoot}
        onRemoveRoot={onRemoveRoot}
        onSelectFolder={onSelectFolder}
        onQueryChange={onQueryChange}
        onFilterSelect={onFilterSelect}
        onViewChange={onViewChange}
        onSelectFile={onSelectFile}
      />
      <ResizeHandle
        side="preview"
        width={panelWidths.preview}
        isActive={resizing === "preview"}
        onPointerDown={(event) => beginResize("preview", event)}
        onKeyDown={(event) => handleResizeKeyDown("preview", event)}
        onDoubleClick={() => resetPanelWidth("preview")}
      />
      <PreviewPanel
        selectedFile={selectedFile}
        isMobile={isMobile}
        previewKind={previewKind}
        previewUrl={previewUrl}
        previewText={previewText}
        previewFile={previewFile}
        previewLoading={previewLoading}
        onClearFile={onClearFile}
      />
    </section>
  );
}

function useHomeController({ search, updateSearch, resetSearch }: HomeProps) {
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [libraries, setLibraries] = useState<LocalLibrary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const isMobile = useMediaQuery("(max-width: 700px)");
  const { panelWidths, resizing, beginResize, handleResizeKeyDown, resetPanelWidth } =
    useResizablePanels();

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
    () =>
      libraries.length > 0
        ? libraries
        : rootName
          ? [{ id: rootName, name: rootName, files: [] }]
          : [],
    [libraries, rootName],
  );
  const hasLibrary = libraries.length > 0 || Boolean(activeRootId);
  const activeDirectory = search.dir ?? "";
  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedId) ?? null,
    [files, selectedId],
  );

  const activeFiles = useMemo(
    () =>
      activeDirectory
        ? files.filter(
            (file) => file.path === activeDirectory || file.path.startsWith(`${activeDirectory}/`),
          )
        : files,
    [files, activeDirectory],
  );
  const filterCounts = useMemo<FilterCounts>(() => {
    const counts: FilterCounts = {
      all: activeFiles.length,
      image: 0,
      video: 0,
      audio: 0,
      document: 0,
    };
    for (const file of activeFiles) {
      if (file.kind !== "other") counts[file.kind] += 1;
    }
    return counts;
  }, [activeFiles]);
  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return activeFiles
      .filter((file) => {
        const matchesKind = filter === "all" || file.kind === filter;
        const matchesQuery =
          !normalizedQuery ||
          file.name.toLowerCase().includes(normalizedQuery) ||
          file.path.toLowerCase().includes(normalizedQuery);
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
      const directory = await picker({
        id: "localshelf-library",
        mode: "read",
        startIn: "downloads",
      });
      const nextFiles = await scanDirectory(directory);
      nextFiles.sort((a, b) => a.path.localeCompare(b.path, "ja"));
      const nextLibrary = { id: directory.name, name: directory.name, files: nextFiles };
      setLibraries((currentLibraries) => {
        const existing = currentLibraries.some((library) => library.id === nextLibrary.id);
        return existing
          ? currentLibraries.map((library) =>
              library.id === nextLibrary.id ? nextLibrary : library,
            )
          : [...currentLibraries, nextLibrary];
      });
      updateSearch({
        folder: directory.name,
        dir: undefined,
        file: undefined,
        filter: "all",
        q: undefined,
      });
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
        setError(
          "Folder selection was canceled or blocked by the browser. Try a regular subfolder.",
        );
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
        ? currentLibraries.map((library) => (library.id === nextLibrary.id ? nextLibrary : library))
        : [...currentLibraries, nextLibrary];
    });
    updateSearch({
      folder: nextRootName,
      dir: undefined,
      file: undefined,
      filter: "all",
      q: undefined,
    });
    event.target.value = "";
  };

  const selectRoot = (id: string) => {
    if (!libraries.some((library) => library.id === id)) return;
    updateSearch({ folder: id, dir: undefined, file: undefined, q: undefined, filter: "all" });
  };

  const selectFolder = (path: string) => {
    updateSearch({ dir: path || undefined, file: undefined, q: undefined, filter: "all" });
  };

  const removeRoot = (id: string) => {
    const nextLibraries = libraries.filter((library) => library.id !== id);
    setLibraries(nextLibraries);
    setError("");
    if (nextLibraries.length === 0) {
      resetSearch();
      return;
    }
    if (id === activeRootId) {
      updateSearch({
        folder: nextLibraries[0].id,
        dir: undefined,
        file: undefined,
        q: undefined,
        filter: "all",
      });
    }
  };

  const resetLibrary = () => {
    setLibraries([]);
    setError("");
    resetSearch();
  };

  const handleBrandPress = () => {
    if (activeDirectory) {
      selectFolder("");
      return;
    }
    resetLibrary();
  };

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!selectedFile) {
      setPreviewUrl("");
      setPreviewText("");
      setPreviewFile(null);
      setPreviewLoading(false);
      return () => {
        active = false;
      };
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
          resolvedKind === "document" &&
          selectedFile.extension !== "pdf" &&
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

  const previewKind = selectedFile
    ? getFileKind(selectedFile.name, previewFile?.type ?? selectedFile.mimeType ?? "")
    : "other";
  const isEmpty = !hasLibrary;
  const workspaceStyle = {
    "--sidebar-width": `${panelWidths.sidebar}px`,
    "--preview-width": `${panelWidths.preview}px`,
  } as CSSProperties;

  return {
    fallbackInputRef,
    searchInputRef,
    isLoading,
    error,
    previewUrl,
    previewText,
    previewFile,
    previewLoading,
    isMobile,
    panelWidths,
    resizing,
    beginResize,
    handleResizeKeyDown,
    resetPanelWidth,
    selectedId,
    filter,
    query,
    view,
    rootLibraries,
    activeRootId,
    files,
    folderTree,
    activeDirectory,
    mobileFolderNodes,
    rootName,
    filterCounts,
    filteredFiles,
    activeFiles,
    selectedFile,
    previewKind,
    workspaceStyle,
    isEmpty,
    openFolder,
    handleFallbackChange,
    handleBrandPress,
    selectRoot,
    removeRoot,
    selectFolder,
  };
}

export default function Home(props: HomeProps) {
  const {
    fallbackInputRef,
    searchInputRef,
    isLoading,
    error,
    previewUrl,
    previewText,
    previewFile,
    previewLoading,
    isMobile,
    panelWidths,
    resizing,
    beginResize,
    handleResizeKeyDown,
    resetPanelWidth,
    selectedId,
    filter,
    query,
    view,
    rootLibraries,
    activeRootId,
    files,
    folderTree,
    activeDirectory,
    mobileFolderNodes,
    rootName,
    filterCounts,
    filteredFiles,
    activeFiles,
    selectedFile,
    previewKind,
    workspaceStyle,
    isEmpty,
    openFolder,
    handleFallbackChange,
    handleBrandPress,
    selectRoot,
    removeRoot,
    selectFolder,
  } = useHomeController(props);

  return (
    <main className="app-shell">
      <input
        ref={(element) => {
          fallbackInputRef.current = element;
          element?.setAttribute("webkitdirectory", "");
        }}
        className="visually-hidden"
        type="file"
        multiple
        onChange={handleFallbackChange}
        aria-label="Choose a folder"
      />
      <header className="topbar">
        <Button
          variant="ghost"
          className="brand-lockup brand-link"
          onPress={handleBrandPress}
          aria-label={activeDirectory ? "Show all folders" : "Return to LocalShelf home"}
        >
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <span className="brand-name">LocalShelf</span>
          <span className="brand-version">LOCAL VIEWER</span>
        </Button>
        <div className="topbar-actions">
          <span className="privacy-note">
            <span className="status-dot" aria-hidden="true" />
            Files stay on this device
          </span>
          <Button
            className="button button-primary button-small"
            onPress={() => void openFolder()}
            isDisabled={isLoading}
          >
            <span aria-hidden="true">＋</span>
            {isLoading ? "Loading…" : "Open folder"}
          </Button>
        </div>
      </header>
      {isEmpty ? (
        <LandingSection
          isLoading={isLoading}
          error={error}
          onOpenFolder={() => void openFolder()}
        />
      ) : (
        <WorkspaceView
          style={workspaceStyle}
          panelWidths={panelWidths}
          resizing={resizing}
          rootLibraries={rootLibraries}
          activeRootId={activeRootId}
          fileCount={files.length}
          folderTree={folderTree}
          activeDirectory={activeDirectory}
          mobileFolderNodes={mobileFolderNodes}
          rootName={rootName}
          filter={filter}
          filterCounts={filterCounts}
          query={query}
          filteredFiles={filteredFiles}
          activeFiles={activeFiles}
          view={view}
          selectedId={selectedId}
          selectedFile={selectedFile}
          error={error}
          isMobile={isMobile}
          previewKind={previewKind}
          previewUrl={previewUrl}
          previewText={previewText}
          previewFile={previewFile}
          previewLoading={previewLoading}
          searchInputRef={searchInputRef}
          onOpenFolder={() => void openFolder()}
          onSelectRoot={selectRoot}
          onRemoveRoot={removeRoot}
          onSelectFolder={selectFolder}
          onFilterSelect={(value) => props.updateSearch({ filter: value })}
          onQueryChange={(nextQuery) => props.updateSearch({ q: nextQuery || undefined })}
          onViewChange={(nextView) => props.updateSearch({ view: nextView })}
          onSelectFile={(fileId) => props.updateSearch({ file: fileId })}
          onClearFile={() => props.updateSearch({ file: undefined })}
          beginResize={beginResize}
          handleResizeKeyDown={handleResizeKeyDown}
          resetPanelWidth={resetPanelWidth}
        />
      )}
    </main>
  );
}
