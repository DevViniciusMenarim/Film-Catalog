const imagePathPattern = /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i;

function imageUrl(path, size) {
  return typeof path === "string" && imagePathPattern.test(path)
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : null;
}

export function posterUrl(movie, size = "w500") {
  return imageUrl(movie?.poster_path, size);
}

export function backdropUrl(movie) {
  return imageUrl(movie?.backdrop_path, "w780");
}
