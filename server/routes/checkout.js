import { Router } from "express";
import { db } from "../db/index.js";
import { sanitizeBody } from "../middleware/sanitize.js";
import { prepareOrderInsert } from "../db/queries/orders.js";
import { createPaymentIntent } from "../services/stripe.service.js";

const router = Router();

// Public route — the storefront calls this to begin checkout.
// items[] is re-priced against canonical DB prices; the client total is
// NEVER trusted. customer holds name / email / shipping_address.
const checkoutSchema = {
  items: "array",
  customer: "object",
};

router.post("/payment-intent", sanitizeBody(checkoutSchema), async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) throw Object.assign(new Error("items required"), { status: 400 });
    const customer = req.body?.customer || {};

    // 1. Recalculate the total server-side from canonical product prices.
    let total = 0;
    const lineItems = [];
    for (const line of items) {
      const product = await db.getProductById(line.id);
      if (!product) throw Object.assign(new Error(`unknown product ${line.id}`), { status: 400 });
      const qty = Math.max(1, parseInt(line.qty, 10) || 1);
      total += Number(product.price) * qty;
      lineItems.push({ id: product.id, name: product.name, price: Number(product.price), qty });
    }
    const amountCents = Math.round(Number(total.toFixed(2)) * 100);
    if (amountCents <= 0) throw Object.assign(new Error("order total must be greater than zero"), { status: 400 });

    // 2. Create the Stripe PaymentIntent (CAD) via the service wrapper.
    const intent = await createPaymentIntent({
      amountCents,
      metadata: {
        customer_email: customer.email ?? "",
        item_count: String(lineItems.reduce((n, l) => n + l.qty, 0)),
      },
    });

    // 3. Persist a pending order keyed by the PaymentIntent id. The webhook
    //    flips it to "paid" once Stripe confirms the charge.
    const order = await db.createOrder(prepareOrderInsert({
      stripe_payment_intent_id: intent.id,
      customer_email: customer.email ?? null,
      customer_name: customer.name ?? null,
      shipping_address: customer.shipping_address ?? customer.address ?? null,
      items: lineItems,
      total: Number(total.toFixed(2)),
      status: "pending",
    }));

    // 4. Hand the client secret back to the browser to confirm payment.
    res.json({ clientSecret: intent.client_secret, order_id: order.id });
  } catch (e) { next(e); }
});

export default router;
