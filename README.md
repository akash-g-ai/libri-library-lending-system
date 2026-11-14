
# 📚 Libri

### Library Lending System

A full-stack library management platform for seamless book discovery,
borrowing, returns, fines, and reservation workflows.

Built with **React · Node.js · Express · Neon PostgreSQL**

---

## 🌐 Live Application

<p align="center">
  <a href="https://libri-frontend.onrender.com/login">
    <img src="https://img.shields.io/badge/🚀_Launch_Libri-Live_Application-2563EB?style=for-the-badge" alt="Launch Libri"/>
  </a>
</p>

<p align="center">
  Experience the complete library lending workflow through dedicated Member and Librarian portals.
</p>

### 🔑 Demo Access

| Portal | Email | Password |
|:---|:---|:---|
| 👤 **Member** | `user2@library.test` | `password123` |
| 🔐 **Librarian** | `user1@library.test` | `password123` |

> **Note:** These demo accounts are provided for evaluation purposes. Use the credentials above to explore the application's features.

---

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=20232A)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Runtime-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/Neon-PostgreSQL-008CC1?logo=postgresql&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?logo=javascript&logoColor=20232A)
:::

------------------------------------------------------------------------

## ✨ Overview

**Libri** is a full-stack library lending application with dedicated
**Member** and **Librarian** portals. It provides a complete lending
workflow---from browsing the catalogue and checking out books to
processing returns, calculating overdue fines, and managing FIFO
reservations.

Authentication and role permissions are enforced by the backend. Library
policies such as loan duration, fine rates, borrowing limits, and
reservation hold windows are configurable through librarian settings.
## 🖼️ Application Preview

### 👤 Member Portal

| Login | Dashboard |
|:---:|:---:|
| ![Member Login](screenshots/member-portal/M_login.png) | ![Member Dashboard](screenshots/member-portal/M_dashboard.png) |

| Books | Loans |
|:---:|:---:|
| ![Member Books](screenshots/member-portal/M_books.png) | ![Member Loans](screenshots/member-portal/M_loans.png) |

| Fines | Reservations |
|:---:|:---:|
| ![Member Fines](screenshots/member-portal/M_fines.png) | ![Member Reservations](screenshots/member-portal/M_reservations.png) |

### 🔐 Librarian Portal

| Login | Dashboard |
|:---:|:---:|
| ![Librarian Login](screenshots/librarian-portal/L_login.png) | ![Librarian Dashboard](screenshots/librarian-portal/L_dashboard.png) |

| Books | Loans |
|:---:|:---:|
| ![Librarian Books](screenshots/librarian-portal/L_books.png) | ![Librarian Loans](screenshots/librarian-portal/L_loans.png) |

| Fines | Reservations | Settings |
|:---:|:---:|:---:|
| ![Librarian Fines](screenshots/librarian-portal/L_fines.png) | ![Librarian Reservations](screenshots/librarian-portal/L_reservations.png) | ![Librarian Settings](screenshots/librarian-portal/L_settings.png) |

---

## 🚀 Features

### 🔐 Authentication & Access Control

-   Separate Member and Librarian portals.
-   JWT-based authentication with bcrypt password hashing.
-   Backend-enforced role-based access control.
-   Public registration creates member accounts only.

### 📚 Catalogue & Lending

-   Librarian-only book creation, editing, and deletion with validation.
-   Book checkout with configurable due dates and active-loan limits.
-   Return processing with automatic overdue fine calculation.
-   Inventory updates protected by database transactions.

### ⏳ Reservations

-   First-In, First-Out (FIFO) reservation queue.
-   Duplicate active reservation prevention.
-   Configurable reservation hold window.
-   Expired holds are reallocated to the next eligible member.

### 💳 Fines & Library Policies

-   Automatic overdue fine calculation with a configurable cap.
-   Partial and full fine payments with balance tracking.
-   Checkout restriction when unpaid fines exceed the configured
    threshold.
-   Librarian-configurable loan period, fine rate, fine cap, borrowing
    limit, fine threshold, and hold duration.

### 📊 Dashboards

-   Member view of active loans, due dates, overdue status, fines, and
    reservations.
-   Librarian dashboard with database-backed library statistics.

------------------------------------------------------------------------

## 🧰 Technology Stack

  Layer            Technologies
  ---------------- -----------------------------------------
  Frontend         React 18, Vite 5, React Router 6, Axios
  Backend          Node.js, Express.js 4, REST API
  Database         Neon PostgreSQL, `pg` driver 8.x
  Authentication   JWT (`jsonwebtoken`), `bcrypt`
  Testing          Vitest 1.6, Supertest 7

## 🏗️ Architecture

``` text
┌──────────────────────────┐
│       Browser            │
│      React SPA           │
└────────────┬─────────────┘
             │ HTTP / REST (Axios)
             ▼
┌──────────────────────────┐
│      Express API         │
│       Node.js            │
└────────────┬─────────────┘
             │ PostgreSQL (pg Pool)
             ▼
┌──────────────────────────┐
│    Neon PostgreSQL       │
└──────────────────────────┘
```

-   **Frontend:** React single-page application built with Vite. Axios
    communicates with the backend REST API. During development, Vite
    proxies `/api` requests to the backend.
-   **Backend:** Express REST API connected to Neon PostgreSQL through a
    centralized `pg.Pool` singleton.
-   **Authentication:** The frontend submits credentials to
    `/api/auth/login`. The backend verifies the password with bcrypt and
    issues a JWT. Protected endpoints validate the token and enforce the
    required role on the server.

## 🗄️ Database Design

  -----------------------------------------------------------------------
  Table                               Purpose
  ----------------------------------- -----------------------------------
  `users`                             Member and librarian accounts with
                                      bcrypt-hashed passwords. Roles are
                                      constrained to `member` or
                                      `librarian`.

  `books`                             Catalogue records with
                                      `total_copies` and
                                      `available_copies`.

  `loans`                             Borrowing records linking members
                                      and books, including checkout, due,
                                      and return dates.

  `fines`                             Overdue fine records with
                                      partial-payment support and payment
                                      status.

  `reservations`                      FIFO queue records with queue
                                      position, status, and hold
                                      timestamps.

  `library_settings`                  Single-row configuration for
                                      library business rules.

  `schema_migrations`                 Tracks applied database migrations.
  -----------------------------------------------------------------------

### Important Constraints

-   Unique user email addresses prevent duplicate registrations.
-   Book copy constraints prevent negative counts and ensure available
    copies do not exceed total copies.
-   Loan date validation prevents a return date earlier than the
    checkout date.
-   Fine constraints prevent negative amounts and payments greater than
    the fine amount.
-   A partial unique index prevents duplicate active reservations for
    the same member and book.
-   Foreign-key relationships maintain consistency between related
    records.

## ⚙️ Business Rules & Workflows

### Loan Configuration

-   Default loan period: **14 days**.
-   Default maximum active loans: **3**.
-   Both values are configurable through `library_settings`.

### Fine Calculation

-   Default fine per overdue day: **₹0.50**.
-   Default maximum fine cap: **₹30.00**.
-   Fine formula: `overdue_days × fine_per_overdue_day`, limited by the
    configured cap.
-   No fine is charged when a book is returned on or before its due
    date.
-   An injectable clock supports deterministic date/time handling in
    tests.

### Borrowing Eligibility

Before checkout, the system checks that: 1. The book has an available
copy. 2. The member has not exceeded the active-loan limit. 3. The
member's outstanding unpaid fines do not exceed the configured borrowing
threshold. 4. The member does not already have an active loan for the
same book.

### FIFO Reservation Allocation

-   Members can reserve a book when no copies are available.
-   Queue order is based on `created_at ASC`, then `id ASC`.
-   When a copy is returned, the earliest eligible waiting reservation
    receives a hold.
-   The default hold window is **48 hours**.

### Reservation Hold Expiry

-   Expired holds are detected at relevant interaction points, including
    checkout, reservation creation, and collection.
-   An expired hold is marked accordingly and the copy is offered to the
    next waiter.
-   If no waiting reservation remains, the copy returns to general
    availability.
-   Only the member assigned the hold can collect the reserved copy.

## 🔒 Transactions & Concurrency

Multi-step lending operations use PostgreSQL transactions to keep
related updates consistent.

-   **Checkout:** `SELECT FOR UPDATE` locks the book row before
    inventory is decremented, protecting the last available copy from
    concurrent checkout attempts.
-   **Returns:** Loan status, inventory restoration, fine calculation,
    and reservation allocation are handled atomically.
-   **Reservation allocation:** `FOR UPDATE SKIP LOCKED` helps prevent
    multiple workers from allocating the same waiting reservation.
-   **Fine payments:** Fine rows are locked while payment balances and
    statuses are updated.
-   **Duplicate prevention:** Transactional safeguards protect against
    duplicate returns, fine creation, and active reservations.

## 💻 Getting Started

### Prerequisites

-   Node.js 18 or later
-   A Neon PostgreSQL database (the free tier is sufficient for
    development)

### 1. Clone the repository

``` bash
git clone <repo-url>
cd library-book-lending
```

### 2. Configure environment variables

Copy the environment template into the backend directory:

``` bash
cp .env.example backend/.env
```

Set the required values in `backend/.env`. See [Environment
Variables](#-environment-variables) below.

### 3. Install dependencies

``` bash
cd backend
npm install

cd ../frontend
npm install
```

### 4. Run database migrations

From the backend directory:

``` bash
cd ../backend
npm run migrate
```

### 5. Seed development data (optional)

From the backend directory:

``` bash
npm run seed
```

### 6. Start the backend

From the backend directory:

``` bash
npm start
```

The backend runs on port `3000` by default.

### 7. Start the frontend

In a separate terminal:

``` bash
cd frontend
npm run dev
```

Open `http://localhost:5173`. The Vite development server proxies `/api`
requests to `http://localhost:3000`.

## 🔑 Environment Variables

Configure these values in `backend/.env`:

  --------------------------------------------------------------------------------------------------
  Variable                Description             Example
  ----------------------- ----------------------- --------------------------------------------------
  `DATABASE_URL`          Neon PostgreSQL         `postgresql://user:pass@host/db?sslmode=require`
                          connection string       

  `JWT_SECRET`            Secret used to sign     Generate a strong random value
                          JWTs                    

  `JWT_EXPIRES_IN`        JWT expiry duration     `7d`

  `PORT`                  Backend server port     `3000`

  `NODE_ENV`              Runtime environment     `development`

  `CORS_ORIGIN`           Frontend origin for     `https://your-frontend.onrender.com`
                          production CORS         
  --------------------------------------------------------------------------------------------------

> **Security:** Keep real `.env` files private. Never commit database
> credentials, JWT secrets, or other sensitive values. The
> `.env.example` file should contain placeholders only.

## 🧪 Development Seed Data

The seed script provides the following development dataset:

  Data                       Seeded count
  ------------------------ --------------
  Librarian accounts                    1
  Member accounts                      10
  Books                                40
  Loans                                26
  Returned on-time loans                5
  Returned overdue loans               15
  Active loans                          6
  Unpaid fines                         15
  Reservations                          4
  Library settings rows                 1

The reservation records include waiting queue entries and an active
hold.

### Demo Accounts

These development-only accounts are created by the seed script:

  Role        Email                   Password
  ----------- ----------------------- ---------------
  Librarian   `user1@library.test`    `password123`
  Member      `user2@library.test`    `password123`
  Member      `user3@library.test`    `password123`
  Member      `user4@library.test`    `password123`
  Member      `user5@library.test`    `password123`
  Member      `user6@library.test`    `password123`
  Member      `user7@library.test`    `password123`
  Member      `user8@library.test`    `password123`
  Member      `user9@library.test`    `password123`
  Member      `user10@library.test`   `password123`
  Member      `user11@library.test`   `password123`

> These credentials are for local development/demo use only. Do not
> reuse them in a production environment.

## ✅ Testing

The project uses **Vitest** and **Supertest** for automated backend
testing.

Run backend tests from the `backend/` directory:

``` bash
npm test
```

The documented test coverage includes: - Member and librarian
registration, login, and JWT middleware. - Book catalogue CRUD,
validation, and role enforcement. - Checkout due-date calculation, loan
limits, and fine-threshold restrictions. - Returns, fine calculation,
fine caps, and inventory restoration. - Partial and full fine payments,
including overpayment rejection. - FIFO reservation creation,
allocation, hold expiry, and collection. - Reservation cancellation and
queue integrity. - Library settings retrieval and updates. - Dashboard
data isolation and database-backed statistics. - Concurrent checkout of
the last copy and prevention of duplicate collection.

The frontend production build can be created from `frontend/` with:

``` bash
npm run build
```

*The commands above are provided for developers; this README does not
claim that they were executed as part of this documentation update.*

## 🗂️ Project Structure

``` text
library-book-lending/
├── backend/
│   ├── src/
│   │   ├── config/          # Environment configuration
│   │   ├── controllers/     # Auth, books, loans, fines, reservations, settings, dashboard
│   │   ├── db/              # Connection, migration runner, seed script
│   │   ├── middleware/      # JWT auth, role guards, error handler
│   │   ├── routes/          # Express API routes
│   │   ├── utils/           # Clock, date utilities, reservation allocator
│   │   ├── app.js
│   │   └── server.js
│   ├── tests/               # Vitest + Supertest suites
│   ├── package.json
│   └── vitest.config.js
├── database/
│   └── migrations/          # Versioned SQL migrations (001–009)
├── frontend/
│   ├── src/
│   │   ├── api/              # Axios client and JWT interceptor
│   │   ├── components/       # Shared UI components
│   │   ├── context/           # Authentication context
│   │   ├── pages/             # Portal pages
│   │   ├── utils/             # INR formatting utility
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── screenshots/
│   ├── member-portal/
│   └── librarian-portal/
├── .env.example
├── .gitignore
└── README.md
```

## 📋 Assignment Requirements Coverage

  -----------------------------------------------------------------------
  Assignment requirement              Libri implementation
  ----------------------------------- -----------------------------------
  Member and Librarian roles          Separate portals with backend role
                                      enforcement; public registration
                                      creates member accounts only.

  Book catalogue                      Title, author, and copy management
                                      with validation; librarian-only
                                      CRUD.

  Checkout                            Configurable due dates, active-loan
                                      limits, and row locking for
                                      concurrent checkout protection.

  Returns                             Librarian-managed returns,
                                      inventory restoration, and
                                      automatic overdue fine calculation.

  Fine management                     Configurable per-day fine, maximum
                                      cap, and partial/full payment
                                      support.

  Borrowing restrictions              Active-loan limit and unpaid-fine
                                      threshold enforced during checkout.

  Reservations                        FIFO queue with duplicate active
                                      reservation prevention.

  Hold management                     Configurable hold duration, expiry
                                      handling, and reallocation to the
                                      next waiter.

  Member dashboard                    Active loans, due dates, overdue
                                      indicators, outstanding fines, and
                                      reservation status.

  Library settings                    Librarian-configurable loan period,
                                      fine rate, fine cap, borrowing
                                      limit, fine threshold, and hold
                                      window.

  Seed data                           40 books, 10 members, 1 librarian,
                                      26 loans, fines, reservations, and
                                      library settings.
  -----------------------------------------------------------------------

## 🛣️ Future Improvements

-   Background scheduler for proactive reservation hold-expiry
    processing (currently detected on-demand).
-   Server-side JWT denylist for immediate session invalidation.
-   Email notifications for due dates and reservation availability.
-   Enhanced catalogue search and filtering by author or availability.
-   Pagination for larger catalogues.

## 📦 Submission Notes

-   The repository includes the application source, database migrations,
    tests, and portal screenshots.
-   Member and Librarian portal screenshots are included above.
-   The assignment requests a demonstration recording of up to **5
    minutes**.
-   The application can be deployed with a backend Web Service and
    frontend Static Site on Render; deployment configuration must be
    supplied through the appropriate environment variables.

------------------------------------------------------------------------


**📚 Libri --- Making library lending simpler, clearer, and more
reliable.**

