import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { latestCatalogYear, routeToUrl } from "../../app/useCatalogRoute";

const emptyFilters = { genre: "", year: "", sort: "popularity.desc" };

const sections = [
  { view: "discover", label: "Descobrir", route: { view: "discover" } },
  { view: "results", label: "Buscar", route: { view: "results" } },
  { view: "favorites", label: "Favoritos", route: { view: "favorites" } },
  { view: "watchlist", label: "Minha lista", route: { view: "watchlist" } },
];

const introductions = {
  discover: {
    eyebrow: "Explore o catálogo",
    title: "Encontre seu próximo filme",
    description: "Navegue pelos destaques ou refine a seleção por gênero e ano.",
  },
  results: {
    eyebrow: "Busca no catálogo",
    title: "Buscar filmes",
    description: "Encontre filmes para conhecer melhor, salvar ou assistir depois.",
  },
  favorites: {
    eyebrow: "Sua coleção",
    title: "Favoritos",
    description: "Reveja os filmes que você guardou e escolha o próximo para assistir.",
  },
  watchlist: {
    eyebrow: "Para ver depois",
    title: "Minha lista",
    description: "Consulte os filmes que deseja assistir e suas anotações.",
  },
};

function CatalogControls({ route, navigate, genres, genresError, retryGenres, catalogSource }) {
  const [searchTerm, setSearchTerm] = useState(route.view === "results" ? route.q : "");
  const [searchYear, setSearchYear] = useState(route.view === "results" ? route.year : "");
  const [quickTerm, setQuickTerm] = useState("");
  const [filters, setFilters] = useState(route.view === "discover" ? {
    genre: route.genre, year: route.year, sort: route.sort,
  } : emptyFilters);
  const [favoritesQuery, setFavoritesQuery] = useState(route.view === "favorites" ? route.q : "");
  const [filtersOpen, setFiltersOpen] = useState(route.view === "discover" && Boolean(
    route.genre || route.year || route.sort !== "popularity.desc",
  ));
  const focusPageTitleRef = useRef(false);

  useLayoutEffect(() => {
    if (focusPageTitleRef.current) {
      document.getElementById("page-title")?.focus();
      focusPageTitleRef.current = false;
    }
  }, [route]);

  useEffect(() => {
    if (route.view === "results") {
      setSearchTerm(route.q);
      setSearchYear(route.year);
    }
  }, [route.view, route.q, route.year]);

  useEffect(() => {
    if (route.view === "discover") {
      setFilters({ genre: route.genre, year: route.year, sort: route.sort });
      setFiltersOpen(Boolean(route.genre || route.year || route.sort !== "popularity.desc"));
    }
  }, [route.view, route.genre, route.year, route.sort]);

  useEffect(() => {
    if (route.view === "favorites") setFavoritesQuery(route.q);
  }, [route.view, route.q]);

  const handleNavigation = (event, nextRoute) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
      || event.shiftKey || event.altKey) return;
    event.preventDefault();
    focusPageTitleRef.current = route.view !== nextRoute.view;
    navigate(nextRoute);
  };

  const handleSearch = (event) => {
    event.preventDefault();
    const q = searchTerm.trim();
    if (q) {
      focusPageTitleRef.current = true;
      navigate({ view: "results", q, year: searchYear, page: 1 });
    }
  };

  const handleQuickSearch = (event) => {
    event.preventDefault();
    const q = quickTerm.trim();
    if (q) {
      focusPageTitleRef.current = true;
      navigate({ view: "results", q, page: 1 });
    }
  };

  const handleDiscover = (event) => {
    event.preventDefault();
    const sort = catalogSource !== "tmdb" && filters.sort === "vote_average.desc"
      ? "popularity.desc" : filters.sort;
    navigate({ view: "discover", ...filters, sort, page: 1 });
  };

  const handleFavoriteFilter = (event) => {
    event.preventDefault();
    const q = favoritesQuery.trim();
    if (q !== route.q) navigate({ ...route, q, page: 1 });
  };

  const activeDiscoverFilters = route.view === "discover" && Boolean(
    route.genre || route.year || route.sort !== "popularity.desc",
  );
  const selectedGenreIsListed = !filters.genre || genres.some((genre) =>
    String(genre.id) === filters.genre);

  return (
    <>
      <nav className="section-nav" aria-label="Seções do catálogo">
        {sections.map((section) => (
          <a key={section.view} href={routeToUrl(section.route)}
            aria-current={route.view === section.view ? "page" : undefined}
            onClick={(event) => handleNavigation(event, section.route)}>
            {section.label}
          </a>
        ))}
      </nav>

      <div className="page-intro">
        <p className="page-eyebrow">{introductions[route.view].eyebrow}</p>
        <h1 id="page-title" tabIndex={-1}>{introductions[route.view].title}</h1>
        <p>{introductions[route.view].description}</p>
      </div>

      {route.view === "discover" && (
        <div className={`discover-tools${filtersOpen ? " filters-expanded" : ""}`}>
          <form className="quick-search" role="search" aria-label="Busca rápida de filmes"
            onSubmit={handleQuickSearch}>
            <label className="sr-only" htmlFor="quick-movie-query">Título do filme</label>
            <div className="quick-search-fields">
              <input id="quick-movie-query" type="search" value={quickTerm}
                placeholder="Busque pelo título" maxLength={200} required
                onChange={(event) => setQuickTerm(event.target.value)} />
              <button type="submit" className="primary-button">Buscar filme</button>
            </div>
          </form>
          <details className="discover-filters" open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}>
            <summary>
              <strong>Refinar descoberta</strong>
              <span className="filter-summary-actions">
                {activeDiscoverFilters && <span className="filter-count">Filtros ativos</span>}
                <span className="filter-chevron" aria-hidden="true" />
              </span>
            </summary>
            <form onSubmit={handleDiscover}>
              <div className="filter-fields">
                <label>Gênero
                  <select value={filters.genre}
                    onChange={(event) => setFilters((current) => ({ ...current, genre: event.target.value }))}>
                    <option value="">Todos os gêneros</option>
                    {!selectedGenreIsListed && (
                      <option value={filters.genre}>Gênero {filters.genre}</option>
                    )}
                    {genres.map((genre) => <option key={genre.id} value={genre.id}>{genre.name}</option>)}
                  </select>
                </label>
                <label>Ano
                  <input type="number" min="1878" max={latestCatalogYear()}
                    value={filters.year} placeholder="Todos os anos"
                    onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value }))} />
                </label>
                <label>Ordenar por
                  <select value={catalogSource !== "tmdb" && filters.sort === "vote_average.desc"
                    ? "popularity.desc" : filters.sort}
                    onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}>
                    <option value="popularity.desc">{catalogSource === "demo" ? "Destaques" : "Popularidade"}</option>
                    <option value="vote_average.desc" disabled={catalogSource !== "tmdb"}>Melhor avaliação</option>
                    <option value="primary_release_date.desc">Mais recentes</option>
                  </select>
                </label>
                <button type="submit" className="primary-button">Aplicar filtros</button>
              </div>
              {genresError && (
                <div className="inline-error" role="alert">
                  <span>Não foi possível carregar os gêneros. </span>
                  <button type="button" className="secondary-button" onClick={retryGenres}>Tentar novamente</button>
                </div>
              )}
            </form>
          </details>
        </div>
      )}

      {route.view === "results" && (
        <form className="search-form" role="search" onSubmit={handleSearch}>
          <div className="search-fields">
            <label htmlFor="movie-query">Título do filme
              <input id="movie-query" type="search" name="movie_query"
                placeholder="Digite o nome do filme..." value={searchTerm} maxLength={200} required
                onChange={(event) => setSearchTerm(event.target.value)} />
            </label>
            <label htmlFor="search-year">Ano (opcional)
              <input id="search-year" type="number" min="1878" max={latestCatalogYear()}
                value={searchYear} onChange={(event) => setSearchYear(event.target.value)} />
            </label>
            <button type="submit" className="primary-button">Buscar filme</button>
          </div>
        </form>
      )}

      {route.view === "favorites" && (
        <div className="favorites-filters">
          <form className="favorite-query-form" role="search" aria-label="Filtrar favoritos"
            onSubmit={handleFavoriteFilter}>
            <label>Filtrar favoritos pelo título
              <input type="search" value={favoritesQuery} maxLength={200}
                onChange={(event) => setFavoritesQuery(event.target.value)} />
            </label>
            <button type="submit" className="primary-button">Aplicar filtros</button>
          </form>
          <label>Ordenar favoritos
            <select value={route.sort}
              onChange={(event) => navigate({ ...route, sort: event.target.value, page: 1 })}>
              <option value="title.asc">Título A–Z</option>
              <option value="title.desc">Título Z–A</option>
              <option value="release.desc">Lançamento mais recente</option>
            </select>
          </label>
        </div>
      )}
    </>
  );
}

export default CatalogControls;
