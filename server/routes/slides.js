import { Router } from "express";
import { db } from "../db/index.js";
import { authGuard } from "../middleware/authGuard.js";
import { sanitizeBody } from "../middleware/sanitize.js";
import { prepareSlideInsert, prepareSlideUpdate } from "../db/queries/slides.js";

const router = Router();

const slideSchema = {
  image_url: "string",
  caption: "string",
  alt_text: "string",
  position: "number",
  active: "boolean",
};

router.get("/", async (_req, res, next) => {
  try { res.json(await db.getHeroSlides()); }
  catch (e) { next(e); }
});

router.get("/all", authGuard, async (_req, res, next) => {
  try { res.json(await db.getAllHeroSlides()); }
  catch (e) { next(e); }
});

router.post("/", authGuard, sanitizeBody(slideSchema), async (req, res, next) => {
  try { res.status(201).json(await db.createHeroSlide(prepareSlideInsert(req.body))); }
  catch (e) { next(e); }
});

router.put("/:id", authGuard, sanitizeBody(slideSchema), async (req, res, next) => {
  try { res.json(await db.updateHeroSlide(req.params.id, prepareSlideUpdate(req.body))); }
  catch (e) { next(e); }
});

router.delete("/:id", authGuard, async (req, res, next) => {
  try { res.json(await db.deleteHeroSlide(req.params.id)); }
  catch (e) { next(e); }
});

router.post("/reorder", authGuard, sanitizeBody({ ids: "array" }), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    if (!ids) throw Object.assign(new Error("ids array required"), { status: 400 });
    res.json(await db.reorderHeroSlides(ids));
  } catch (e) { next(e); }
});

export default router;
