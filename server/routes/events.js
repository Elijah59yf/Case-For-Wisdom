import { Router } from "express";
import { db } from "../db/index.js";
import { authGuard } from "../middleware/authGuard.js";
import { sanitizeBody } from "../middleware/sanitize.js";
import { prepareEventInsert, prepareEventUpdate } from "../db/queries/events.js";
import { paginate } from "../utils/paginate.js";
import { generateTicketRef } from "../utils/ticket.js";
import { sendEmail, ticketConfirmationEmail } from "../services/email.service.js";

const router = Router();

// `description` is declared as html so DOMPurify runs on Quill output before storage.
const eventSchema = {
  title: "string",
  slug: "string",
  description: "html",
  event_date: "string",
  end_date: "string",
  location: "string",
  location_url: "string",
  is_online: "boolean",
  is_inperson: "boolean",
  is_paid: "boolean",
  price: "number",
  capacity: "number",
  registration_open: "boolean",
  cover_url: "string",
  published: "boolean",
};

const registerSchema = { name: "string", email: "string" };

const EMAIL_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
  hour: "numeric", minute: "2-digit",
});
function formatEventDate(iso) {
  if (!iso) return "Date to be announced";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : EMAIL_DATE_FMT.format(d);
}

// ── Admin (declared before /:slug so they aren't shadowed) ──────────────
router.get("/all", authGuard, async (req, res, next) => {
  try {
    const { limit, offset } = paginate(req.query);
    res.json(await db.getAllEvents({ limit, offset }));
  } catch (e) { next(e); }
});

router.get("/admin/:id", authGuard, async (req, res, next) => {
  try {
    const event = await db.getEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "not found" });
    res.json(event);
  } catch (e) { next(e); }
});

// ── Public ──────────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const { limit, offset } = paginate(req.query);
    res.json(await db.getEvents({ limit, offset }));
  } catch (e) { next(e); }
});

// Past events: published, already finished, most-recent-first (max 20).
// Declared before /:slug so "past" isn't captured as a slug.
router.get("/past", async (_req, res, next) => {
  try {
    res.json(await db.getPastEvents());
  } catch (e) { next(e); }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const event = await db.getEventBySlug(req.params.slug);
    if (!event || !event.published) return res.status(404).json({ error: "not found" });
    res.json(event);
  } catch (e) { next(e); }
});

// ── Registration (public) ────────────────────────────────────────────────
router.post("/:slug/register", sanitizeBody(registerSchema), async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!name) return res.status(400).json({ error: "Name is required" });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email is required" });
    }

    // 1. Event must exist (and be published, like the public detail route).
    const event = await db.getEventBySlug(req.params.slug);
    if (!event || !event.published) return res.status(404).json({ error: "not found" });

    // 2. Registration may be force-closed by an admin.
    if (!event.registration_open) {
      return res.status(403).json({ error: "Registration is closed" });
    }

    // 3. Capacity check (NULL = unlimited).
    if (event.capacity != null) {
      const count = await db.countRegistrations(event.id);
      if (count >= event.capacity) {
        return res.status(403).json({ error: "This event is full" });
      }
    }

    // 4. Duplicate guard — return the existing ticket so they can retrieve it.
    const existing = await db.getRegistrationByEventAndEmail(event.id, email);
    if (existing) {
      return res.status(409).json({
        error: "You're already registered for this event",
        ticketRef: existing.ticket_ref,
      });
    }

    // 5–6. Unique ticket ref + persist.
    const ticketRef = await generateTicketRef(event.slug, db);
    await db.createRegistration({ eventId: event.id, ticketRef, name, email });

    // 7. Ticket URL for the confirmation email.
    const frontend = (process.env.FRONTEND_URL || "http://127.0.0.1:5500").replace(/\/$/, "");
    const ticketUrl = `${frontend}/ticket.html?ref=${encodeURIComponent(ticketRef)}`;
    // For online events, the proxied join link (gated by time window) — never
    // the raw meeting URL.
    const joinUrl = event.is_online
      ? `${frontend}/join.html?ref=${encodeURIComponent(ticketRef)}`
      : undefined;

    // 8. Confirmation email — never let a send failure break registration.
    try {
      const tpl = ticketConfirmationEmail({
        name,
        eventTitle: event.title,
        eventDate: formatEventDate(event.event_date),
        eventLocation: event.location,
        ticketRef,
        isOnline: !!event.is_online,
        locationUrl: event.location_url,
        ticketUrl,
        joinUrl,
      });
      const result = await sendEmail({ to: email, ...tpl });
      if (!result.ok) console.error("[register] confirmation email failed for", ticketRef);
    } catch (mailErr) {
      console.error("[register] confirmation email threw for", ticketRef, mailErr);
    }

    // 9.
    res.status(201).json({ ok: true, ticketRef, ticketUrl });
  } catch (e) { next(e); }
});

router.patch("/:id/toggle-registration", authGuard, async (req, res, next) => {
  try {
    const event = await db.getEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "not found" });
    const next_ = !event.registration_open;
    await db.updateEvent(req.params.id, { registration_open: next_ });
    res.json({ registration_open: next_ });
  } catch (e) { next(e); }
});

router.get("/:id/registrations", authGuard, async (req, res, next) => {
  try {
    res.json(await db.getEventRegistrations(req.params.id));
  } catch (e) { next(e); }
});

// ── Admin writes ─────────────────────────────────────────────────────────
router.post("/", authGuard, sanitizeBody(eventSchema), async (req, res, next) => {
  try { res.status(201).json(await db.createEvent(prepareEventInsert(req.body))); }
  catch (e) { next(e); }
});

router.put("/:id", authGuard, sanitizeBody(eventSchema), async (req, res, next) => {
  try { res.json(await db.updateEvent(req.params.id, prepareEventUpdate(req.body))); }
  catch (e) { next(e); }
});

router.delete("/:id", authGuard, async (req, res, next) => {
  try { res.json(await db.deleteEvent(req.params.id)); }
  catch (e) { next(e); }
});

export default router;
