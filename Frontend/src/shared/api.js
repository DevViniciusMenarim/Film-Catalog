export class ApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const textOrEmpty = (value) => typeof value === "string" ? value : "";
const imagePathOrNull = (value) => typeof value === "string" &&
  /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(value) ? value : null;
const optionalText = (value) => typeof value === "string" && value.trim() ? value.trim() : null;

function movieFrom(value) {
  if (!value || !positiveId(value.id) || typeof value.title !== "string" || !value.title.trim()) {
    throw new ApiError("Resposta de filme inválida.");
  }
  return {
    ...value,
    overview: textOrEmpty(value.overview),
    poster_path: imagePathOrNull(value.poster_path),
    backdrop_path: imagePathOrNull(value.backdrop_path),
    release_date: textOrEmpty(value.release_date),
    vote_average: Number.isFinite(value.vote_average) ? value.vote_average : 0,
  };
}

function watchlistEntryFrom(value) {
  if (!value || !positiveId(value.tmdb_id) || typeof value.title !== "string"
    || !["want_to_watch", "watched"].includes(value.watch_status)
    || !positiveId(value.version)) {
    throw new ApiError("Resposta da lista pessoal inválida.");
  }
  const movie = value.movie == null
    ? movieFrom({ id: value.tmdb_id, title: value.title })
    : movieFrom({ ...value.movie, id: value.tmdb_id, title: value.movie.title || value.title });
  return { ...value, movie };
}

function pageFrom(value, parseItem, label) {
  if (!value || !Array.isArray(value.items)
    || !Number.isInteger(value.page) || value.page < 1
    || !Number.isInteger(value.pageSize) || value.pageSize < 1
    || !Number.isInteger(value.totalPages) || value.totalPages < 0
    || !Number.isInteger(value.totalCount) || value.totalCount < 0) {
    throw new ApiError("Resposta de " + label + " inválida.");
  }
  return { ...value, items: value.items.map(parseItem) };
}

export function createApiClient({ baseUrl = "/api", fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Uma implementação de fetch é necessária.");
  }

  const root = (baseUrl || "/api").replace(/\/+$/, "");

  const request = async (path, options) => {
    const response = await fetchImpl(root + path, options);
    let data = null;

    if (response.status !== 204) {
      try {
        data = await response.json();
      } catch {
        if (response.ok) {
          throw new ApiError("Resposta inválida da API.", response.status);
        }
      }
    }

    if (!response.ok) {
      const message = typeof data?.message === "string"
        ? data.message
        : "Erro HTTP " + response.status;
      throw new ApiError(message, response.status);
    }

    return data;
  };

  const readPage = async (path, signal) => {
    const data = await request(path, { signal });
    if (!Array.isArray(data?.results)
      || !Number.isInteger(data.page) || data.page < 1
      || !Number.isInteger(data.total_pages) || data.total_pages < 0) {
      throw new ApiError("Resposta de filmes inválida.");
    }
    return { ...data, results: data.results.map(movieFrom) };
  };

  const readList = async (path, signal, label, parseItem) => {
    const data = await request(path, { signal });
    if (!Array.isArray(data)) {
      throw new ApiError("Resposta de " + label + " inválida.");
    }
    return data.map(parseItem);
  };

  const readIds = (path, signal, label) => readList(path, signal, label, (value) => {
    if (!positiveId(value)) throw new ApiError("Resposta de " + label + " inválida.");
    return value;
  });

  return {
    async getCatalogInfo({ signal } = {}) {
      const data = await request("/catalog-info", { signal });
      if (!["demo", "tmdb"].includes(data?.source)) {
        throw new ApiError("Informações do catálogo inválidas.");
      }
      return { source: data.source };
    },

    searchMovies(query, { signal, page = 1, year = "" } = {}) {
      const params = new URLSearchParams({ movie_query: query, page: String(page) });
      if (year) params.set("year", String(year));
      return readPage("/search?" + params, signal);
    },

    discoverMovies({ signal, page = 1, genre = "", year = "", sort = "" } = {}) {
      const params = new URLSearchParams({ page: String(page) });
      if (genre) params.set("genre", String(genre));
      if (year) params.set("year", String(year));
      if (sort) params.set("sort", sort);
      return readPage("/discover?" + params, signal);
    },

    async getGenres({ signal } = {}) {
      const data = await request("/genres", { signal });
      if (!Array.isArray(data?.genres) || data.genres.some((genre) =>
        !positiveId(genre?.id) || typeof genre.name !== "string")) {
        throw new ApiError("Resposta de gêneros inválida.");
      }
      return data.genres;
    },

    async getMovieDetails(tmdbId, { signal } = {}) {
      const data = await request("/movies/" + encodeURIComponent(tmdbId), { signal });
      const movie = movieFrom(data);
      if (movie.id !== Number(tmdbId)) throw new ApiError("Resposta de detalhes inválida.");
      if (data.genres != null && (!Array.isArray(data.genres)
        || data.genres.some((genre) => !positiveId(genre?.id) || typeof genre.name !== "string"))) {
        throw new ApiError("Resposta de detalhes inválida.");
      }
      return { ...movie, runtime: Number.isFinite(data.runtime) ? data.runtime : null,
        genres: data.genres || [], tagline: textOrEmpty(data.tagline),
        original_title: textOrEmpty(data.original_title),
        original_language: textOrEmpty(data.original_language),
        director: optionalText(data.director),
        cast: Array.isArray(data.cast)
          ? data.cast.map(optionalText).filter(Boolean).slice(0, 5) : [],
        certification_br: optionalText(data.certification_br),
        trailer_key: typeof data.trailer_key === "string" &&
          /^[A-Za-z0-9_-]{11}$/.test(data.trailer_key) ? data.trailer_key : null };
    },

    async getFavoritesPage({ signal, page = 1, pageSize = 12, q = "", sort = "title.asc" } = {}) {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort });
      if (q) params.set("q", q);
      return pageFrom(await request("/favorites?" + params, { signal }), movieFrom, "favoritos");
    },

    getFavoriteIds({ signal } = {}) {
      return readIds("/favorites/ids", signal, "IDs favoritos");
    },

    saveFavorite(movie) {
      return request("/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdb_id: movie.id }),
      });
    },

    deleteFavorite(tmdbId) {
      return request("/favorites/" + encodeURIComponent(tmdbId), { method: "DELETE" });
    },

    async getWatchlistPage({ signal, page = 1, pageSize = 12 } = {}) {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      return pageFrom(await request("/watchlist?" + params, { signal }), watchlistEntryFrom, "minha lista");
    },

    getWatchlistIds({ signal } = {}) {
      return readIds("/watchlist/ids", signal, "IDs da lista");
    },

    addToWatchlist(movie) {
      return request("/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdb_id: movie.id, watch_status: "want_to_watch" }),
      });
    },

    updateWatchlist(tmdbId, changes, version) {
      return request("/watchlist/" + encodeURIComponent(tmdbId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": `"${version}"` },
        body: JSON.stringify(changes),
      });
    },

    deleteWatchlist(tmdbId) {
      return request("/watchlist/" + encodeURIComponent(tmdbId), { method: "DELETE" });
    },
  };
}
