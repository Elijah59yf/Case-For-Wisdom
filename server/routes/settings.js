import { Router } from "express";
import { db } from "../db/index.js";
import { authGuard } from "../middleware/authGuard.js";
import { sanitizeBody } from "../middleware/sanitize.js";
import { validateSetting, allowedKeys } from "../db/queries/settings.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try { res.json(await db.getSettings()); }
  catch (e) { next(e); }
});

router.get("/keys", (_req, res) => res.json(allowedKeys()));

router.put("/:key", authGuard, sanitizeBody({ value: "string" }), async (req, res, next) => {
  try {
    const { key, value } = validateSetting(req.params.key, req.body?.value);
    res.json(await db.updateSetting(key, value));
  } catch (e) { next(e); }
});

export default router;
