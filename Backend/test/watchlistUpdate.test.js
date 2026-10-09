const test = require("node:test");
const assert = require("node:assert/strict");
const { buildWatchlistUpdate } = require("../lib/watchlistUpdate");

test("data civil de um cliente adiantado em relação ao UTC é aceita, mas futuro distante não", () => {
  const tomorrowUtc = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const dayAfterUtc = new Date(Date.now() + 172800000).toISOString().slice(0, 10);
  assert.equal(buildWatchlistUpdate({ watched_at: tomorrowUtc }).error, undefined);
  assert.equal(buildWatchlistUpdate({ watched_at: dayAfterUtc }).error, "Data inválida.");
});
