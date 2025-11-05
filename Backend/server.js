require("dotenv").config();

const express = require("express");
const axios = require("axios");
const mysql2 = require("mysql2");
const cors = require("cors");

const pool = mysql2.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

const promisePool = pool.promise();
const PORT = 3000;

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const app = express();

app.use(express.json());
app.use(cors());

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} 🚀`);
});

app.get("/search", async (req, res) => {
  const { movie_query } = req.query;

  if (!movie_query) {
    return res.status(400).send({ message: "Termo da busca não fornecido." });
  }

  const url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${movie_query}`;

  try {
    const response = await axios.get(url);
    res.send(response.data);
  } catch (error) {
    console.error("Erro ao buscar no TMDB:", error.message);
    res.status(500).send({ message: "API do TMDB falhou." });
  }
});

app.get("/favorites", async (req, res) => {
  try {
    const [favorites] = await promisePool.execute(
      "SELECT tmdb_id FROM favorites"
    );

    const moviePromises = favorites.map((fav) => {
      const url = `${TMDB_BASE_URL}/movie/${fav.tmdb_id}?api_key=${TMDB_API_KEY}`;
      return axios.get(url).then((response) => response.data);
    });

    const detailedFavorites = await Promise.all(moviePromises);

    res.send(detailedFavorites);
  } catch (error) {
    console.error("Erro ao buscar favoritos detalhados:", error);
    res.status(500).send({ message: "Error fetching detailed favorites." });
  }
});

app.post("/favorites", async (req, res) => {
  try {
    const { tmdb_id, title } = req.body;
    const sql = "INSERT INTO favorites (tmdb_id, title) VALUES (?, ?)";
    await promisePool.execute(sql, [tmdb_id, title]);
    res.status(201).send({ message: "Filme salvo com sucesso!" });
  } catch (error) {
    console.error("Erro ao salvar favorito:", error);
    res.status(500).send({ message: "Error saving the movie." });
  }
});

app.delete("/favorites/:tmdb_id", async (req, res) => {
  try {
    const { tmdb_id } = req.params;
    const sql = "DELETE FROM favorites WHERE tmdb_id = ?";
    await promisePool.execute(sql, [tmdb_id]);
    res.send({ message: "Filme deletado com sucesso!" });
  } catch (error) {
    console.error("Erro ao deletar favorito:", error);
    res.status(500).send({ message: "Error deleting the movie." });
  }
});