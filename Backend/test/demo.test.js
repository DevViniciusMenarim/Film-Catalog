const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../app");
const { createDemoCatalog } = require("../lib/demoCatalog");
const { enrichMovie } = require("../services/catalogMovies");

const quietLogger = { error() {} };

async function withDemoServer(db, run) {
  const app = createApp({ db, tmdb: createDemoCatalog(), catalogSource: "demo", logger: quietLogger });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
}

test("demo serves 40 real movies with search, filters, sorting, details and five pages", async () => {
  await withDemoServer({ execute: async () => [[]] }, async (base) => {
    const info = await (await fetch(`${base}/catalog-info`)).json();
    assert.deepEqual(info, { source: "demo" });

    const first = await (await fetch(`${base}/discover?page=1`)).json();
    const second = await (await fetch(`${base}/discover?page=2`)).json();
    const third = await (await fetch(`${base}/discover?page=3`)).json();
    const fourth = await (await fetch(`${base}/discover?page=4`)).json();
    const fifth = await (await fetch(`${base}/discover?page=5`)).json();
    const beyond = await (await fetch(`${base}/discover?page=6`)).json();
    assert.deepEqual([first.total_results, first.total_pages, first.results.length], [40, 5, 8]);
    assert.equal(second.results.length, 8);
    assert.equal(third.results.length, 8);
    assert.equal(fourth.results.length, 8);
    assert.equal(fifth.results.length, 8);
    assert.deepEqual(beyond.results, []);
    const allMovies = [...first.results, ...second.results, ...third.results,
      ...fourth.results, ...fifth.results];
    assert.equal(new Set(allMovies.map((movie) => movie.id)).size, 40);
    assert.ok(allMovies.every((movie) => movie.poster_path?.startsWith("/") &&
      movie.backdrop_path?.startsWith("/") && movie.vote_average === null));
    assert.equal(first.results[0].title, "Guerra nas Estrelas");
    assert.equal(fifth.results.at(-1).title, "Harry Potter e a Pedra Filosofal");

    const search = await (await fetch(`${base}/search?movie_query=chihiro`)).json();
    assert.deepEqual(search.results.map((movie) => movie.title), ["A Viagem de Chihiro"]);
    const noYear = await (await fetch(`${base}/search?movie_query=chihiro&year=2024`)).json();
    assert.equal(noYear.total_results, 0);
    const accented = await (await fetch(`${base}/search?movie_query=senhor%20dos%20aneis`)).json();
    assert.deepEqual(accented.results.map((movie) => movie.title),
      ["O Senhor dos Anéis: A Sociedade do Anel"]);
    const alias = await (await fetch(`${base}/search?movie_query=Star%20Wars`)).json();
    assert.deepEqual(alias.results.map((movie) => movie.title), ["Guerra nas Estrelas"]);
    assert.equal(Object.hasOwn(alias.results[0], "search_aliases"), false);
    const original = await (await fetch(`${base}/search?movie_query=%E5%8D%83%E3%81%A8%E5%8D%83%E5%B0%8B`)).json();
    assert.deepEqual(original.results.map((movie) => movie.title), ["A Viagem de Chihiro"]);

    const genres = await (await fetch(`${base}/genres`)).json();
    const scienceFiction = genres.genres.find((genre) => genre.name === "Ficção científica");
    assert.equal(scienceFiction.id, 878);
    const filtered = await (await fetch(`${base}/discover?genre=878&year=2014`)).json();
    assert.deepEqual(filtered.results.map((movie) => movie.title), ["Interestelar"]);
    const recent = await (await fetch(`${base}/discover?sort=primary_release_date.desc`)).json();
    assert.deepEqual(recent.results.slice(0, 2).map((movie) => movie.title),
      ["Duna: Parte Dois", "Barbie"]);
    const legacyRatingSort = await (await fetch(`${base}/discover?sort=vote_average.desc`)).json();
    assert.equal(legacyRatingSort.results[0].title, "Guerra nas Estrelas");

    const detail = await (await fetch(`${base}/movies/${search.results[0].id}`)).json();
    assert.equal(detail.runtime, 125);
    assert.deepEqual(detail.genres.map((genre) => genre.name), ["Fantasia", "Animação", "Família"]);
    assert.match(detail.overview, /mundo de espíritos/);
    assert.equal(detail.poster_path, "/hhoKhsyJ3hFaxEm5pMdZRiTu2lJ.jpg");
    assert.equal(detail.backdrop_path, "/dyJvKsNs2KP8qQnAXbRwDjblViy.jpg");
    assert.equal(detail.original_title, "千と千尋の神隠し");
    assert.equal(detail.original_language, "ja");
    assert.equal(detail.director, "Hayao Miyazaki");
    assert.deepEqual(detail.cast, ["Rumi Hiiragi", "Miyu Irino", "Mari Natsuki", "Takashi Naitô"]);
    assert.equal(detail.certification_br, "L");
    assert.equal(detail.trailer_key, "GAp2_0JJskk");
    assert.equal(detail.vote_average, null);
    assert.equal(detail.featured_rank, undefined);
    const added = await (await fetch(`${base}/movies/354912`)).json();
    assert.equal(added.title, "Viva: A Vida é Uma Festa");
    assert.equal(added.director, "Lee Unkrich");
    assert.deepEqual(added.cast.slice(0, 2), ["Anthony Gonzalez", "Gael García Bernal"]);
    assert.equal(added.certification_br, "L");
    assert.equal(added.trailer_key, "K3cL-o73GPU");
    assert.equal((await fetch(`${base}/movies/2000000099`)).status, 404);
    assert.equal((await fetch(`${base}/discover?genre=0`)).status, 400);
  });
});

test("demo validates trusted movie data before saving favorites and watchlist", async () => {
  const favorites = new Map();
  const watchlist = new Map();
  const db = { async execute(sql, params = []) {
    if (sql.startsWith("INSERT INTO favorites")) {
      favorites.set(params[0], { tmdb_id: params[0], title: params[1], release_date: params[2] });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("INSERT INTO watchlist")) {
      watchlist.set(params[0], { tmdb_id: params[0], title: params[1], watch_status: params[2] });
      return [{ affectedRows: 1 }];
    }
    if (sql === "SELECT tmdb_id FROM favorites ORDER BY tmdb_id") {
      return [[...favorites.values()].map(({ tmdb_id }) => ({ tmdb_id }))];
    }
    if (sql === "SELECT tmdb_id FROM watchlist ORDER BY tmdb_id") {
      return [[...watchlist.values()].map(({ tmdb_id }) => ({ tmdb_id }))];
    }
    throw new Error(`Consulta inesperada: ${sql}`);
  } };
  await withDemoServer(db, async (base) => {
    const body = JSON.stringify({ tmdb_id: 11, title: "Título inventado pelo cliente",
      watch_status: "want_to_watch" });
    for (const route of ["favorites", "watchlist"]) {
      const response = await fetch(`${base}/${route}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
      });
      assert.equal(response.status, 201);
      assert.deepEqual(await (await fetch(`${base}/${route}/ids`)).json(), [11]);
    }
    const foreign = await fetch(`${base}/favorites`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdb_id: 2000000001 }),
    });
    assert.equal(foreign.status, 404);
  });
  assert.equal(favorites.get(11).title, "Guerra nas Estrelas");
  assert.equal(favorites.get(11).release_date, "1977-05-25");
  assert.equal(watchlist.get(11).title, "Guerra nas Estrelas");

  const preserved = await enrichMovie(
    { tmdb_id: 2000000001, title: "O Arquivo das Nuvens", release_date: "2024-03-14" },
    { get: async () => { throw new Error("A outra fonte não deve ser consultada"); } },
    quietLogger, "catálogo de demonstração", "demo"
  );
  assert.equal(preserved.title, "O Arquivo das Nuvens");
  assert.equal(preserved.release_date, "2024-03-14");
});

test("switching to demo keeps legacy TMDB dates pending and lists saved rows", async () => {
  const statements = [];
  const db = { async execute(sql) {
    statements.push(sql);
    if (sql.startsWith("SELECT tmdb_id FROM favorites WHERE release_date_checked")) {
      return [[{ tmdb_id: 42 }]];
    }
    if (sql.startsWith("SELECT COUNT")) return [[{ totalCount: 1 }]];
    if (sql.includes("LIMIT 12 OFFSET 0")) {
      return [[{ tmdb_id: 42, title: "Filme real já salvo", release_date: "2020-01-01" }]];
    }
    throw new Error(`Consulta inesperada: ${sql}`);
  } };
  await withDemoServer(db, async (base) => {
    const response = await fetch(`${base}/favorites?page=1&sort=release.desc`);
    assert.equal(response.status, 200);
    const page = await response.json();
    assert.equal(page.items[0].title, "Filme real já salvo");
    assert.equal(page.items[0].release_date, "2020-01-01");
  });
  assert.equal(statements.some((sql) => sql.startsWith("UPDATE favorites")), false);
});

test("switching from demo to TMDB refreshes shared IDs and preserves fictional legacy rows", async () => {
  const requests = [];
  const tmdb = { async get(path) {
    requests.push(path);
    return { data: {
      id: 11, title: "Star Wars", release_date: "1977-05-25",
      overview: "Sinopse TMDB", poster_path: "/official.jpg", vote_average: 8.2,
    } };
  } };

  const updated = await enrichMovie(
    { tmdb_id: 11, title: "Guerra nas Estrelas", release_date: "1977-05-25" },
    tmdb, quietLogger, "TMDB", "tmdb"
  );
  assert.deepEqual(requests, ["/movie/11"]);
  assert.equal(updated.title, "Star Wars");
  assert.equal(updated.poster_path, "/official.jpg");
  assert.equal(updated.vote_average, 8.2);
  assert.equal(updated.release_date, "1977-05-25");

  const legacy = await enrichMovie(
    { tmdb_id: 2000000001, title: "O Arquivo das Nuvens", release_date: "2024-03-14" },
    tmdb, quietLogger, "TMDB", "tmdb"
  );
  assert.deepEqual(requests, ["/movie/11"]);
  assert.equal(legacy.title, "O Arquivo das Nuvens");
  assert.equal(legacy.poster_path, null);
});
