-- Referencia historica do esquema inicial. Para criar ou atualizar o banco,
-- execute npm run db:migrate em Backend (migrações versionadas).
-- Este script nao altera nem copia registros de favorites.
CREATE TABLE IF NOT EXISTS watchlist (
    tmdb_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    watch_status VARCHAR(20) NOT NULL DEFAULT 'want_to_watch',
    watched_at DATE NULL,
    personal_rating TINYINT UNSIGNED NULL,
    notes VARCHAR(1000) NULL,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tmdb_id),
    CONSTRAINT chk_watchlist_status
        CHECK (watch_status IN ('want_to_watch', 'watched')),
    CONSTRAINT chk_watchlist_watched_date
        CHECK (watch_status = 'watched' OR (watched_at IS NULL AND personal_rating IS NULL)),
    CONSTRAINT chk_watchlist_rating
        CHECK (personal_rating IS NULL OR personal_rating BETWEEN 1 AND 5)
);
