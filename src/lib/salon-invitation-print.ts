import { NERA_PACKING_LOGO } from "./packingLogo";

export interface SalonInvitationInput {
  salonName?: string | null;
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

export function printSalonInvitation(input: SalonInvitationInput = {}) {
  const {
    salonName,
    companyName = "NÉRA Beauty",
    contactEmail = "info@nerabeautyus.com",
    contactPhone = "",
    website = "NeraBeautyUS.com",
    instagram = "NeraBeautyUS",
  } = input;

  const today = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const greeting = salonName
    ? `Dear ${esc(salonName)},`
    : `Dear Salon Owner,`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Salon Partnership Invitation${salonName ? ` — ${esc(salonName)}` : ""}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;color:#111;padding:10mm 12mm;line-height:1.35;font-size:10px}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #111;padding-bottom:6px;margin-bottom:8px}
  .brand{display:flex;gap:8px;align-items:center}
  .brand img{height:36px;width:auto;object-fit:contain}
  .brand-name{font-size:16px;font-weight:700;letter-spacing:.3px}
  .tagline{font-size:8.5px;color:#666;margin-top:1px}
  .meta{font-size:8.5px;color:#555;text-align:right;line-height:1.35}
  h1{font-size:17px;margin:0 0 4px 0;letter-spacing:.2px;line-height:1.15}
  .greeting{font-size:10.5px;margin-bottom:6px;font-weight:600}
  p{font-size:10px;margin:0 0 5px 0}
  .mission-box{margin:6px 0;padding:8px 10px;background:#faf7f2;border-left:3px solid #111;border-radius:0 5px 5px 0}
  .mission-box p{margin-bottom:3px}
  .mission-box p:last-child{margin-bottom:0}
  .section-title{font-size:11px;font-weight:700;margin:8px 0 4px 0;padding-bottom:2px;border-bottom:1px solid #ddd;text-transform:uppercase;letter-spacing:.8px}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .benefits{margin:4px 0}
  .benefit{display:flex;gap:5px;align-items:flex-start;margin-bottom:3px}
  .benefit-icon{flex:0 0 12px;font-size:9px;line-height:1.4}
  .benefit-text{font-size:9.5px;flex:1;line-height:1.35}
  .benefit-text b{display:block;margin-bottom:1px}
  .cat-vision{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0}
  .categories,.vision{padding:8px 10px;background:#f7f7f5;border-radius:5px}
  .categories ul,.vision ul{margin:0;padding-left:14px;font-size:9.5px}
  .categories li,.vision li{margin-bottom:2px}
  .signature{margin-top:8px;font-size:10px}
  .signature .name{font-weight:700;margin-top:2px}
  .contact-row{margin-top:3px;font-size:9px;color:#444;line-height:1.4}
  footer{margin-top:8px;font-size:8px;color:#777;border-top:1px solid #ddd;padding-top:4px;display:flex;justify-content:space-between;gap:12px}
  @page{size:Letter;margin:0}
  @media print{
    html,body{margin:0!important}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
</style></head>
<body>
  <header>
    <div class="brand">
      <img src="${NERA_PACKING_LOGO}" alt="logo" />
      <div>
        <div class="brand-name">${esc(companyName)}</div>
        <div class="tagline">Premium nail care · Salon Partnership Program</div>
      </div>
    </div>
    <div class="meta">
      <div>${esc(today)}</div>
      ${contactEmail ? `<div>${esc(contactEmail)}</div>` : ""}
      ${contactPhone ? `<div>${esc(contactPhone)}</div>` : ""}
      ${website ? `<div>${esc(website)}</div>` : ""}
    </div>
  </header>

  <h1>Elevate Your Salon With ${esc(companyName)}</h1>
  <div class="greeting">${greeting}</div>

  <p>We would like to personally invite you and your team to join the growing ${esc(companyName)} Salon Partnership Program.</p>

  <div class="mission-box">
    <p><b>Our mission:</b> Set new quality standards in the nail industry and make the highest-quality professional tools available at the most reasonable price possible — nail artists should never have to choose between quality and affordability.</p>
  </div>

  <div class="cols">
    <div>
      <div class="section-title">Why ${esc(companyName)}?</div>
      <div class="benefits">
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Premium professional quality</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Tested by nail professionals</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Consistent performance & reliability</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Fast U.S. shipping</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Dedicated customer support</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Growing line for modern artists</div></div>
      </div>
    </div>
    <div>
      <div class="section-title">Salon Partner Benefits</div>
      <div class="benefits">
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text"><b>20% Bulk Order Discount</b>Exclusive salon pricing on qualifying monthly orders.</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text"><b>Team Discounts</b>Professional pricing for your nail artists.</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text"><b>Priority Access</b>First to receive new launches and partner offers.</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text"><b>Marketing Support</b>Product photos and promotional materials.</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text"><b>Referral Rewards</b>Extra benefits for bringing in fellow salons.</div></div>
      </div>
    </div>
  </div>

  <div class="cat-vision">
    <div class="categories">
      <div class="section-title" style="margin-top:0">Built For Professionals</div>
      <ul>
        <li>Russian Manicure</li>
        <li>Structured & Hard Gel</li>
        <li>Nail Extensions</li>
        <li>Pedicures</li>
        <li>Advanced Nail Art</li>
      </ul>
    </div>
    <div class="vision">
      <div class="section-title" style="margin-top:0">Our Vision</div>
      <ul>
        <li>Raising industry standards</li>
        <li>Delivering exceptional value</li>
        <li>Supporting artists & educators</li>
        <li>Long-term salon partnerships</li>
        <li>Continuously improving quality</li>
      </ul>
    </div>
  </div>

  <div class="mission-box">
    <p><b>We would love the opportunity to work together and support your salon's growth. Let's grow together.</b></p>
  </div>

  <div class="signature">
    Warm regards,
    <div class="name">The ${esc(companyName)} Team</div>
    <div class="contact-row">
      🌐 ${esc(website)} &nbsp;·&nbsp; 📧 ${esc(contactEmail)} &nbsp;·&nbsp; 📸 @${esc(instagram)}
    </div>
  </div>

  <footer>
    <div>${esc(companyName)} · Premium Tools. Professional Results. 💎🖤</div>
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
