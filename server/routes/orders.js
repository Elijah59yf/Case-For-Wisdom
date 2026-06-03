import { Router } from "express";
import { db } from "../db/index.js";
import { authGuard } from "../middleware/authGuard.js";
import { sanitizeBody } from "../middleware/sanitize.js";
import { prepareOrderInsert, validateStatus } from "../db/queries/orders.js";
import { paginate } from "../utils/paginate.js";

const router = Router();

// Only customer-supplied fields are accepted. items[] is re-priced server-side;
// total and status are computed server-side and never trusted from the client.
const orderSchema = {
  items: "array",
  customer_email: "string",
  customer_name: "string",
  shipping_address: "object",
};

// Public — checkout creates a pending order.
// The Stripe flow (server-side total recalculation) lives in
// services/stripe.service.js and is wired into a dedicated route
// at /api/checkout (not implemented yet — placeholder endpoint).
router.post("/", sanitizeBody(orderSchema), async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) throw Object.assign(new Error("items required"), { status: 400 });

    let total = 0;
    const lineItems = [];
    for (const line of items) {
      const product = await db.getProductById(line.id);
      if (!product) throw Object.assign(new Error(`unknown product ${line.id}`), { status: 400 });
      const qty = Math.max(1, parseInt(line.qty, 10) || 1);
      total += Number(product.price) * qty;
      lineItems.push({ id: product.id, name: product.name, price: Number(product.price), qty });
    }

    const order = await db.createOrder(prepareOrderInsert({
      ...req.body,
      items: lineItems,
      total: Number(total.toFixed(2)),
      status: "pending",
    }));
    res.status(201).json(order);
  } catch (e) { next(e); }
});

router.get("/", authGuard, async (req, res, next) => {
  try {
    const { limit, offset } = paginate(req.query);
    res.json(await db.getOrders({ status: req.query.status, limit, offset }));
  } catch (e) { next(e); }
});

router.get("/:id", authGuard, async (req, res, next) => {
  try {
    const order = await db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "not found" });
    res.json(order);
  } catch (e) { next(e); }
});

router.patch("/:id/status", authGuard, sanitizeBody({ status: "string" }), async (req, res, next) => {
  try {
    const status = validateStatus(req.body?.status);
    res.json(await db.updateOrderStatus(req.params.id, status));
  } catch (e) { next(e); }
});

export default router;
