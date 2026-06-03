import { Router } from "express";
import multer from "multer";
import { authGuard } from "../middleware/authGuard.js";
import { saveFile } from "../services/upload.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — service re-validates type & size
});

const router = Router();

router.post("/", authGuard, upload.single("file"), async (req, res, next) => {
  try { res.status(201).json(await saveFile(req.file)); }
  catch (e) { next(e); }
});

export default router;
