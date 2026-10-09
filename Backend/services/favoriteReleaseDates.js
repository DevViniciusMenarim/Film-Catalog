const { TMDB_DETAIL_CONCURRENCY, parseStoredId, logError, mapWithConcurrency } = require("../lib/common");
const { isCatalogMovieId } = require("../lib/movie");
const { getMovie } = require("./catalogMovies");
const { isLegacyDemoMovieId } = require("../lib/demoCatalog");
const { getUncheckedFavoriteIds, markReleaseDateChecked } = require("../repositories/favorites");

// Check every matching legacy row before pagination, so sorting uses complete dates.
async function backfillReleaseDates(db, tmdb, logger, q, sourceName, catalogSource) {
  const rows = await getUncheckedFavoriteIds(db, q);
  await mapWithConcurrency(rows, TMDB_DETAIL_CONCURRENCY, async (row) => {
    const id = parseStoredId(row.tmdb_id);
    if (id === null || id <= 0) {
      throw Object.assign(new Error("ID local inválido"), { upstream: false });
    }
    if (!isCatalogMovieId(id, catalogSource)) return;

    let movie;
    try {
      movie = await getMovie(tmdb, id);
      if (!movie) throw new Error(`Resposta inválida do ${sourceName}.`);
    } catch (error) {
      // Keep records from another source pending until that source is active again.
      if (error?.response?.status === 404) {
        if (catalogSource === "demo" || isLegacyDemoMovieId(id)) return;
        movie = null;
      } else {
        logError(logger, `Erro ao preencher data do filme ${id} no ${sourceName}:`, error);
        throw Object.assign(new Error(`Falha no ${sourceName} durante a ordenação.`, { cause: error }),
          { upstream: true });
      }
    }
    await markReleaseDateChecked(db, id, movie?.release_date ?? null);
  });
}

module.exports = { backfillReleaseDates };
