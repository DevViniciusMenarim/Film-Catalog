import { useCallback, useEffect, useState } from "react";

const views = new Set(["discover", "results", "favorites", "watchlist"]);
const discoverySorts = new Set(["popularity.desc", "vote_average.desc", "primary_release_date.desc"]);
const favoriteSorts = new Set(["title.asc", "title.desc", "release.desc"]);
export const latestCatalogYear = () => new Date().getFullYear() + 1;

export function normalizeRoute(value = {}) {
  const view = views.has(value.view) ? value.view : "discover";
  const rawPage = Number(value.page);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 500 ? rawPage : 1;
  const q = typeof value.q === "string" ? value.q.slice(0, 200) : "";
  const yearValue = Number(value.year);
  const year = /^\d{4}$/.test(String(value.year || ""))
    && yearValue >= 1878 && yearValue <= latestCatalogYear() ? String(yearValue) : "";

  if (view === "results") {
    return { view, q: q.trim(), year, page: q.trim() ? page : 1 };
  }
  if (view === "favorites") {
    return { view, q, sort: favoriteSorts.has(value.sort) ? value.sort : "title.asc", page };
  }
  if (view === "watchlist") return { view, page };

  const genreValue = Number(value.genre);
  const genre = Number.isSafeInteger(genreValue) && genreValue > 0 ? String(genreValue) : "";
  return { view, genre, year, sort: discoverySorts.has(value.sort) ? value.sort : "popularity.desc", page };
}

export function routeFromLocation(search = window.location.search) {
  const params = new URLSearchParams(search);
  return normalizeRoute(Object.fromEntries(params.entries()));
}

export function routeToUrl(route, location = window.location) {
  const normalized = normalizeRoute(route);
  const params = new URLSearchParams(location.search);
  for (const key of ["view", "q", "year", "genre", "sort", "page"]) params.delete(key);
  if (normalized.view !== "discover") params.set("view", normalized.view);
  if (normalized.q) params.set("q", normalized.q);
  if (normalized.year) params.set("year", normalized.year);
  if (normalized.genre) params.set("genre", normalized.genre);
  if (normalized.sort && normalized.sort !== "popularity.desc" && normalized.sort !== "title.asc") {
    params.set("sort", normalized.sort);
  }
  if (normalized.page > 1) params.set("page", String(normalized.page));
  const query = params.toString();
  return location.pathname + (query ? "?" + query : "") + location.hash;
}

export function useCatalogRoute() {
  const [route, setRoute] = useState(() => routeFromLocation());

  useEffect(() => {
    const url = routeToUrl(route);
    if (url !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, "", url);
    }
  }, [route]);

  useEffect(() => {
    const onPopState = () => setRoute(routeFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((nextRoute, { replace = false } = {}) => {
    const normalized = normalizeRoute(nextRoute);
    const url = routeToUrl(normalized);
    if (replace) window.history.replaceState(null, "", url);
    else if (url !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.pushState(null, "", url);
    }
    setRoute(normalized);
  }, []);

  return { route, navigate };
}
