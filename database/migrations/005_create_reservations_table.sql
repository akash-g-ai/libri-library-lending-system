CREATE TABLE IF NOT EXISTS reservations (
    id              BIGSERIAL   PRIMARY KEY,
    member_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id         BIGINT      NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    queue_position  INTEGER     NOT NULL,
    status          TEXT        NOT NULL CHECK (status IN ('waiting', 'held', 'fulfilled', 'expired', 'cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hold_start_at   TIMESTAMPTZ,
    hold_expires_at TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_reservations_unique
    ON reservations (member_id, book_id)
    WHERE status IN ('waiting', 'held');