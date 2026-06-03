// Input sanitization.
//
//  - sanitizeBody(schema): returns middleware that coerces each known field
//    on req.body to its declared type and DROPS every field not in the schema.
//    This neutralizes mass-assignment and type-confusion before the value ever
//    reaches a query builder.
//
//  - sanitizeHtml(html): runs DOMPurify over Quill output, allowing only a
//    small, safe set of tags/attributes. Use before storing post bodies.

import DOMPurify from "isomorphic-dompurify";

// ── HTML sanitization (Quill output) ─────────────────────────────────────
const ALLOWED_TAGS = [
  "p", "h2", "h3", "ul", "ol", "li",
  "strong", "em", "blockquote", "a", "br",
];
const ALLOWED_ATTR = ["href"];

export function sanitizeHtml(html) {
  if (html == null) return html;
  return DOMPurify.sanitize(String(html), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Disallow javascript:/data: URIs; only http(s), mailto, and relative.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: ["target", "rel"],
  });
}

// ── Body coercion ────────────────────────────────────────────────────────
function coerce(type, value) {
  if (value === undefined) return undefined;

  switch (type) {
    case "string":
      return value == null ? null : String(value);
    case "html":
      return value == null ? null : sanitizeHtml(String(value));
    case "number": {
      if (value === null || value === "") return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case "boolean":
      return value === true || value === "true" || value === 1 || value === "1";
    case "array":
      return Array.isArray(value) ? value : [];
    case "object":
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    default:
      return value;
  }
}

/**
 * @param {Record<string,"string"|"html"|"number"|"boolean"|"array"|"object">} schema
 */
export function sanitizeBody(schema) {
  return (req, _res, next) => {
    const src = req.body && typeof req.body === "object" ? req.body : {};
    const out = {};
    for (const [field, type] of Object.entries(schema)) {
      if (field in src) {
        const v = coerce(type, src[field]);
        if (v !== undefined) out[field] = v;
      }
    }
    req.body = out;
    next();
  };
}
