CREATE TABLE IF NOT EXISTS fines (
    id             BIGSERIAL     PRIMARY KEY,
    loan_id        BIGINT        NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    member_id      BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fine_amount    NUMERIC(10,2) NOT NULL CHECK (fine_amount >= 0),
    paid_amount    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    payment_status TEXT          NOT NULL CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CHECK (paid_amount <= fine_amount)
);