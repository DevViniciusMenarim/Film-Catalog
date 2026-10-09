require("dotenv").config();

const axios = require("axios");
const mysql = require("mysql2");
const { createApp } = require("./app");
const { createDemoCatalog } = require("./lib/demoCatalog");

function readInteger(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} deve ser um inteiro entre ${min} e ${max}.`);
  }
  return value;
}

function readFrontendOrigin() {
  const raw = process.env.FRONTEND_ORIGIN?.trim();
  if (!raw) return undefined;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("FRONTEND_ORIGIN deve ser uma origem HTTP(S) válida.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== raw) {
    throw new Error("FRONTEND_ORIGIN deve ser uma origem HTTP(S) válida.");
  }
  return raw;
}

const host = process.env.HOST || "127.0.0.1";
const containerBind = host === "0.0.0.0" && process.env.BIND_TO_CONTAINER_NETWORK === "1";
if (host !== "127.0.0.1" && host !== "::1" && !containerBind) {
  throw new Error("HOST deve ser loopback; 0.0.0.0 exige BIND_TO_CONTAINER_NETWORK=1.");
}

const port = readInteger("PORT", 3000, 1, 65535);
const dbPort = readInteger("DB_PORT", 3306, 1, 65535);
const timeout = readInteger("TMDB_TIMEOUT_MS", 5000, 1000, 30000);
const catalogSource = process.env.CATALOG_SOURCE?.trim() || "demo";
if (!["demo", "tmdb"].includes(catalogSource)) {
  throw new Error("CATALOG_SOURCE deve ser demo ou tmdb.");
}
const apiKey = process.env.TMDB_API_KEY?.trim();
if (!process.env.DB_USER || !process.env.DB_DATABASE) {
  throw new Error("Configure DB_USER e DB_DATABASE no Backend/.env.");
}
if (catalogSource === "tmdb" && !apiKey) {
  throw new Error("CATALOG_SOURCE=tmdb exige TMDB_API_KEY no Backend/.env.");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: dbPort,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_DATABASE,
});

const tmdb = catalogSource === "demo" ? createDemoCatalog() : (() => {
  const tmdbHttp = axios.create({
    baseURL: "https://api.themoviedb.org/3",
    timeout,
  });
  return {
    get(path, config = {}) {
      return tmdbHttp.get(path, {
        ...config,
        params: { api_key: apiKey, language: "pt-BR", ...config.params },
      });
    },
  };
})();

const app = createApp({
  db: pool.promise(),
  tmdb,
  catalogSource,
  frontendOrigin: readFrontendOrigin(),
});

app.listen(port, host, () => {
  console.log(`Servidor rodando em http://${host}:${port}`);
});
