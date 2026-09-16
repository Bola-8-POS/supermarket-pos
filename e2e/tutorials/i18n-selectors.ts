/**
 * Locale-safe (es-MX/en-US) dual-locale selector constants shared across
 * every domain in `e2e/tutorials/**`. This harness's default locale is
 * es-MX, unlike the CI-critical `e2e/**` suite's en-US-defaulted fixture
 * accounts — see 34-01-PLAN.md Task 1 for why. Add a new cross-domain-reusable
 * constant here before inventing an ad-hoc regex in a domain spec; strings
 * used by only one domain stay inline in that domain's own spec file.
 */

/** homeDashboard.tiles.pos */
export const CHECKOUT_TILE_RE = /^(checkout|cobro)$/i;
/** checkoutPanel.searchPlaceholder */
export const SEARCH_PRODUCTS_PLACEHOLDER_RE = /^(search products|buscar productos)$/i;
/** checkoutPanel.processPayment */
export const PROCESS_PAYMENT_RE = /^(process payment|procesar pago)$/i;
/** wPanels.json confirmCardPayment */
export const CONFIRM_CARD_PAYMENT_RE = /^(confirm card payment|confirmar pago con tarjeta)$/i;
/** wPanels.json amountTendered */
export const AMOUNT_TENDERED_RE = /^(amount tendered|monto entregado)$/i;
/** featOrders.json processPayment.done */
export const DONE_RE = /^(done|listo)$/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches entities.json's selectRegularPrice key: "Select {{name}}, Regular
 * price" (en-US) / "Seleccionar {{name}}, precio regular" (es-MX).
 */
export function selectProductRe(productName: string): RegExp {
  const escaped = escapeRegExp(productName);
  return new RegExp(`(select|seleccionar) ${escaped}`, 'i');
}
