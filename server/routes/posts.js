import { Router } from "express";
import { db } from "../db/index.js";
import { authGuard } from "../middleware/authGuard.js";
import { sanitizeBody } from "../middleware/sanitize.js";
import { preparePostInsert, preparePostUpdate } from "../db/queries/posts.js";
import { paginate } from "../utils/paginate.js";

const router = Router();

// `body` is declared as html so DOMPurify runs on Quill output before storage.
const postSchema = {
  title: "string",
  slug: "string",
  excerpt: "string",
  body: "html",
  cover_url: "string",
  category: "string",
  published: "boolean",
};

// Public
router.get("/", async (req, res, next) => {
  try {
    const { limit, offset, page } = paginate(req.query);
    const result = await db.getPosts({ limit, offset, page });
    const data = (result.data ?? []).map((p) => ({
      ...p,
      read_time: Math.max(1, Math.ceil((p.body?.length ?? 0) / 1000)),
    }));
    res.json({ data, total: result.total ?? 0, page, limit });
  } catch (e) { next(e); }
});

router.get("/slug/:slug", async (req, res, next) => {
  try {
    const post = await db.getPostBySlug(req.params.slug);
    if (!post || !post.published) return res.status(404).json({ error: "not found" });
    res.json(post);
  } catch (e) { next(e); }
});

// Admin
router.get("/admin/all", authGuard, async (req, res, next) => {
  try {
    const { limit, offset } = paginate(req.query);
    res.json(await db.getAllPosts({ limit, offset }));
  } catch (e) { next(e); }
});

router.get("/admin/:id", authGuard, async (req, res, next) => {
  try {
    const post = await db.getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: "not found" });
    res.json(post);
  } catch (e) { next(e); }
});

router.post("/", authGuard, sanitizeBody(postSchema), async (req, res, next) => {
  try { res.status(201).json(await db.createPost(preparePostInsert(req.body))); }
  catch (e) { next(e); }
});

router.patch("/:id", authGuard, sanitizeBody(postSchema), async (req, res, next) => {
  try { res.json(await db.updatePost(req.params.id, preparePostUpdate(req.body))); }
  catch (e) { next(e); }
});

router.delete("/:id", authGuard, async (req, res, next) => {
  try { res.json(await db.deletePost(req.params.id)); }
  catch (e) { next(e); }
});

export default router;
