import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import Home, { type LibrarySearch } from "../../app/page";

const FILTER_VALUES = new Set(["all", "image", "video", "audio", "document"]);
const SORT_VALUES = new Set(["name", "size", "kind"]);
const SORT_ORDER_VALUES = new Set(["asc", "desc"]);
const VIEW_VALUES = new Set(["list", "preview"]);
const SEARCH_DEFAULTS = { filter: "all", sort: "name", order: "asc", view: "list" } as const;

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
    folder: typeof search.folder === "string" ? search.folder : undefined,
    dir: typeof search.dir === "string" ? search.dir : undefined,
    file: typeof search.file === "string" ? search.file : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    filter:
      typeof search.filter === "string" && FILTER_VALUES.has(search.filter)
        ? (search.filter as LibrarySearch["filter"])
        : "all",
    sort:
      typeof search.sort === "string" && SORT_VALUES.has(search.sort)
        ? (search.sort as LibrarySearch["sort"])
        : "name",
    order:
      typeof search.order === "string" && SORT_ORDER_VALUES.has(search.order)
        ? (search.order as LibrarySearch["order"])
        : "asc",
    view:
      typeof search.view === "string" && VIEW_VALUES.has(search.view)
        ? (search.view as LibrarySearch["view"])
        : "list",
  }),
  search: {
    middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
  },
  component: LibraryRoute,
});

function LibraryRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const updateSearch = (updates: Partial<LibrarySearch>) => {
    void navigate({
      search: (previous) => ({ ...previous, ...updates }),
      replace: true,
      resetScroll: false,
    });
  };

  const resetSearch = () => {
    void navigate({
      search: {
        folder: undefined,
        dir: undefined,
        file: undefined,
        q: undefined,
        ...SEARCH_DEFAULTS,
      },
      replace: true,
      resetScroll: false,
    });
  };

  return <Home search={search} updateSearch={updateSearch} resetSearch={resetSearch} />;
}
