// Protected join-link system for online events.
//
//   GET /api/join/:ticketRef        → 302 redirect to the event meeting URL
//   GET /api/join/:ticketRef/check  → same gating, returns JSON instead of a
//                                     redirect (used by the join.html proxy page)
//
// No auth: the ticket reference is the bearer credential. The real meeting URL
// (event.location_url) is never exposed to the registrant ahead of time — it is
// only revealed inside the time window, and only via this proxy.

import { Router } from "express";
import { db } from "../db/index.js";

const router = Router();

const WINDOW_OPEN_MS = 30 * 60 * 1000;        // join link opens 30 min before start
const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1000; // fallback window length when no end_date

// Resolves the registration + event and applies every gate. Returns either
// { ok: true, registration, event } or { status, body } describing the failure.
async function resolveJoin(ticketRef) {
  const reg = await db.getRegistrationByTicketRef(ticketRef);
  if (!reg) return { status: 404, body: { error: "Ticket not found" } };

  const event = await db.getEventById(reg.event_id);
  if (!event || !event.published) {
    return { status: 404, body: { error: "Event not found" } };
  }

  if (!event.is_online) {
    return { status: 400, body: { error: "This is not an online event" } };
  }
  if (!event.location_url) {
    return { status: 400, body: { error: "No join link available" } };
  }

  const now = Date.now();
  const eventStart = new Date(event.event_date).getTime();
  if (Number.isNaN(eventStart)) {
    return { status: 400, body: { error: "Event start time is invalid" } };
  }
  const windowOpen = eventStart - WINDOW_OPEN_MS;
  const windowClose = event.end_date
    ? new Date(event.end_date).getTime()
    : eventStart + DEFAULT_DURATION_MS;

  if (now < windowOpen) {
    return {
      status: 403,
      body: {
        error: "Event has not started yet",
        startsAt: event.event_date,
        windowOpensAt: new Date(windowOpen).toISOString(),
        eventTitle: event.title,
        message: "Join link opens 30 minutes before the event",
      },
    };
  }
  if (now > windowClose) {
    return { status: 403, body: { error: "This event has ended" } };
  }

  return { ok: true, registration: reg, event };
}

// JSON variant — the join.html page calls this. Marks attendance here (this is
// the only route the frontend hits) then returns the meeting URL.
router.get("/:ticketRef/check", async (req, res, next) => {
  try {
    const result = await resolveJoin(req.params.ticketRef);
    if (!result.ok) return res.status(result.status).json(result.body);

    if (!result.registration.attended) {
      await db.markAttendedByTicketRef(result.registration.ticket_ref);
    }
    res.json({ ok: true, url: result.event.location_url });
  } catch (e) { next(e); }
});

// Redirect variant — direct API use (e.g. a raw link). Kept for completeness;
// the frontend uses /check.
router.get("/:ticketRef", async (req, res, next) => {
  try {
    const result = await resolveJoin(req.params.ticketRef);
    if (!result.ok) return res.status(result.status).json(result.body);

    if (!result.registration.attended) {
      await db.markAttendedByTicketRef(result.registration.ticket_ref);
    }
    res.redirect(302, result.event.location_url);
  } catch (e) { next(e); }
});

export default router;
