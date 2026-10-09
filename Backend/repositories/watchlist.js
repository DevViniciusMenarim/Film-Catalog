async function getWatchlistIds(db) {
  const [rows] = await db.execute("SELECT tmdb_id FROM watchlist ORDER BY tmdb_id");
  return rows;
}

async function listWatchlist(db, pagination) {
  const [counts] = await db.execute("SELECT COUNT(*) AS totalCount FROM watchlist");
  // mysql2 sends bound numbers as DOUBLE, which MySQL rejects in LIMIT.
  // Pagination bounds both integers before they are interpolated.
  const sql = "SELECT tmdb_id, title, watch_status, " +
    "DATE_FORMAT(watched_at, '%Y-%m-%d') AS watched_at, " +
    "personal_rating, notes, added_at, version " +
    "FROM watchlist ORDER BY added_at DESC, tmdb_id DESC" +
    ` LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}`;
  const [rows] = await db.execute(sql);
  return { rows, count: counts[0]?.totalCount };
}

async function insertWatchlist(db, id, title, status) {
  await db.execute(
    "INSERT INTO watchlist (tmdb_id, title, watch_status) VALUES (?, ?, ?)",
    [id, title, status]
  );
}

async function updateWatchlist(db, id, changes, values, requiresWatchedStatus, version) {
  const [result] = await db.execute(
    `UPDATE watchlist SET ${changes.join(", ")}, version = version + 1 WHERE tmdb_id = ? AND version = ?` +
      (requiresWatchedStatus ? " AND watch_status = 'watched'" : ""),
    [...values, id, version]
  );
  return result.affectedRows;
}

async function findWatchlistStatus(db, id) {
  const [rows] = await db.execute(
    "SELECT tmdb_id, watch_status, version FROM watchlist WHERE tmdb_id = ?",
    [id]
  );
  return rows[0] ?? null;
}

async function deleteWatchlist(db, id) {
  const [result] = await db.execute("DELETE FROM watchlist WHERE tmdb_id = ?", [id]);
  return result.affectedRows;
}

module.exports = {
  getWatchlistIds,
  listWatchlist,
  insertWatchlist,
  updateWatchlist,
  findWatchlistStatus,
  deleteWatchlist,
};
