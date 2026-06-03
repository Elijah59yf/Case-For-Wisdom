// Centralized error handler.
// - Never leaks stack traces in production.
// - Logs the full error server-side.
// - Maps a few well-known driver/library error codes to HTTP statuses.

const isProd = () => process.env.NODE_ENV === "production";

function classify(err) {
  // Respect an explicit status if a route already set one.
  if (err.status && err.status >= 400) return err.status;

  switch (err.code) {
    case "ECONNREFUSED":
      return 503; // DB / upstream unreachable
    case "ER_DUP_ENTRY":      // MariaDB duplicate key
    case "23505":             // Postgres unique_violation
      return 409;
    default:
      break;
  }

  // jsonwebtoken errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return 401;
  }

  return 500;
}

export function errorHandler(err, req, res, _next) {
  const status = classify(err);

  // Always log the full error server-side.
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  } else {
    console.warn(`[warn ] ${req.method} ${req.originalUrl} -> ${status}: ${err.message}`);
  }

  if (status === 503) {
    return res.status(503).json({ error: "Service unavailable" });
  }

  if (isProd()) {
    // Generic message for 5xx; for explicit 4xx the message is safe to surface.
    const body = status >= 500
      ? { error: "Something went wrong" }
      : { error: err.message || "Request failed" };
    return res.status(status).json(body);
  }

  // Development: full detail to aid debugging.
  return res.status(status).json({ error: err.message, stack: err.stack });
}

export function notFound(req, res) {
  res.status(404).json({ error: `not found: ${req.method} ${req.originalUrl}` });
}
