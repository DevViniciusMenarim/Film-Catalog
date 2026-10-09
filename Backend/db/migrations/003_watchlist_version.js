async function up(connection) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'watchlist' AND COLUMN_NAME = 'version'`
  );
  if (Number(rows[0]?.count) === 0) {
    await connection.query(
      "ALTER TABLE watchlist ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1"
    );
  }
}

module.exports = { up };
