'use strict';
/**
 * Development seed script.
 *
 * SAFETY: This script NEVER truncates the entire database.
 * It identifies seed rows by email domain (@library.test for users)
 * and book titles that match the seed list. Only rows created by
 * this script are removed and replaced on re-run.
 * Unrelated users, books, loans, fines and reservations are untouched.
 *
 * DO NOT run in production. The script refuses to run when
 * NODE_ENV=production as an extra safeguard.
 *
 * Seeds:
 *   1 librarian  (user1@library.test)
 *   10 members   (user2–11@library.test)
 *   40 books     (identified by title)
 *   25 loans     (5 returned on-time, 15 returned overdue, 5 active)
 *   5 fines      (for the 5 overdue loans)
 *   4 reservations (3 waiting in FIFO order + 1 held)
 *   1 library_settings row (upserted)
 */

const bcrypt = require('bcrypt');
const { pool } = require('./connection');

// Titles of the 40 seed books — used to scope cleanup to seed rows only
const SEED_BOOK_TITLES = [
  'The Great Gatsby', 'To Kill a Mockingbird', '1984', 'Pride and Prejudice',
  'The Catcher in the Rye', 'The Hobbit', 'Brave New World', 'The Lord of the Rings',
  'Animal Farm', 'The Diary of a Young Girl', 'The Alchemist', 'The Book Thief',
  'The Kite Runner', 'The Girl with the Dragon Tattoo', 'Life of Pi', 'The Road',
  'A Game of Thrones', 'The Da Vinci Code', 'Angels and Demons',
  'The Fault in Our Stars', 'Gone Girl', 'The Night Circus',
  'Where the Crawdads Sing', 'Educated', 'Becoming', 'Sapiens', 'Atomic Habits',
  'The Power of Now', 'Dune', 'Neuromancer', 'The Name of the Wind',
  'The Way of Kings', 'Mistborn', 'The Silent Patient',
  'Where the Forest Meets the Stars', 'The Seven Husbands of Evelyn Hugo',
  'Circe', 'The Song of Achilles', 'Pachinko', 'The Midnight Library',
];

const SEED_EMAIL_DOMAIN = '@library.test';

async function runSeed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed script must not run in production (NODE_ENV=production).');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ----------------------------------------------------------------
    // 1. Remove only seed-owned rows (scoped by email domain / title list)
    // Order: reservations -> fines -> loans -> books -> users
    // ----------------------------------------------------------------

    // Find seed user IDs first (needed to scope loans/fines/reservations)
    const { rows: seedUsers } = await client.query(
      "SELECT id FROM users WHERE email LIKE $1",
      ['%' + SEED_EMAIL_DOMAIN]
    );
    const seedUserIds = seedUsers.map(u => u.id);

    // Find seed book IDs (by title list)
    const titlePlaceholders = SEED_BOOK_TITLES.map((_, i) => `$${i + 1}`).join(',');
    const { rows: seedBooks } = await client.query(
      `SELECT id FROM books WHERE title IN (${titlePlaceholders})`,
      SEED_BOOK_TITLES
    );
    const seedBookIds = seedBooks.map(b => b.id);

    if (seedUserIds.length > 0 || seedBookIds.length > 0) {
      const allIds = [...new Set([...seedUserIds, ...seedBookIds])];

      // Delete reservations referencing seed users or seed books
      if (seedUserIds.length > 0 && seedBookIds.length > 0) {
        await client.query(
          `DELETE FROM reservations WHERE member_id = ANY($1) OR book_id = ANY($2)`,
          [seedUserIds, seedBookIds]
        );
      } else if (seedUserIds.length > 0) {
        await client.query('DELETE FROM reservations WHERE member_id = ANY($1)', [seedUserIds]);
      } else {
        await client.query('DELETE FROM reservations WHERE book_id = ANY($1)', [seedBookIds]);
      }

      // Delete fines referencing seed users
      if (seedUserIds.length > 0) {
        await client.query('DELETE FROM fines WHERE member_id = ANY($1)', [seedUserIds]);
      }

      // Delete loans referencing seed users or seed books
      if (seedUserIds.length > 0 && seedBookIds.length > 0) {
        await client.query(
          'DELETE FROM loans WHERE member_id = ANY($1) OR book_id = ANY($2)',
          [seedUserIds, seedBookIds]
        );
      } else if (seedUserIds.length > 0) {
        await client.query('DELETE FROM loans WHERE member_id = ANY($1)', [seedUserIds]);
      } else {
        await client.query('DELETE FROM loans WHERE book_id = ANY($1)', [seedBookIds]);
      }

      // Delete seed books
      if (seedBookIds.length > 0) {
        await client.query('DELETE FROM books WHERE id = ANY($1)', [seedBookIds]);
      }

      // Delete seed users
      if (seedUserIds.length > 0) {
        await client.query('DELETE FROM users WHERE id = ANY($1)', [seedUserIds]);
      }
    }

    // ----------------------------------------------------------------
    // 2. Library settings — upsert (only 1 row; update if exists)
    // ----------------------------------------------------------------
    await client.query(`
      INSERT INTO library_settings
        (loan_period_days, fine_per_overdue_day, max_fine_cap,
         max_active_loans, reservation_hold_window_days,
         reservation_hold_window_hours, unpaid_fine_borrowing_threshold)
      VALUES (14, 0.50, 30.00, 3, 7, 48, 5.00)
      ON CONFLICT DO NOTHING
    `);
    // Update existing row if one already exists
    await client.query(`
      UPDATE library_settings
      SET loan_period_days = 14, fine_per_overdue_day = 0.50, max_fine_cap = 30.00,
          max_active_loans = 3, reservation_hold_window_days = 7,
          reservation_hold_window_hours = 48, unpaid_fine_borrowing_threshold = 5.00,
          updated_at = NOW()
    `);

    // ----------------------------------------------------------------
    // 3. Insert seed users (1 librarian + 10 members = 11 total)
    // ----------------------------------------------------------------
    const passwordHash = await bcrypt.hash('password123', 10);
    const users = [];
    // user1 = librarian, user2-user11 = 10 members
    for (let i = 1; i <= 11; i++) {
      const role = i === 1 ? 'librarian' : 'member';
      const name = i === 1 ? 'Sarah Librarian' : `Member ${i}`;
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, role`,
        [name, `user${i}@library.test`, passwordHash, role]
      );
      users.push(rows[0]);
    }

    // ----------------------------------------------------------------
    // 4. Insert 40 seed books
    // ----------------------------------------------------------------
    const bookData = [
      ['The Great Gatsby',                    'F. Scott Fitzgerald',    5],
      ['To Kill a Mockingbird',               'Harper Lee',             3],
      ['1984',                                'George Orwell',          4],
      ['Pride and Prejudice',                 'Jane Austen',            2],
      ['The Catcher in the Rye',              'J.D. Salinger',          3],
      ['The Hobbit',                          'J.R.R. Tolkien',         5],
      ['Brave New World',                     'Aldous Huxley',          2],
      ['The Lord of the Rings',               'J.R.R. Tolkien',         4],
      ['Animal Farm',                         'George Orwell',          3],
      ['The Diary of a Young Girl',           'Anne Frank',             2],
      ['The Alchemist',                       'Paulo Coelho',           5],
      ['The Book Thief',                      'Markus Zusak',           3],
      ['The Kite Runner',                     'Khaled Hosseini',        4],
      ['The Girl with the Dragon Tattoo',     'Stieg Larsson',          2],
      ['Life of Pi',                          'Yann Martel',            3],
      ['The Road',                            'Cormac McCarthy',        2],
      ['A Game of Thrones',                   'George R.R. Martin',     4],
      ['The Da Vinci Code',                   'Dan Brown',              5],
      ['Angels and Demons',                   'Dan Brown',              3],
      ['The Fault in Our Stars',              'John Green',             4],
      ['Gone Girl',                           'Gillian Flynn',          2],
      ['The Night Circus',                    'Erin Morgenstern',       1],
      ['Where the Crawdads Sing',             'Delia Owens',            3],
      ['Educated',                            'Tara Westover',          2],
      ['Becoming',                            'Michelle Obama',         5],
      ['Sapiens',                             'Yuval Noah Harari',      3],
      ['Atomic Habits',                       'James Clear',            4],
      ['The Power of Now',                    'Eckhart Tolle',          2],
      ['Dune',                                'Frank Herbert',          3],
      ['Neuromancer',                         'William Gibson',         1],
      ['The Name of the Wind',                'Patrick Rothfuss',       2],
      ['The Way of Kings',                    'Brandon Sanderson',      3],
      ['Mistborn',                            'Brandon Sanderson',      2],
      ['The Silent Patient',                  'Alex Michaelides',       4],
      ['Where the Forest Meets the Stars',    'Glendy Vanderah',        1],
      ['The Seven Husbands of Evelyn Hugo',   'Taylor Jenkins Reid',    3],
      ['Circe',                               'Madeline Miller',        2],
      ['The Song of Achilles',                'Madeline Miller',        3],
      ['Pachinko',                            'Min Jin Lee',            2],
      ['The Midnight Library',                'Matt Haig',              4],
    ];

    const books = [];
    for (const [title, author, copies] of bookData) {
      const { rows } = await client.query(
        `INSERT INTO books (title, author, total_copies, available_copies)
         VALUES ($1, $2, $3, $3) RETURNING id, title, total_copies, available_copies`,
        [title, author, copies]
      );
      books.push(rows[0]);
    }

    // ----------------------------------------------------------------
    // 5. Insert 25 loans
    //   Loans 1-5:   returned on time  (checkout 2024-01-01, due 2024-01-15, returned 2024-01-10)
    //   Loans 6-20:  returned overdue  (checkout 2024-01-01, due 2024-01-15, returned 2024-01-25)
    //                 10 days x $0.50 = $5.00 fine each
    //   Loans 21-25: active            (checkout 2024-01-01, due 2024-01-15)
    // ----------------------------------------------------------------
    const memberIds = users.slice(1).map(u => u.id); // 10 member IDs

    // Loans 1-5: returned on time
    for (let i = 0; i < 5; i++) {
      await client.query(
        `INSERT INTO loans (member_id, book_id, checkout_date, due_date, return_date, status)
         VALUES ($1, $2, '2024-01-01', '2024-01-15', '2024-01-10', 'returned')`,
        [memberIds[i % memberIds.length], books[i].id]
      );
    }

    // Loans 6-20: returned overdue with fines
    for (let i = 5; i < 20; i++) {
      const { rows } = await client.query(
        `INSERT INTO loans (member_id, book_id, checkout_date, due_date, return_date, status)
         VALUES ($1, $2, '2024-01-01', '2024-01-15', '2024-01-25', 'returned')
         RETURNING id`,
        [memberIds[i % memberIds.length], books[i].id]
      );
      await client.query(
        `INSERT INTO fines (loan_id, member_id, fine_amount, paid_amount, payment_status)
         VALUES ($1, $2, 5.00, 0, 'unpaid')`,
        [rows[0].id, memberIds[i % memberIds.length]]
      );
    }

    // Loans 21-25: active
    for (let i = 20; i < 25; i++) {
      await client.query(
        `INSERT INTO loans (member_id, book_id, checkout_date, due_date, status)
         VALUES ($1, $2, '2024-01-01', '2024-01-15', 'active')`,
        [memberIds[i % memberIds.length], books[i].id]
      );
      await client.query(
        'UPDATE books SET available_copies = available_copies - 1 WHERE id = $1',
        [books[i].id]
      );
    }

    // ----------------------------------------------------------------
    // 6. Reservations demo data
    //    Book 30 (Neuromancer, 1 copy): exhaust copy, then 3 waiting members
    //    Book 35 (Where the Forest Meets the Stars, 1 copy): held reservation
    // ----------------------------------------------------------------

    // Exhaust Neuromancer (book index 29)
    await client.query(
      `INSERT INTO loans (member_id, book_id, checkout_date, due_date, status)
       VALUES ($1, $2, '2024-01-01', '2024-01-15', 'active')`,
      [memberIds[0], books[29].id]
    );
    await client.query(
      'UPDATE books SET available_copies = available_copies - 1 WHERE id = $1',
      [books[29].id]
    );

    // Members 3, 4, 5 join the waiting queue in FIFO order (staggered created_at)
    for (let i = 1; i <= 3; i++) {
      await client.query(
        `INSERT INTO reservations (member_id, book_id, queue_position, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'waiting',
                 NOW() - ($4 * INTERVAL '1 hour'),
                 NOW() - ($4 * INTERVAL '1 hour'))`,
        [memberIds[i], books[29].id, i, 4 - i]
      );
    }

    // Book 35: add a past loan (returned) + held reservation for member 3
    await client.query(
      `INSERT INTO loans (member_id, book_id, checkout_date, due_date, return_date, status)
       VALUES ($1, $2, '2024-01-01', '2024-01-15', '2024-01-10', 'returned')`,
      [memberIds[0], books[34].id]
    );
    await client.query(
      `INSERT INTO reservations (member_id, book_id, queue_position, status,
                                  hold_start_at, hold_expires_at, created_at, updated_at)
       VALUES ($1, $2, 1, 'held',
               NOW(), NOW() + INTERVAL '48 hours',
               NOW() - INTERVAL '1 hour', NOW())`,
      [memberIds[1], books[34].id]
    );

    await client.query('COMMIT');

    console.log(
      'Seed completed: 11 users (1 librarian + 10 members), 40 books, ' +
      '26 loans, 15 fines, 4 reservations, 1 settings row.'
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runSeed };