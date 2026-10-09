const express = require("express");
const {
  parseMovieId,
  parsePagination,
  pageEnvelope,
  logError,
  catalogUpstreamMessage,
} = require("../lib/common");
const { catalogSourceName } = require("../lib/movie");
const { CatalogLookupError } = require("../services/catalogMovies");
const { WATCH_STATUSES, buildWatchlistUpdate } = require("../lib/watchlistUpdate");
const { createWatchlistService } = require("../services/watchlist");

function createWatchlistRouter({ db, tmdb, logger, catalogSource = "tmdb" }) {
  const router = express.Router();
  const sourceName = catalogSourceName(catalogSource);
  const watchlist = createWatchlistService({ db, tmdb, logger, catalogSource });
  router.get("/watchlist/ids", async (_req, res) => {
    try {
      return res.json(await watchlist.listIds());
    } catch (error) {
      logError(logger, "Erro ao consultar IDs da biblioteca:", error);
      return res.status(500).json({ message: "Erro ao consultar biblioteca." });
    }
  });

  router.get("/watchlist", async (req, res) => {
    const pagination = parsePagination(req.query);
    if (pagination === false) {
      return res.status(400).json({ message: "Paginação inválida." });
    }
    let result;
    try {
      result = await watchlist.list(pagination);
    } catch (error) {
      logError(logger, "Erro ao consultar biblioteca:", error);
      return res.status(500).json({ message: "Erro ao consultar biblioteca." });
    }
    return res.json(pageEnvelope(result.items, result.count, pagination));
  });

  router.post("/watchlist", async (req, res) => {
    const id = parseMovieId(req.body?.tmdb_id);
    const status = req.body?.watch_status;
    if (id === null || !WATCH_STATUSES.has(status)) {
      return res.status(400).json({ message: "Filme ou status inválido." });
    }

    try {
      if (!await watchlist.add(id, status)) {
        return res.status(502).json({ message: `Resposta inválida do ${sourceName}.` });
      }
      return res.status(201).json({ message: "Filme adicionado à biblioteca." });
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
        return res.status(409).json({ message: "Filme já está na biblioteca." });
      }
      logError(logger, "Erro ao adicionar filme à biblioteca:", error);
      return res.status(500).json({ message: "Erro ao salvar na biblioteca." });
    }
  });

  router.patch("/watchlist/:tmdb_id", async (req, res) => {
    const id = parseMovieId(req.params.tmdb_id);
    if (id === null) {
      return res.status(400).json({ message: "Atualização inválida." });
    }
    const update = buildWatchlistUpdate(req.body);
    if (update.error) return res.status(400).json({ message: update.error });
    const match = /^"([1-9]\d*)"$/.exec(req.get("If-Match") || "");
    const version = match ? Number(match[1]) : null;
    if (!Number.isSafeInteger(version)) {
      return res.status(428).json({ message: "Recarregue o registro antes de salvar." });
    }
    try {
      const result = await watchlist.update(id, { ...update, version });
      if (result === "missing") {
        return res.status(404).json({ message: "Filme não encontrado na biblioteca." });
      }
      if (result === "requires-watched") {
        return res.status(400).json({ message: "Filme não assistido não pode ter data ou nota." });
      }
      if (result === "conflict") {
        return res.status(409).json({ message: "Registro alterado em outra sessão. Recarregue antes de salvar." });
      }
      return res.json({ message: "Biblioteca atualizada." });
    } catch (error) {
      logError(logger, "Erro ao atualizar biblioteca:", error);
      return res.status(500).json({ message: "Erro ao atualizar biblioteca." });
    }
  });

  router.delete("/watchlist/:tmdb_id", async (req, res) => {
    const id = parseMovieId(req.params.tmdb_id);
    if (id === null) {
      return res.status(400).json({ message: "ID do filme inválido." });
    }

    try {
      const affectedRows = await watchlist.remove(id);
      if (affectedRows === 0) {
        return res.status(404).json({ message: "Filme não encontrado na biblioteca." });
      }
      return res.json({ message: "Filme removido da biblioteca." });
    } catch (error) {
      logError(logger, "Erro ao remover filme da biblioteca:", error);
      return res.status(500).json({ message: "Erro ao remover filme da biblioteca." });
    }
  });

  return router;
}
module.exports = { createWatchlistRouter };
