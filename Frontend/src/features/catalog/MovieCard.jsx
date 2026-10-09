import { useState } from "react";
import LibraryActionButtons from "../library/LibraryActionButtons";
import WatchlistEditor from "../library/WatchlistEditor";
import MoviePoster from "./MoviePoster";

function MovieCard({
  movie,
  watchlistEntry,
  isFavorite,
  isInWatchlist,
  busy,
  favoritesReady,
  watchlistReady,
  onDetails,
  onToggleFavorite,
  onToggleWatchlist,
  onUpdateWatchlist,
}) {
  const [editing, setEditing] = useState(false);
  const year = movie.release_date?.slice(0, 4);

  return (
    <article className="movie-card">
      <MoviePoster movie={movie} />
      <div className="movie-info">
        <h3>{movie.title}</h3>
        {year && <span className="movie-year">{year}</span>}
        {watchlistEntry && (
          <p className="list-summary">
            {watchlistEntry.watch_status === "watched" ? "Assistido" : "Quero assistir"}
            {watchlistEntry.personal_rating ? " · Minha nota: " + watchlistEntry.personal_rating + "/5" : ""}
          </p>
        )}
        <p className="movie-overview">{movie.overview || "Sem sinopse disponível."}</p>
        <div className="card-actions">
          <button
            type="button"
            className="primary-button details-button"
            aria-label={"Ver detalhes de " + movie.title}
            onClick={() => onDetails(movie)}
          >
            Detalhes
          </button>
          <LibraryActionButtons movie={movie} isFavorite={isFavorite} isInWatchlist={isInWatchlist}
            busy={busy} favoritesReady={favoritesReady} watchlistReady={watchlistReady}
            onToggleFavorite={onToggleFavorite} onToggleWatchlist={onToggleWatchlist} />
          {watchlistEntry && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              aria-expanded={editing}
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? "Fechar edição" : "Editar registro"}
            </button>
          )}
        </div>
        {editing && watchlistEntry && (
          <WatchlistEditor
            entry={watchlistEntry}
            busy={busy}
            onSave={onUpdateWatchlist}
            onClose={() => setEditing(false)}
          />
        )}
      </div>
    </article>
  );
}

export default MovieCard;
