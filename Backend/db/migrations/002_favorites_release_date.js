async function hasColumn(connection, column) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favorites' AND COLUMN_NAME = ?`,
    [column]
  );
  return Number(rows[0].count) > 0;
}

async function up(connection) {
  if (!(await hasColumn(connection, "release_date"))) {
    await connection.query("ALTER TABLE favorites ADD COLUMN release_date DATE NULL");
  }
  if (!(await hasColumn(connection, "release_date_checked"))) {
    await connection.query(
      "ALTER TABLE favorites ADD COLUMN release_date_checked TINYINT(1) NOT NULL DEFAULT 0"
    );
  }
  const [indexes] = await connection.execute(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favorites'
       AND INDEX_NAME = 'idx_favorites_release_date'`
  );
  if (Number(indexes[0].count) === 0) {
    await connection.query("CREATE INDEX idx_favorites_release_date ON favorites (release_date)");
  }
}

module.exports = { up };
