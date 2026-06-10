import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

import authRoutes from "./routes/auth.js";
import postsRoutes from "./routes/posts.js";
import eventsRoutes from "./routes/events.js";
import ticketsRoutes from "./routes/tickets.js";
import joinRoutes from "./routes/join.js";
import productsRoutes from "./routes/products.js";
import ordersRoutes from "./routes/orders.js";
import checkoutRoutes from "./routes/checkout.js";
import settingsRoutes from "./routes/settings.js";
import navRoutes from "./routes/nav.js";
import uploadRoutes from "./routes/upload.js";
import slidesRoutes from "./routes/slides.js";
import subscribeRoutes from "./routes/subscribe.js";

import { adapter, closeDb } from "./db/index.js";

// ── Environment validation (fail fast) ───────────────────────────────────
function validateEnv() {
  const required = ["JWT_SECRET", "JWT_REFRESH_SECRET", "DB_ADAPTER"];
  const dbAdapter = (process.env.DB_ADAPTER || "").toLowerCase();

  if (dbAdapter === "mariadb") {
    required.push("DB_HOST", "DB_USER", "DB_PASS", "DB_NAME");
  } else if (dbAdapter === "supabase") {
    required.push("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  }

  if (process.env.NODE_ENV === "production") {
    required.push("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET");
    // Email + ticketing essentials. RESEND is the primary email provider and
    // FRONTEND_URL is needed to build the ticket link in registration replies.
    required.push("RESEND_API_KEY", "FRONTEND_URL");
  } else {
    // In dev, warn (don't fail) so local registration still works without keys.
    for (const k of ["RESEND_API_KEY", "FRONTEND_URL"]) {
      if (!process.env[k] || !String(process.env[k]).trim()) {
        console.warn(`[env] ${k} not set — using a dev default / email may be skipped`);
      }
    }
  }

  const missing = required.filter((k) => !process.env[k] || !String(process.env[k]).trim());
  if (missing.length) {
    for (const key of missing) console.error(`[env] missing required variable: ${key}`);
    process.exit(1);
  }
}
validateEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Behind Render's proxy — required for correct client IPs in the rate limiter.
app.set("trust proxy", 1);

const allowedOrigins = process.env.NODE_ENV === "production"
  ? ["https://acaseforwisdom.pages.dev"]
  : [
      "http://localhost:8000",
      "http://localhost:5500",
      "http://127.0.0.1:5500",
      "http://127.0.0.1:8000",
      "http://0.0.0.0:8000",
    ];

// ── Security & performance middleware ────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://cdn.quilljs.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.quilljs.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co"],
      connectSrc: ["'self'", "https://*.supabase.co", "https://api.stripe.com"],
      frameSrc: ["https://js.stripe.com"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(compression());

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(requestLogger);

// General limiter: 100 requests / 15 min / IP across all /api routes.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
// Stricter limiter for login: 5 attempts / 15 min / IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
});

app.use("/api", apiLimiter);

// Static uploads for the local upload adapter.
const uploadDir = path.resolve(__dirname, process.env.UPLOAD_DIR || "./uploads");
app.use("/uploads", express.static(uploadDir, { maxAge: "7d" }));

// ── Health check (no auth) ───────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({
  status: "ok",
  adapter,
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/tickets", ticketsRoutes);
app.use("/api/join", joinRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/nav", navRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/slides", slidesRoutes);
// Mounted at /api so it can own both POST /api/subscribe and GET /api/subscribers.
app.use("/api", subscribeRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = parseInt(process.env.PORT || "3000", 10);
const server = app.listen(PORT, () => {
  console.log(`A Case for Wisdom server listening on :${PORT} (adapter: ${adapter})`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[shutdown] ${signal} received — closing server...`);

  // Stop accepting new connections.
  server.close(async () => {
    try {
      await closeDb();
      console.log("[shutdown] database connections closed. Bye.");
      process.exit(0);
    } catch (err) {
      console.error("[shutdown] error closing DB:", err);
      process.exit(1);
    }
  });

  // Hard cap so a hung connection can't block shutdown forever.
  setTimeout(() => {
    console.error("[shutdown] forced exit after timeout.");
    process.exit(1);
  }, 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
