const { TMDB_DETAIL_CONCURRENCY, parseStoredId, mapWithConcurrency } = require("../lib/common");
const { catalogSourceName } = require("../lib/movie");
const { getSavedMovieForWrite, enrichMovie } = require("./catalogMovies");
const {
  getWatchlistIds,
  listWatchlist,
  insertWatchlist,
  updateWatchlist,
  findWatchlistStatus,
  deleteWatchlist,
} = require("../repositories/watchlist");

function createWatchlistService({ db, tmdb, logger, catalogSource }) {
  const sourceName = catalogSourceName(catalogSource);

  return {
    async listIds() {
      const rows = await getWatchlistIds(db);
      return rows.map((row) => parseStoredId(row.tmdb_id));
    },

    async list(pagination) {
      const result = await listWatchlist(db, pagination);
      const items = await mapWithConcurrency(
        result.rows,
        TMDB_DETAIL_CONCURRENCY,
        async (row) => {
          const id = parseStoredId(row.tmdb_id);
          const movie = await enrichMovie(row, tmdb, logger, sourceName, catalogSource);
          return {
            tmdb_id: id ?? row.tmdb_id,
            title: row.title,
            watch_status: row.watch_status,
            watched_at: row.watched_at ?? null,
            personal_rating: row.personal_rating ?? null,
            notes: row.notes ?? null,
            added_at: row.added_at,
            version: Number(row.version),
            movie,
          };
        }
      );
      return { items, count: result.count };
    },

    async add(id, status) {
      const snapshot = await getSavedMovieForWrite(tmdb, id);
      if (!snapshot) return false;
      await insertWatchlist(db, id, snapshot.title, status);
      return true;
    },

    async update(id, { changes, values, requiresWatchedStatus, version }) {
      const affectedRows = await updateWatchlist(db, id, changes, values, requiresWatchedStatus, version);
      if (affectedRows > 0) return "updated";
      const row = await findWatchlistStatus(db, id);
      if (!row) return "missing";
      if (Number(row.version) !== version) return "conflict";
      if (requiresWatchedStatus && row.watch_status !== "watched") return "requires-watched";
      return "conflict";
    },

    remove(id) {
      return deleteWatchlist(db, id);
    },
  };
}

module.exports = { createWatchlistService };
