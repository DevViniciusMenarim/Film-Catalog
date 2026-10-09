const WATCH_STATUSES = new Set(["want_to_watch", "watched"]);
const ALLOWED_FIELDS = new Set(["watch_status", "watched_at", "personal_rating", "notes"]);

function parseDate(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= "1000-01-01" &&
    // A client can be in a timezone where the local date is already tomorrow in UTC.
    value <= new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    ? value
    : undefined;
}

function buildWatchlistUpdate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length === 0 ||
      Object.keys(input).some((key) => !ALLOWED_FIELDS.has(key))) {
    return { error: "Atualização inválida." };
  }

  const changes = [];
  const values = [];
  if (Object.hasOwn(input, "watch_status")) {
    if (!WATCH_STATUSES.has(input.watch_status)) return { error: "Status inválido." };
    if (input.watch_status === "want_to_watch" &&
        ((Object.hasOwn(input, "watched_at") && input.watched_at !== null) ||
         (Object.hasOwn(input, "personal_rating") && input.personal_rating !== null))) {
      return { error: "Filme não assistido não pode ter data ou nota." };
    }
    changes.push("watch_status = ?");
    values.push(input.watch_status);
  }
  if (Object.hasOwn(input, "watched_at")) {
    const date = parseDate(input.watched_at);
    if (date === undefined) return { error: "Data inválida." };
    changes.push("watched_at = ?");
    values.push(date);
  } else if (input.watch_status === "want_to_watch") {
    changes.push("watched_at = ?");
    values.push(null);
  }
  if (Object.hasOwn(input, "personal_rating")) {
    const rating = input.personal_rating;
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return { error: "Nota deve estar entre 1 e 5." };
    }
    changes.push("personal_rating = ?");
    values.push(rating);
  } else if (input.watch_status === "want_to_watch") {
    changes.push("personal_rating = ?");
    values.push(null);
  }
  if (Object.hasOwn(input, "notes")) {
    const notes = input.notes;
    if (notes !== null && (typeof notes !== "string" || Array.from(notes).length > 1000)) {
      return { error: "Comentário inválido." };
    }
    changes.push("notes = ?");
    values.push(notes);
  }

  const requiresWatchedStatus =
    ((Object.hasOwn(input, "watched_at") && input.watched_at !== null) ||
     (Object.hasOwn(input, "personal_rating") && input.personal_rating !== null)) &&
    !Object.hasOwn(input, "watch_status");

  return { changes, values, requiresWatchedStatus };
}

module.exports = { WATCH_STATUSES, buildWatchlistUpdate };
