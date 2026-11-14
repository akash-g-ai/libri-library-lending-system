CREATE TABLE IF NOT EXISTS library_settings (
    id                              BIGSERIAL     PRIMARY KEY,
    loan_period_days                INTEGER       NOT NULL CHECK (loan_period_days > 0),
    fine_per_overdue_day            NUMERIC(10,2) NOT NULL CHECK (fine_per_overdue_day >= 0),
    max_fine_cap                    NUMERIC(10,2) NOT NULL CHECK (max_fine_cap >= 0),
    max_active_loans                INTEGER       NOT NULL CHECK (max_active_loans > 0),
    reservation_hold_window_days    INTEGER       NOT NULL CHECK (reservation_hold_window_days > 0),
    unpaid_fine_borrowing_threshold NUMERIC(10,2) NOT NULL CHECK (unpaid_fine_borrowing_threshold >= 0),
    created_at                      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);