function LibraryActionButtons({
  movie,
  isFavorite,
  isInWatchlist,
  busy,
  favoritesReady,
  watchlistReady,
  onToggleFavorite,
  onToggleWatchlist,
}) {
  return (
    <>
      <button
        type="button"
        className="secondary-button library-toggle-button"
        disabled={!favoritesReady}
        aria-disabled={busy || !favoritesReady}
        aria-pressed={isFavorite}
        aria-label={(isFavorite ? "Remover " : "Salvar ") + movie.title
          + (isFavorite ? " dos favoritos" : " nos favoritos")}
        onClick={(event) => { if (!busy) onToggleFavorite(movie, event.currentTarget); }}
      >
        {isFavorite ? "♥ Favorito" : "♡ Favoritar"}
      </button>
      <button
        type="button"
        className="secondary-button library-toggle-button"
        disabled={!watchlistReady}
        aria-disabled={busy || !watchlistReady}
        aria-pressed={isInWatchlist}
        aria-label={(isInWatchlist ? "Remover " : "Adicionar ") + movie.title
          + (isInWatchlist ? " da minha lista" : " à minha lista")}
        onClick={(event) => { if (!busy) onToggleWatchlist(movie, event.currentTarget); }}
      >
        {isInWatchlist ? "✓ Na minha lista" : "+ Minha lista"}
      </button>
    </>
  );
}

export default LibraryActionButtons;
