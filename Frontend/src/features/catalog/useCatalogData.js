import { useCallback, useEffect, useRef, useState } from "react";

const initialData = { key: "", items: [], page: 1, totalPages: 1,
  loading: true, error: null };

export function catalogKey(route) {
  return JSON.stringify(route.view === "results"
    ? ["results", route.q, route.year, route.page]
    : ["discover", route.genre, route.year, route.sort, route.page]);
}

export function useCatalogData(api, route, navigate) {
  const [data, setData] = useState(initialData);
  const [genres, setGenres] = useState([]);
  const [genresLoaded, setGenresLoaded] = useState(false);
  const [genresError, setGenresError] = useState(false);
  const pageRequestRef = useRef(null);
  const genresRequestRef = useRef(null);
  const pagesRef = useRef(new Map());

  const loadGenres = useCallback(async () => {
    genresRequestRef.current?.abort();
    const controller = new AbortController();
    genresRequestRef.current = controller;
    setGenresError(false);
    try {
      const loaded = await api.getGenres({ signal: controller.signal });
      if (genresRequestRef.current === controller) {
        setGenres(loaded);
        setGenresLoaded(true);
      }
    } catch {
      if (!controller.signal.aborted && genresRequestRef.current === controller) setGenresError(true);
    }
  }, [api]);

  const loadPage = useCallback(async (nextRoute, { force = false } = {}) => {
    pageRequestRef.current?.abort();
    const controller = new AbortController();
    pageRequestRef.current = controller;
    const key = catalogKey(nextRoute);
    const cached = pagesRef.current.get(key);
    if (!force && cached) {
      setData({ key, items: cached.results.map((movie) => ({ movie })),
        page: cached.page, totalPages: cached.totalPages, loading: false, error: null });
      return;
    }

    setData({ key, items: [], page: nextRoute.page, totalPages: 1,
      loading: true, error: null });
    try {
      const result = nextRoute.view === "results"
        ? await api.searchMovies(nextRoute.q, {
          signal: controller.signal, page: nextRoute.page, year: nextRoute.year,
        })
        : await api.discoverMovies({ signal: controller.signal, page: nextRoute.page,
          genre: nextRoute.genre, year: nextRoute.year, sort: nextRoute.sort });
      if (pageRequestRef.current !== controller) return;
      const totalPages = Math.max(1, Math.min(result.total_pages, 500));
      if (nextRoute.page > totalPages) {
        navigate({ ...nextRoute, page: totalPages }, { replace: true });
        return;
      }
      const page = { ...result, totalPages };
      pagesRef.current.set(key, page);
      setData({ key, items: result.results.map((movie) => ({ movie })),
        page: result.page, totalPages: page.totalPages, loading: false, error: null });
    } catch {
      if (!controller.signal.aborted && pageRequestRef.current === controller) {
        setData((current) => ({ ...current, loading: false,
          error: "Falha ao carregar filmes. Tente novamente." }));
      }
    }
  }, [api, navigate]);

  useEffect(() => {
    loadGenres();
    return () => genresRequestRef.current?.abort();
  }, [loadGenres]);

  useEffect(() => {
    if (route.view === "discover" || (route.view === "results" && route.q)) loadPage(route);
    else {
      pageRequestRef.current?.abort();
      if (route.view === "results") {
        setData({ key: catalogKey(route), items: [], page: 1,
          totalPages: 1, loading: false, error: null });
      }
    }
    return () => pageRequestRef.current?.abort();
  }, [loadPage, route]);

  return { ...data, genres, genresLoaded, genresError, loadGenres,
    retry: () => loadPage(route, { force: true }) };
}
