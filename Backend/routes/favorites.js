const express = require("express");
const {
  parseMovieId,
  parseStoredId,
  parsePagination,
  pageEnvelope,
  logError,
  catalogUpstreamMessage,
} = require("../lib/common");
const { catalogSourceName } = require("../lib/movie");
const { CatalogLookupError } = require("../services/catalogMovies");
const { createFavoritesService, isFavoriteSort } = require("../services/favorites");

function createFavoritesRouter({ db, tmdb, logger, catalogSource = "tmdb" }) {
  const router = express.Router();
  const sourceName = catalogSourceName(catalogSource);
  const favorites = createFavoritesService({ db, tmdb, logger, catalogSource });
  router.get("/favorites/ids", async (_req, res) => {
    try {
      return res.json(await favorites.listIds());
    } catch (error) {
      logError(logger, "Erro ao consultar IDs dos favoritos:", error);
      return res.status(500).json({ message: "Erro ao consultar favoritos." });
    }
  });

  router.get("/favorites", async (req, res) => {
    const pagination = parsePagination(req.query);
    const q = req.query.q === undefined
      ? ""
      : typeof req.query.q === "string" ? req.query.q.trim() : null;
    const sort = req.query.sort ?? "title.asc";
    if (pagination === false || q === null || q.length > 200 || !isFavoriteSort(sort)) {
      return res.status(400).json({ message: "Filtros de favoritos inválidos." });
    }
    let result;
    try {
      result = await favorites.list({ pagination, q, sort });
    } catch (error) {
      if (error?.upstream) {
        return res.status(502).json({ message: catalogUpstreamMessage(
          error, catalogSource, `${sourceName} indisponível ao ordenar favoritos.`
        ) });
      }
      logError(logger, "Erro ao consultar favoritos:", error);
      return res.status(500).json({ message: "Erro ao consultar favoritos." });
    }
    return res.json(pageEnvelope(result.items, result.count, pagination));
  });

  router.post("/favorites", async (req, res) => {
    const id = parseMovieId(req.body?.tmdb_id);
    if (id === null) {
      return res.status(400).json({ message: "ID do filme inválido." });
    }

    try {
      if (!await favorites.add(id)) {
        return res.status(502).json({ message: `Resposta inválida do ${sourceName}.` });
      }
      return res.status(201).json({ message: "Filme salvo com sucesso!" });
    } catch (error) {
      if (error instanceof CatalogLookupError) {
        logError(logger, `Erro ao validar filme ${id} no ${sourceName}:`, error.cause);
        if (error.cause?.response?.status === 404) {
          return res.status(404).json({ message: `Filme não encontrado no ${sourceName}.` });
        }
        return res.status(502).json({ message: catalogUpstreamMessage(
          error, catalogSource, `${sourceName} indisponível.`
        ) });
      }
      if (error?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Filme já está nos favoritos." });
      }
      logError(logger, "Erro ao salvar favorito:", error);
      return res.status(500).json({ message: "Erro ao salvar o filme." });
    }
  });

  router.delete("/favorites/:tmdb_id", async (req, res) => {
    const id = parseStoredId(req.params.tmdb_id);
    if (id === null || !/^-?\d+$/.test(req.params.tmdb_id)) {
      return res.status(400).json({ message: "ID do filme inválido." });
    }

    try {
      const affectedRows = await favorites.remove(id);
      if (affectedRows === 0) {
        return res.status(404).json({ message: "Favorito não encontrado." });
      }
      return res.json({ message: "Filme deletado com sucesso!" });
    } catch (error) {
      logError(logger, "Erro ao deletar favorito:", error);
      return res.status(500).json({ message: "Erro ao deletar o filme." });
    }
  });

  return router;
}
module.exports = { createFavoritesRouter };
