// Public ticket delivery.
//
//   GET /api/tickets/:ticketRef       → PDF, downloaded (attachment)
//   GET /api/tickets/:ticketRef/view  → PDF, displayed inline in the browser
//
// No auth: the ticket reference is the bearer credential. The PATCH attend
// route (admin) lives in routes/events.js alongside the other admin actions.

import { Router } from "express";
import { db } from "../db/index.js";
import { authGuard } from "../middleware/authGuard.js";
import { sanitizeBody } from "../middleware/sanitize.js";
import { generateTicketPDF } from "../services/ticket.service.js";

const router = Router();

const DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
  hour: "numeric", minute: "2-digit",
});

function formatEventDate(iso) {
  if (!iso) return "Date to be announced";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return DATE_FMT.format(d);
}

async function streamTicket(req, res, next, { inline }) {
  try {
    const reg = await db.getRegistrationByTicketRef(req.params.ticketRef);
    if (!reg) return res.status(404).json({ error: "ticket not found" });

    // For online events, surface the proxied join link (gated by time window)
    // on the PDF — never the raw meeting URL.
    const frontend = (process.env.FRONTEND_URL || "http://127.0.0.1:5500").replace(/\/$/, "");
    const joinUrl = reg.is_online
      ? `${frontend}/join.html?ref=${encodeURIComponent(reg.ticket_ref)}`
      : undefined;

    const pdf = await generateTicketPDF({
      ticketRef: reg.ticket_ref,
      name: reg.name,
      eventTitle: reg.event_title,
      eventDate: formatEventDate(reg.event_date),
      eventLocation: reg.location,
      isOnline: !!reg.is_online,
      locationUrl: reg.location_url,
      joinUrl,
    });

    const disposition = inline ? "inline" : "attachment";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="ticket-${reg.ticket_ref}.pdf"`
    );
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  } catch (e) {
    next(e);
  }
}

// JSON registration + event data, used by the on-screen HTML ticket view.
router.get("/:ticketRef/data", async (req, res, next) => {
  try {
    const reg = await db.getRegistrationByTicketRef(req.params.ticketRef);
    if (!reg) return res.status(404).json({ error: "ticket not found" });
    res.json({
      ticket_ref: reg.ticket_ref,
      name: reg.name,
      attended: !!reg.attended,
      event_title: reg.event_title,
      event_slug: reg.event_slug,
      event_date: reg.event_date,
      location: reg.location,
      location_url: reg.location_url,
      is_online: !!reg.is_online,
    });
  } catch (e) { next(e); }
});

router.get("/:ticketRef", (req, res, next) => streamTicket(req, res, next, { inline: false }));
router.get("/:ticketRef/view", (req, res, next) => streamTicket(req, res, next, { inline: true }));

// ── Admin: mark attendance / check-in ──────────────────────────────────────
// PATCH /api/tickets/:ticketRef/attend  body: { attended: true|false }
router.patch("/:ticketRef/attend", authGuard, sanitizeBody({ attended: "boolean" }), async (req, res, next) => {
  try {
    const existing = await db.getRegistrationByTicketRef(req.params.ticketRef);
    if (!existing) return res.status(404).json({ error: "ticket not found" });
    const attended = req.body?.attended !== false;
    const updated = await db.markAttended(req.params.ticketRef, attended);
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
