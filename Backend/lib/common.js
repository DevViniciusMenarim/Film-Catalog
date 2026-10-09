const TMDB_DETAIL_CONCURRENCY = 4;
const MAX_PAGE = 500;

function parseOptionalInteger(value, { min, max, fallback = null }) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max
    ? number
    : null;
}

function parseMovieId(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  if (!/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  // The documented MySQL schema uses a signed INT column.
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

function parseStoredId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function logError(logger, label, error) {
  // Axios errors can contain request configuration, including the TMDB key.
  logger.error(label, {
    code: typeof error?.code === "string" ? error.code : undefined,
    status: Number.isInteger(error?.response?.status)
      ? error.response.status
      : undefined,
  });
}

function catalogUpstreamMessage(error, catalogSource, fallback) {
  const status = error?.response?.status ?? error?.cause?.response?.status;
  if (catalogSource === "tmdb" && (status === 401 || status === 403)) {
    return "Credenciais do TMDB inválidas ou sem permissão. Verifique TMDB_API_KEY.";
  }
  return fallback;
}

async function mapWithConcurrency(items, limit, mapper) {
  const result = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      result[index] = await mapper(items[index]);
    }
  }

  // Drain all workers before propagating an error. A failed release-date
  // backfill must not leave other database updates running after the response.
  const outcomes = await Promise.allSettled(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  const failure = outcomes.find((outcome) => outcome.status === "rejected");
  if (failure) throw failure.reason;
  return result;
}

function parsePagination(query) {
  const page = parseOptionalInteger(query.page, { min: 1, max: 2147483647, fallback: 1 });
  const pageSize = parseOptionalInteger(query.pageSize, { min: 1, max: 50, fallback: 12 });
  if (page === null || pageSize === null) return false;
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset > 2147483647) return false;
  return { page, pageSize, offset };
}

function pageEnvelope(rows, count, pagination) {
  const totalCount = Number(count);
  if (!Number.isSafeInteger(totalCount) || totalCount < 0) {
    throw new Error("Contagem inválida no banco.");
  }
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: Math.ceil(totalCount / pagination.pageSize),
    totalCount,
    items: rows,
  };
}

module.exports = {
  TMDB_DETAIL_CONCURRENCY,
  MAX_PAGE,
  parseOptionalInteger,
  parseMovieId,
  parseStoredId,
  logError,
  catalogUpstreamMessage,
  mapWithConcurrency,
  parsePagination,
  pageEnvelope,
};
