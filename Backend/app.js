const express = require("express");
const { createCatalogRouter } = require("./routes/catalog");
const { createFavoritesRouter } = require("./routes/favorites");
const { createWatchlistRouter } = require("./routes/watchlist");
const { logError } = require("./lib/common");

function createApp({ db, tmdb, logger = console, frontendOrigin, catalogSource = "tmdb" } = {}) {
  if (!db || !tmdb) throw new Error("db e tmdb são obrigatórios.");

  const app = express();
  app.use(express.json());

  // The Vite proxy is same-origin. Direct browser access can allow one explicit origin.
  if (frontendOrigin) {
    const cors = require("cors");
    app.use(cors({ origin: frontendOrigin }));
  }

  app.get("/catalog-info", (_req, res) => {
    res.json({ source: catalogSource });
  });

  app.use(createCatalogRouter({ tmdb, logger, catalogSource }));
  app.use(createFavoritesRouter({ db, tmdb, logger, catalogSource }));
  app.use(createWatchlistRouter({ db, tmdb, logger, catalogSource }));
  app.use((_req, res) => res.status(404).json({ message: "Rota não encontrada." }));
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.type === "entity.parse.failed") {
      return res.status(400).json({ message: "JSON inválido." });
    }

    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500
      ? error.status : 500;
    if (status === 500) logError(logger, "Erro inesperado na API:", error);
    const message = status === 413 ? "Corpo da requisição excede o limite."
      : status === 415 ? "Formato da requisição não suportado."
        : status === 500 ? "Erro interno do servidor." : "Requisição inválida.";
    return res.status(status).json({ message });
  });
  return app;
}

module.exports = { createApp };
