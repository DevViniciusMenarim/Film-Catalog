import { useState } from "react";
import { posterUrl } from "./posterUrl";

function MoviePoster({ movie, detail = false }) {
  const poster = posterUrl(movie, detail ? "w342" : "w500");
  const [failedPoster, setFailedPoster] = useState(null);
  if (poster && poster !== failedPoster) {
    return <img className={detail ? "details-poster" : undefined} src={poster}
      alt={"Pôster do filme " + movie.title} loading={detail ? undefined : "lazy"}
      onError={() => setFailedPoster(poster)} />;
  }

  const year = movie.release_date?.slice(0, 4);
  return (
    <div className={`poster-placeholder poster-art poster-tone-${movie.id % 4}${detail ? " details-poster" : ""}`}
      role="img" aria-label={`Arte tipográfica do filme ${movie.title}; pôster indisponível`}>
      <span className="poster-art-label" aria-hidden="true">FILM CATALOG</span>
      <strong aria-hidden="true">{movie.title}</strong>
      <span className="poster-art-label" aria-hidden="true">{year || "CATÁLOGO"}</span>
    </div>
  );
}

export default MoviePoster;
