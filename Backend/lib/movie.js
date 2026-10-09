const { parseMovieId } = require("./common");
const { isDemoMovieId, isLegacyDemoMovieId } = require("./demoCatalog");

const IMAGE_PATH = /^\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i;
const YOUTUBE_KEY = /^[A-Za-z0-9_-]{11}$/;

function imagePath(value) {
  return typeof value === "string" && IMAGE_PATH.test(value) ? value : null;
}

function shortText(value, maxLength = 200) {
  return typeof value === "string" && value.trim().length <= maxLength
    ? value.trim() || null : null;
}

function brazilianCertification(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized === "LIVRE" || normalized === "0" ? "L"
    : /^(?:L|10|12|14|16|18)$/.test(normalized) ? normalized : null;
}

function directorOf(data) {
  const direct = shortText(data.director);
  if (direct) return direct;
  const crew = Array.isArray(data.credits?.crew) ? data.credits.crew : [];
  const names = [];
  for (const person of crew) {
    if (person?.job !== "Director") continue;
    const name = shortText(person.name);
    if (name && !names.includes(name)) names.push(name);
    if (names.length === 2) break;
  }
  return names.length ? names.join(" / ") : null;
}

function castOf(data) {
  const cast = Array.isArray(data.cast) ? data.cast
    : Array.isArray(data.credits?.cast) ? data.credits.cast : [];
  const names = [];
  for (const person of cast) {
    const name = shortText(typeof person === "string" ? person : person?.name);
    if (name && !names.includes(name)) names.push(name);
    if (names.length === 5) break;
  }
  return names;
}

function certificationOf(data) {
  const direct = brazilianCertification(data.certification_br);
  if (direct) return direct;
  const countries = Array.isArray(data.release_dates?.results) ? data.release_dates.results : [];
  const releases = countries.find((country) => country?.iso_3166_1 === "BR")?.release_dates;
  if (!Array.isArray(releases)) return null;
  // Prefer the nationwide theatrical release, then limited theatrical, then other releases.
  for (const type of [3, 2, 1, 4, 5, 6]) {
    for (const release of releases) {
      if (release?.type !== type) continue;
      const certification = brazilianCertification(release.certification);
      if (certification) return certification;
    }
  }
  return null;
}

function trailerOf(data) {
  if (typeof data.trailer_key === "string" && YOUTUBE_KEY.test(data.trailer_key)) {
    return data.trailer_key;
  }
  const videos = Array.isArray(data.videos?.results) ? data.videos.results : [];
  const trailers = videos.filter((video) => video?.site === "YouTube" &&
    video.type === "Trailer" && typeof video.key === "string" && YOUTUBE_KEY.test(video.key));
  trailers.sort((left, right) =>
    Number(right.official === true) - Number(left.official === true) ||
    Number(right.iso_639_1 === "pt") - Number(left.iso_639_1 === "pt"));
  return trailers[0]?.key ?? null;
}

function dateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return value >= "1000-01-01" && value <= "9999-12-31" &&
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function normalizeMovie(data, expectedId, detail = false) {
  const id = parseMovieId(data?.id);
  if (id === null || (expectedId !== undefined && id !== expectedId) ||
      typeof data.title !== "string" || !data.title.trim()) return null;

  const movie = {
    id,
    title: data.title.trim(),
    overview: typeof data.overview === "string" ? data.overview : "",
    poster_path: imagePath(data.poster_path),
    backdrop_path: imagePath(data.backdrop_path),
    release_date: dateOnly(data.release_date),
    vote_average: typeof data.vote_average === "number" &&
      Number.isFinite(data.vote_average) && data.vote_average >= 0 && data.vote_average <= 10
      ? data.vote_average : null,
  };

  if (detail) {
    movie.runtime = Number.isInteger(data.runtime) && data.runtime >= 0 && data.runtime <= 10000
      ? data.runtime : null;
    movie.genres = Array.isArray(data.genres)
      ? data.genres.map((genre) => ({ id: parseMovieId(genre?.id), name: genre?.name }))
        .filter((genre) => genre.id !== null && typeof genre.name === "string" && genre.name.trim())
        .map((genre) => ({ id: genre.id, name: genre.name.trim() }))
      : [];
    movie.tagline = typeof data.tagline === "string" ? data.tagline : "";
    movie.original_title = shortText(data.original_title, 500);
    movie.original_language = typeof data.original_language === "string" &&
      /^[a-z]{2}$/.test(data.original_language) ? data.original_language : null;
    movie.director = directorOf(data);
    movie.cast = castOf(data);
    movie.certification_br = certificationOf(data);
    movie.trailer_key = trailerOf(data);
  }
  return movie;
}

function normalizeMoviePage(data, requestedPage) {
  if (!Array.isArray(data?.results)) return null;
  const results = data.results.map((movie) => normalizeMovie(movie));
  if (results.some((movie) => movie === null)) return null;
  return {
    page: Number.isInteger(data.page) && data.page > 0 ? data.page : requestedPage,
    total_pages: Number.isInteger(data.total_pages) && data.total_pages >= 0
      ? data.total_pages : 1,
    total_results: Number.isInteger(data.total_results) && data.total_results >= 0
      ? data.total_results : results.length,
    results,
  };
}

function normalizeGenres(data) {
  if (!Array.isArray(data?.genres)) return null;
  const genres = data.genres.map((genre) => ({
    id: parseMovieId(genre?.id),
    name: genre?.name,
  }));
  if (genres.some((genre) => genre.id === null ||
      typeof genre.name !== "string" || !genre.name.trim())) return null;
  return { genres: genres.map((genre) => ({ id: genre.id, name: genre.name.trim() })) };
}

function fallbackMovie(id, title, releaseDate = null) {
  return {
    id,
    title: typeof title === "string" && title.trim() ? title : `Filme #${id}`,
    overview: "",
    poster_path: null,
    backdrop_path: null,
    release_date: dateOnly(releaseDate),
    vote_average: null,
  };
}

function isCatalogMovieId(id, catalogSource) {
  return catalogSource === "demo" ? isDemoMovieId(id) : !isLegacyDemoMovieId(id);
}

function catalogSourceName(catalogSource) {
  return catalogSource === "demo" ? "catálogo de demonstração" : "TMDB";
}

module.exports = {
  normalizeMovie,
  normalizeMoviePage,
  normalizeGenres,
  fallbackMovie,
  isCatalogMovieId,
  catalogSourceName,
};
