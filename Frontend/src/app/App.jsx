import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { createApiClient } from "../shared/api";
import CatalogControls from "../features/catalog/CatalogControls";
import MovieResults from "../features/catalog/MovieResults";
import MovieDetails from "../features/catalog/MovieDetails";
import Notification from "../shared/Notification";
import { catalogKey, useCatalogData } from "../features/catalog/useCatalogData";
import { useCatalogRoute } from "./useCatalogRoute";
import { libraryRouteKey, useMovieLibrary } from "../features/library/useMovieLibrary";
import { useMovieDetails } from "../features/catalog/useMovieDetails";

const defaultApi = createApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL || "/api" });

function App({ apiClient = defaultApi }) {
  const { route, navigate } = useCatalogRoute();
  const [notification, setNotification] = useState(null);
  const [catalogInfo, setCatalogInfo] = useState(null);
  const [catalogInfoError, setCatalogInfoError] = useState(false);
  const notificationIdRef = useRef(0);
  const catalogInfoRequestRef = useRef(null);
  useEffect(() => {
    const title = {
      discover: "Descobrir",
      results: "Buscar",
      favorites: "Favoritos",
      watchlist: "Minha lista",
    }[route.view];
    document.title = `${title} | Film Catalog`;
  }, [route.view]);
  const showNotification = useCallback((message, type) => {
    notificationIdRef.current += 1;
    setNotification({ id: notificationIdRef.current, message, type });
  }, []);
  const closeNotification = useCallback((id) => {
    setNotification((current) => current?.id === id ? null : current);
  }, []);

  const loadCatalogInfo = useCallback(() => {
    catalogInfoRequestRef.current?.abort();
    const controller = new AbortController();
    catalogInfoRequestRef.current = controller;
    setCatalogInfoError(false);
    apiClient.getCatalogInfo({ signal: controller.signal })
      .then((info) => {
        if (catalogInfoRequestRef.current === controller) setCatalogInfo(info);
      })
      .catch(() => {
        if (!controller.signal.aborted && catalogInfoRequestRef.current === controller) {
          setCatalogInfoError(true);
        }
      });
  }, [apiClient]);

  useEffect(() => {
    loadCatalogInfo();
    return () => catalogInfoRequestRef.current?.abort();
  }, [loadCatalogInfo]);

  const catalog = useCatalogData(apiClient, route, navigate);
  useEffect(() => {
    if (route.view !== "discover") return;
    const unsupportedSort = catalogInfo?.source === "demo" && route.sort === "vote_average.desc";
    const unknownGenre = route.genre && catalog.genresLoaded
      && !catalog.genres.some((genre) => String(genre.id) === route.genre);
    if (unsupportedSort || unknownGenre) {
      navigate({ ...route,
        sort: unsupportedSort ? "popularity.desc" : route.sort,
        genre: unknownGenre ? "" : route.genre,
        page: 1 }, { replace: true });
    }
  }, [catalogInfo, catalog.genres, catalog.genresLoaded, route, navigate]);
  const library = useMovieLibrary(apiClient, route, navigate, showNotification);
  const details = useMovieDetails(apiClient);
  const personalCollection = route.view === "favorites" || route.view === "watchlist";
  const collectionMatches = library.collection.key === libraryRouteKey(route);
  const catalogMatches = catalog.key === catalogKey(route);
  const data = personalCollection
    ? collectionMatches ? library.collection
      : { items: [], page: route.page, totalPages: 1, loading: true, error: null }
    : catalogMatches ? catalog
      : { items: [], page: route.page, totalPages: 1, loading: true, error: null };

  return (
    <>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <header className="site-header">
        <div className="header-inner">
          <img className="brand-mark" src="/film-catalog-icon.png" alt="" width="88" height="88" />
          <div className="brand-copy">
            <p className="brand-kicker">Seu espaço de cinema</p>
            <p className="brand-name">Meu Catálogo de Filmes</p>
            <p className="brand-tagline">Encontre histórias, guarde seus favoritos e organize o que assistir depois.</p>
          </div>
        </div>
      </header>
      <main id="conteudo" className={route.view === "discover" ? "discover-page" : "inner-page"}>
        {catalogInfo?.source === "demo" && (
          <aside className="catalog-notice" role="note" aria-label="Modo de demonstração">
            <div className="notice-heading">
              <strong>Modo de demonstração</strong>
              <span className="notice-count">40 filmes</span>
            </div>
            <p>Explore uma seleção de filmes reais com dados do TMDB. Para acessar o catálogo completo, configure uma chave da API do TMDB.</p>
          </aside>
        )}
        {catalogInfoError && (
          <div className="catalog-info-error inline-error" role="alert">
            <span>Não foi possível identificar a fonte do catálogo. </span>
            <button type="button" className="secondary-button" onClick={loadCatalogInfo}>
              Tentar novamente
            </button>
          </div>
        )}
        <CatalogControls route={route} navigate={navigate} genres={catalog.genres}
          genresError={catalog.genresError} retryGenres={catalog.loadGenres}
          catalogSource={catalogInfo?.source} />
        {library.favoritesError && (
          <div className="membership-error inline-error" role="alert">
            <span>Não foi possível verificar seus favoritos. </span>
            <button type="button" className="secondary-button" onClick={library.loadFavoriteIds}>Tentar novamente</button>
          </div>
        )}
        {library.watchlistError && (
          <div className="membership-error inline-error" role="alert">
            <span>Não foi possível verificar sua lista. </span>
            <button type="button" className="secondary-button" onClick={library.loadWatchlistIds}>Tentar novamente</button>
          </div>
        )}
        {!(route.view === "results" && !route.q) && (
          <MovieResults route={route} items={data.items} loading={data.loading}
            error={data.error}
            page={data.page} totalPages={data.totalPages}
            onRetry={personalCollection ? library.retryCollection : catalog.retry}
            onPage={(page) => navigate({ ...route, page })}
            library={library} details={details}
            onExplore={() => navigate({ view: "discover" })} />
        )}
      </main>
      <footer>
        <p>&copy; {new Date().getFullYear()} Film Catalog</p>
        <section className="tmdb-credit" aria-label="Créditos">
          <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">
            <img src="/tmdb-logo.svg" alt="TMDB" />
          </a>
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </section>
      </footer>
      {details.movie && (
        <MovieDetails movie={details.movie} details={details.details} loading={details.loading}
          catalogSource={catalogInfo?.source}
          error={details.error} busy={library.pendingIds.has(details.movie.id)}
          favoritesReady={library.favoritesReady} watchlistReady={library.watchlistReady}
          isFavorite={library.favoriteIds.has(details.movie.id)}
          isInWatchlist={library.watchlistIds.has(details.movie.id)}
          onClose={details.close} onRetry={details.retry}
          onToggleFavorite={library.toggleFavorite} onToggleWatchlist={library.toggleWatchlist} />
      )}
      {notification && (
        <Notification key={notification.id} id={notification.id} message={notification.message}
          type={notification.type} onClose={closeNotification} />
      )}
    </>
  );
}

export default App;
