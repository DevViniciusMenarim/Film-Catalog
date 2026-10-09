const { TMDB_DETAIL_CONCURRENCY, parseStoredId, mapWithConcurrency } = require("../lib/common");
const { catalogSourceName } = require("../lib/movie");
const { getSavedMovieForWrite, enrichMovie } = require("./catalogMovies");
const { backfillReleaseDates } = require("./favoriteReleaseDates");
const {
  isFavoriteSort,
  getFavoriteIds,
  listFavorites,
  insertFavorite,
  deleteFavorite,
} = require("../repositories/favorites");

function createFavoritesService({ db, tmdb, logger, catalogSource }) {
  const sourceName = catalogSourceName(catalogSource);

  return {
    async listIds() {
      const rows = await getFavoriteIds(db);
      return rows.map((row) => parseStoredId(row.tmdb_id));
    },

    async list({ pagination, q, sort }) {
      if (sort === "release.desc") {
        await backfillReleaseDates(db, tmdb, logger, q, sourceName, catalogSource);
      }
      const result = await listFavorites(db, pagination, q, sort);
      const items = await mapWithConcurrency(
        result.rows,
        TMDB_DETAIL_CONCURRENCY,
        async (favorite) => {
          const movie = await enrichMovie(favorite, tmdb, logger, sourceName, catalogSource);
          // A busca e a ordenação usam o título e a data salvos no MySQL.
          return {
            ...movie,
            title: favorite.title,
            release_date: favorite.release_date ??
              (Number(favorite.release_date_checked) === 0 ? movie.release_date : null),
          };
        }
      );
      return { items, count: result.count };
    },

    async add(id) {
      const snapshot = await getSavedMovieForWrite(tmdb, id);
      if (!snapshot) return false;
      await insertFavorite(db, id, snapshot.title, snapshot.releaseDate);
      return true;
    },

    remove(id) {
      return deleteFavorite(db, id);
    },
  };
}

module.exports = { createFavoritesService, isFavoriteSort };
