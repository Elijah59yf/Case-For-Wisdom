import jwt from "jsonwebtoken";

export function authGuard(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "missing or invalid Authorization header" });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "");
    return next();
  } catch {
    return res.status(401).json({ error: "invalid or expired token" });
  }
}
