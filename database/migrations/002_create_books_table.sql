CREATE TABLE IF NOT EXISTS books (
    id               BIGSERIAL   PRIMARY KEY,
    title            TEXT        NOT NULL,
    author           TEXT        NOT NULL,
    total_copies     INTEGER     NOT NULL DEFAULT 0 CHECK (total_copies >= 0),
    available_copies INTEGER     NOT NULL DEFAULT 0 CHECK (available_copies >= 0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (available_copies <= total_copies)
);