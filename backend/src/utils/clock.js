'use strict';
/**
 * Injectable clock for deterministic date/time in business logic.
 *
 * Production: getClock().today() / getClock().now() return real time.
 * Tests: setClock('YYYY-MM-DD' | ISO string | Date) overrides the clock.
 *        setClock(null) restores the real clock.
 */

let _fixed = null;

function getClock() {
  if (_fixed !== null) {
    const d = _fixed;
    return {
      now:   () => new Date(d),
      today: () => d.toISOString().slice(0, 10),
    };
  }
  return {
    now:   () => new Date(),
    today: () => new Date().toISOString().slice(0, 10),
  };
}

function setClock(value) {
  if (value === null || value === undefined) { _fixed = null; return; }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) throw new TypeError('setClock: Invalid Date');
    _fixed = new Date(value);
    return;
  }
  if (typeof value === 'string') {
    const iso = value.length === 10 ? value + 'T00:00:00Z' : value;
    const d = new Date(iso);
    if (isNaN(d.getTime())) throw new TypeError(`setClock: invalid date "${value}"`);
    _fixed = d;
    return;
  }
  throw new TypeError(`setClock: expected string, Date, or null`);
}

module.exports = { getClock, setClock };