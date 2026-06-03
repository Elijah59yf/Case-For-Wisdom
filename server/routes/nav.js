import { Router } from "express";
import { db } from "../db/index.js";
import { authGuard } from "../middleware/authGuard.js";
import { sanitizeBody } from "../middleware/sanitize.js";
import { prepareNavInsert, prepareNavUpdate } from "../db/queries/nav.js";

const router = Router();

const navSchema = {
  label: "string",
  url: "string",
  position: "number",
  visible: "boolean",
  opens_new: "boolean",
};

router.get("/", async (_req, res, next) => {
  try { res.json(await db.getNavItems()); }
  catch (e) { next(e); }
});

router.get("/admin/all", authGuard, async (_req, res, next) => {
  try { res.json(await db.getAllNavItems()); }
  catch (e) { next(e); }
});

router.post("/", authGuard, sanitizeBody(navSchema), async (req, res, next) => {
  try { res.status(201).json(await db.createNavItem(prepareNavInsert(req.body))); }
  catch (e) { next(e); }
});

router.patch("/:id", authGuard, sanitizeBody(navSchema), async (req, res, next) => {
  try { res.json(await db.updateNavItem(req.params.id, prepareNavUpdate(req.body))); }
  catch (e) { next(e); }
});

router.delete("/:id", authGuard, async (req, res, next) => {
  try { res.json(await db.deleteNavItem(req.params.id)); }
  catch (e) { next(e); }
});

router.post("/reorder", authGuard, sanitizeBody({ ids: "array" }), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    if (!ids) throw Object.assign(new Error("ids array required"), { status: 400 });
    res.json(await db.reorderNavItems(ids));
  } catch (e) { next(e); }
});

export default router;
