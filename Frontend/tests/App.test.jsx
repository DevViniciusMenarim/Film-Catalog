import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const movieA = {
  id: 1,
  title: "Filme A",
  overview: "Sinopse curta A",
  release_date: "2020-01-01",
  poster_path: null,
};
const movieB = {
  id: 2,
  title: "Filme B",
  overview: "Sinopse curta B",
  release_date: "2021-01-01",
  poster_path: null,
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pageResponse(items, url) {
  const params = new URL(url, "http://localhost").searchParams;
  const page = Number(params.get("page") || 1);
  const pageSize = Number(params.get("pageSize") || 12);
  const q = params.get("q")?.toLocaleLowerCase("pt-BR") || "";
  const sort = params.get("sort") || "title.asc";
  const filtered = items.filter((item) => (item.movie?.title || item.title)
    .toLocaleLowerCase("pt-BR").includes(q));
  if (sort === "title.asc" || sort === "title.desc") {
    filtered.sort((left, right) => (left.movie?.title || left.title)
      .localeCompare(right.movie?.title || right.title, "pt-BR")
      * (sort === "title.desc" ? -1 : 1));
  }
  return jsonResponse({ page, pageSize, totalPages: Math.ceil(filtered.length / pageSize),
    totalCount: filtered.length, items: filtered.slice((page - 1) * pageSize, page * pageSize) });
}

let App;
let handler;
const fetchMock = vi.fn((url, options) => handler(url, options));

function baseHandler(url) {
  const parsed = new URL(url, "http://localhost");
  if (parsed.pathname === "/api/catalog-info") {
    return jsonResponse({ source: "tmdb" });
  }
  if (parsed.pathname === "/api/discover") {
    return jsonResponse({ page: 1, total_pages: 1, results: [movieA] });
  }
  if (parsed.pathname === "/api/genres") {
    return jsonResponse({ genres: [{ id: 28, name: "Ação" }] });
  }
  if (parsed.pathname === "/api/favorites/ids" || parsed.pathname === "/api/watchlist/ids") {
    return jsonResponse([]);
  }
  if (parsed.pathname === "/api/favorites" || parsed.pathname === "/api/watchlist") {
    return pageResponse([], url);
  }
  throw new Error("Requisição inesperada: " + url);
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  App = (await import("../src/app/App.jsx")).default;
});

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  fetchMock.mockClear();
  handler = baseHandler;
});

test("modo de demonstração mostra pôster e ficha ampliada sem avaliação TMDB", async () => {
  const demoMovie = { ...movieA, id: 11, title: "Guerra nas Estrelas",
    release_date: "1977-05-25", poster_path: "/star-wars.jpg",
    backdrop_path: "/star-wars-bg.jpg", vote_average: null };
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/catalog-info") {
      return jsonResponse({ source: "demo" });
    }
    if (parsed.pathname === "/api/discover") {
      return jsonResponse({ page: 1, total_pages: 3, results: [demoMovie] });
    }
    if (parsed.pathname === "/api/movies/11") {
      return jsonResponse({ ...demoMovie, runtime: 121,
        genres: [{ id: 12, name: "Aventura" }],
        original_title: "Star Wars", original_language: "en",
        director: "George Lucas", cast: ["Mark Hamill", "Carrie Fisher"],
        certification_br: "10", trailer_key: "abcDEF123_-" });
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  const notice = await screen.findByRole("note");
  expect(notice.textContent).toMatch(/Modo de demonstração/);
  expect(within(notice).getByText("Explore uma seleção de filmes reais com dados do TMDB. Para acessar o catálogo completo, configure uma chave da API do TMDB.")).toBeTruthy();
  const poster = await screen.findByRole("img", { name: "Pôster do filme Guerra nas Estrelas" });
  expect(poster.getAttribute("src")).toContain("/star-wars.jpg");
  expect(screen.getByRole("option", { name: "Melhor avaliação" }).disabled).toBe(true);
  await user.click(await screen.findByRole("button", { name: "Ver detalhes de Guerra nas Estrelas" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.querySelector(".details-backdrop")?.getAttribute("src")).toContain("/star-wars-bg.jpg");
  expect(dialog.textContent).toContain("121 min");
  expect(dialog.textContent).toContain("Aventura");
  expect(dialog.textContent).toContain("Star Wars");
  expect(dialog.textContent).toContain("Inglês");
  expect(dialog.textContent).toContain("George Lucas");
  expect(dialog.textContent).toContain("Mark Hamill, Carrie Fisher");
  expect(dialog.textContent).toContain("10 anos");
  const trailer = within(dialog).getByRole("link", { name: "Ver trailer no YouTube" });
  expect(trailer.getAttribute("href")).toBe("https://www.youtube.com/watch?v=abcDEF123_-");
  expect(trailer.getAttribute("target")).toBe("_blank");
  expect(trailer.getAttribute("rel")).toContain("noopener");
  expect(dialog.textContent).not.toContain("Nota ");
});

test("pôster que falha volta para a arte tipográfica", async () => {
  handler = (url, options) => {
    if (new URL(url, "http://localhost").pathname === "/api/discover") {
      return jsonResponse({ page: 1, total_pages: 1,
        results: [{ ...movieA, poster_path: "/unavailable.jpg" }] });
    }
    return baseHandler(url, options);
  };
  render(<App />);
  const poster = await screen.findByRole("img", { name: "Pôster do filme Filme A" });
  fireEvent.error(poster);
  expect(await screen.findByRole("img", { name: /Arte tipográfica do filme Filme A/ })).toBeTruthy();
});

test("modo TMDB exibe pôster e avaliação oficial ao abrir o mesmo filme", async () => {
  const tmdbMovie = { ...movieA, id: 11, title: "Guerra nas Estrelas",
    poster_path: "/official.jpg", vote_average: 8.2 };
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/discover") {
      return jsonResponse({ page: 1, total_pages: 1, results: [tmdbMovie] });
    }
    if (parsed.pathname === "/api/movies/11") {
      return jsonResponse({ ...tmdbMovie, runtime: 121, genres: [] });
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  const poster = await screen.findByRole("img", { name: "Pôster do filme Guerra nas Estrelas" });
  expect(poster.getAttribute("src")).toContain("/official.jpg");
  expect(screen.queryByText(/Modo de demonstração/)).toBeNull();
  expect(screen.getByRole("option", { name: "Melhor avaliação" }).disabled).toBe(false);
  await user.click(screen.getByRole("button", { name: "Ver detalhes de Guerra nas Estrelas" }));
  expect((await screen.findByRole("dialog")).textContent).toContain("Nota TMDB 8.2/10");
});

afterEach(() => cleanup());
afterAll(() => vi.unstubAllGlobals());

test("descoberta aplica filtros e navega entre páginas pela URL", async () => {
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/discover") {
      return jsonResponse({
        page: Number(parsed.searchParams.get("page")),
        total_pages: 2,
        results: parsed.searchParams.get("page") === "2" ? [movieB] : [movieA],
      });
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Filme A" });

  const filtersPanel = document.querySelector(".discover-filters");
  expect(filtersPanel.open).toBe(false);
  await user.click(screen.getByText("Refinar descoberta"));
  expect(filtersPanel.open).toBe(true);
  await user.selectOptions(screen.getByLabelText("Gênero"), "28");
  await user.type(screen.getByLabelText("Ano", { exact: true }), "2020");
  expect(filtersPanel.open).toBe(true);
  await user.selectOptions(screen.getByLabelText("Ordenar por"), "vote_average.desc");
  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

  await waitFor(() => {
    const filtered = fetchMock.mock.calls.find(([url]) => {
      const parsed = new URL(url, "http://localhost");
      return parsed.pathname === "/api/discover" && parsed.searchParams.get("genre") === "28";
    });
    expect(filtered).toBeTruthy();
    const parsed = new URL(filtered[0], "http://localhost");
    expect(parsed.searchParams.get("year")).toBe("2020");
    expect(parsed.searchParams.get("sort")).toBe("vote_average.desc");
  });

  await user.click(await screen.findByRole("button", { name: "Próxima página" }));
  await screen.findByRole("heading", { name: "Filme B" });
  expect(screen.queryByRole("heading", { name: "Filme A" })).toBeNull();
  expect(new URLSearchParams(window.location.search).get("page")).toBe("2");
  expect(fetchMock.mock.calls.some(([url]) => {
    const parsed = new URL(url, "http://localhost");
    return parsed.pathname === "/api/discover" && parsed.searchParams.get("page") === "2";
  })).toBe(true);
});

test.each([
  { initialUrl: "/?page=5", endpoint: "/api/discover", lastPage: 4, query: null },
  { initialUrl: "/?view=results&q=Filme&page=2", endpoint: "/api/search", lastPage: 1, query: "Filme" },
])("link direto fora da paginação volta à última página disponível: $endpoint", async ({
  initialUrl, endpoint, lastPage, query,
}) => {
  window.history.replaceState(null, "", initialUrl);
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === endpoint) {
      const page = Number(parsed.searchParams.get("page"));
      return jsonResponse({ page, total_pages: lastPage,
        results: page === lastPage ? [movieB] : [] });
    }
    return baseHandler(url, options);
  };

  render(<App />);
  await screen.findByRole("heading", { name: "Filme B" });
  const params = new URLSearchParams(window.location.search);
  expect(params.get("page")).toBe(lastPage === 1 ? null : String(lastPage));
  expect(params.get("q")).toBe(query);
  expect(fetchMock.mock.calls.some(([url]) => {
    const parsed = new URL(url, "http://localhost");
    return parsed.pathname === endpoint && parsed.searchParams.get("page") === String(lastPage);
  })).toBe(true);
});

test("favorito salvo aparece na descoberta e pode ser removido mesmo se a lista pessoal falhar", async () => {
  let saved = true;
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/favorites/ids") return jsonResponse(saved ? [1] : []);
    if (parsed.pathname === "/api/watchlist/ids") return jsonResponse({ message: "Tabela indisponível" }, 500);
    if (parsed.pathname === "/api/favorites/1" && options?.method === "DELETE") {
      saved = false;
      return jsonResponse({ message: "Removido" });
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Filme A" });
  const remove = await screen.findByRole("button", { name: "Remover Filme A dos favoritos" });
  expect(remove.disabled).toBe(false);

  await user.click(remove);
  await screen.findByRole("button", { name: "Salvar Filme A nos favoritos" });
  expect(fetchMock.mock.calls.some(([url, options]) =>
    url === "/api/favorites/1" && options?.method === "DELETE")).toBe(true);
});

test("edição para Quero assistir limpa data e nota do registro", async () => {
  let entry = {
    tmdb_id: 1,
    title: "Filme A",
    version: 1,
    watch_status: "watched",
    watched_at: "2026-10-01",
    personal_rating: 4,
    notes: "Gostei",
    movie: movieA,
  };
  let patchBody;
  let patchVersion;
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/watchlist/ids") return jsonResponse([1]);
    if (parsed.pathname === "/api/watchlist" && !options?.method) return pageResponse([entry], url);
    if (parsed.pathname === "/api/watchlist/1" && options?.method === "PATCH") {
      patchBody = JSON.parse(options.body);
      patchVersion = options.headers["If-Match"];
      entry = { ...entry, ...patchBody, version: entry.version + 1 };
      return jsonResponse({ message: "Atualizado" });
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Filme A" });
  await user.click(screen.getByRole("link", { name: "Minha lista", exact: true }));
  await screen.findByRole("button", { name: "Editar registro" });
  await user.click(screen.getByRole("button", { name: "Editar registro" }));
  await user.selectOptions(screen.getByLabelText("Estado"), "want_to_watch");
  expect(screen.queryByLabelText("Data em que assistiu")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Salvar registro" }));

  await waitFor(() => expect(patchBody).toBeTruthy());
  expect(patchBody.watch_status).toBe("want_to_watch");
  expect(patchBody.watched_at).toBeNull();
  expect(patchBody.personal_rating).toBeNull();
  expect(patchVersion).toBe('"1"');
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Salvar registro" })).toBeNull();
    expect(document.querySelector(".list-summary")?.textContent).toContain("Quero assistir");
  });
});

test("conflito na edição preserva rascunho e exige reabrir registro atualizado", async () => {
  let entry = {
    tmdb_id: 1, title: "Filme A", version: 1, watch_status: "want_to_watch",
    watched_at: null, personal_rating: null, notes: "Nota antiga", movie: movieA,
  };
  const patchVersions = [];
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/watchlist/ids") return jsonResponse([1]);
    if (parsed.pathname === "/api/watchlist" && !options?.method) return pageResponse([entry], url);
    if (parsed.pathname === "/api/watchlist/1" && options?.method === "PATCH") {
      patchVersions.push(options.headers["If-Match"]);
      if (patchVersions.length === 1) {
        entry = { ...entry, version: 2, notes: "Outra sessão" };
        return jsonResponse({ message: "Registro alterado em outra sessão" }, 409);
      }
      entry = { ...entry, ...JSON.parse(options.body), version: 3 };
      return jsonResponse({ message: "Atualizado" });
    }
    return baseHandler(url, options);
  };

  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Filme A" });
  await user.click(screen.getByRole("link", { name: "Minha lista", exact: true }));
  await user.click(await screen.findByRole("button", { name: "Editar registro" }));
  const notes = screen.getByLabelText("Comentário pessoal");
  await user.clear(notes);
  await user.type(notes, "Meu rascunho");
  await user.click(screen.getByRole("button", { name: "Salvar registro" }));

  await screen.findByText(/Seu rascunho não foi salvo/);
  expect(screen.getByLabelText("Comentário pessoal").value).toBe("Meu rascunho");
  expect(screen.getByRole("button", { name: "Salvar registro" }).disabled).toBe(true);
  expect(patchVersions).toEqual(['"1"']);

  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  await user.click(screen.getByRole("button", { name: "Editar registro" }));
  expect(screen.getByLabelText("Comentário pessoal").value).toBe("Outra sessão");
  await user.clear(screen.getByLabelText("Comentário pessoal"));
  await user.type(screen.getByLabelText("Comentário pessoal"), "Nota revisada");
  await user.click(screen.getByRole("button", { name: "Salvar registro" }));
  await waitFor(() => expect(patchVersions).toEqual(['"1"', '"2"']));
  expect(entry.notes).toBe("Nota revisada");
  expect(entry.version).toBe(3);
});

test("resposta tardia da edição não cria editor na descoberta", async () => {
  let resolvePatch;
  const patchResponse = new Promise((resolve) => { resolvePatch = resolve; });
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/watchlist/ids") return jsonResponse([1]);
    if (parsed.pathname === "/api/watchlist" && !options?.method) {
      return pageResponse([{
        tmdb_id: 1,
        title: "Filme A",
        version: 1,
        watch_status: "want_to_watch",
        watched_at: null,
        personal_rating: null,
        notes: null,
        movie: movieA,
      }], url);
    }
    if (parsed.pathname === "/api/watchlist/1" && options?.method === "PATCH") {
      return patchResponse;
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Filme A" });
  await user.click(screen.getByRole("link", { name: "Minha lista", exact: true }));
  await screen.findByRole("button", { name: "Editar registro" });
  await user.click(screen.getByRole("button", { name: "Editar registro" }));
  await user.type(screen.getByLabelText("Comentário pessoal"), "Depois vejo");
  await user.click(screen.getByRole("button", { name: "Salvar registro" }));
  await user.click(screen.getByRole("link", { name: "Descobrir", exact: true }));
  await screen.findByRole("heading", { name: "Filme A" });

  resolvePatch(jsonResponse({ message: "Atualizado" }));
  await screen.findByText("Registro atualizado.");
  expect(screen.queryByRole("button", { name: "Editar registro" })).toBeNull();
});

test("sincronização antiga da lista não sobrescreve IDs de uma mutação mais recente", async () => {
  let idsCalls = 0;
  const pendingIds = [];
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/discover") {
      return jsonResponse({ page: 1, total_pages: 1, results: [movieA, movieB] });
    }
    if (parsed.pathname === "/api/watchlist/ids") {
      idsCalls += 1;
      if (idsCalls === 1) return jsonResponse([]);
      return new Promise((resolve) => pendingIds.push(resolve));
    }
    if (parsed.pathname === "/api/watchlist" && options?.method === "POST") {
      return jsonResponse({ message: "Adicionado" }, 201);
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Filme B" });
  await user.click(screen.getByRole("button", { name: "Adicionar Filme A à minha lista" }));
  await user.click(screen.getByRole("button", { name: "Adicionar Filme B à minha lista" }));
  await waitFor(() => expect(pendingIds.length).toBe(2));

  await act(async () => pendingIds[1](jsonResponse([1, 2])));
  await act(async () => pendingIds[0](jsonResponse([1])));

  expect(screen.getByRole("button", { name: "Remover Filme A da minha lista" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Remover Filme B da minha lista" }).getAttribute("aria-pressed")).toBe("true");
});

test("GET antigo da Minha lista não substitui recarga feita após o POST", async () => {
  let resolvePost;
  let resolveOldList;
  const postResponse = new Promise((resolve) => { resolvePost = resolve; });
  const oldListResponse = new Promise((resolve) => { resolveOldList = resolve; });
  let watchlistGets = 0;
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/watchlist/ids") {
      return jsonResponse(watchlistGets ? [1] : []);
    }
    if (parsed.pathname === "/api/watchlist" && options?.method === "POST") {
      return postResponse;
    }
    if (parsed.pathname === "/api/watchlist" && !options?.method) {
      watchlistGets += 1;
      if (watchlistGets === 1) return oldListResponse;
      return pageResponse([{
        tmdb_id: 1,
        title: "Filme A",
        version: 1,
        watch_status: "want_to_watch",
        watched_at: null,
        personal_rating: null,
        notes: null,
        movie: movieA,
      }], url);
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Filme A" });
  const add = screen.getByRole("button", { name: "Adicionar Filme A à minha lista" });
  await waitFor(() => expect(add.disabled).toBe(false));
  await user.click(add);
  await user.click(screen.getByRole("link", { name: "Minha lista", exact: true }));
  await waitFor(() => expect(watchlistGets).toBe(1));
  expect(screen.getByText("Carregando filmes...")).toBeTruthy();

  await act(async () => resolvePost(jsonResponse({ message: "Adicionado" }, 201)));
  await waitFor(() => expect(watchlistGets).toBe(2));
  await screen.findByRole("button", { name: "Editar registro" });
  expect(screen.queryByText("Carregando filmes...")).toBeNull();

  await act(async () => resolveOldList(pageResponse([], "/api/watchlist?page=1&pageSize=12")));
  expect(screen.getByRole("button", { name: "Editar registro" })).toBeTruthy();
  expect(screen.queryByText("Carregando filmes...")).toBeNull();
});

test("ficha mostra detalhes completos e fecha devolvendo o foco", async () => {
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/movies/1") {
      return jsonResponse({
        ...movieA,
        overview: "Sinopse completa do filme A.",
        runtime: 123,
        genres: [{ id: 28, name: "Ação" }],
        vote_average: 8.3,
      });
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Filme A" });
  const open = screen.getByRole("button", { name: "Ver detalhes de Filme A" });
  await user.click(open);
  await screen.findByText("Sinopse completa do filme A.");
  expect(screen.getByRole("dialog").textContent).toContain("123 min");
  expect(screen.getByRole("dialog").textContent).toContain("Ação");
  await user.click(screen.getByRole("button", { name: "Fechar detalhes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(open);
});

test("falha ao identificar a fonte pode ser corrigida por nova tentativa", async () => {
  let attempts = 0;
  handler = (url, options) => {
    if (new URL(url, "http://localhost").pathname === "/api/catalog-info") {
      attempts += 1;
      return attempts === 1 ? jsonResponse({ message: "Indisponível" }, 503)
        : jsonResponse({ source: "tmdb" });
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);

  await screen.findByText(/Não foi possível identificar a fonte do catálogo/);
  await user.click(screen.getByRole("link", { name: "Descobrir", exact: true }));
  expect(screen.getByRole("option", { name: "Melhor avaliação" }).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await waitFor(() => expect(screen.getByRole("option", { name: "Melhor avaliação" }).disabled).toBe(false));
  expect(attempts).toBe(2);
  expect(screen.queryByText(/Não foi possível identificar a fonte do catálogo/)).toBeNull();
});

test("filtro de favoritos só consulta ao aplicar, restaura o texto e ordena", async () => {
  const queries = [];
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/favorites") {
      queries.push(parsed.searchParams.get("q") || "");
      return pageResponse([movieA, movieB], url);
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Filme A" });
  await user.click(screen.getByRole("link", { name: "Favoritos", exact: true }));
  await screen.findByRole("heading", { name: "Filme B" });

  const filter = screen.getByLabelText("Filtrar favoritos pelo título");
  await user.type(filter, "Filme B");
  expect(queries).toEqual([""]);
  expect(new URLSearchParams(window.location.search).has("q")).toBe(false);
  await user.keyboard("{Enter}");
  await waitFor(() => expect(queries).toEqual(["", "Filme B"]));
  expect(new URLSearchParams(window.location.search).get("q")).toBe("Filme B");
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Filme A" })).toBeNull());

  await act(async () => window.history.back());
  await waitFor(() => expect(filter.value).toBe(""));
  await screen.findByRole("heading", { name: "Filme A" });
  expect(new URLSearchParams(window.location.search).has("q")).toBe(false);
  await user.selectOptions(screen.getByLabelText("Ordenar favoritos"), "title.desc");
  await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent)).toEqual(["Filme B", "Filme A"]));
});

test("paginação preserva o controle durante a espera e só move foco após clique", async () => {
  let resolveSecondPage;
  const secondPage = new Promise((resolve) => { resolveSecondPage = resolve; });
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/discover") {
      return parsed.searchParams.get("page") === "2" ? secondPage
        : jsonResponse({ page: 1, total_pages: 2, results: [movieA] });
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("button", { name: "Próxima página" });
  expect(document.activeElement).not.toBe(document.getElementById("section-title"));
  const next = screen.getByRole("button", { name: "Próxima página" });
  await user.click(next);
  await screen.findByText("Carregando filmes...");
  expect(next.isConnected).toBe(true);
  expect(document.activeElement).toBe(next);
  expect(screen.getByRole("navigation", { name: "Paginação de filmes" }).textContent)
    .toContain("Carregando página 2 de 2");

  await act(async () => resolveSecondPage(jsonResponse({
    page: 2, total_pages: 2, results: [movieB],
  })));
  await screen.findByRole("heading", { name: "Filme B" });
  await waitFor(() => expect(document.activeElement).toBe(document.getElementById("section-title")));
});

test("edição de registro removido em outra sessão fecha o editor e recarrega a lista", async () => {
  let removed = false;
  let listReads = 0;
  const entry = { tmdb_id: 1, title: "Filme A", version: 1, watch_status: "want_to_watch",
    watched_at: null, personal_rating: null, notes: null, movie: movieA };
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/watchlist/ids") return jsonResponse(removed ? [] : [1]);
    if (parsed.pathname === "/api/watchlist" && !options?.method) {
      listReads += 1;
      return pageResponse(removed ? [] : [entry], url);
    }
    if (parsed.pathname === "/api/watchlist/1" && options?.method === "PATCH") {
      removed = true;
      return jsonResponse({ message: "Não encontrado" }, 404);
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Filme A" });
  await user.click(screen.getByRole("link", { name: "Minha lista", exact: true }));
  await user.click(await screen.findByRole("button", { name: "Editar registro" }));
  await user.type(screen.getByLabelText("Comentário pessoal"), "Nota nova");
  await user.click(screen.getByRole("button", { name: "Salvar registro" }));

  await screen.findByText(/Este registro foi removido em outra sessão/);
  await screen.findByText(/Sua lista está vazia/);
  expect(screen.queryByRole("button", { name: "Salvar registro" })).toBeNull();
  expect(listReads).toBeGreaterThan(1);
});

test("ficha devolve foco ao título quando o card que a abriu é removido", async () => {
  let saved = true;
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/favorites/ids") return jsonResponse(saved ? [1] : []);
    if (parsed.pathname === "/api/favorites" && !options?.method) {
      return pageResponse(saved ? [movieA] : [], url);
    }
    if (parsed.pathname === "/api/favorites/1" && options?.method === "DELETE") {
      saved = false;
      return jsonResponse({ message: "Removido" });
    }
    if (parsed.pathname === "/api/movies/1") return jsonResponse(movieA);
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Filme A" });
  await user.click(screen.getByRole("link", { name: "Favoritos", exact: true }));
  await screen.findByRole("heading", { name: "Filme A" });
  const opener = screen.getByRole("button", { name: "Ver detalhes de Filme A" });
  await user.click(opener);
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Remover Filme A dos favoritos" }));
  await waitFor(() => expect(opener.isConnected).toBe(false));
  await user.click(within(dialog).getByRole("button", { name: "Fechar detalhes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(document.getElementById("section-title"));
});

test("Busca vazia mostra apenas a busca sem carregar resultados e preserva a navegação", async () => {
  window.history.replaceState(null, "", "/?view=results");
  const user = userEvent.setup();
  render(<App />);

  expect(screen.getByRole("heading", { name: "Buscar filmes" })).toBeTruthy();
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(document.querySelector(".results-section")).toBeNull();
  expect(screen.getByRole("link", { name: "Buscar", exact: true }).getAttribute("aria-current"))
    .toBe("page");
  expect(screen.getByRole("link", { name: "Favoritos", exact: true }).getAttribute("href"))
    .toBe("/?view=favorites");
  expect(document.title).toBe("Buscar | Film Catalog");
  expect(fetchMock.mock.calls.some(([url]) => /\/api\/(search|discover)/.test(url))).toBe(false);

  await user.click(screen.getByRole("link", { name: "Minha lista", exact: true }));
  expect(document.getElementById("page-title")?.textContent).toBe("Minha lista");
  expect(screen.queryByLabelText("Título do filme")).toBeNull();
  expect(document.activeElement).toBe(document.getElementById("page-title"));
  expect(document.title).toBe("Minha lista | Film Catalog");

  await act(async () => window.history.back());
  await waitFor(() => expect(screen.getByRole("heading", { name: "Buscar filmes" })).toBeTruthy());
  expect(screen.getByLabelText("Título do filme").value).toBe("");
});

test("busca rápida abre a tela de resultados e a volta restaura Descobrir", async () => {
  handler = (url, options) => {
    if (new URL(url, "http://localhost").pathname === "/api/search") {
      return jsonResponse({ page: 1, total_pages: 1, results: [movieA] });
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Filme A" });
  expect(screen.queryByLabelText("Filtrar favoritos pelo título")).toBeNull();

  await user.type(screen.getByLabelText("Título do filme"), "Filme A");
  await user.click(screen.getByRole("button", { name: "Buscar filme" }));
  await screen.findByRole("heading", { name: "Resultados para “Filme A”" });
  expect(document.activeElement).toBe(document.getElementById("page-title"));
  expect(new URLSearchParams(window.location.search).get("q")).toBe("Filme A");
  expect(screen.getByLabelText("Título do filme").value).toBe("Filme A");
  expect(screen.queryByText("Refinar descoberta")).toBeNull();

  await act(async () => window.history.back());
  await waitFor(() => expect(screen.getByRole("heading", { name: "Encontre seu próximo filme" })).toBeTruthy());
  expect(screen.getByLabelText("Título do filme").value).toBe("Filme A");
});

test("busca por título na própria página move o foco para o título", async () => {
  window.history.replaceState(null, "", "/?view=results");
  handler = (url, options) => {
    if (new URL(url, "http://localhost").pathname === "/api/search") {
      return jsonResponse({ page: 1, total_pages: 1, results: [movieA] });
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("Título do filme"), "Filme A");
  await user.click(screen.getByRole("button", { name: "Buscar filme", exact: true }));
  await screen.findByRole("heading", { name: "Resultados para “Filme A”" });
  expect(document.activeElement).toBe(document.getElementById("page-title"));
});

test("link com gênero desconhecido volta aos filtros padrão após carregar os gêneros", async () => {
  window.history.replaceState(null, "", "/?genre=999999&page=2");
  handler = (url, options) => {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/discover") {
      const unknownGenre = parsed.searchParams.get("genre") === "999999";
      return jsonResponse({ page: Number(parsed.searchParams.get("page")), total_pages: 2,
        results: unknownGenre ? [] : [movieA] });
    }
    return baseHandler(url, options);
  };

  render(<App />);
  await screen.findByRole("heading", { name: "Filme A" });
  await waitFor(() => {
    const params = new URLSearchParams(window.location.search);
    expect(params.has("genre")).toBe(false);
    expect(params.has("page")).toBe(false);
  });
  await waitFor(() => expect(screen.getByLabelText("Gênero").value).toBe(""));
  expect(screen.queryByText("Filtros ativos")).toBeNull();
});

test("explorar o catálogo após uma lista vazia mantém o foco no conteúdo", async () => {
  window.history.replaceState(null, "", "/?view=favorites");
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Sua seleção começa aqui" });
  await user.click(screen.getByRole("button", { name: "Explorar catálogo" }));
  await screen.findByRole("heading", { name: "Filme A" });
  expect(document.activeElement).toBe(document.getElementById("page-title"));
  expect(document.activeElement).not.toBe(document.body);
});

test("nova tentativa devolve foco ao erro persistente e depois ao resultado", async () => {
  let attempts = 0;
  let resolveSuccess;
  const success = new Promise((resolve) => { resolveSuccess = resolve; });
  handler = (url, options) => {
    if (new URL(url, "http://localhost").pathname === "/api/discover") {
      attempts += 1;
      return attempts < 3 ? jsonResponse({ message: "Indisponível" }, 503) : success;
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText("Falha ao carregar filmes. Tente novamente.");
  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await waitFor(() => expect(attempts).toBe(2));
  await waitFor(() => expect(document.activeElement)
    .toBe(screen.getByRole("button", { name: "Tentar novamente" })));

  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await screen.findByText("Carregando filmes...");
  expect(document.activeElement).toBe(document.getElementById("section-title"));
  await act(async () => resolveSuccess(jsonResponse({
    page: 1, total_pages: 1, results: [movieA],
  })));
  await screen.findByRole("heading", { name: "Filme A" });
  expect(document.activeElement).toBe(document.getElementById("section-title"));
});

test("ao remover um favorito pelo cartão, o foco segue para o próximo filme", async () => {
  window.history.replaceState(null, "", "/?view=favorites");
  let saved = true;
  let resolveRemoval;
  const removal = new Promise((resolve) => { resolveRemoval = resolve; });
  let deleteCalls = 0;
  handler = (url, options) => {
    const path = new URL(url, "http://localhost").pathname;
    if (path === "/api/favorites/ids") return jsonResponse(saved ? [1, 2] : [2]);
    if (path === "/api/favorites" && !options?.method) {
      return pageResponse(saved ? [movieA, movieB] : [movieB], url);
    }
    if (path === "/api/favorites/1" && options?.method === "DELETE") {
      deleteCalls += 1;
      return removal;
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  const remove = await screen.findByRole("button", { name: "Remover Filme A dos favoritos" });
  await user.click(remove);
  expect(remove.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(remove);
  await user.click(remove);
  expect(deleteCalls).toBe(1);

  saved = false;
  await act(async () => resolveRemoval(jsonResponse({ message: "Removido" })));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Remover Filme A dos favoritos" })).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ver detalhes de Filme B" }));
});

test("ao remover o único filme da Minha lista, o foco retorna ao título dos resultados", async () => {
  window.history.replaceState(null, "", "/?view=watchlist");
  let saved = true;
  const entry = { tmdb_id: 1, title: "Filme A", version: 1, watch_status: "want_to_watch",
    watched_at: null, personal_rating: null, notes: null, movie: movieA };
  handler = (url, options) => {
    const path = new URL(url, "http://localhost").pathname;
    if (path === "/api/watchlist/ids") return jsonResponse(saved ? [1] : []);
    if (path === "/api/watchlist" && !options?.method) {
      return pageResponse(saved ? [entry] : [], url);
    }
    if (path === "/api/watchlist/1" && options?.method === "DELETE") {
      saved = false;
      return jsonResponse({ message: "Removido" });
    }
    return baseHandler(url, options);
  };
  const user = userEvent.setup();
  render(<App />);
  const remove = await screen.findByRole("button", { name: "Remover Filme A da minha lista" });
  await user.click(remove);
  await screen.findByText(/Sua lista está vazia/);
  expect(document.activeElement).toBe(document.getElementById("section-title"));
});
