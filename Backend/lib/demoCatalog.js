// Curadoria local: dados selecionados de filmes conhecidos e sinopses escritas para este projeto.
// Apenas caminhos de imagens, nunca arquivos de imagem ou respostas completas da API.
const { genres, movies } = require("../data/demoMovies.json");
const LEGACY_DEMO_MIN_ID = 2000000001;
const LEGACY_DEMO_MAX_ID = 2000000012;

const byId = new Map(movies.map((movie) => [movie.id, movie]));
const PAGE_SIZE = 8;

function isDemoMovieId(id) {
  return byId.has(id);
}

function isLegacyDemoMovieId(id) {
  return Number.isInteger(id) && id >= LEGACY_DEMO_MIN_ID && id <= LEGACY_DEMO_MAX_ID;
}

function fold(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function pageOf(filtered, page) {
  return {
    page,
    total_pages: Math.ceil(filtered.length / PAGE_SIZE),
    total_results: filtered.length,
    results: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  };
}

function createDemoCatalog() {
  return {
    async get(path, { params = {} } = {}) {
      if (path === "/genre/movie/list") return { data: { genres } };
      if (path === "/search/movie") {
        const query = fold(params.query?.trim() ?? "");
        const filtered = movies.filter((movie) =>
          (!params.year || movie.release_date.startsWith(String(params.year))) &&
          (fold(movie.title).includes(query) ||
            fold(movie.original_title ?? "").includes(query) ||
            movie.search_aliases?.some((alias) => fold(alias).includes(query)))
        );
        return { data: pageOf(filtered, params.page ?? 1) };
      }
      if (path === "/discover/movie") {
        const filtered = movies.filter((movie) =>
          (!params.with_genres || movie.genre_ids.includes(params.with_genres)) &&
          (!params.primary_release_year || movie.release_date.startsWith(String(params.primary_release_year)))
        );
        const sortBy = params.sort_by ?? "popularity.desc";
        filtered.sort((left, right) => {
          const order = sortBy === "primary_release_date.desc"
            ? right.release_date.localeCompare(left.release_date)
            : right.featured_rank - left.featured_rank;
          // The demo has no live audience score; old rating links use the curated order.
          return order || left.id - right.id;
        });
        return { data: pageOf(filtered, params.page ?? 1) };
      }
      const detail = /^\/movie\/(\d+)$/.exec(path);
      if (detail) {
        const movie = byId.get(Number(detail[1]));
        if (movie) {
          return { data: {
            ...movie,
            vote_average: null,
            tagline: "",
            genres: genres.filter((genre) => movie.genre_ids.includes(genre.id)),
          } };
        }
      }
      const error = new Error("Filme ou rota não encontrado no catálogo de demonstração.");
      error.response = { status: 404 };
      throw error;
    },
  };
}

module.exports = { createDemoCatalog, isDemoMovieId, isLegacyDemoMovieId };
