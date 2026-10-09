const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const migrationsDir = path.join(__dirname, "migrations");

async function migrate(connection, directory = migrationsDir) {
  const [databaseRows] = await connection.query("SELECT DATABASE() AS name");
  const databaseName = databaseRows[0]?.name;
  if (!databaseName) throw new Error("Selecione um banco antes de executar as migrações.");

  const lockName = "film_catalog_migrations_" + crypto
    .createHash("sha256").update(databaseName).digest("hex").slice(0, 16);
  const [lockRows] = await connection.execute("SELECT GET_LOCK(?, 15) AS acquired", [lockName]);
  if (lockRows[0]?.acquired !== 1) throw new Error("Não foi possível obter o bloqueio das migrações.");

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) NOT NULL PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [rows] = await connection.query("SELECT version, checksum FROM schema_migrations");
    const applied = new Map(rows.map((row) => [row.version, row.checksum]));
    const files = fs.readdirSync(directory)
      .filter((file) => /^\d+_[a-z0-9_]+\.js$/.test(file))
      .sort();
    const newlyApplied = [];

    for (const file of files) {
      const absolute = path.join(directory, file);
      // Git may check out the same migration with LF or CRLF on different hosts.
      const source = fs.readFileSync(absolute, "utf8").replace(/\r\n?/g, "\n");
      const checksum = crypto.createHash("sha256").update(source).digest("hex");
      if (applied.has(file)) {
        if (applied.get(file) !== checksum) {
          throw new Error(`A migração ${file} foi alterada após sua aplicação.`);
        }
        continue;
      }

      // MySQL commits DDL implicitly. Each migration must be safe to retry if
      // the process stops before its version is recorded below.
      const migration = require(absolute);
      if (typeof migration.up !== "function") throw new Error(`Migração inválida: ${file}`);
      await migration.up(connection);
      await connection.execute(
        "INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)",
        [file, checksum]
      );
      newlyApplied.push(file);
    }
    return newlyApplied;
  } finally {
    await connection.execute("SELECT RELEASE_LOCK(?)", [lockName]);
  }
}

async function main() {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const mysql = require("mysql2/promise");
  if (!process.env.DB_USER || !process.env.DB_DATABASE) {
    throw new Error("Configure DB_USER e DB_DATABASE no Backend/.env.");
  }
  const port = process.env.DB_PORT === undefined ? 3306 : Number(process.env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT deve ser um inteiro entre 1 e 65535.");
  }
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE,
  });
  try {
    const newlyApplied = await migrate(connection);
    console.log(newlyApplied.length
      ? `Migrações aplicadas: ${newlyApplied.join(", ")}`
      : "Banco atualizado: nenhuma migração pendente.");
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Falha ao aplicar migrações:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { migrate };
