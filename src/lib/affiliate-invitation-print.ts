import { NERA_PACKING_LOGO } from "./packingLogo";

export interface AffiliateInvitationInput {
  referrerName?: string | null;
  referralCode?: string | null;
  commissionRate?: number | null;
  companyName?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  instagram?: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );

export function printAffiliateInvitation(input: AffiliateInvitationInput = {}) {
  const {
    referrerName,
    referralCode,
    commissionRate = 10,
    companyName = "NÉRA Beauty",
    contactEmail = "info@nerabeautyus.com",
    contactPhone = "",
    website = "nerabeautyus.com",
    instagram = "nerabeautyus",
  } = input;

  const today = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const greeting = referrerName
    ? `Dear ${esc(referrerName)},`
    : `Dear Future Partner,`;

  const codeBlock = referralCode
    ? `<div class="code-card">
         <div class="code-label">Your Personal Referral Code</div>
         <div class="code-value">${esc(referralCode)}</div>
         <div class="code-rate">${commissionRate}% commission on every order</div>
       </div>`
    : `<div class="code-card placeholder">
         <div class="code-label">Your Personal Referral Code</div>
         <div class="code-value">— TO BE ASSIGNED —</div>
         <div class="code-rate">${commissionRate}% commission on every order</div>
       </div>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Affiliate Invitation${referrerName ? ` — ${esc(referrerName)}` : ""}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;color:#111;padding:36px;line-height:1.55}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:18px;margin-bottom:28px}
  .brand{display:flex;gap:14px;align-items:center}
  .brand img{height:64px;width:auto;object-fit:contain}
  .brand-name{font-size:24px;font-weight:700;letter-spacing:.5px}
  .tagline{font-size:11px;color:#666;margin-top:2px}
  .meta{font-size:11px;color:#555;text-align:right;line-height:1.5}
  h1{font-size:26px;margin:0 0 6px 0;letter-spacing:.3px}
  .subtitle{color:#666;font-size:13px;margin-bottom:24px}
  .greeting{font-size:14px;margin-bottom:16px;font-weight:600}
  p{font-size:13px;margin:0 0 12px 0}
  .code-card{margin:26px 0;padding:22px;border:2px solid #111;border-radius:8px;text-align:center;background:#faf7f2}
  .code-card.placeholder{background:#fff;border-style:dashed}
  .code-label{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#666;margin-bottom:6px}
  .code-value{font-size:32px;font-weight:800;font-family:'Courier New',monospace;letter-spacing:3px;margin-bottom:6px}
  .code-rate{font-size:12px;color:#111;font-weight:600}
  .benefits{margin:22px 0;padding:18px;background:#f7f7f5;border-radius:6px}
  .benefits h3{margin:0 0 10px 0;font-size:14px}
  .benefits ul{margin:0;padding-left:20px;font-size:12.5px}
  .benefits li{margin-bottom:6px}
  .how{margin:22px 0}
  .how h3{margin:0 0 10px 0;font-size:14px}
  .step{display:flex;gap:12px;margin-bottom:10px;align-items:flex-start}
  .step-num{flex:0 0 28px;height:28px;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px}
  .step-text{font-size:12.5px;flex:1}
  .signature{margin-top:30px;font-size:13px}
  .signature .name{font-weight:700;margin-top:4px}
  footer{margin-top:36px;font-size:10px;color:#777;border-top:1px solid #ddd;padding-top:10px;display:flex;justify-content:space-between;gap:16px}
  @page{size:auto;margin:0mm}
  @media print{
    html,body{margin:0!important}
    body{padding:14mm 12mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
</style></head>
<body>
  <header>
    <div class="brand">
      <img src="${NERA_PACKING_LOGO}" alt="logo" />
      <div>
        <div class="brand-name">${esc(companyName)}</div>
        <div class="tagline">Premium nail care · Affiliate Program</div>
      </div>
    </div>
    <div class="meta">
      <div>${esc(today)}</div>
      ${contactEmail ? `<div>${esc(contactEmail)}</div>` : ""}
      ${contactPhone ? `<div>${esc(contactPhone)}</div>` : ""}
      ${website ? `<div>${esc(website)}</div>` : ""}
      ${instagram ? `<div>@${esc(instagram)}</div>` : ""}
    </div>
  </header>

  <h1>You're Invited to Join Our Affiliate Program</h1>
  <div class="subtitle">Earn commission by sharing the products you love.</div>

  <div class="greeting">${greeting}</div>

  <p>We'd love to partner with you. As a ${esc(companyName)} affiliate, you'll earn a real commission every time someone shops with your personal code — no caps, no expiration.</p>

  ${codeBlock}

  <div class="benefits">
    <h3>What you get</h3>
    <ul>
      <li><b>${commissionRate}% commission</b> on every qualifying order placed with your code</li>
      <li><b>Lifetime tracking</b> — your customers stay linked to you forever</li>
      <li><b>Monthly payouts</b> via your preferred method (Zelle, Venmo, CashApp, bank)</li>
      <li><b>Free marketing assets</b> — product photos, captions, and promo material</li>
      <li><b>Early access</b> to new launches and exclusive partner-only promos</li>
    </ul>
  </div>

  <div class="how">
    <h3>How it works</h3>
    <div class="step"><div class="step-num">1</div><div class="step-text">Share your unique code with friends, clients, and on social media.</div></div>
    <div class="step"><div class="step-num">2</div><div class="step-text">They enter it at checkout — and often unlock a small discount themselves.</div></div>
    <div class="step"><div class="step-num">3</div><div class="step-text">We track every order automatically and credit your account.</div></div>
    <div class="step"><div class="step-num">4</div><div class="step-text">Get paid monthly. Simple, transparent, no minimums.</div></div>
  </div>

  <p>If you'd like to join, just reply to this invitation${contactEmail ? ` at <b>${esc(contactEmail)}</b>` : ""} and we'll activate your account right away.</p>

  <div class="signature">
    Warm regards,
    <div class="name">The ${esc(companyName)} Team</div>
  </div>

  <footer>
    <div>${esc(companyName)} · Affiliate Partnership Invitation</div>
    <div>${esc(website)}</div>
  </footer>

  <script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),300)});</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
