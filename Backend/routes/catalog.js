const express = require("express");
const {
  MAX_PAGE, parseOptionalInteger, parseMovieId, logError, catalogUpstreamMessage,
} = require("../lib/common");
const { catalogSourceName } = require("../lib/movie");
const { searchMovies, discoverMovies, getGenres, getMovie } = require("../services/catalogMovies");

const MAX_SEARCH_LENGTH = 200;
const MIN_YEAR = 1878;
const MAX_YEAR = 2100;
const DISCOVER_SORTS = new Set([
  "popularity.desc",
  "vote_average.desc",
  "primary_release_date.desc",
]);

function createCatalogRouter({ tmdb, logger, catalogSource = "tmdb" }) {
  const router = express.Router();
  const sourceName = catalogSourceName(catalogSource);
  router.get("/search", async (req, res) => {
    const query = req.query.movie_query;
    const page = parseOptionalInteger(req.query.page, {
      min: 1,
      max: MAX_PAGE,
      fallback: 1,
    });
    const year = parseOptionalInteger(req.query.year, {
      min: MIN_YEAR,
      max: MAX_YEAR,
    });
    if (
      typeof query !== "string" ||
      !query.trim() ||
      query.trim().length > MAX_SEARCH_LENGTH ||
      page === null ||
      (req.query.year !== undefined && year === null)
    ) {
      return res.status(400).json({ message: "Parâmetros de busca inválidos." });
    }

    try {
      const data = await searchMovies(tmdb, query.trim(), page, year);
      return data
        ? res.json(data)
        : res.status(502).json({ message: `Resposta inválida do ${sourceName}.` });
    } catch (error) {
      logError(logger, `Erro ao buscar no ${sourceName}:`, error);
      return res.status(502).json({ message: catalogUpstreamMessage(
        error, catalogSource, `${sourceName} indisponível.`
      ) });
    }
  });

  router.get("/discover", async (req, res) => {
    const page = parseOptionalInteger(req.query.page, {
      min: 1,
      max: MAX_PAGE,
      fallback: 1,
    });
    const year = parseOptionalInteger(req.query.year, {
      min: MIN_YEAR,
      max: MAX_YEAR,
    });
    const genre = req.query.genre === undefined
      ? null
      : parseMovieId(req.query.genre);
    const sort = req.query.sort === undefined ? "popularity.desc" : req.query.sort;
    if (
      page === null ||
      (req.query.year !== undefined && year === null) ||
      (req.query.genre !== undefined && genre === null) ||
      !DISCOVER_SORTS.has(sort)
    ) {
      return res.status(400).json({ message: "Filtros de descoberta inválidos." });
    }

    try {
      const data = await discoverMovies(tmdb, { page, sort, genre, year });
      return data
        ? res.json(data)
        : res.status(502).json({ message: `Resposta inválida do ${sourceName}.` });
    } catch (error) {
      logError(logger, `Erro ao descobrir filmes no ${sourceName}:`, error);
      return res.status(502).json({ message: catalogUpstreamMessage(
        error, catalogSource, `${sourceName} indisponível.`
      ) });
    }
  });

  router.get("/genres", async (_req, res) => {
    try {
      const data = await getGenres(tmdb);
      return data
        ? res.json(data)
        : res.status(502).json({ message: `Resposta inválida do ${sourceName}.` });
    } catch (error) {
      logError(logger, `Erro ao carregar gêneros no ${sourceName}:`, error);
      return res.status(502).json({ message: catalogUpstreamMessage(
        error, catalogSource, `${sourceName} indisponível.`
      ) });
    }
  });

  router.get("/movies/:tmdb_id", async (req, res) => {
    const id = parseMovieId(req.params.tmdb_id);
    if (id === null) {
      return res.status(400).json({ message: "ID do filme inválido." });
    }

    try {
      const movie = await getMovie(tmdb, id, true);
      if (!movie) {
        return res.status(502).json({ message: `Resposta inválida do ${sourceName}.` });
      }
      return res.json(movie);
    } catch (error) {
      logError(logger, `Erro no detalhe do filme ${id} no ${sourceName}:`, error);
      if (error?.response?.status === 404) {
        return res.status(404).json({ message: `Filme não encontrado no ${sourceName}.` });
      }
      return res.status(502).json({ message: catalogUpstreamMessage(
        error, catalogSource, `${sourceName} indisponível.`
      ) });
    }
  });

  return router;
}
module.exports = { createCatalogRouter };
