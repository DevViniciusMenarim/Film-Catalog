import { useEffect, useRef, useState } from "react";
import LibraryActionButtons from "../library/LibraryActionButtons";
import MoviePoster from "./MoviePoster";
import { backdropUrl } from "./posterUrl";

function languageName(code) {
  if (typeof code !== "string" || !/^[a-z]{2,3}$/i.test(code)) return null;
  try {
    const name = new Intl.DisplayNames(["pt-BR"], { type: "language" }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase("pt-BR") + name.slice(1) : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

function trailerUrl(key) {
  return typeof key === "string" && /^[A-Za-z0-9_-]{11}$/.test(key)
    ? `https://www.youtube.com/watch?v=${key}`
    : null;
}

function brazilianRating(value) {
  if (value === "L") return "Livre";
  return /^\d{1,2}$/.test(value || "") ? `${Number(value)} anos` : value;
}

function MovieDetails({
  movie,
  catalogSource,
  details,
  loading,
  error,
  busy,
  favoritesReady,
  watchlistReady,
  isFavorite,
  isInWatchlist,
  onClose,
  onRetry,
  onToggleFavorite,
  onToggleWatchlist,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const [failedBackdrop, setFailedBackdrop] = useState(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    closeRef.current?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      if (previousFocus?.isConnected && previousFocus !== document.body) {
        previousFocus.focus({ preventScroll: true });
      }
      if (document.activeElement !== previousFocus) {
        document.getElementById("section-title")?.focus();
      }
    };
  }, []);

  const displayed = details || movie;
  const year = displayed.release_date?.slice(0, 4);
  const runtime = displayed.runtime ? displayed.runtime + " min" : null;
  const genres = details?.genres?.map((genre) => genre.name).join(", ");
  const score = typeof displayed.vote_average === "number" && displayed.vote_average > 0
    ? displayed.vote_average.toFixed(1) + "/10"
    : null;
  const scoreLabel = catalogSource === "tmdb" ? "Nota TMDB " : "Nota ";
  const backdrop = backdropUrl(displayed);
  const originalLanguage = languageName(details?.original_language);
  const trailer = trailerUrl(details?.trailer_key);

  return (
    <dialog
      ref={dialogRef}
      className="details-dialog"
      aria-labelledby="details-title"
      aria-describedby="details-overview"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="details-panel">
        <button
          ref={closeRef}
          type="button"
          className="close-button"
          aria-label="Fechar detalhes"
          onClick={onClose}
        >
          ×
        </button>
        {backdrop && backdrop !== failedBackdrop && (
          <img className="details-backdrop" src={backdrop} alt=""
            onError={() => setFailedBackdrop(backdrop)} />
        )}
        <div className="details-content">
          <MoviePoster movie={displayed} detail />
          <div>
            <h2 id="details-title">{displayed.title}</h2>
            {loading && <p role="status">Carregando detalhes...</p>}
            {error && (
              <div className="inline-error" role="alert">
                <p>{error}</p>
                <button type="button" className="secondary-button" onClick={onRetry}>Tentar novamente</button>
              </div>
            )}
            {!loading && !error && (
              <>
                <p className="details-meta">
                  {[year, runtime, genres, score && scoreLabel + score].filter(Boolean).join(" · ") || "Informações adicionais indisponíveis."}
                </p>
                {displayed.tagline && <p className="details-tagline">{displayed.tagline}</p>}
                {details && (
                  <dl className="details-facts">
                    {details.original_title && (
                      <div><dt>Título original</dt><dd>{details.original_title}</dd></div>
                    )}
                    {originalLanguage && (
                      <div><dt>Idioma original</dt><dd>{originalLanguage}</dd></div>
                    )}
                    {details.director && (
                      <div><dt>Direção</dt><dd>{details.director}</dd></div>
                    )}
                    {details.cast?.length > 0 && (
                      <div><dt>Elenco principal</dt><dd>{details.cast.join(", ")}</dd></div>
                    )}
                    {details.certification_br && (
                      <div><dt>Classificação no Brasil</dt><dd>{brazilianRating(details.certification_br)}</dd></div>
                    )}
                  </dl>
                )}
                {trailer && (
                  <a className="secondary-button details-trailer" href={trailer}
                    target="_blank" rel="noopener noreferrer">
                    Ver trailer no YouTube
                  </a>
                )}
              </>
            )}
            <h3>Sinopse</h3>
            <p id="details-overview" className="details-overview">
              {displayed.overview || "Sem sinopse disponível."}
            </p>
            <div className="details-actions">
              <LibraryActionButtons movie={movie} isFavorite={isFavorite}
                isInWatchlist={isInWatchlist} busy={busy}
                favoritesReady={favoritesReady} watchlistReady={watchlistReady}
                onToggleFavorite={onToggleFavorite} onToggleWatchlist={onToggleWatchlist} />
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

export default MovieDetails;
