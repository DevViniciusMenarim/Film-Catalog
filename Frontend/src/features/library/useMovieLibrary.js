import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../shared/api";
import { useLibraryCollection } from "./useLibraryCollection";
export { libraryRouteKey } from "./useLibraryCollection";

export function useMovieLibrary(api, route, navigate, notify) {
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [watchlistIds, setWatchlistIds] = useState(new Set());
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [watchlistReady, setWatchlistReady] = useState(false);
  const [favoritesError, setFavoritesError] = useState(false);
  const [watchlistError, setWatchlistError] = useState(false);
  const [pendingIds, setPendingIds] = useState(new Set());
  const { collection, setCollection, loadCollection } = useLibraryCollection(api, route, navigate);
  const idsRequestRef = useRef({ favorites: null, watchlist: null });
  const idsVersionRef = useRef({ favorites: 0, watchlist: 0 });
  const pendingIdsRef = useRef(new Set());
  const routeRef = useRef(route);
  routeRef.current = route;

  const setMoviePending = useCallback((id, pending) => {
    const next = new Set(pendingIdsRef.current);
    if (pending) {
      if (next.has(id)) return false;
      next.add(id);
    } else next.delete(id);
    pendingIdsRef.current = next;
    setPendingIds(next);
    return true;
  }, []);

  const loadIds = useCallback(async (kind) => {
    idsRequestRef.current[kind]?.abort();
    const controller = new AbortController();
    idsRequestRef.current[kind] = controller;
    const version = ++idsVersionRef.current[kind];
    const isCurrent = () => idsRequestRef.current[kind] === controller
      && idsVersionRef.current[kind] === version;
    if (kind === "favorites") setFavoritesError(false);
    else setWatchlistError(false);
    try {
      const ids = kind === "favorites"
        ? await api.getFavoriteIds({ signal: controller.signal })
        : await api.getWatchlistIds({ signal: controller.signal });
      if (!isCurrent()) return true;
      if (kind === "favorites") {
        setFavoriteIds(new Set(ids));
        setFavoritesReady(true);
      } else {
        setWatchlistIds(new Set(ids));
        setWatchlistReady(true);
      }
      return true;
    } catch {
      if (controller.signal.aborted || !isCurrent()) return true;
      if (kind === "favorites") {
        setFavoritesError(true);
        setFavoritesReady(false);
      } else {
        setWatchlistError(true);
        setWatchlistReady(false);
      }
      return false;
    }
  }, [api]);

  const revalidate = useCallback(async (kind) => {
    const currentRoute = routeRef.current;
    const updates = [loadIds(kind)];
    if (currentRoute.view === kind) {
      updates.push(loadCollection(currentRoute, { preserveItems: true }));
    }
    const outcomes = await Promise.all(updates);
    return outcomes.every(Boolean);
  }, [loadCollection, loadIds]);

  useEffect(() => {
    const idsRequests = idsRequestRef.current;
    loadIds("favorites");
    loadIds("watchlist");
    return () => {
      idsRequests.favorites?.abort();
      idsRequests.watchlist?.abort();
    };
  }, [loadIds]);

  const toggleFavorite = async (movie) => {
    const id = Number(movie.id);
    if (!favoritesReady || !setMoviePending(id, true)) return;
    const removing = favoriteIds.has(id);
    try {
      if (removing) {
        await api.deleteFavorite(id);
        setFavoriteIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        if (routeRef.current.view === "favorites") {
          setCollection((current) => ({ ...current,
            items: current.items.filter((item) => item.movie.id !== id) }));
        }
      } else {
        await api.saveFavorite(movie);
        setFavoriteIds((current) => new Set(current).add(id));
      }
      notify(removing ? "Filme removido dos favoritos." : "Filme salvo nos favoritos.", "success");
      if (!await revalidate("favorites")) {
        notify("Alteração salva, mas não foi possível atualizar os favoritos. Tente recarregar.", "error");
      }
    } catch (error) {
      notify(error instanceof ApiError && error.status === 409
        ? "Este filme já está nos favoritos. Atualize a lista."
        : "Falha ao atualizar favoritos. Tente novamente.", "error");
      await revalidate("favorites");
    } finally {
      setMoviePending(id, false);
    }
  };

  const toggleWatchlist = async (movie) => {
    const id = Number(movie.id);
    if (!watchlistReady || !setMoviePending(id, true)) return;
    const removing = watchlistIds.has(id);
    try {
      if (removing) {
        await api.deleteWatchlist(id);
        setWatchlistIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        if (routeRef.current.view === "watchlist") {
          setCollection((current) => ({ ...current,
            items: current.items.filter((item) => item.movie.id !== id) }));
        }
      } else {
        await api.addToWatchlist(movie);
        setWatchlistIds((current) => new Set(current).add(id));
      }
      notify(removing ? "Filme removido da sua lista." : "Filme adicionado à sua lista.", "success");
      if (!await revalidate("watchlist")) {
        notify("Alteração salva, mas não foi possível atualizar a lista. Tente recarregar.", "error");
      }
    } catch (error) {
      notify(error instanceof ApiError && error.status === 409
        ? "Este filme já está na sua lista. Recarregue a seção."
        : "Falha ao atualizar sua lista. Tente novamente.", "error");
      await revalidate("watchlist");
    } finally {
      setMoviePending(id, false);
    }
  };

  const updateWatchlist = async (id, changes, version) => {
    id = Number(id);
    if (!setMoviePending(id, true)) return false;
    try {
      await api.updateWatchlist(id, changes, version);
      setCollection((current) => current.view === "watchlist"
        ? { ...current, items: current.items.map((item) => item.movie.id === id
          && item.watchlistEntry
          ? { ...item, watchlistEntry: { ...item.watchlistEntry, ...changes,
            version: version + 1 } }
          : item) }
        : current);
      notify("Registro atualizado.", "success");
      if (!await revalidate("watchlist")) {
        notify("Registro salvo, mas não foi possível recarregar a lista.", "error");
      }
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        notify("Registro alterado em outra sessão. Revise os dados antes de editar novamente.", "error");
        await revalidate("watchlist");
        return "conflict";
      }
      if (error instanceof ApiError && error.status === 404) {
        setWatchlistIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        setCollection((current) => current.view === "watchlist"
          ? { ...current, items: current.items.filter((item) => item.movie.id !== id) }
          : current);
        const refreshed = await revalidate("watchlist");
        notify(refreshed
          ? "Este registro foi removido em outra sessão. Sua lista foi atualizada."
          : "Este registro foi removido em outra sessão. Não foi possível recarregar a lista.", "error");
        return true;
      }
      notify("Falha ao salvar o registro. Tente novamente.", "error");
      return false;
    } finally {
      setMoviePending(id, false);
    }
  };

  return {
    favoriteIds, watchlistIds, favoritesReady, watchlistReady,
    favoritesError, watchlistError, pendingIds, collection,
    loadFavoriteIds: () => loadIds("favorites"),
    loadWatchlistIds: () => loadIds("watchlist"),
    retryCollection: () => loadCollection(routeRef.current, { preserveItems: true }),
    toggleFavorite, toggleWatchlist, updateWatchlist,
  };
}
