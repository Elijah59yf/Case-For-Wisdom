import { Router } from "express";
import { db } from "../db/index.js";
import { authGuard } from "../middleware/authGuard.js";
import { sanitizeBody } from "../middleware/sanitize.js";
import { prepareProductInsert, prepareProductUpdate } from "../db/queries/products.js";
import { paginate } from "../utils/paginate.js";

const router = Router();

const productSchema = {
  name: "string",
  slug: "string",
  description: "string",
  price: "number",
  images: "array",
  category: "string",
  in_stock: "boolean",
  stock_count: "number",
  stripe_price_id: "string",
};

router.get("/", async (req, res, next) => {
  try {
    const { limit, offset } = paginate(req.query);
    res.json(await db.getProducts({ limit, offset }));
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const product = await db.getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: "not found" });
    res.json(product);
  } catch (e) { next(e); }
});

router.get("/admin/all", authGuard, async (req, res, next) => {
  try {
    const { limit, offset } = paginate(req.query);
    res.json(await db.getAllProducts({ limit, offset }));
  } catch (e) { next(e); }
});

router.get("/admin/:id", authGuard, async (req, res, next) => {
  try {
    const product = await db.getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: "not found" });
    res.json(product);
  } catch (e) { next(e); }
});

router.post("/", authGuard, sanitizeBody(productSchema), async (req, res, next) => {
  try { res.status(201).json(await db.createProduct(prepareProductInsert(req.body))); }
  catch (e) { next(e); }
});

router.patch("/:id", authGuard, sanitizeBody(productSchema), async (req, res, next) => {
  try { res.json(await db.updateProduct(req.params.id, prepareProductUpdate(req.body))); }
  catch (e) { next(e); }
});

router.delete("/:id", authGuard, async (req, res, next) => {
  try { res.json(await db.deleteProduct(req.params.id)); }
  catch (e) { next(e); }
});

export default router;
