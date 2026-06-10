// Transactional email with cascading provider failover.
//
// sendEmail() walks the PROVIDERS list in order. The first provider that
// succeeds wins; any failure (network, auth, rate limit, quota) is logged and
// the next provider is tried. If every provider fails we log the details and
// return { ok: false } — we NEVER throw, because an email failure must not
// crash the registration flow that triggered it.
//
// Providers are imported lazily inside their senders so a missing package or
// missing API key degrades to "this provider failed" rather than a boot crash.

const PROVIDERS = ["resend", "brevo"];

const FROM_EMAIL = process.env.EMAIL_FROM || "tickets@acaseforwisdom.com";
const FROM_NAME = process.env.EMAIL_FROM_NAME || "A Case for Wisdom";

// ── Providers ──────────────────────────────────────────────────────────────
async function sendViaResend({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: [to],
    subject,
    html,
    text,
  });
  if (error) throw new Error(error.message || "Resend send failed");
  return data;
}

async function sendViaBrevo({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY not configured");

  const brevo = await import("@getbrevo/brevo");
  const api = new brevo.TransactionalEmailsApi();
  api.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);

  const message = new brevo.SendSmtpEmail();
  message.sender = { email: FROM_EMAIL, name: FROM_NAME };
  message.to = [{ email: to }];
  message.subject = subject;
  message.htmlContent = html;
  message.textContent = text;

  return api.sendTransacEmail(message);
}

const SENDERS = {
  resend: sendViaResend,
  brevo: sendViaBrevo,
};

// ── Public API ───────────────────────────────────────────────────────────
/**
 * @param {{to:string, subject:string, html:string, text:string}} payload
 * @returns {Promise<{ok:true, provider:string}|{ok:false, error:string}>}
 */
export async function sendEmail({ to, subject, html, text }) {
  const failures = [];

  for (const provider of PROVIDERS) {
    const send = SENDERS[provider];
    if (!send) continue;
    try {
      await send({ to, subject, html, text });
      return { ok: true, provider };
    } catch (err) {
      failures.push({ provider, error: err?.message || String(err) });
      console.warn(`[email] Provider ${provider} failed, trying next...`, err?.message || err);
    }
  }

  console.error("[email] All providers failed:", JSON.stringify(failures, null, 2));
  return { ok: false, error: "All providers failed" };
}

// ── Templates ──────────────────────────────────────────────────────────────
const BRAND_GREEN = "#2B3E1E";
const BRAND_CREAM = "#F5F0EA";

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Ticket confirmation email.
 * @returns {{subject:string, html:string, text:string}}
 */
export function ticketConfirmationEmail({
  name,
  eventTitle,
  eventDate,
  eventLocation,
  ticketRef,
  isOnline,
  locationUrl,
  ticketUrl,
  joinUrl,
}) {
  const subject = `Your ticket | ${eventTitle}`;

  // For online events we never expose the raw meeting URL (locationUrl) in the
  // email — only the proxied joinUrl, which gates access by time window.
  const locationLine = isOnline
    ? "Online event"
    : esc(eventLocation || "Location to be announced");

  const joinBlock = (isOnline && joinUrl)
    ? `<div style="text-align:center;margin:24px 0 0;">
              <a href="${esc(joinUrl)}" style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;font-size:15px;font-weight:bold;padding:13px 30px;border-radius:6px;">Join the event</a>
              <p style="margin:12px 0 0;font-size:13px;color:#6b6b6b;">This link opens 30 minutes before the event starts.</p>
            </div>`
    : "";

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#eceae4;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceae4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${BRAND_CREAM};border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND_GREEN};padding:28px 32px;">
            <div style="color:#fff;font-size:14px;letter-spacing:1px;text-transform:uppercase;opacity:.85;">A Case for Wisdom</div>
            <div style="color:#fff;font-size:24px;font-weight:bold;margin-top:6px;">Your ticket is confirmed</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 20px;font-size:16px;">Hi ${esc(name)}, you're registered. Here are your event details:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(43,62,30,.15);border-radius:6px;">
              <tr><td style="padding:18px 20px;">
                <div style="font-size:20px;font-weight:bold;color:${BRAND_GREEN};">${esc(eventTitle)}</div>
                <div style="margin-top:10px;font-size:15px;color:#444;">${esc(eventDate)}</div>
                <div style="margin-top:4px;font-size:15px;color:#444;">${locationLine}</div>
              </td></tr>
            </table>
            <div style="text-align:center;margin:28px 0 8px;">
              <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b6b6b;">Ticket reference</div>
              <div style="font-family:'Courier New',monospace;font-size:28px;font-weight:bold;letter-spacing:2px;color:${BRAND_GREEN};margin-top:6px;">${esc(ticketRef)}</div>
            </div>
            <div style="text-align:center;margin:24px 0;">
              <a href="${esc(ticketUrl)}" style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;font-size:15px;font-weight:bold;padding:13px 30px;border-radius:6px;">View &amp; Print Ticket</a>
            </div>
            ${joinBlock}
            <p style="margin:18px 0 0;font-size:13px;color:#6b6b6b;text-align:center;">Please bring this ticket to the event — printed or on your phone.</p>
          </td>
        </tr>
        <tr>
          <td style="background:${BRAND_GREEN};padding:20px 32px;text-align:center;">
            <div style="color:#fff;font-size:13px;opacity:.85;">A Case for Wisdom — The Source. The Sustainer.</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textLocation = isOnline ? "Online event" : (eventLocation || "Location to be announced");

  const joinText = (isOnline && joinUrl)
    ? `\nJoin the event: ${joinUrl}\n(This link opens 30 minutes before the event starts.)\n`
    : "";

  const text = `Your ticket is confirmed

Hi ${name}, you're registered.

${eventTitle}
${eventDate}
${textLocation}

Ticket reference: ${ticketRef}

View & print your ticket: ${ticketUrl}
${joinText}
Please bring this ticket to the event (printed or on your phone).

A Case for Wisdom — The Source. The Sustainer.`;

  return { subject, html, text };
}
