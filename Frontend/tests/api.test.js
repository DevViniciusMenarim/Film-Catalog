import { test } from "vitest";
import assert from "node:assert/strict";
import { ApiError, createApiClient } from "../src/shared/api.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("consulta a fonte ativa na transição demo/TMDB e rejeita metadados inconsistentes", async () => {
  let source = "demo";
  const client = createApiClient({
    fetchImpl: async (url) => {
      assert.equal(url, "/api/catalog-info");
      return jsonResponse({ source });
    },
  });
  assert.deepEqual(await client.getCatalogInfo(), { source: "demo" });
  source = "tmdb";
  assert.deepEqual(await client.getCatalogInfo(), { source: "tmdb" });
  const unknown = createApiClient({
    fetchImpl: async () => jsonResponse({ source: "other" }),
  });
  await assert.rejects(unknown.getCatalogInfo(), /Informações do catálogo inválidas/);
});

test("erros HTTP de busca e favoritos rejeitam em vez de parecer lista vazia", async () => {
  const client = createApiClient({
    fetchImpl: async () => jsonResponse({ message: "Serviço indisponível" }, 500),
  });

  await assert.rejects(client.searchMovies("Filme"), (error) =>
    error instanceof ApiError && error.status === 500);
  await assert.rejects(client.getFavoritesPage(), (error) =>
    error instanceof ApiError && error.status === 500);
});

test("respostas de listagem com formato inválido são rejeitadas", async () => {
  const client = createApiClient({
    fetchImpl: async () => jsonResponse({ message: "sem lista" }),
  });

  await assert.rejects(client.searchMovies("Filme"), /Resposta de filmes inválida/);
  await assert.rejects(client.getFavoritesPage(), /Resposta de favoritos inválida/);
});

test("POST e DELETE só confirmam sucesso após resposta HTTP bem-sucedida", async () => {
  const calls = [];
  const client = createApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ message: "Banco indisponível" }, 500);
    },
  });

  await assert.rejects(client.saveFavorite({ id: 42, title: "Teste" }), (error) =>
    error instanceof ApiError && error.status === 500);
  await assert.rejects(client.deleteFavorite(42), (error) =>
    error instanceof ApiError && error.status === 500);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { tmdb_id: 42 });
  assert.equal(calls[1].options.method, "DELETE");
  assert.equal(calls[1].url, "/api/favorites/42");
});

test("descoberta e busca encaminham filtros e página", async () => {
  const calls = [];
  const client = createApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url, "http://localhost"), options });
      return jsonResponse({ page: 2, total_pages: 3, results: [{ id: 7, title: "Filme" }] });
    },
  });

  const controller = new AbortController();
  assert.equal((await client.searchMovies("Star & War", {
    page: 2, year: 2020, signal: controller.signal,
  })).page, 2);
  assert.equal(calls[0].url.pathname, "/api/search");
  assert.equal(calls[0].url.searchParams.get("movie_query"), "Star & War");
  assert.equal(calls[0].url.searchParams.get("year"), "2020");
  assert.equal(calls[0].url.searchParams.get("page"), "2");
  assert.equal(calls[0].options.signal, controller.signal);

  await client.discoverMovies({ genre: 28, year: 1999, sort: "vote_average.desc", page: 2 });
  assert.equal(calls[1].url.pathname, "/api/discover");
  assert.equal(calls[1].url.searchParams.get("genre"), "28");
  assert.equal(calls[1].url.searchParams.get("sort"), "vote_average.desc");
  assert.equal(calls[1].url.searchParams.get("year"), "1999");
});

test("metadados, detalhes e biblioteca usam o contrato da API", async () => {
  const calls = [];
  const client = createApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/genres")) return jsonResponse({ genres: [{ id: 28, name: "Ação" }] });
      if (url.endsWith("/movies/42")) return jsonResponse({ id: 42, title: "Teste" });
      if (url.endsWith("/favorites/ids")) return jsonResponse([42]);
      if (url.endsWith("/watchlist/ids")) return jsonResponse([42]);
      if (url.includes("/watchlist?") && !options?.method) {
        return jsonResponse({ page: 1, pageSize: 12, totalPages: 0,
          totalCount: 0, items: [] });
      }
      return jsonResponse({ message: "ok" });
    },
  });

  assert.equal((await client.getGenres())[0].name, "Ação");
  assert.equal((await client.getMovieDetails(42)).id, 42);
  assert.deepEqual(await client.getFavoriteIds(), [42]);
  assert.deepEqual(await client.getWatchlistIds(), [42]);
  assert.deepEqual((await client.getWatchlistPage()).items, []);
  await client.addToWatchlist({ id: 42 });
  await client.updateWatchlist(42, { watch_status: "want_to_watch", watched_at: null }, 7);
  await client.deleteWatchlist(42);
  assert.deepEqual(JSON.parse(calls[5].options.body), {
    tmdb_id: 42,
    watch_status: "want_to_watch",
  });
  assert.deepEqual(JSON.parse(calls[6].options.body), {
    watch_status: "want_to_watch",
    watched_at: null,
  });
  assert.equal(calls[6].options.method, "PATCH");
  assert.equal(calls[6].options.headers["If-Match"], '"7"');
  assert.equal(calls[7].options.method, "DELETE");
});

test("detalhes opcionais são normalizados e URLs externas inválidas não passam", async () => {
  const client = createApiClient({
    fetchImpl: async () => jsonResponse({
      id: 42, title: "Filme",
      poster_path: "//outro-site/imagem.jpg", backdrop_path: "/fundo.jpg",
      original_title: "Original", original_language: "en",
      director: "  Diretora  ", cast: [" Pessoa A ", null, "Pessoa B"],
      certification_br: "12", trailer_key: "https://outro-site.test",
    }),
  });
  const detail = await client.getMovieDetails(42);
  assert.equal(detail.poster_path, null);
  assert.equal(detail.backdrop_path, "/fundo.jpg");
  assert.equal(detail.director, "Diretora");
  assert.deepEqual(detail.cast, ["Pessoa A", "Pessoa B"]);
  assert.equal(detail.certification_br, "12");
  assert.equal(detail.trailer_key, null);
});

test("DELETE sem corpo com HTTP 204 é aceito", async () => {
  const client = createApiClient({
    fetchImpl: async () => new Response(null, { status: 204 }),
  });
  assert.equal(await client.deleteWatchlist(42), null);
});

