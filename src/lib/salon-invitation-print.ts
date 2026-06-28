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
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;color:#111;padding:36px;line-height:1.55}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:18px;margin-bottom:28px}
  .brand{display:flex;gap:14px;align-items:center}
  .brand img{height:64px;width:auto;object-fit:contain}
  .brand-name{font-size:24px;font-weight:700;letter-spacing:.5px}
  .tagline{font-size:11px;color:#666;margin-top:2px}
  .meta{font-size:11px;color:#555;text-align:right;line-height:1.5}
  h1{font-size:28px;margin:0 0 12px 0;letter-spacing:.3px;line-height:1.15}
  .greeting{font-size:14px;margin-bottom:16px;font-weight:600}
  p{font-size:13px;margin:0 0 12px 0}
  .mission-box{margin:20px 0;padding:20px;background:#faf7f2;border-left:4px solid #111;border-radius:0 8px 8px 0}
  .mission-box p:last-child{margin-bottom:0}
  .section-title{font-size:16px;font-weight:700;margin:26px 0 12px 0;padding-bottom:6px;border-bottom:1px solid #ddd}
  .benefits{margin:18px 0}
  .benefit{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}
  .benefit-icon{flex:0 0 20px;font-size:14px;line-height:1.4}
  .benefit-text{font-size:13px;flex:1}
  .benefit-text b{display:block;margin-bottom:1px}
  .categories{margin:18px 0;padding:16px;background:#f7f7f5;border-radius:6px}
  .categories ul{margin:0;padding-left:20px;font-size:13px}
  .categories li{margin-bottom:4px}
  .vision-list{margin:12px 0;padding-left:20px;font-size:13px}
  .vision-list li{margin-bottom:6px}
  .signature{margin-top:30px;font-size:13px}
  .signature .name{font-weight:700;margin-top:4px}
  .contact-row{margin-top:8px;font-size:12px;color:#444}
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

  <p>We would like to personally invite you and your team to become a part of the growing ${esc(companyName)} Salon Partnership Program.</p>

  <div class="mission-box">
    <p><b>At ${esc(companyName)}, our mission is simple:</b></p>
    <p>To set new quality standards in the nail industry and make the highest-quality professional tools available at the most reasonable price possible.</p>
    <p>We believe nail artists should never have to choose between quality and affordability. Our goal is to deliver professional-grade tools that perform at the highest level while remaining accessible to working nail technicians and salons.</p>
  </div>

  <div class="section-title">Why ${esc(companyName)}?</div>
  <div class="benefits">
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Premium Professional Quality</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Carefully Selected Products Tested by Nail Professionals</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Consistent Performance & Reliability</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Fast U.S. Shipping</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Dedicated Customer Support</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Growing Product Line Designed for Modern Nail Artists</div></div>
  </div>
  <p>As we continue expanding our collection, our focus remains the same: <b>Exceptional quality, fair pricing, and long-term relationships with professionals.</b></p>

  <div class="section-title">Salon Partner Benefits</div>
  <div class="benefits">
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text"><b>20% Bulk Order Discount</b>Receive exclusive salon pricing on qualifying monthly orders.</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text"><b>Team Discounts</b>Provide your nail artists with access to professional pricing and preferred partner benefits.</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text"><b>Priority Access</b>Be among the first to receive new product launches, limited releases, and exclusive partner offers.</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text"><b>Product Testing Opportunities</b>Selected partner salons may receive early access to upcoming products before public release.</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text"><b>Marketing Support</b>Access professional product photos, promotional materials, and content designed to help your team showcase their work.</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text"><b>Referral Rewards</b>Earn additional benefits by introducing fellow nail professionals and salons to ${esc(companyName)}.</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text"><b>Dedicated Partner Support</b>Receive direct assistance with product recommendations, orders, and partnership opportunities.</div></div>
  </div>

  <div class="section-title">Built For Professionals</div>
  <p>Whether your artists specialize in:</p>
  <div class="categories">
    <ul>
      <li>Russian Manicure</li>
      <li>Structured Gel</li>
      <li>Hard Gel</li>
      <li>Nail Extensions</li>
      <li>Pedicures</li>
      <li>Advanced Nail Art</li>
    </ul>
  </div>
  <p><b>${esc(companyName)} is committed to providing tools that help professionals deliver their best work every day.</b></p>

  <div class="section-title">Our Vision</div>
  <p>We are not building just another beauty supply company.</p>
  <p><b>We are building a professional brand dedicated to:</b></p>
  <ul class="vision-list">
    <li>Raising industry standards</li>
    <li>Delivering exceptional value</li>
    <li>Supporting nail artists and educators</li>
    <li>Creating long-term partnerships with salons</li>
    <li>Continuously improving product quality</li>
  </ul>
  <p>Our ambition is to become one of the most trusted names in professional nail tools while maintaining fair and accessible pricing for the artists who use them every day.</p>

  <div class="mission-box">
    <p><b>We would love the opportunity to work together and support your salon’s growth.</b></p>
    <p>Let’s grow together.</p>
  </div>

  <div class="signature">
    Warm regards,
    <div class="name">The ${esc(companyName)} Team</div>
    <div class="contact-row">
      🌐 ${esc(website)}<br/>
      📧 ${esc(contactEmail)}<br/>
      📸 Instagram: @${esc(instagram)}
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
