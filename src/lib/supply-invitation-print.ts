import { NERA_PACKING_LOGO } from "./packingLogo";

export interface SupplyInvitationInput {
  partnerName?: string | null;
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

export function printSupplyInvitation(input: SupplyInvitationInput = {}) {
  const {
    partnerName,
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

  const greeting = partnerName
    ? `Dear ${esc(partnerName)},`
    : `Dear Partner,`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Wholesale Partnership Invitation${partnerName ? ` — ${esc(partnerName)}` : ""}</title>
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
  h2{font-size:16px;margin:26px 0 10px 0;padding-bottom:6px;border-bottom:1px solid #ddd;text-transform:uppercase;letter-spacing:1px}
  .greeting{font-size:14px;margin-bottom:16px;font-weight:600}
  p{font-size:13px;margin:0 0 12px 0}
  .intro-box{margin:20px 0;padding:20px;background:#faf7f2;border-left:4px solid #111;border-radius:0 8px 8px 0}
  .benefits{margin:18px 0}
  .benefit{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}
  .benefit-icon{flex:0 0 20px;font-size:14px;line-height:1.4}
  .benefit-text{font-size:13px;flex:1}
  .category-box{margin:18px 0;padding:16px;background:#f7f7f5;border-radius:6px}
  .category-box ul{margin:0 0 12px 0;padding-left:20px;font-size:13px}
  .category-box li{margin-bottom:4px}
  .category-box .coming-soon{margin-top:12px;padding-top:10px;border-top:1px solid #ddd;font-size:12px;color:#444}
  .why-box{margin:18px 0;padding:16px;border:1px solid #ddd;border-radius:6px;background:#fff}
  .why-box ul{margin:0 0 12px 0;padding-left:20px;font-size:13px}
  .why-box li{margin-bottom:6px}
  .benefit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:18px 0}
  .benefit-card{padding:14px;border:1px solid #ddd;border-radius:6px;background:#fff}
  .benefit-card b{display:block;font-size:12px;margin-bottom:4px}
  .benefit-card span{font-size:11.5px;color:#444}
  .mission-box{margin:20px 0;padding:20px;background:#111;color:#fff;border-radius:8px}
  .mission-box p{color:#fff;margin-bottom:8px}
  .mission-box p:last-child{margin-bottom:0}
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
        <div class="tagline">Premium nail care · Wholesale Partnership</div>
      </div>
    </div>
    <div class="meta">
      <div>${esc(today)}</div>
      ${contactEmail ? `<div>${esc(contactEmail)}</div>` : ""}
      ${contactPhone ? `<div>${esc(contactPhone)}</div>` : ""}
      ${website ? `<div>${esc(website)}</div>` : ""}
    </div>
  </header>

  <h1>Wholesale Partnership Opportunity</h1>

  <div class="greeting">${greeting}</div>

  <div class="intro-box">
    <p><b>Introducing ${esc(companyName)}</b></p>
    <p>We would like to introduce ${esc(companyName)}, a growing professional nail tools brand based in the United States.</p>
    <p>Our mission is to raise quality standards in the nail industry by delivering professional-grade products at accessible prices.</p>
    <p>We are currently expanding our wholesale partner network and would love to explore a potential partnership with your store.</p>
  </div>

  <h2>Why ${esc(companyName)}?</h2>
  <div class="benefits">
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Premium quality professional nail tools</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Competitive wholesale pricing</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Strong retail margins</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Fast U.S. fulfillment</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Professional branding and packaging</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Products designed specifically for working nail technicians</div></div>
    <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Growing product catalog</div></div>
  </div>

  <h2>Product Categories</h2>
  <div class="category-box">
    <p><b>Our current collection includes:</b></p>
    <ul>
      <li>Professional Nail Drill Bits</li>
      <li>Diamond Bits</li>
      <li>Carbide Bits</li>
      <li>Sanding Bands</li>
      <li>Pedicure Discs</li>
      <li>Nail Brushes</li>
      <li>Professional Accessories</li>
    </ul>
    <div class="coming-soon">
      <b>Coming Soon:</b> Premium Nippers, Scissors, Pushers, and additional professional tools.
    </div>
  </div>

  <h2>Why Stores Choose ${esc(companyName)}</h2>
  <div class="why-box">
    <p>Many professional nail technicians are actively seeking alternatives to overpriced brands without sacrificing quality.</p>
    <p><b>${esc(companyName)} focuses on providing:</b></p>
    <ul>
      <li>Reliable quality</li>
      <li>Professional performance</li>
      <li>Attractive retail pricing</li>
      <li>Consistent inventory availability</li>
      <li>Products technicians reorder regularly</li>
    </ul>
    <p><b>Our goal is simple:</b> Deliver premium-quality tools that artists trust and stores can confidently recommend.</p>
  </div>

  <h2>Wholesale Benefits</h2>
  <div class="benefit-grid">
    <div class="benefit-card"><b>Competitive Wholesale Pricing</b><span>Designed to provide healthy margins while remaining attractive to professional buyers.</span></div>
    <div class="benefit-card"><b>Low Minimum Orders</b><span>Flexible purchasing options for both smaller and larger stores.</span></div>
    <div class="benefit-card"><b>Marketing Support</b><span>Professional product photos and promotional materials available.</span></div>
    <div class="benefit-card"><b>New Product Access</b><span>Wholesale partners receive early access to upcoming launches.</span></div>
    <div class="benefit-card"><b>Dedicated Support</b><span>Direct communication with our team for orders, questions, and product recommendations.</span></div>
  </div>

  <div class="mission-box">
    <p><b>Let’s Grow Together</b></p>
    <p>We are looking for long-term wholesale partners who value quality, reliability, and customer satisfaction.</p>
    <p>We would be happy to provide samples and discuss wholesale pricing with your team.</p>
  </div>

  <p>Thank you for your time and consideration.</p>

  <div class="signature">
    Warm regards,
    <div class="name">${esc(companyName)}</div>
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
