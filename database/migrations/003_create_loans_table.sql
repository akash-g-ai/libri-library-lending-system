CREATE TABLE IF NOT EXISTS loans (
    id            BIGSERIAL   PRIMARY KEY,
    member_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id       BIGINT      NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    checkout_date DATE        NOT NULL,
    due_date      DATE        NOT NULL,
    return_date   DATE,
    status        TEXT        NOT NULL CHECK (status IN ('active', 'returned')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (return_date IS NULL OR return_date >= checkout_date)
);