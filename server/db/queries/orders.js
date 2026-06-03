import { v4 as uuid } from "uuid";

const VALID_STATUSES = new Set(["pending", "paid", "fulfilled", "cancelled", "refunded"]);

export function prepareOrderInsert(input) {
  const total = Number(input.total);
  if (!Number.isFinite(total) || total < 0) throw Object.assign(new Error("total invalid"), { status: 400 });
  if (!Array.isArray(input.items)) throw Object.assign(new Error("items must be an array"), { status: 400 });
  return {
    id: input.id || uuid(),
    stripe_payment_intent_id: input.stripe_payment_intent_id ?? null,
    customer_email: input.customer_email ?? null,
    customer_name: input.customer_name ?? null,
    shipping_address: input.shipping_address ?? null,
    items: input.items,
    total,
    status: input.status && VALID_STATUSES.has(input.status) ? input.status : "pending",
  };
}

export function validateStatus(status) {
  if (!VALID_STATUSES.has(status)) throw Object.assign(new Error("invalid status"), { status: 400 });
  return status;
}
