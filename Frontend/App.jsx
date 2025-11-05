import { useState } from "react";
import "./App.css";
import MovieCard from "./MovieCard";
import Notification from "./Notification";

function App() {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [view, setView] = useState("search");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  const API_URL = "http://localhost:3000";

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (searchTerm.trim() === "") return;

    setLoading(true);
    setError(null);
    setView("results");
    setFavorites([]);
    setNotification(null);

    try {
      const response = await fetch(
        `${API_URL}/search?movie_query=${searchTerm}`
      );
      const data = await response.json();
      setResults(data.results);
    } catch (error) {
      console.error("Error searching movies:", error);
      setError("Falha ao buscar filmes. Tente novamente.");
      showNotification("Falha ao buscar filmes. Tente novamente.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleViewFavorites = async () => {
    setLoading(true);
    setError(null);
    setView("favorites");
    setResults([]);
    setNotification(null);

    try {
      const response = await fetch(`${API_URL}/favorites`);
      const data = await response.json();
      setFavorites(data);
    } catch (error) {
      console.error("Error fetching favorites:", error);
      setError("Falha ao carregar favoritos. O backend está online?");
      showNotification("Falha ao carregar favoritos.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFavorite = async (movie) => {
    try {
      await fetch(`${API_URL}/favorites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tmdb_id: movie.id, title: movie.title }),
      });
      showNotification(`${movie.title} salvo nos favoritos!`, "success");
    } catch (error) {
      console.error("Error saving favorite:", error);
      showNotification(
        "Falha ao salvar. Este filme já é um favorito?",
        "error"
      );
    }
  };

  const handleDeleteFavorite = async (tmdb_id) => {
    try {
      await fetch(`${API_URL}/favorites/${tmdb_id}`, {
        method: "DELETE",
      });
      setFavorites(favorites.filter((movie) => movie.id !== tmdb_id));
      showNotification("Filme removido dos favoritos!", "success");
    } catch (error) {
      console.error("Error deleting favorite:", error);
      showNotification("Falha ao deletar o filme.", "error");
    }
  };

  const moviesToDisplay = view === "results" ? results : favorites;
  const displayType = view === "results" ? "search" : "favorites";

  const renderContent = () => {
    if (loading) {
      return <p className="loading">Carregando...</p>;
    }
    if (error) {
      return <p className="error-message">{error}</p>;
    }
    if (moviesToDisplay.length > 0) {
      return moviesToDisplay.map((movie) => (
        <MovieCard
          key={movie.id}
          movie={movie}
          type={displayType}
          onSave={handleSaveFavorite}
          onDelete={handleDeleteFavorite}
        />
      ));
    }
    return (
      <p>
        {view === "favorites"
          ? "Você ainda não salvou nenhum favorito."
          : "Use a busca para encontrar filmes."}
      </p>
    );
  };

  return (
    <>
      <header>
        <h1>Meu Catálogo de Filmes</h1>
      </header>

      <main>
        <div className="controls">
          <form onSubmit={handleSearch}>
            <input
              type="text"
              name="movie_query"
              placeholder="Digite o nome do filme..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button type="submit">Buscar</button>
          </form>
          <button id="view-favorites-btn" onClick={handleViewFavorites}>
            Ver Favoritos
          </button>
        </div>

        <div id="results">{renderContent()}</div>
      </main>

      <footer>
        <p>&copy; 2025 Movie Catalog. All rights reserved.</p>
      </footer>

      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </>
  );
}

export default App;