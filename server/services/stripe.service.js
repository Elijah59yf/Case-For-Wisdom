// Stripe service — thin wrapper so the route layer doesn't import
// the SDK directly. Stripe is lazy-loaded so missing keys don't crash boot.

let _stripe;
async function stripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw Object.assign(new Error("STRIPE_SECRET_KEY not configured"), { status: 500 });
  const { default: Stripe } = await import("stripe");
  _stripe = new Stripe(key);
  return _stripe;
}

export async function createPaymentIntent({ amountCents, metadata = {} }) {
  const s = await stripe();
  return s.paymentIntents.create({
    amount: amountCents,
    currency: "cad",
    automatic_payment_methods: { enabled: true },
    metadata,
  });
}

export async function verifyWebhook(rawBody, signature) {
  const s = await stripe();
  return s.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}
