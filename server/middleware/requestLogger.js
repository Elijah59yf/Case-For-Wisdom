export function requestLogger(req, _res, next) {
  const t = new Date().toISOString();
  console.log(`[${t}] ${req.method} ${req.originalUrl}`);
  next();
}
