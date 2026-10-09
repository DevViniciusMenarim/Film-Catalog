const { parseStoredId, logError } = require("../lib/common");
const {
  normalizeMovie,
  normalizeMoviePage,
  normalizeGenres,
  fallbackMovie,
  isCatalogMovieId,
} = require("../lib/movie");

async function searchMovies(catalog, query, page, year) {
  const response = await catalog.get("/search/movie", {
    params: { query, page, ...(year === null ? {} : { year }) },
  });
  return normalizeMoviePage(response.data, page);
}

async function discoverMovies(catalog, { page, sort, genre, year }) {
  const response = await catalog.get("/discover/movie", {
    params: {
      page,
      sort_by: sort,
      ...(genre === null ? {} : { with_genres: genre }),
      ...(year === null ? {} : { primary_release_year: year }),
    },
  });
  return normalizeMoviePage(response.data, page);
}

async function getGenres(catalog) {
  const response = await catalog.get("/genre/movie/list");
  return normalizeGenres(response.data);
}

async function getMovie(catalog, id, detail = false) {
  const response = detail
    ? await catalog.get(`/movie/${id}`, {
      params: { append_to_response: "credits,release_dates,videos" },
    })
    : await catalog.get(`/movie/${id}`);
  return normalizeMovie(response.data, id, detail);
}

async function savedMovieSnapshot(catalog, id) {
  const movie = await getMovie(catalog, id);
  if (!movie) return null;
  // O título guardado no MySQL usa uma coluna VARCHAR(255).
  return {
    title: Array.from(movie.title).slice(0, 255).join(""),
    releaseDate: movie.release_date,
  };
}

class CatalogLookupError extends Error {
  constructor(cause) {
    super("Falha ao consultar a fonte de filmes.", { cause });
  }
}

async function getSavedMovieForWrite(catalog, id) {
  try {
    return await savedMovieSnapshot(catalog, id);
  } catch (error) {
    throw new CatalogLookupError(error);
  }
}

async function enrichMovie(row, catalog, logger, sourceName = "TMDB", catalogSource = "tmdb") {
  const id = parseStoredId(row.tmdb_id);
  const fallback = fallbackMovie(id ?? row.tmdb_id, row.title, row.release_date);
  if (id === null || id <= 0 || !isCatalogMovieId(id, catalogSource)) return fallback;
  try {
    const movie = await getMovie(catalog, id);
    return movie ? { ...movie, release_date: fallback.release_date ?? movie.release_date } : fallback;
  } catch (error) {
    // Filmes de outra fonte continuam visíveis com o título e a data salvos no MySQL.
    if (error?.response?.status !== 404) {
      logError(logger, `Erro no detalhe do filme ${id} no ${sourceName}:`, error);
    }
    return fallback;
  }
}

module.exports = {
  searchMovies,
  discoverMovies,
  getGenres,
  getMovie,
  savedMovieSnapshot,
  getSavedMovieForWrite,
  CatalogLookupError,
  enrichMovie,
};
