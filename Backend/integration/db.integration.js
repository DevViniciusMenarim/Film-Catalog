const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { once } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const { createApp } = require("../app");
const { migrate } = require("../db/migrate");

function testConnectionOptions() {
  if (!process.env.DB_TEST_USER) {
    throw new Error("Configure DB_TEST_USER para executar o teste de integração MySQL.");
  }
  const port = Number(process.env.DB_TEST_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_TEST_PORT inválido.");
  }
  return {
    host: process.env.DB_TEST_HOST || "127.0.0.1",
    port,
    user: process.env.DB_TEST_USER,
    password: process.env.DB_TEST_PASSWORD || "",
  };
}

async function withTemporaryDatabase(run) {
  const admin = await mysql.createConnection(testConnectionOptions());
  const database = "film_catalog_it_" + crypto.randomBytes(8).toString("hex");
  let created = false;
  let connection;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    created = true;
    connection = await mysql.createConnection({ ...testConnectionOptions(), database });
    await run(connection);
  } finally {
    if (connection) await connection.end();
    if (created) await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
}

test("migrações criam o esquema, preservam histórico e respeitam constraints", async () => {
  await withTemporaryDatabase(async (connection) => {
    assert.deepEqual(await migrate(connection), [
      "001_initial.js",
      "002_favorites_release_date.js",
      "003_watchlist_version.js",
    ]);
    assert.deepEqual(await migrate(connection), []);

    const [columns] = await connection.execute("SHOW COLUMNS FROM favorites");
    assert.ok(columns.some((column) => column.Field === "release_date"));
    assert.ok(columns.some((column) => column.Field === "release_date_checked"));
    await connection.execute("INSERT INTO favorites (tmdb_id, title) VALUES (?, ?)", [42, "Filme"]);
    const [favorites] = await connection.execute(
      "SELECT release_date, release_date_checked FROM favorites WHERE tmdb_id = ?", [42]
    );
    assert.equal(favorites[0].release_date, null);
    assert.equal(favorites[0].release_date_checked, 0);

    await assert.rejects(
      connection.execute(
        "INSERT INTO watchlist (tmdb_id, title, watch_status) VALUES (?, ?, ?)",
        [42, "Filme", "invalid"]
      ),
      (error) => error.errno === 3819
    );
    await connection.execute(
      "INSERT INTO watchlist (tmdb_id, title, watch_status) VALUES (?, ?, ?)",
      [42, "Filme", "want_to_watch"]
    );
    const [watchlist] = await connection.execute(
      "SELECT version FROM watchlist WHERE tmdb_id = ?", [42]
    );
    assert.equal(watchlist[0].version, 1);
  });
});

test("migração atualiza banco legado sem remover os filmes salvos", async () => {
  await withTemporaryDatabase(async (connection) => {
    await connection.query(`
      CREATE TABLE favorites (
        tmdb_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        PRIMARY KEY (tmdb_id)
      )
    `);
    const legacyWatchlist = fs.readFileSync(
      path.join(__dirname, "..", "db", "watchlist.sql"), "utf8"
    );
    await connection.query(legacyWatchlist);
    await connection.execute("INSERT INTO favorites (tmdb_id, title) VALUES (?, ?)", [7, "Legado"]);
    await connection.execute(
      "INSERT INTO watchlist (tmdb_id, title, watch_status) VALUES (?, ?, ?)",
      [8, "Lista antiga", "watched"]
    );

    await migrate(connection);
    const [favorites] = await connection.execute(
      "SELECT tmdb_id, title, release_date_checked FROM favorites WHERE tmdb_id = ?", [7]
    );
    const [watchlist] = await connection.execute(
      "SELECT tmdb_id, title, watch_status, version FROM watchlist WHERE tmdb_id = ?", [8]
    );
    assert.deepEqual(favorites.map((row) => ({ ...row })), [
      { tmdb_id: 7, title: "Legado", release_date_checked: 0 },
    ]);
    assert.deepEqual(watchlist.map((row) => ({ ...row })), [
      { tmdb_id: 8, title: "Lista antiga", watch_status: "watched", version: 1 },
    ]);
  });
});

test("rotas paginadas consultam o MySQL e ordenam após preencher datas antigas", async () => {
  await withTemporaryDatabase(async (connection) => {
    await migrate(connection);
    const emptyServer = createApp({
      db: connection,
      tmdb: { get: async () => { throw new Error("unexpected TMDB call"); } },
      logger: { error() {} },
    }).listen(0, "127.0.0.1");
    await once(emptyServer, "listening");
    try {
      const base = `http://127.0.0.1:${emptyServer.address().port}`;
      const response = await fetch(`${base}/favorites?page=1&pageSize=12`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        page: 1, pageSize: 12, totalPages: 0, totalCount: 0, items: [],
      });
    } finally {
      await new Promise((resolve, reject) => {
        emptyServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
    for (let id = 1; id <= 12; id++) {
      await connection.execute(
        `INSERT INTO favorites (tmdb_id, title, release_date, release_date_checked)
         VALUES (?, ?, ?, 1)`,
        [id, `Filme ${String(id).padStart(2, "0")}`, "2020-01-01"]
      );
    }
    for (let id = 1; id <= 7; id++) {
      await connection.execute(
        "INSERT INTO watchlist (tmdb_id, title) VALUES (?, ?)",
        [100 + id, `Lista ${id}`]
      );
    }

    const requests = [];
    const tmdb = {
      async get(path) {
        requests.push(path);
        const id = Number(path.split("/").at(-1));
        return { data: { id, title: `TMDB ${id}`, release_date: id === 99 ? "2025-01-01" : "2020-01-01" } };
      },
    };
    const server = createApp({ db: connection, tmdb, logger: { error() {} } })
      .listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const favorites = await (await fetch(`${base}/favorites?page=2&pageSize=5&sort=title.asc`)).json();
      assert.equal(favorites.totalCount, 12);
      assert.equal(favorites.totalPages, 3);
      assert.deepEqual(favorites.items.map((movie) => movie.id), [6, 7, 8, 9, 10]);
      assert.equal(requests.length, 5, "somente filmes da página consultam o TMDB");

      const filtered = await (await fetch(`${base}/favorites?page=1&pageSize=5&q=Filme%2001`)).json();
      assert.equal(filtered.totalCount, 1);
      assert.deepEqual(filtered.items.map((movie) => movie.id), [1]);

      const watchlist = await (await fetch(`${base}/watchlist?page=1&pageSize=5`)).json();
      assert.equal(watchlist.totalCount, 7);
      assert.equal(watchlist.items.length, 5);
      assert.equal(watchlist.items[0].version, 1);

      const updateHeaders = { "Content-Type": "application/json", "If-Match": '"1"' };
      const firstUpdate = await fetch(`${base}/watchlist/101`, {
        method: "PATCH",
        headers: updateHeaders,
        body: JSON.stringify({ notes: "Primeira edição" }),
      });
      assert.equal(firstUpdate.status, 200);
      const staleUpdate = await fetch(`${base}/watchlist/101`, {
        method: "PATCH",
        headers: updateHeaders,
        body: JSON.stringify({ notes: "Edição atrasada" }),
      });
      assert.equal(staleUpdate.status, 409);
      const [updatedWatchlist] = await connection.execute(
        "SELECT notes, version FROM watchlist WHERE tmdb_id = ?", [101]
      );
      assert.deepEqual(updatedWatchlist.map((row) => ({ ...row })), [
        { notes: "Primeira edição", version: 2 },
      ]);

      await connection.execute("INSERT INTO favorites (tmdb_id, title) VALUES (?, ?)", [99, "Antigo"]);
      const byReleaseResponse = await fetch(`${base}/favorites?page=1&pageSize=5&sort=release.desc`);
      assert.equal(byReleaseResponse.status, 200);
      const byRelease = await byReleaseResponse.json();
      assert.equal(byRelease.items[0].id, 99);
      const [backfilled] = await connection.execute(
        "SELECT release_date_checked FROM favorites WHERE tmdb_id = ?", [99]
      );
      assert.equal(backfilled[0].release_date_checked, 1);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
