const SORT_COLUMNS = {
  "title.asc": "title ASC, tmdb_id ASC",
  "title.desc": "title DESC, tmdb_id ASC",
  "release.desc": "release_date IS NULL ASC, release_date DESC, title ASC, tmdb_id ASC",
};

function isFavoriteSort(sort) {
  return Object.hasOwn(SORT_COLUMNS, sort);
}

async function getFavoriteIds(db) {
  const [rows] = await db.execute("SELECT tmdb_id FROM favorites ORDER BY tmdb_id");
  return rows;
}

async function getUncheckedFavoriteIds(db, q) {
  const filter = q ? " AND LOCATE(?, title) > 0" : "";
  const [rows] = await db.execute(
    `SELECT tmdb_id FROM favorites WHERE release_date_checked = 0${filter}`,
    q ? [q] : []
  );
  return rows;
}

async function markReleaseDateChecked(db, id, releaseDate) {
  await db.execute(
    "UPDATE favorites SET release_date = ?, release_date_checked = 1 WHERE tmdb_id = ? AND release_date_checked = 0",
    [releaseDate, id]
  );
}

async function listFavorites(db, pagination, q, sort) {
  const filter = q ? " WHERE LOCATE(?, title) > 0" : "";
  const values = q ? [q] : [];
  const [counts] = await db.execute(`SELECT COUNT(*) AS totalCount FROM favorites${filter}`, values);
  // mysql2 binds JavaScript numbers as DOUBLE; MySQL rejects that type for LIMIT/OFFSET.
  // Pagination bounds these integers before they are interpolated.
  const [rows] = await db.execute(
    `SELECT tmdb_id, title, DATE_FORMAT(release_date, '%Y-%m-%d') AS release_date, release_date_checked ` +
      `FROM favorites${filter} ORDER BY ${SORT_COLUMNS[sort]} ` +
      `LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}`,
    values
  );
  return { rows, count: counts[0]?.totalCount };
}

async function insertFavorite(db, id, title, releaseDate) {
  await db.execute(
    "INSERT INTO favorites (tmdb_id, title, release_date, release_date_checked) VALUES (?, ?, ?, 1)",
    [id, title, releaseDate]
  );
}

async function deleteFavorite(db, id) {
  const [result] = await db.execute("DELETE FROM favorites WHERE tmdb_id = ?", [id]);
  return result.affectedRows;
}

module.exports = {
  isFavoriteSort,
  getFavoriteIds,
  getUncheckedFavoriteIds,
  markReleaseDateChecked,
  listFavorites,
  insertFavorite,
  deleteFavorite,
};
