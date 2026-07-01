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
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;color:#111;padding:10mm 12mm;line-height:1.35;font-size:10px}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #111;padding-bottom:6px;margin-bottom:8px}
  .brand{display:flex;gap:8px;align-items:center}
  .brand img{height:36px;width:auto;object-fit:contain}
  .brand-name{font-size:16px;font-weight:700;letter-spacing:.3px}
  .tagline{font-size:8.5px;color:#666;margin-top:1px}
  .meta{font-size:8.5px;color:#555;text-align:right;line-height:1.35}
  h1{font-size:17px;margin:0 0 4px 0;letter-spacing:.2px;line-height:1.15}
  h2{font-size:11px;margin:8px 0 4px 0;padding-bottom:2px;border-bottom:1px solid #ddd;text-transform:uppercase;letter-spacing:.8px}
  .greeting{font-size:10.5px;margin-bottom:6px;font-weight:600}
  p{font-size:10px;margin:0 0 5px 0}
  .intro-box{margin:6px 0;padding:8px 10px;background:#faf7f2;border-left:3px solid #111;border-radius:0 5px 5px 0}
  .intro-box p{margin-bottom:3px}
  .intro-box p:last-child{margin-bottom:0}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .benefits{margin:4px 0}
  .benefit{display:flex;gap:5px;align-items:flex-start;margin-bottom:3px}
  .benefit-icon{flex:0 0 12px;font-size:9px;line-height:1.4}
  .benefit-text{font-size:9.5px;flex:1;line-height:1.35}
  .category-box{padding:8px 10px;background:#f7f7f5;border-radius:5px;margin:4px 0}
  .category-box ul{margin:0;padding-left:14px;font-size:9.5px}
  .category-box li{margin-bottom:2px}
  .category-box .coming-soon{margin-top:5px;padding-top:4px;border-top:1px solid #ddd;font-size:9px;color:#444}
  .benefit-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:6px 0}
  .benefit-card{padding:6px 8px;border:1px solid #ddd;border-radius:4px;background:#fff}
  .benefit-card b{display:block;font-size:9.5px;margin-bottom:2px}
  .benefit-card span{font-size:9px;color:#444;line-height:1.35}
  .mission-box{margin:6px 0;padding:8px 10px;background:#111;color:#fff;border-radius:5px}
  .mission-box p{color:#fff;margin-bottom:3px;font-size:10px}
  .mission-box p:last-child{margin-bottom:0}
  .signature{margin-top:6px;font-size:10px}
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
    <p><b>Introducing ${esc(companyName)}</b> — a growing professional nail tools brand based in the United States. Our mission is to raise quality standards in the nail industry by delivering professional-grade products at accessible prices. We are expanding our wholesale partner network and would love to explore a partnership with your store.</p>
  </div>

  <div class="cols">
    <div>
      <h2 style="margin-top:0">Why ${esc(companyName)}?</h2>
      <div class="benefits">
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Premium quality professional nail tools</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Competitive wholesale pricing</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Strong retail margins</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Fast U.S. fulfillment</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Professional branding & packaging</div></div>
        <div class="benefit"><div class="benefit-icon">💎</div><div class="benefit-text">Designed for working technicians</div></div>
      </div>
    </div>
    <div>
      <h2 style="margin-top:0">Product Categories</h2>
      <div class="category-box">
        <ul>
          <li>Professional Nail Drill Bits</li>
          <li>Diamond & Carbide Bits</li>
          <li>Sanding Bands</li>
          <li>Pedicure Discs</li>
          <li>Nail Brushes & Accessories</li>
        </ul>
        <div class="coming-soon"><b>Coming Soon:</b> Nippers, Scissors, Pushers & more.</div>
      </div>
    </div>
  </div>

  <h2>Wholesale Benefits</h2>
  <div class="benefit-grid">
    <div class="benefit-card"><b>Competitive Pricing</b><span>Healthy margins, attractive to pros.</span></div>
    <div class="benefit-card"><b>Low Minimums</b><span>Flexible options for stores of any size.</span></div>
    <div class="benefit-card"><b>Marketing Support</b><span>Product photos & promo materials.</span></div>
    <div class="benefit-card"><b>Early Access</b><span>Wholesale partners see new launches first.</span></div>
    <div class="benefit-card"><b>Dedicated Support</b><span>Direct line to our team.</span></div>
    <div class="benefit-card"><b>Reliable Reorders</b><span>Products technicians come back for.</span></div>
  </div>

  <div class="mission-box">
    <p><b>Let's Grow Together.</b> We're looking for long-term partners who value quality, reliability, and customer satisfaction. Happy to provide samples and discuss wholesale pricing with your team.</p>
  </div>

  <div class="signature">
    Warm regards,
    <div class="name">${esc(companyName)}</div>
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
