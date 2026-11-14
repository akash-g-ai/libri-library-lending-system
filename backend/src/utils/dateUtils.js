'use strict';

/** Add `days` calendar days to a 'YYYY-MM-DD' string. Returns 'YYYY-MM-DD'. Uses UTC. */
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calculate calendar days overdue between two 'YYYY-MM-DD' strings. Returns 0 if not overdue. */
function calcOverdueDays(dueDateStr, returnDateStr) {
  const due = new Date(dueDateStr    + 'T00:00:00Z');
  const ret = new Date(returnDateStr + 'T00:00:00Z');
  const diff = Math.floor((ret - due) / 86400000);
  return diff > 0 ? diff : 0;
}

/** Fine = overdueDays * finePerDay, capped at maxCap. All values from library_settings. */
function calcFine(overdueDays, finePerDay, maxCap) {
  if (overdueDays <= 0) return 0;
  return Math.min(overdueDays * parseFloat(finePerDay), parseFloat(maxCap));
}

module.exports = { addDays, calcOverdueDays, calcFine };