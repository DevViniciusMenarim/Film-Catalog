import { useEffect, useLayoutEffect, useRef } from "react";
import MovieCard from "./MovieCard";

function MovieResults({ route, items, loading, error, page, totalPages,
  onRetry, onPage, onExplore, library, details }) {
  const headingRef = useRef(null);
  const requestedPageRef = useRef(null);
  const pendingRetryRef = useRef(null);
  const retryButtonRef = useRef(null);
  const pendingExploreRef = useRef(false);
  const lastPaginationRef = useRef(null);
  const pendingRemovalRef = useRef(null);
  const paginationScope = JSON.stringify({ ...route, page: 1 });
  useLayoutEffect(() => {
    if (!loading && !error) {
      lastPaginationRef.current = { scope: paginationScope, totalPages };
    }
  }, [loading, error, paginationScope, totalPages]);
  useLayoutEffect(() => {
    if (!pendingExploreRef.current) return;
    pendingExploreRef.current = false;
    document.getElementById("page-title")?.focus();
  }, [route]);
  useLayoutEffect(() => {
    const pendingRoute = pendingRetryRef.current;
    if (!pendingRoute) return;
    if (pendingRoute !== JSON.stringify(route)) {
      pendingRetryRef.current = null;
      return;
    }
    if (loading) return;
    pendingRetryRef.current = null;
    (error ? retryButtonRef.current : headingRef.current)?.focus();
  }, [route, loading, error]);
  useLayoutEffect(() => {
    const pending = pendingRemovalRef.current;
    if (!pending) return;
    if (pending.view !== route.view) {
      pendingRemovalRef.current = null;
      return;
    }
    if (!pending.button.isConnected) {
      pendingRemovalRef.current = null;
      if (document.activeElement === document.body) {
        const remaining = document.querySelectorAll(".movie-grid .movie-card .primary-button");
        (remaining[Math.min(pending.index, remaining.length - 1)] || headingRef.current)?.focus();
      }
    } else if (!library.pendingIds.has(pending.id)) {
      pendingRemovalRef.current = null;
    }
  });
  const previousTotalPages = lastPaginationRef.current?.scope === paginationScope
    ? lastPaginationRef.current.totalPages : 1;
  const visibleTotalPages = loading || error ? previousTotalPages : totalPages;
  const visiblePage = loading || error ? route.page : page;
  const paginationBusy = loading || Boolean(error);

  useEffect(() => {
    const requested = requestedPageRef.current;
    if (!requested) return;
    if (requested.view !== route.view || requested.page !== route.page) {
      requestedPageRef.current = null;
    } else if (!loading && !error && page === requested.page) {
      requestedPageRef.current = null;
      headingRef.current?.focus();
    }
  }, [route.view, route.page, loading, error, page]);

  const selectPage = (nextPage) => {
    if (paginationBusy) return;
    requestedPageRef.current = { view: route.view, page: nextPage };
    onPage(nextPage);
  };
  const retry = () => {
    pendingRetryRef.current = JSON.stringify(route);
    headingRef.current?.focus();
    onRetry();
  };
  const explore = () => {
    pendingExploreRef.current = true;
    onExplore();
  };
  const toggleFromCard = (kind, movie, button) => {
    const saved = kind === "favorites"
      ? library.favoriteIds.has(movie.id) : library.watchlistIds.has(movie.id);
    if (route.view === kind && saved) {
      pendingRemovalRef.current = {
        view: kind,
        id: movie.id,
        button,
        index: items.findIndex((item) => item.movie.id === movie.id),
      };
    }
    if (kind === "favorites") library.toggleFavorite(movie);
    else library.toggleWatchlist(movie);
  };
  const title = route.view === "favorites" ? "Sua seleção"
    : route.view === "watchlist" ? "Para assistir"
      : route.view === "results" ? "Resultados para “" + route.q + "”" : "Em destaque";
  const emptyText = route.view === "favorites"
    ? route.q ? "Nenhum favorito corresponde ao filtro." : "Você ainda não salvou nenhum favorito."
    : route.view === "watchlist" ? "Sua lista está vazia. Adicione filmes que deseja assistir."
      : route.view === "results" ? "Nenhum filme encontrado para esta busca."
        : "Nenhum filme encontrado com esses filtros.";
  const emptyTitle = route.view === "favorites"
    ? route.q ? "Nenhum favorito encontrado" : "Sua seleção começa aqui"
    : route.view === "watchlist" ? "Sua lista começa aqui"
      : route.view === "results" ? "Nenhum resultado nesta busca"
        : "Nenhum filme com esses filtros";
  const showSectionHeading = loading || error || items.length > 0;

  return (
    <section className="results-section" aria-labelledby="section-title">
      {showSectionHeading && <div className="section-heading">
        <h2 id="section-title" ref={headingRef} tabIndex={-1}>{title}</h2>
        {route.view === "results" && route.year && <span className="active-filter">Ano: {route.year}</span>}
      </div>}
      {loading && <p className="state-message" role="status">Carregando filmes...</p>}
      {error && (
        <div className="state-message inline-error" role="alert">
          <p>{error}</p>
          <button type="button" ref={retryButtonRef} className="secondary-button"
            onClick={retry}>Tentar novamente</button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="state-message empty-state" role="status">
          <h2 id="section-title" ref={headingRef} tabIndex={-1}>{emptyTitle}</h2>
          <p>{emptyText}</p>
          <button type="button" className="secondary-button" onClick={explore}>
            {route.view === "discover" ? "Ver destaques" : "Explorar catálogo"}
          </button>
        </div>
      )}
      {items.length > 0 && (
        <>
          <p className="sr-only" role="status">
            {items.length} {items.length === 1 ? "filme exibido" : "filmes exibidos"} nesta página
          </p>
          <div className="movie-grid">
            {items.map(({ movie, watchlistEntry }) => (
              <MovieCard key={movie.id} movie={movie} watchlistEntry={watchlistEntry}
                isFavorite={library.favoriteIds.has(movie.id)}
                isInWatchlist={library.watchlistIds.has(movie.id)}
                busy={library.pendingIds.has(movie.id)}
                favoritesReady={library.favoritesReady} watchlistReady={library.watchlistReady}
                onDetails={details.open}
                onToggleFavorite={(movie, button) => toggleFromCard("favorites", movie, button)}
                onToggleWatchlist={(movie, button) => toggleFromCard("watchlist", movie, button)}
                onUpdateWatchlist={library.updateWatchlist} />
            ))}
          </div>
        </>
      )}
      {visibleTotalPages > 1 && (
        <nav className="pagination" aria-label="Paginação de filmes">
          <button type="button" className="secondary-button" disabled={visiblePage <= 1 && !paginationBusy}
            aria-disabled={paginationBusy || visiblePage <= 1}
            onClick={() => selectPage(visiblePage - 1)}>Página anterior</button>
          <span role="status" aria-live="polite">
            {loading ? "Carregando" : error ? "Falha na" : "Página"} {loading || error ? "página " : ""}{visiblePage} de {visibleTotalPages}
          </span>
          <button type="button" className="secondary-button" disabled={visiblePage >= visibleTotalPages && !paginationBusy}
            aria-disabled={paginationBusy || visiblePage >= visibleTotalPages}
            onClick={() => selectPage(visiblePage + 1)}>Próxima página</button>
        </nav>
      )}
    </section>
  );
}

export default MovieResults;
