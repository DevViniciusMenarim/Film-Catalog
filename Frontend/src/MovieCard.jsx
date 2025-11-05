import React from "react";

function MovieCard({ movie, type, onSave, onDelete }) {
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : "https://via.placeholder.com/500x750.png?text=Sem+Imagem";

  const renderButtons = () => {
    if (type === "search") {
      return (
        <button className="save-btn" onClick={() => onSave(movie)}>
          Salvar
        </button>
      );
    } else {
      return (
        <button className="delete-btn" onClick={() => onDelete(movie.id)}>
          Deletar
        </button>
      );
    }
  };

  return (
    <div className="movie-card">
      <img src={posterUrl} alt={`Poster do filme ${movie.title}`} />
      <div className="movie-info">
        <h3>{movie.title}</h3>
        <p>{movie.overview || "Sem sinopse disponível."}</p>
        {renderButtons()}
      </div>
    </div>
  );
}

export default MovieCard;