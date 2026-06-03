import { Router } from "express";
import { db } from "../db/index.js";
import { authGuard } from "../middleware/authGuard.js";
import { sanitizeBody } from "../middleware/sanitize.js";

// Newsletter subscribers. All DB access goes through the adapter pair
// (db.addSubscriber / db.getSubscribers), so this works on both targets.

const router = Router();

// Deliberately conservative: one @, at least one dot in the domain, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/subscribe — public newsletter signup.
router.post("/subscribe", sanitizeBody({ email: "string" }), async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!email || email.length > 500 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }
    // A duplicate is swallowed inside the adapter and reported as success —
    // we never reveal that an address is already on the list.
    res.json(await db.addSubscriber(email));
  } catch (e) { next(e); }
});

// GET /api/subscribers — admin-only list.
router.get("/subscribers", authGuard, async (_req, res, next) => {
  try {
    res.json(await db.getSubscribers());
  } catch (e) { next(e); }
});

export default router;
