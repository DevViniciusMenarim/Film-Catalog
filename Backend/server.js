const express = require("express");
const path = require("path");
const axios = require("axios");
const mysql2 = require("mysql2");

const pool = mysql2.createPool({
  host: "localhost",
  user: "root",
  password: "1234",
  database: "movie_catalog",
});

const promisePool = pool.promise();
const PORT = 3000;
const app = express();

app.use(express.static(path.join(__dirname, "../Frontend")));
app.use(express.json());

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/index.html"));
});

app.get("/search", (req, res) => {
  axios
    .get(
      `https://api.themoviedb.org/3/search/movie?api_key=5cf8c712b684facfec97b04bf1783a32&query=${req.query.movie_query}`
    )
    .then((response) => {
      res.send(response.data);
    })
    .catch((error) => {});
});

app.get("/favorites", async (req, res) => {
  try {
    const [favorites] = await promisePool.execute(
      "SELECT tmdb_id FROM favorites"
    );

    const moviePromises = favorites.map((fav) => {
      const url = `https://api.themoviedb.org/3/movie/${fav.tmdb_id}?api_key=5cf8c712b684facfec97b04bf1783a32`;
      return axios.get(url).then((response) => response.data);
    });

    const detailedFavorites = await Promise.all(moviePromises);

    res.send(detailedFavorites);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Error fetching detailed favorites." });
  }
});

app.post("/favorites", async (req, res) => {
  try {
    const { tmdb_id, title } = req.body;

    const sql = "INSERT INTO favorites (tmdb_id, title) VALUES (?, ?)";

    await promisePool.execute(sql, [tmdb_id, title]);

    res.status(201).send({ message: "Movie saved successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Error saving the movie." });
  }
});

app.delete("/favorites/:tmdb_id", async (req, res) => {
  try {
    const { tmdb_id } = req.params;

    const sql = "DELETE FROM favorites WHERE tmdb_id = ?";

    await promisePool.execute(sql, [tmdb_id]);

    res.send({ message: "Movie deleted successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Error deleting the movie." });
  }
});
