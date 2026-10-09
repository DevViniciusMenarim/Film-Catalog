const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../app");

async function withServer(dependencies, run) {
  const server = createApp(dependencies).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

const quietLogger = { error() {} };

test("rota desconhecida responde 404 em JSON", async () => {
  await withServer({
    db: { execute: async () => { throw new Error("Acesso inesperado ao banco"); } },
    tmdb: { get: async () => { throw new Error("Acesso inesperado ao TMDB"); } },
    logger: quietLogger,
  }, async (base) => {
    const response = await fetch(`${base}/unknown`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await response.json(), { message: "Rota não encontrada." });
  });
});

test("JSON malformado e erro inesperado respondem sem detalhes internos", async () => {
  await withServer({
    db: { execute: async (sql) => sql.startsWith("SELECT COUNT")
      ? [[{ totalCount: -1 }]] : [[]] },
    tmdb: { get: async () => { throw new Error("Acesso inesperado ao TMDB"); } },
    logger: quietLogger,
  }, async (base) => {
    const malformed = await fetch(`${base}/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"tmdb_id":',
    });
    assert.equal(malformed.status, 400);
    assert.match(malformed.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await malformed.json(), { message: "JSON inválido." });

    const unexpected = await fetch(`${base}/favorites?page=1`);
    assert.equal(unexpected.status, 500);
    assert.match(unexpected.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await unexpected.json(), { message: "Erro interno do servidor." });
  });
});

test("search preserves special characters in the TMDB query", async () => {
  let requested;
  await withServer(
    {
      db: { execute: async () => [[]] },
      tmdb: {
        get: async (path, options) => {
          requested = { path, options };
          return { data: { results: [{ id: 1, title: "Tom & Jerry" }] } };
        },
      },
      logger: quietLogger,
    },
    async (base) => {
      const params = new URLSearchParams({ movie_query: "Tom & Jerry #1" });
      const response = await fetch(`${base}/search?${params}`);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).results, [
        { id: 1, title: "Tom & Jerry", overview: "", poster_path: null, backdrop_path: null,
          release_date: null, vote_average: null },
      ]);
    }
  );
  assert.equal(requested.path, "/search/movie");
  assert.equal(requested.options.params.query, "Tom & Jerry #1");
});

test("search rejects invalid query before contacting TMDB", async () => {
  let called = false;
  await withServer(
    {
      db: { execute: async () => [[]] },
      tmdb: { get: async () => { called = true; } },
      logger: quietLogger,
    },
    async (base) => {
      const response = await fetch(`${base}/search?movie_query=%20%20`);
      assert.equal(response.status, 400);
    }
  );
  assert.equal(called, false);
});

test("POST validates the TMDB ID and stores the trusted title", async () => {
  const inserts = [];
  await withServer(
    {
      db: {
        execute: async (sql, params) => {
          inserts.push({ sql, params });
          return [{ affectedRows: 1 }];
        },
      },
      tmdb: {
        get: async (path) => {
          assert.equal(path, "/movie/42");
          return { data: { id: 42, title: "Título do TMDB" } };
        },
      },
      logger: quietLogger,
    },
    async (base) => {
      const invalid = await fetch(`${base}/favorites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdb_id: "42 OR 1=1", title: "Falso" }),
      });
      assert.equal(invalid.status, 400);

      const valid = await fetch(`${base}/favorites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdb_id: 42, title: "Falso" }),
      });
      assert.equal(valid.status, 201);
    }
  );
  assert.equal(inserts.length, 1);
  assert.deepEqual(inserts[0].params, [42, "Título do TMDB", null]);
  assert.match(inserts[0].sql, /release_date_checked/);
});

test("POST reports missing movies and duplicate favorites accurately", async () => {
  let writes = 0;
  await withServer(
    {
      db: {
        execute: async () => {
          writes++;
          const error = new Error("duplicate");
          error.code = "ER_DUP_ENTRY";
          throw error;
        },
      },
      tmdb: {
        get: async (path) => {
          if (path === "/movie/99") {
            const error = new Error("not found");
            error.response = { status: 404 };
            throw error;
          }
          return { data: { id: 42, title: "Filme" } };
        },
      },
      logger: quietLogger,
    },
    async (base) => {
      const post = (id) => fetch(`${base}/favorites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdb_id: id }),
      });
      assert.equal((await post(99)).status, 404);
      assert.equal((await post(42)).status, 409);
    }
  );
  assert.equal(writes, 1);
});

test("favorites retain order, use local fallback, and limit TMDB concurrency", async () => {
  let active = 0;
  let maxActive = 0;
  const queries = [];
  const favorites = Array.from({ length: 9 }, (_, index) => ({
    tmdb_id: index + 1,
    title: `Local ${index + 1}`,
  }));

  await withServer(
    {
      db: { execute: async (sql) => {
        queries.push(sql);
        return sql.startsWith("SELECT COUNT")
          ? [[{ totalCount: favorites.length }]] : [favorites];
      } },
      tmdb: {
        get: async (path) => {
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 10));
          active--;
          const id = Number(path.split("/").at(-1));
          if (id === 2) throw new Error("upstream failure");
          return { data: { id, title: `TMDB ${id}` } };
        },
      },
      logger: quietLogger,
    },
    async (base) => {
      const response = await fetch(`${base}/favorites`);
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.deepEqual([result.page, result.pageSize, result.totalCount], [1, 12, 9]);
      const movies = result.items;
      assert.deepEqual(movies.map((movie) => movie.id), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
      assert.deepEqual(movies[1], {
        id: 2,
        title: "Local 2",
        overview: "",
        poster_path: null,
        backdrop_path: null,
        release_date: null,
        vote_average: null,
      });
      assert.equal(movies[0].title, "Local 1");
    }
  );
  assert.ok(maxActive <= 4);
  assert.ok(maxActive > 1);
  assert.match(queries[1], /LIMIT 12 OFFSET 0$/);
});

test("DELETE returns 404 when no row was removed", async () => {
  await withServer(
    {
      db: { execute: async () => [{ affectedRows: 0 }] },
      tmdb: { get: async () => { throw new Error("unused"); } },
      logger: quietLogger,
    },
    async (base) => {
      const response = await fetch(`${base}/favorites/42`, { method: "DELETE" });
      assert.equal(response.status, 404);
    }
  );
});

test("error logging does not include request secrets", async () => {
  const messages = [];
  await withServer(
    {
      db: { execute: async () => [[]] },
      tmdb: {
        get: async () => {
          const error = new Error("api_key=secret-token");
          error.config = { params: { api_key: "secret-token" } };
          error.response = { status: 503 };
          throw error;
        },
      },
      logger: { error: (...args) => messages.push(args) },
    },
    async (base) => {
      const response = await fetch(`${base}/search?movie_query=test`);
      assert.equal(response.status, 502);
    }
  );
  assert.equal(messages.length, 1);
  assert.ok(!JSON.stringify(messages).includes("secret-token"));
});

test("TMDB authentication failures explain the credential problem without exposing secrets", async () => {
  const messages = [];
  let upstreamStatus = 401;
  const secret = "secret-token";
  await withServer({
    db: { execute: async (sql) => {
      if (sql.startsWith("SELECT tmdb_id FROM favorites WHERE release_date_checked")) {
        return [[{ tmdb_id: 42 }]];
      }
      throw new Error(`Unexpected database call: ${sql}`);
    } },
    tmdb: { get: async () => {
      const error = new Error(`api_key=${secret}`);
      error.response = { status: upstreamStatus };
      error.config = { params: { api_key: secret } };
      throw error;
    } },
    logger: { error: (...args) => messages.push(args) },
  }, async (base) => {
    const requests = [
      ["/search?movie_query=filme", 401],
      ["/discover", 403],
      ["/genres", 401],
      ["/movies/42", 403],
      ["/favorites?sort=release.desc", 401],
    ];
    for (const [path, status] of requests) {
      upstreamStatus = status;
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 502, path);
      assert.deepEqual(await response.json(), {
        message: "Credenciais do TMDB inválidas ou sem permissão. Verifique TMDB_API_KEY.",
      }, path);
    }
    for (const [path, body, status] of [
      ["/favorites", { tmdb_id: 42 }, 401],
      ["/watchlist", { tmdb_id: 42, watch_status: "want_to_watch" }, 403],
    ]) {
      upstreamStatus = status;
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 502, path);
      assert.deepEqual(await response.json(), {
        message: "Credenciais do TMDB inválidas ou sem permissão. Verifique TMDB_API_KEY.",
      }, path);
    }
  });
  assert.ok(!JSON.stringify(messages).includes(secret));
});

test("CORS is disabled by default and limited to an explicit origin", async () => {
  const dependencies = {
    db: { execute: async () => [[]] },
    tmdb: { get: async () => ({ data: { results: [] } }) },
    logger: quietLogger,
  };
  await withServer(dependencies, async (base) => {
    const response = await fetch(`${base}/search?movie_query=x`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
  await withServer(
    { ...dependencies, frontendOrigin: "http://localhost:5173" },
    async (base) => {
      const response = await fetch(`${base}/search?movie_query=x`, {
        headers: { Origin: "http://localhost:5173" },
      });
      assert.equal(
        response.headers.get("access-control-allow-origin"),
        "http://localhost:5173"
      );
    }
  );
});

test("search and discover forward validated pagination and filters", async () => {
  const requests = [];
  const envelope = { page: 2, results: [{ id: 42, title: "Filme" }], total_pages: 3, total_results: 50 };
  const normalizedEnvelope = { ...envelope, results: [{ id: 42, title: "Filme",
    overview: "", poster_path: null, backdrop_path: null, release_date: null,
    vote_average: null }] };
  await withServer(
    {
      db: { execute: async () => [[]] },
      tmdb: {
        get: async (path, options) => {
          requests.push({ path, options });
          return { data: envelope };
        },
      },
      logger: quietLogger,
    },
    async (base) => {
      const search = await fetch(`${base}/search?movie_query=Matrix&page=2&year=1999`);
      assert.equal(search.status, 200);
      assert.deepEqual(await search.json(), normalizedEnvelope);

      const discover = await fetch(
        `${base}/discover?page=2&genre=28&year=2024&sort=vote_average.desc`
      );
      assert.equal(discover.status, 200);
      assert.deepEqual(await discover.json(), normalizedEnvelope);

      for (const path of [
        "/search?movie_query=x&page=0",
        "/search?movie_query=x&year=twenty",
        "/discover?genre=28%20OR%201%3D1",
        "/discover?sort=title.asc",
        "/discover?page=501",
      ]) {
        assert.equal((await fetch(`${base}${path}`)).status, 400, path);
      }
    }
  );

  assert.deepEqual(requests, [
    { path: "/search/movie", options: { params: { query: "Matrix", page: 2, year: 1999 } } },
    {
      path: "/discover/movie",
      options: {
        params: {
          page: 2,
          sort_by: "vote_average.desc",
          with_genres: 28,
          primary_release_year: 2024,
        },
      },
    },
  ]);
});

test("genres and movie details expose TMDB data with appropriate errors", async () => {
  const requests = [];
  await withServer(
    {
      db: { execute: async () => [[]] },
      tmdb: {
        get: async (path, options) => {
          requests.push({ path, options });
          if (path === "/genre/movie/list") {
            return { data: { genres: [{ id: 28, name: "Ação" }] } };
          }
          if (path === "/movie/404") {
            const error = new Error("missing");
            error.response = { status: 404 };
            throw error;
          }
          return { data: { id: 42, title: "Filme", runtime: 120 } };
        },
      },
      logger: quietLogger,
    },
    async (base) => {
      assert.deepEqual(await (await fetch(`${base}/genres`)).json(), {
        genres: [{ id: 28, name: "Ação" }],
      });
      assert.deepEqual(await (await fetch(`${base}/movies/42`)).json(), {
        id: 42,
        title: "Filme",
        overview: "",
        poster_path: null,
        backdrop_path: null,
        release_date: null,
        vote_average: null,
        runtime: 120,
        genres: [],
        tagline: "",
        original_title: null,
        original_language: null,
        director: null,
        cast: [],
        certification_br: null,
        trailer_key: null,
      });
      assert.equal((await fetch(`${base}/movies/0`)).status, 400);
      assert.equal((await fetch(`${base}/movies/404`)).status, 404);
    }
  );
  assert.deepEqual(requests, [
    { path: "/genre/movie/list", options: undefined },
    { path: "/movie/42", options: { params: {
      append_to_response: "credits,release_dates,videos" } } },
    { path: "/movie/404", options: { params: {
      append_to_response: "credits,release_dates,videos" } } },
  ]);
});

test("movie details select safe media, key credits, Brazilian rating and trailer", async () => {
  const calls = [];
  await withServer({
    db: { execute: async () => [[]] },
    tmdb: { get: async (path, options) => {
      calls.push({ path, options });
      return { data: {
        id: 42, title: "Filme", original_title: "Original Title",
        original_language: "en", poster_path: "/poster.jpg", backdrop_path: "/wide.jpg",
        credits: {
          crew: [{ job: "Producer", name: "Produtor" },
            { job: "Director", name: "Diretora" },
            { job: "Director", name: "Codiretor" }],
          cast: ["Ator 1", "Ator 2", "Ator 3", "Ator 4", "Ator 5", "Ator 6"]
            .map((name) => ({ name })),
        },
        release_dates: { results: [{ iso_3166_1: "US", release_dates: [
          { type: 3, certification: "PG-13" }] }, { iso_3166_1: "BR", release_dates: [
          { type: 4, certification: "14" }, { type: 3, certification: "12" }] }] },
        videos: { results: [
          { site: "YouTube", type: "Teaser", key: "teaser12345" },
          { site: "YouTube", type: "Trailer", key: "validEn1234", official: false,
            iso_639_1: "en" },
          { site: "YouTube", type: "Trailer", key: "validPt1234", official: true,
            iso_639_1: "pt" },
        ] },
        belongs_to_collection: { internal: "not exposed" },
      } };
    } },
    logger: quietLogger,
  }, async (base) => {
    const movie = await (await fetch(`${base}/movies/42`)).json();
    assert.equal(movie.poster_path, "/poster.jpg");
    assert.equal(movie.backdrop_path, "/wide.jpg");
    assert.equal(movie.original_title, "Original Title");
    assert.equal(movie.original_language, "en");
    assert.equal(movie.director, "Diretora / Codiretor");
    assert.deepEqual(movie.cast, ["Ator 1", "Ator 2", "Ator 3", "Ator 4", "Ator 5"]);
    assert.equal(movie.certification_br, "12");
    assert.equal(movie.trailer_key, "validPt1234");
    assert.equal(movie.credits, undefined);
    assert.equal(movie.release_dates, undefined);
    assert.equal(movie.videos, undefined);
    assert.equal(movie.belongs_to_collection, undefined);
  });
  assert.deepEqual(calls, [{ path: "/movie/42", options: { params: {
    append_to_response: "credits,release_dates,videos" } } }]);
});

test("ID endpoints read local tables without contacting TMDB", async () => {
  const queries = [];
  await withServer(
    {
      db: {
        execute: async (sql) => {
          queries.push(sql);
          return [[{ tmdb_id: 4 }, { tmdb_id: 9 }]];
        },
      },
      tmdb: { get: async () => { throw new Error("unexpected TMDB call"); } },
      logger: quietLogger,
    },
    async (base) => {
      assert.deepEqual(await (await fetch(`${base}/favorites/ids`)).json(), [4, 9]);
      assert.deepEqual(await (await fetch(`${base}/watchlist/ids`)).json(), [4, 9]);
    }
  );
  assert.ok(queries[0].includes("FROM favorites"));
  assert.ok(queries[1].includes("FROM watchlist"));
});

test("watchlist enriches local entries, preserves metadata and uses a fallback", async () => {
  let active = 0;
  let maxActive = 0;
  const queries = [];
  const rows = Array.from({ length: 7 }, (_, index) => ({
    tmdb_id: index + 1,
    title: `Local ${index + 1}`,
    watch_status: index === 0 ? "watched" : "want_to_watch",
    watched_at: index === 0 ? "2024-05-01" : null,
    personal_rating: index === 0 ? 5 : null,
    notes: index === 0 ? "Gostei" : null,
    added_at: "2024-05-02T00:00:00.000Z",
    version: 1,
  }));

  await withServer(
    {
      db: {
        execute: async (sql) => {
          queries.push(sql);
          return sql.startsWith("SELECT COUNT")
            ? [[{ totalCount: rows.length }]] : [rows];
        },
      },
      tmdb: {
        get: async (path) => {
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active--;
          const id = Number(path.split("/").at(-1));
          if (id === 2) throw new Error("temporary outage");
          return { data: { id, title: `TMDB ${id}`, overview: "Detalhes" } };
        },
      },
      logger: quietLogger,
    },
    async (base) => {
      const response = await fetch(`${base}/watchlist`);
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.deepEqual([result.page, result.pageSize, result.totalCount], [1, 12, 7]);
      const items = result.items;
      assert.deepEqual(items.map((item) => item.tmdb_id), [1, 2, 3, 4, 5, 6, 7]);
      assert.equal(items[0].watched_at, "2024-05-01");
      assert.equal(items[0].personal_rating, 5);
      assert.equal(items[0].notes, "Gostei");
      assert.equal(items[0].version, 1);
      assert.equal(items[0].movie.title, "TMDB 1");
      assert.deepEqual(items[1].movie, {
        id: 2,
        title: "Local 2",
        overview: "",
        poster_path: null,
        backdrop_path: null,
        release_date: null,
        vote_average: null,
      });
    }
  );
  assert.ok(maxActive > 1 && maxActive <= 4);
  assert.match(queries[1], /ORDER BY added_at DESC, tmdb_id DESC LIMIT 12 OFFSET 0$/);
});

test("watchlist POST uses TMDB title and handles invalid and duplicate entries", async () => {
  const writes = [];
  await withServer(
    {
      db: {
        execute: async (sql, params) => {
          writes.push({ sql, params });
          if (params[0] === 43) {
            const error = new Error("duplicate");
            error.code = "ER_DUP_ENTRY";
            throw error;
          }
          return [{ affectedRows: 1 }];
        },
      },
      tmdb: { get: async (path) => ({ data: { id: Number(path.split("/").at(-1)), title: "Confiável" } }) },
      logger: quietLogger,
    },
    async (base) => {
      const post = (body) => fetch(`${base}/watchlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal((await post({ tmdb_id: 0, watch_status: "watched" })).status, 400);
      assert.equal((await post({ tmdb_id: 42, watch_status: "other" })).status, 400);
      assert.equal((await post({ tmdb_id: 42, watch_status: "watched", title: "Falso" })).status, 201);
      assert.equal((await post({ tmdb_id: 43, watch_status: "want_to_watch" })).status, 409);
    }
  );
  assert.deepEqual(writes[0].params, [42, "Confiável", "watched"]);
  assert.equal(writes.length, 2);
});

test("watchlist PATCH validates fields and uses parameterized updates", async () => {
  const writes = [];
  await withServer(
    {
      db: {
        execute: async (sql, params) => {
          writes.push({ sql, params });
          return [{ affectedRows: 1 }];
        },
      },
      tmdb: { get: async () => { throw new Error("unexpected TMDB call"); } },
      logger: quietLogger,
    },
    async (base) => {
      const patch = (body) => fetch(`${base}/watchlist/42`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": '"1"' },
        body: JSON.stringify(body),
      });
      for (const invalid of [
        {},
        { watch_status: "unknown" },
        { watched_at: "2024-02-30" },
        { watched_at: "0999-12-31" },
        { watched_at: new Date(Date.now() + 172800000).toISOString().slice(0, 10) },
        { watch_status: "want_to_watch", watched_at: "2024-02-29" },
        { watch_status: "want_to_watch", personal_rating: 5 },
        { personal_rating: 6 },
        { notes: "x".repeat(1001) },
        { title: "Client-supplied" },
      ]) {
        assert.equal((await patch(invalid)).status, 400);
      }
      const valid = await patch({
        watch_status: "watched",
        watched_at: "2024-02-29",
        personal_rating: 5,
        notes: "Muito bom",
      });
      assert.equal(valid.status, 200);
      assert.equal((await patch({ notes: null, personal_rating: null })).status, 200);
      assert.equal((await patch({ watch_status: "want_to_watch" })).status, 200);
    }
  );
  assert.equal(writes.length, 3);
  assert.deepEqual(writes[0].params, ["watched", "2024-02-29", 5, "Muito bom", 42, 1]);
  assert.ok(writes[0].sql.startsWith("UPDATE watchlist SET"));
  assert.ok(writes[0].sql.includes("version = version + 1 WHERE tmdb_id = ? AND version = ?"));
  assert.deepEqual(writes[1].params, [null, null, 42, 1]);
  assert.deepEqual(writes[2].params, ["want_to_watch", null, null, 42, 1]);
  assert.ok(writes[2].sql.includes("watched_at = ?"));
  assert.ok(writes[2].sql.includes("personal_rating = ?"));
});

test("date and rating updates require an item already marked watched", async () => {
  const statements = [];
  await withServer(
    {
      db: {
        execute: async (sql, params) => {
          statements.push({ sql, params });
          if (sql.startsWith("SELECT")) {
            return [[{ tmdb_id: 42, watch_status: "want_to_watch", version: 1 }]];
          }
          return [{ affectedRows: sql.includes("notes = ?") ? 1 : 0 }];
        },
      },
      tmdb: { get: async () => { throw new Error("unexpected TMDB call"); } },
      logger: quietLogger,
    },
    async (base) => {
      for (const body of [
        { watched_at: "2024-02-29" },
        { personal_rating: 4 },
      ]) {
        const response = await fetch(`${base}/watchlist/42`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "If-Match": '"1"' },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 400);
      }
      const notes = await fetch(`${base}/watchlist/42`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": '"1"' },
        body: JSON.stringify({ notes: "Quero ver" }),
      });
      assert.equal(notes.status, 200);
    }
  );
  assert.ok(statements[0].sql.endsWith("AND watch_status = 'watched'"));
  assert.deepEqual(statements[0].params, ["2024-02-29", 42, 1]);
  assert.ok(statements[2].sql.endsWith("AND watch_status = 'watched'"));
  assert.deepEqual(statements[2].params, [4, 42, 1]);
  assert.ok(!statements[4].sql.includes("AND watch_status = 'watched'"));
});

test("watchlist PATCH and DELETE report missing rows", async () => {
  await withServer(
    {
      db: {
        execute: async (sql) => sql.startsWith("SELECT")
          ? [[]]
          : [{ affectedRows: 0 }],
      },
      tmdb: { get: async () => { throw new Error("unexpected TMDB call"); } },
      logger: quietLogger,
    },
    async (base) => {
      const patch = await fetch(`${base}/watchlist/42`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": '"1"' },
        body: JSON.stringify({ notes: "Ainda não" }),
      });
      assert.equal(patch.status, 404);
      assert.equal((await fetch(`${base}/watchlist/42`, { method: "DELETE" })).status, 404);
      assert.equal((await fetch(`${base}/watchlist/nope`, { method: "DELETE" })).status, 400);
    }
  );
});

test("watchlist PATCH requires an exact version before touching the database", async () => {
  const statements = [];
  await withServer(
    {
      db: { execute: async (sql, params) => {
        statements.push({ sql, params });
        throw new Error("Database should not be accessed without a valid If-Match");
      } },
      tmdb: { get: async () => { throw new Error("unexpected TMDB call"); } },
      logger: quietLogger,
    },
    async (base) => {
      for (const ifMatch of [undefined, "1", 'W/"1"', '"0"', '"9007199254740992"']) {
        const headers = { "Content-Type": "application/json" };
        if (ifMatch !== undefined) headers["If-Match"] = ifMatch;
        const response = await fetch(`${base}/watchlist/42`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ notes: "Nova nota" }),
        });
        assert.equal(response.status, 428);
      }
    }
  );
  assert.equal(statements.length, 0);
});

test("watchlist PATCH rejects stale versions without replacing another session's edit", async () => {
  const statements = [];
  await withServer(
    {
      db: { execute: async (sql, params) => {
        statements.push({ sql, params });
        if (sql.startsWith("UPDATE watchlist")) return [{ affectedRows: 0 }];
        if (sql.startsWith("SELECT tmdb_id, watch_status, version")) {
          return [[{ tmdb_id: 42, watch_status: "watched", version: 2 }]];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      } },
      tmdb: { get: async () => { throw new Error("unexpected TMDB call"); } },
      logger: quietLogger,
    },
    async (base) => {
      const response = await fetch(`${base}/watchlist/42`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": '"1"' },
        body: JSON.stringify({ notes: "Minha nota antiga" }),
      });
      assert.equal(response.status, 409);
      assert.match((await response.json()).message, /outra sessão/i);
    }
  );
  assert.deepEqual(statements[0].params, ["Minha nota antiga", 42, 1]);
  assert.deepEqual(statements[1].params, [42]);
  assert.equal(statements.length, 2);
});

test("paged favorites filter and sort in SQL before TMDB enrichment", async () => {
  const statements = [];
  const requested = [];
  await withServer({
    db: { execute: async (sql, params = []) => {
      statements.push({ sql, params });
      if (sql.startsWith("SELECT COUNT")) return [[{ totalCount: 3 }]];
      if (sql.includes("LIMIT 2 OFFSET 0")) return [[
        { tmdb_id: 8, title: "Local 8", release_date: "2024-01-01" },
        { tmdb_id: 7, title: "Local 7", release_date: "2023-01-01" },
      ]];
      throw new Error(`Consulta inesperada: ${sql}`);
    } },
    tmdb: { get: async (path) => {
      requested.push(path);
      const id = Number(path.split("/").at(-1));
      return { data: { id, title: `TMDB ${id}`, release_date: id === 8 ? null : "2024-01-01",
        extra: "not exposed" } };
    } },
    logger: quietLogger,
  }, async (base) => {
    const response = await fetch(`${base}/favorites?page=1&pageSize=2&q=100%25_%21&sort=title.desc`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual([data.page, data.pageSize, data.totalPages, data.totalCount], [1, 2, 2, 3]);
    assert.deepEqual(data.items.map((movie) => movie.id), [8, 7]);
    assert.deepEqual(data.items.map((movie) => movie.title), ["Local 8", "Local 7"]);
    assert.equal(data.items[0].release_date, "2024-01-01");
    assert.equal(data.items[1].release_date, "2023-01-01");
    assert.equal(data.items[0].extra, undefined);
    assert.deepEqual(requested, ["/movie/8", "/movie/7"]);
    assert.equal((await fetch(`${base}/favorites?page=0`)).status, 400);
    assert.equal((await fetch(`${base}/favorites?page=1&pageSize=51`)).status, 400);
    assert.equal((await fetch(`${base}/favorites?page=1&sort=unknown`)).status, 400);
    assert.equal((await fetch(`${base}/favorites?page=1&q=${"x".repeat(201)}`)).status, 400);
  });
  assert.match(statements[0].sql, /COUNT\(\*\).*LOCATE\(\?, title\)/);
  assert.deepEqual(statements[0].params, ["100%_!"]);
  assert.match(statements[1].sql, /ORDER BY title DESC, tmdb_id ASC LIMIT 2 OFFSET 0/);
  assert.deepEqual(statements[1].params, ["100%_!"]);
});

test("release sort backfills every unchecked favorite before paging", async () => {
  const rows = [
    { tmdb_id: 1, title: "One", release_date: null, release_date_checked: 0 },
    { tmdb_id: 2, title: "Two", release_date: null, release_date_checked: 0 },
    { tmdb_id: 3, title: "Three", release_date: "2020-01-01", release_date_checked: 1 },
  ];
  const statements = [];
  const fetched = [];
  await withServer({
    db: { execute: async (sql, params = []) => {
      statements.push({ sql, params });
      if (sql.includes("release_date_checked = 0") && sql.startsWith("SELECT")) {
        return [rows.filter((row) => !row.release_date_checked).map((row) => ({ tmdb_id: row.tmdb_id }))];
      }
      if (sql.startsWith("UPDATE favorites")) {
        const row = rows.find((item) => item.tmdb_id === params[1]);
        row.release_date = params[0];
        row.release_date_checked = 1;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("SELECT COUNT")) return [[{ totalCount: rows.length }]];
      if (sql.includes("LIMIT 1 OFFSET 0")) {
        return [rows.slice().sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""))
          .slice(0, 1)];
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    } },
    tmdb: { get: async (path) => {
      fetched.push(path);
      const id = Number(path.split("/").at(-1));
      return { data: { id, title: `Movie ${id}`, release_date: id === 1 ? "2025-01-01" : null } };
    } },
    logger: quietLogger,
  }, async (base) => {
    const response = await fetch(`${base}/favorites?page=1&pageSize=1&sort=release.desc`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.items.map((movie) => movie.id), [1]);
    assert.equal(data.totalPages, 3);
  });
  assert.deepEqual(rows.map((row) => row.release_date_checked), [1, 1, 1]);
  assert.deepEqual(fetched.slice(0, 2).sort(), ["/movie/1", "/movie/2"]);
  assert.match(statements.find((item) => item.sql.includes("LIMIT 1 OFFSET 0")).sql,
    /release_date IS NULL ASC, release_date DESC/);
  assert.ok(statements.findIndex((item) => item.sql.startsWith("SELECT COUNT")) >
    statements.findIndex((item) => item.sql.startsWith("UPDATE favorites")));
});

test("release sort fails closed when a legacy movie cannot be checked", async () => {
  const statements = [];
  await withServer({
    db: { execute: async (sql) => {
      statements.push(sql);
      if (sql.includes("release_date_checked = 0")) return [[{ tmdb_id: 19 }]];
      throw new Error(`Consulta inesperada: ${sql}`);
    } },
    tmdb: { get: async () => { throw new Error("temporary failure"); } },
    logger: quietLogger,
  }, async (base) => {
    const response = await fetch(`${base}/favorites?page=1&sort=release.desc`);
    assert.equal(response.status, 502);
  });
  assert.equal(statements.length, 1);
});

test("release sort keeps a removed TMDB movie with an unknown date", async () => {
  const statements = [];
  await withServer({
    db: { execute: async (sql, params = []) => {
      statements.push({ sql, params });
      if (sql.startsWith("SELECT tmdb_id FROM favorites WHERE release_date_checked")) {
        return [[{ tmdb_id: 19 }]];
      }
      if (sql.startsWith("UPDATE favorites")) return [{ affectedRows: 1 }];
      if (sql.startsWith("SELECT COUNT")) return [[{ totalCount: 1 }]];
      if (sql.includes("LIMIT 12 OFFSET 0")) return [[{
        tmdb_id: 19, title: "Título local", release_date: null,
      }]];
      throw new Error(`Consulta inesperada: ${sql}`);
    } },
    tmdb: { get: async () => {
      const error = new Error("Filme removido");
      error.response = { status: 404 };
      throw error;
    } },
    logger: quietLogger,
  }, async (base) => {
    const response = await fetch(`${base}/favorites?page=1&sort=release.desc`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.items[0].title, "Título local");
    assert.equal(data.items[0].release_date, null);
  });
  assert.deepEqual(statements.find((statement) => statement.sql.startsWith("UPDATE favorites")).params,
    [null, 19]);
});

test("favorito legado mostra o ano disponível sem alterar sua data pendente no banco", async () => {
  const statements = [];
  await withServer({
    db: { execute: async (sql) => {
      statements.push(sql);
      if (sql.startsWith("SELECT COUNT")) return [[{ totalCount: 1 }]];
      if (sql.includes("LIMIT 12 OFFSET 0")) {
        return [[{ tmdb_id: 19, title: "Título salvo", release_date: null,
          release_date_checked: 0 }]];
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    } },
    tmdb: { get: async () => ({ data: { id: 19, title: "Título TMDB",
      release_date: "2020-01-01" } }) },
    logger: quietLogger,
  }, async (base) => {
    const response = await fetch(`${base}/favorites?page=1&sort=title.asc`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.items[0].title, "Título salvo");
    assert.equal(data.items[0].release_date, "2020-01-01");
  });
  assert.match(statements[1], /release_date_checked/);
  assert.equal(statements.some((sql) => sql.startsWith("UPDATE favorites")), false);
});

test("a favorite checked without a release date remains undated when TMDB gains one", async () => {
  const statements = [];
  await withServer({
    db: { execute: async (sql) => {
      statements.push(sql);
      if (sql.startsWith("SELECT tmdb_id FROM favorites WHERE release_date_checked")) return [[]];
      if (sql.startsWith("SELECT COUNT")) return [[{ totalCount: 1 }]];
      if (sql.includes("LIMIT 12 OFFSET 0")) {
        return [[{ tmdb_id: 19, title: "Título salvo", release_date: null }]];
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    } },
    tmdb: { get: async () => ({
      data: { id: 19, title: "Novo título", release_date: "2025-01-01",
        poster_path: "/poster.jpg" },
    }) },
    logger: quietLogger,
  }, async (base) => {
    const response = await fetch(`${base}/favorites?page=1&sort=release.desc`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.items[0].title, "Título salvo");
    assert.equal(data.items[0].release_date, null);
    assert.equal(data.items[0].poster_path, "/poster.jpg");
  });
  assert.equal(statements.some((sql) => sql.startsWith("UPDATE favorites")), false);
});

test("paged favorites use the default page size without a search query", async () => {
  const statements = [];
  await withServer({
    db: { execute: async (sql, params = []) => {
      statements.push({ sql, params });
      return sql.startsWith("SELECT COUNT") ? [[{ totalCount: 0 }]] : [[]];
    } },
    tmdb: { get: async () => { throw new Error("unexpected TMDB call"); } },
    logger: quietLogger,
  }, async (base) => {
    const response = await fetch(`${base}/favorites?page=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      page: 1, pageSize: 12, totalPages: 0, totalCount: 0, items: [],
    });
  });
  assert.match(statements[1].sql, /LIMIT 12 OFFSET 0$/);
  assert.deepEqual(statements[1].params, []);
});

test("saved lists default to bounded pages even without a page parameter", async () => {
  const statements = [];
  const requested = [];
  const rows = Array.from({ length: 25 }, (_, index) => ({
    tmdb_id: index + 1,
    title: `Local ${index + 1}`,
    release_date: null,
    watch_status: "want_to_watch",
    watched_at: null,
    personal_rating: null,
    notes: null,
    added_at: "2024-01-01",
  }));
  await withServer({
    db: { execute: async (sql) => {
      statements.push(sql);
      if (sql.startsWith("SELECT COUNT")) return [[{ totalCount: rows.length }]];
      const match = sql.match(/LIMIT (\d+) OFFSET (\d+)$/);
      assert.ok(match, `Unbounded query: ${sql}`);
      return [rows.slice(Number(match[2]), Number(match[2]) + Number(match[1]))];
    } },
    tmdb: { get: async (path) => {
      requested.push(path);
      const id = Number(path.split("/").at(-1));
      return { data: { id, title: `TMDB ${id}` } };
    } },
    logger: quietLogger,
  }, async (base) => {
    for (const route of ["favorites", "watchlist"]) {
      requested.length = 0;
      const response = await fetch(`${base}/${route}`);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual([data.page, data.pageSize, data.totalPages, data.totalCount],
        [1, 12, 3, 25]);
      assert.equal(data.items.length, 12);
      assert.equal(requested.length, 12, `${route} should enrich only the first page`);

      const smaller = await (await fetch(`${base}/${route}?pageSize=1`)).json();
      assert.deepEqual([smaller.page, smaller.pageSize, smaller.items.length], [1, 1, 1]);
      assert.equal((await fetch(`${base}/${route}?pageSize=51`)).status, 400);
    }
  });
  assert.equal(statements.filter((sql) => /LIMIT 12 OFFSET 0$/.test(sql)).length, 2);
});

test("watchlist pagination selects one page before fetching movie details", async () => {
  const requested = [];
  const statements = [];
  await withServer({
    db: { execute: async (sql, params = []) => {
      statements.push({ sql, params });
      if (sql.startsWith("SELECT COUNT")) return [[{ totalCount: 25 }]];
      return [[{ tmdb_id: 9, title: "Nove", watch_status: "want_to_watch",
        watched_at: null, personal_rating: null, notes: null, added_at: "2024-01-01" }]];
    } },
    tmdb: { get: async (path) => {
      requested.push(path);
      return { data: { id: 9, title: "Nove" } };
    } },
    logger: quietLogger,
  }, async (base) => {
    const response = await fetch(`${base}/watchlist?page=2&pageSize=1`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual([data.page, data.pageSize, data.totalPages, data.totalCount], [2, 1, 25, 25]);
    assert.deepEqual(data.items.map((item) => item.tmdb_id), [9]);
    assert.equal((await fetch(`${base}/watchlist?page=2&pageSize=0`)).status, 400);
  });
  assert.deepEqual(requested, ["/movie/9"]);
  assert.match(statements[1].sql, /ORDER BY added_at DESC, tmdb_id DESC LIMIT 1 OFFSET 1/);
  assert.deepEqual(statements[1].params, []);
});

test("TMDB responses expose only validated movie fields", async () => {
  await withServer({
    db: { execute: async () => [[]] },
    tmdb: { get: async (path) => {
      if (path === "/search/movie") return { data: { page: 1, total_pages: 1,
        total_results: 1, results: [{ id: 4, title: " Filme ", overview: 7,
          poster_path: "https://example.com/x.jpg", backdrop_path: "//outro-site/imagem.jpg",
          release_date: "2024-02-30",
          vote_average: 11, internal: "secret" }] } };
      return { data: { id: 4, title: " Filme ", runtime: -1,
        genres: [{ id: 28, name: "Ação" }, { id: -1, name: "Inválido" }],
        tagline: "Chamada", original_title: 42, original_language: "not-a-code",
        director: " ", cast: ["Ator", "", "Ator", 23], certification_br: "PG-13",
        trailer_key: "https://evil.example/", poster_path: "javascript:alert(1)",
        backdrop_path: "/../evil.jpg", internal: "secret" } };
    } },
    logger: quietLogger,
  }, async (base) => {
    const search = await (await fetch(`${base}/search?movie_query=x`)).json();
    assert.deepEqual(search.results[0], { id: 4, title: "Filme", overview: "",
      poster_path: null, backdrop_path: null, release_date: null, vote_average: null });
    const detail = await (await fetch(`${base}/movies/4`)).json();
    assert.deepEqual(detail.genres, [{ id: 28, name: "Ação" }]);
    assert.equal(detail.runtime, null);
    assert.equal(detail.tagline, "Chamada");
    assert.equal(detail.poster_path, null);
    assert.equal(detail.backdrop_path, null);
    assert.equal(detail.original_title, null);
    assert.equal(detail.original_language, null);
    assert.equal(detail.director, null);
    assert.deepEqual(detail.cast, ["Ator"]);
    assert.equal(detail.certification_br, null);
    assert.equal(detail.trailer_key, null);
    assert.equal(detail.internal, undefined);
  });
});
