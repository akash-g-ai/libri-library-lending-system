'use strict';
const { getClock } = require('./clock');

/**
 * Allocate a held copy to the next WAITING reservation in FIFO order.
 * Must be called inside an open transaction on `client`.
 * Uses FOR UPDATE SKIP LOCKED to prevent concurrent double-allocation.
 *
 * @returns {object|null} The updated reservation row, or null if queue is empty.
 */
async function allocateNextReservation(client, bookId, holdWindowHours) {
  const { rows } = await client.query(
    `SELECT id, member_id, queue_position
     FROM reservations
     WHERE book_id = $1 AND status = 'waiting'
     ORDER BY created_at ASC, id ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [bookId]
  );

  if (rows.length === 0) return null;

  const reservation = rows[0];
  const now         = getClock().now();
  const expiresAt   = new Date(now.getTime() + holdWindowHours * 60 * 60 * 1000);

  const { rows: updated } = await client.query(
    `UPDATE reservations
     SET status = 'held',
         hold_start_at   = $1,
         hold_expires_at = $2,
         updated_at      = NOW()
     WHERE id = $3
     RETURNING id, member_id, book_id, queue_position, status,
               hold_start_at, hold_expires_at, created_at, updated_at`,
    [now.toISOString(), expiresAt.toISOString(), reservation.id]
  );

  return updated[0];
}

/**
 * Find all expired HELD reservations for a book, mark them EXPIRED, and
 * attempt to re-allocate each released copy to the next waiter.
 *
 * Returns the count of copies that had no waiter and were restored to inventory.
 * Must be called inside an open transaction on `client`.
 */
async function processExpiredHolds(client, bookId, holdWindowHours) {
  const now = getClock().now().toISOString();

  const { rows: expired } = await client.query(
    `SELECT id FROM reservations
     WHERE book_id = $1 AND status = 'held' AND hold_expires_at < $2::timestamptz
     FOR UPDATE SKIP LOCKED`,
    [bookId, now]
  );

  if (expired.length === 0) return { allocated: null, restoredToInventory: 0 };

  let restoredToInventory = 0;
  let lastAllocated = null;

  for (const exp of expired) {
    await client.query(
      "UPDATE reservations SET status = 'expired', updated_at = NOW() WHERE id = $1",
      [exp.id]
    );

    const next = await allocateNextReservation(client, bookId, holdWindowHours);
    if (next) {
      lastAllocated = next;
    } else {
      restoredToInventory += 1;
    }
  }

  return { allocated: lastAllocated, restoredToInventory };
}

module.exports = { allocateNextReservation, processExpiredHolds };