/** Format a numeric value as Indian Rupees (e.g. ₹5.00) */
export function inr(value) {
  return '\u20B9' + parseFloat(value || 0).toFixed(2);
}