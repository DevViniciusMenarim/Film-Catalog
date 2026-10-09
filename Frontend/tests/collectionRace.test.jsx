import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { libraryRouteKey, useMovieLibrary } from "../src/features/library/useMovieLibrary";

const movieA = { id: 1, title: "Filme A" };
const movieB = { id: 2, title: "Filme B" };
const page = (items) => ({ page: 1, pageSize: 12, totalPages: 1,
  totalCount: items.length, items });

test("mutação concluída após trocar o filtro não exibe itens da consulta anterior", async () => {
  let resolveDelete;
  const deletion = new Promise((resolve) => { resolveDelete = resolve; });
  const filteredRequests = [];
  let idsCalls = 0;
  const api = {
    getFavoriteIds: async () => ++idsCalls === 1 ? [1, 2] : [1],
    getWatchlistIds: async () => [],
    getFavoritesPage: ({ q }) => q
      ? new Promise((resolve) => { filteredRequests.push(resolve); })
      : Promise.resolve(page([movieA, movieB])),
    deleteFavorite: () => deletion,
  };
  const initialRoute = { view: "favorites", q: "", sort: "title.asc", page: 1 };
  const filteredRoute = { ...initialRoute, q: "Filme B" };
  const navigate = () => {};
  const notify = () => {};
  const { result, rerender } = renderHook(({ route }) =>
    useMovieLibrary(api, route, navigate, notify),
  { initialProps: { route: initialRoute } });

  await waitFor(() => expect(result.current.collection.items).toHaveLength(2));
  await waitFor(() => expect(result.current.favoritesReady).toBe(true));

  let mutation;
  act(() => { mutation = result.current.toggleFavorite(movieB); });
  rerender({ route: filteredRoute });
  await waitFor(() => expect(filteredRequests).toHaveLength(1));

  await act(async () => { resolveDelete(); await Promise.resolve(); });
  await waitFor(() => expect(filteredRequests).toHaveLength(2));
  expect(result.current.collection.key).toBe(libraryRouteKey(filteredRoute));
  expect(result.current.collection.loading).toBe(true);
  expect(result.current.collection.items).toEqual([]);

  await act(async () => { filteredRequests[1](page([])); await mutation; });
  expect(result.current.collection.items).toEqual([]);
});

test("duas alterações simultâneas não informam falha quando a segunda consulta substitui a primeira", async () => {
  let idsCalls = 0;
  let pageCalls = 0;
  const messages = [];
  const api = {
    getFavoriteIds: ({ signal }) => {
      idsCalls += 1;
      if (idsCalls === 1) return Promise.resolve([]);
      if (idsCalls === 2) return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Abortada", "AbortError")));
      });
      return Promise.resolve([1, 2]);
    },
    getWatchlistIds: async () => [],
    getFavoritesPage: ({ signal }) => {
      pageCalls += 1;
      if (pageCalls === 1) return Promise.resolve(page([]));
      if (pageCalls === 2) return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Abortada", "AbortError")));
      });
      return Promise.resolve(page([movieA, movieB]));
    },
    saveFavorite: async () => ({ message: "Salvo" }),
  };
  const route = { view: "favorites", q: "", sort: "title.asc", page: 1 };
  const navigate = () => {};
  const notify = (message, type) => messages.push({ message, type });
  const { result } = renderHook(() => useMovieLibrary(api, route, navigate, notify));
  await waitFor(() => expect(result.current.favoritesReady).toBe(true));

  act(() => { result.current.toggleFavorite(movieA); });
  await waitFor(() => {
    expect(idsCalls).toBe(2);
    expect(pageCalls).toBe(2);
  });
  act(() => { result.current.toggleFavorite(movieB); });
  await waitFor(() => expect(messages.filter(({ type }) => type === "success")).toHaveLength(2));

  expect([...result.current.favoriteIds]).toEqual([1, 2]);
  expect(result.current.collection.items.map((item) => item.movie.id)).toEqual([1, 2]);
  expect(messages.filter(({ type }) => type === "error")).toEqual([]);
});
