// KPI icon colours carry meaning: plain counts use the neutral treatment, and
// colour is reserved for status. Payment success is a status, so its tone
// follows the rate (healthy / watch / critical).
export const PAYMENT_SUCCESS_OK = 95;
export const PAYMENT_SUCCESS_WARN = 85;

export function paymentSuccessTone(rate) {
  const n = Number(rate);
  if (n >= PAYMENT_SUCCESS_OK) return 'tone-green';
  if (n >= PAYMENT_SUCCESS_WARN) return 'tone-amber';
  return 'tone-red';
}
