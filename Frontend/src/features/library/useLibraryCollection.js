import { useCallback, useEffect, useRef, useState } from "react";

const emptyCollection = { key: "", view: null, items: [], page: 1, totalPages: 1,
  totalCount: 0, loading: false, error: null };

export function libraryRouteKey(route) {
  return JSON.stringify([route.view, route.page, route.q || "", route.sort || ""]);
}

export function useLibraryCollection(api, route, navigate) {
  const [collection, setCollection] = useState(emptyCollection);
  const collectionRequestRef = useRef(null);

  const loadCollection = useCallback(async (nextRoute, { preserveItems = false } = {}) => {
    if (nextRoute.view !== "favorites" && nextRoute.view !== "watchlist") return true;
    collectionRequestRef.current?.abort();
    const controller = new AbortController();
    collectionRequestRef.current = controller;
    const key = libraryRouteKey(nextRoute);
    setCollection((current) => ({
      key,
      view: nextRoute.view,
      items: preserveItems && current.key === key ? current.items : [],
      page: nextRoute.page,
      totalPages: current.key === key ? current.totalPages : 1,
      totalCount: current.key === key ? current.totalCount : 0,
      loading: true,
      error: null,
    }));
    try {
      const result = nextRoute.view === "favorites"
        ? await api.getFavoritesPage({ signal: controller.signal, page: nextRoute.page,
          pageSize: 12, q: nextRoute.q, sort: nextRoute.sort })
        : await api.getWatchlistPage({ signal: controller.signal, page: nextRoute.page, pageSize: 12 });
      if (collectionRequestRef.current !== controller) return true;
      const totalPages = Math.max(1, result.totalPages);
      if (nextRoute.page > totalPages) {
        navigate({ ...nextRoute, page: totalPages }, { replace: true });
        return true;
      }
      setCollection({ key: libraryRouteKey(nextRoute), view: nextRoute.view,
        items: nextRoute.view === "favorites"
          ? result.items.map((movie) => ({ movie }))
          : result.items.map((entry) => ({ movie: entry.movie, watchlistEntry: entry })),
        page: result.page, totalPages, totalCount: result.totalCount,
        loading: false, error: null });
      return true;
    } catch {
      if (controller.signal.aborted || collectionRequestRef.current !== controller) return true;
      setCollection((current) => ({ ...current, loading: false,
        error: nextRoute.view === "favorites"
          ? "Falha ao carregar favoritos. Tente novamente."
          : "Falha ao carregar sua lista. Tente novamente." }));
      return false;
    }
  }, [api, navigate]);

  useEffect(() => {
    if (route.view === "favorites" || route.view === "watchlist") {
      loadCollection(route);
    } else collectionRequestRef.current?.abort();
    return () => collectionRequestRef.current?.abort();
  }, [loadCollection, route]);

  return { collection, setCollection, loadCollection };
}
