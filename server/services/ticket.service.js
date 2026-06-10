// PDF ticket generation.
//
// generateTicketPDF() returns a Buffer holding an A4 portrait ticket with a
// green header, a cream detail block, a QR code encoding the ticket reference,
// and a footer. Uses pdfkit's built-in Helvetica/Courier fonts (no font files
// to ship) and the qrcode package for the scannable code.

import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const GREEN = "#2B3E1E";
const CREAM = "#F5F0EA";
const INK = "#1A1A1A";
const MUTED = "#6B6B6B";

/**
 * @param {{ticketRef:string, name:string, eventTitle:string,
 *          eventDate:string, eventLocation:string, isOnline:boolean,
 *          locationUrl?:string, joinUrl?:string}} data
 * @returns {Promise<Buffer>}
 */
export async function generateTicketPDF({
  ticketRef,
  name,
  eventTitle,
  eventDate,
  eventLocation,
  isOnline,
  locationUrl,
  joinUrl,
}) {
  // QR encodes the ticket reference so it can be scanned at the door.
  const qrDataUrl = await QRCode.toDataURL(String(ticketRef), { margin: 1, width: 300 });
  const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 0 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const W = doc.page.width; // 595.28 for A4
      const pad = 50;

      // ── Header (green) ──────────────────────────────────────────────
      const headerH = 150;
      doc.rect(0, 0, W, headerH).fill(GREEN);
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(22)
        .text("A Case for Wisdom", pad, 52, { width: W - pad * 2 });
      doc.font("Helvetica").fontSize(13).fillColor("#D9D2C5")
        .text("Event Ticket", pad, 86);

      // ── Body (cream) ────────────────────────────────────────────────
      const bodyTop = headerH;
      const bodyH = 360;
      doc.rect(0, bodyTop, W, bodyH).fill(CREAM);

      let y = bodyTop + 36;
      doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(24)
        .text(eventTitle || "Event", pad, y, { width: W - pad * 2 });
      y = doc.y + 14;

      doc.fillColor(INK).font("Helvetica").fontSize(13)
        .text(eventDate || "Date to be announced", pad, y, { width: W - pad * 2 });
      y = doc.y + 4;

      const locText = isOnline
        ? (locationUrl ? `Online — ${locationUrl}` : "Online event")
        : (eventLocation || "Location to be announced");
      doc.fillColor(INK).font("Helvetica").fontSize(13)
        .text(locText, pad, y, { width: W - pad * 2 });
      y = doc.y + 18;

      // Horizontal rule
      doc.moveTo(pad, y).lineTo(W - pad, y)
        .lineWidth(1).strokeColor("#C9C1B2").stroke();
      y += 22;

      doc.fillColor(MUTED).font("Helvetica").fontSize(10)
        .text("ATTENDEE", pad, y);
      y = doc.y + 2;
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(16)
        .text(name || "—", pad, y, { width: W - pad * 2 });
      y = doc.y + 16;

      doc.fillColor(MUTED).font("Helvetica").fontSize(10)
        .text("TICKET REFERENCE", pad, y);
      y = doc.y + 2;
      doc.fillColor(GREEN).font("Courier-Bold").fontSize(22)
        .text(ticketRef || "—", pad, y);

      // ── QR section ──────────────────────────────────────────────────
      const qrSize = 100;
      const qrX = (W - qrSize) / 2;
      const qrY = bodyTop + bodyH + 30;
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
      doc.fillColor(MUTED).font("Helvetica").fontSize(11)
        .text("Scan at entry", 0, qrY + qrSize + 8, { width: W, align: "center" });

      // ── Join link (online events only) ──────────────────────────────
      let belowQrY = qrY + qrSize + 30;
      if (isOnline && joinUrl) {
        doc.fillColor(MUTED).font("Helvetica").fontSize(10)
          .text("JOIN LINK", pad, belowQrY, { width: W - pad * 2, align: "center" });
        belowQrY = doc.y + 4;
        doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(12)
          .text(joinUrl, pad, belowQrY, {
            width: W - pad * 2, align: "center", link: joinUrl, underline: true,
          });
        belowQrY = doc.y + 4;
        doc.fillColor(MUTED).font("Helvetica").fontSize(9)
          .text("Active 30 minutes before event starts", pad, belowQrY,
            { width: W - pad * 2, align: "center" });
        belowQrY = doc.y + 10;
      }

      // ── Footer ──────────────────────────────────────────────────────
      const footY = Math.max(belowQrY + 10, qrY + qrSize + 50);
      doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(13)
        .text("The Source. The Sustainer.", 0, footY, { width: W, align: "center" });
      doc.fillColor(MUTED).font("Helvetica").fontSize(10)
        .text("Please bring this ticket to the event (printed or on your phone).",
          pad, footY + 22, { width: W - pad * 2, align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
