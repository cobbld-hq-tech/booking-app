// HTML email in the cobbld "Workwear" style. Written for real email clients:
// table-based layout, all styles inline, web fonts with system fallbacks (Gmail /
// Outlook ignore the @import and degrade gracefully). Self-contained — no external
// CSS, no SVG (clients strip it). All interpolated values are HTML-escaped.

import { SHOP } from "./business-hours";

export interface EmailRow {
  label: string;
  value: string;
  mono?: boolean;
}

export interface BookingEmailOpts {
  preheader: string;
  heading: string;
  intro: string;
  rows: EmailRow[];
  note: string;
}

const C = {
  bone: "#f2efe9",
  ink: "#11100d",
  inkSoft: "#2a2823",
  tang: "#ff5b1e",
  line: "rgba(17,16,13,0.12)",
  onInkMuted: "rgba(242,239,233,0.72)",
  labelMuted: "#6b6760",
};

const FONT_DISPLAY = "'Unbounded','Arial Black',Arial,sans-serif";
const FONT_BODY = "'Onest',-apple-system,Helvetica,Arial,sans-serif";
const FONT_MONO = "'DM Mono',ui-monospace,'Courier New',monospace";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderBookingEmail(o: BookingEmailOpts): string {
  const rows = o.rows
    .map(
      (r) => `
              <tr>
                <td style="padding:13px 0;border-bottom:1px solid ${C.line};font-family:${FONT_MONO};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${C.labelMuted};vertical-align:top;">${esc(r.label)}</td>
                <td style="padding:13px 0 13px 16px;border-bottom:1px solid ${C.line};font-family:${r.mono ? FONT_MONO : FONT_BODY};font-size:15px;font-weight:600;color:${C.ink};text-align:right;">${esc(r.value)}</td>
              </tr>`,
    )
    .join("");

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<title>${esc(o.heading)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Onest:wght@400;600&family=DM+Mono:wght@400;500&display=swap');
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${C.tang}; }
  @media (max-width:600px) {
    .card { width:100% !important; }
    .pad { padding-left:22px !important; padding-right:22px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bone};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bone};">${esc(o.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bone};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="card" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:${C.bone};border:2px solid ${C.ink};border-radius:16px;overflow:hidden;">
          <tr>
            <td class="pad" style="background:${C.ink};padding:30px 34px 26px;">
              <p style="margin:0 0 12px;font-family:${FONT_MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.tang};">${esc(SHOP.name)}</p>
              <h1 style="margin:0;font-family:${FONT_DISPLAY};font-weight:800;font-size:32px;line-height:1.04;letter-spacing:-0.6px;color:${C.bone};">${esc(o.heading)}</h1>
              <p style="margin:12px 0 0;font-family:${FONT_BODY};font-size:15px;line-height:1.5;color:${C.onInkMuted};">${esc(o.intro)}</p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:22px 34px 6px;background:${C.bone};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
              </table>
            </td>
          </tr>
          <tr>
            <td class="pad" style="padding:18px 34px 28px;background:${C.bone};">
              <p style="margin:0;font-family:${FONT_BODY};font-size:14px;line-height:1.5;color:${C.inkSoft};">${esc(o.note)}</p>
            </td>
          </tr>
          <tr>
            <td class="pad" style="background:${C.ink};padding:18px 34px;">
              <a href="https://cobbld.com" style="font-family:${FONT_MONO};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${C.onInkMuted};text-decoration:none;">
                <span style="display:inline-block;width:8px;height:8px;background:${C.tang};border-radius:2px;margin-right:7px;"></span>built by cobbld
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
