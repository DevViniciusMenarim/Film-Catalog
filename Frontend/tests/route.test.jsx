import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { latestCatalogYear, routeFromLocation, useCatalogRoute } from "../src/app/useCatalogRoute";

test("link direto restaura seção, filtro e página; popstate restaura a rota anterior", () => {
  window.history.replaceState(null, "", "/?view=results&q=Filme%20A&year=2020&page=2");
  const { result } = renderHook(() => useCatalogRoute());
  expect(result.current.route).toEqual({
    view: "results", q: "Filme A", year: "2020", page: 2,
  });

  act(() => result.current.navigate({ view: "favorites", q: "B", sort: "title.desc", page: 3 }));
  expect(window.location.search).toContain("view=favorites");
  expect(result.current.route).toEqual({
    view: "favorites", q: "B", sort: "title.desc", page: 3,
  });

  act(() => {
    window.history.replaceState(null, "", "/?view=results&q=Filme%20A&year=2020&page=2");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(result.current.route).toEqual({
    view: "results", q: "Filme A", year: "2020", page: 2,
  });
});

test("parâmetros inválidos na URL voltam a uma rota segura", () => {
  expect(routeFromLocation("?view=results&q=&page=999999")).toEqual({
    view: "results", q: "", year: "", page: 1,
  });
  expect(routeFromLocation("?view=watchlist&page=-3")).toEqual({ view: "watchlist", page: 1 });
});

test("ano acima do limite do formulário é removido da rota e da URL", () => {
  const invalidYear = latestCatalogYear() + 1;
  window.history.replaceState(null, "", `/?view=results&q=Filme&year=${invalidYear}`);
  const { result } = renderHook(() => useCatalogRoute());
  expect(result.current.route.year).toBe("");
  expect(new URLSearchParams(window.location.search).has("year")).toBe(false);
  expect(routeFromLocation(`?genre=28&year=${invalidYear}`).year).toBe("");
});
