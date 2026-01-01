import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Logo URLs - hosted on the app's public folder
// Light/cream logo for dark backgrounds, dark logo for light backgrounds
const LOGO_FOR_DARK_BG = "https://nera-beauty-dashboard.lovable.app/images/nera-logo-dark-bg.png";
const LOGO_FOR_LIGHT_BG = "https://nera-beauty-dashboard.lovable.app/images/nera-logo-light-bg.png";

interface CartItem {
  name: string;
  quantity: number;
  price: number;
  image_url?: string;
}

interface OrderItem {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  image_url?: string;
}

interface EmailRequest {
  type: "order_confirmation" | "abandoned_cart" | "newsletter_welcome";
  email: string;
  name?: string;
  // Order confirmation fields
  orderId?: string;
  orderDate?: string;
  items?: OrderItem[];
  subtotal?: number;
  discount?: number;
  discountCode?: string;
  tax?: number;
  total?: number;
  pointsEarned?: number;
  shippingAddress?: string;
  // Abandoned cart fields
  cartItems?: CartItem[];
  cartTotal?: number;
  cartUrl?: string;
  // Newsletter fields
  discountCodeWelcome?: string;
}

async function sendEmail(to: string, subject: string, html: string) {
  console.log(`Sending email to ${to}: ${subject}`);
  
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "NERA Beauty <info@nerabeautyus.com>",
      to: [to],
      subject,
      html,
    }),
  });
  
  const responseData = await response.json();
  
  if (!response.ok) {
    console.error("Resend API error:", responseData);
    throw new Error(responseData.message || "Failed to send email");
  }
  
  return responseData;
}

// Email header with actual NERA logo (cream/gold logo for dark background)
const emailHeader = `
  <tr>
    <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #2a2a2a;">
      <img src="${LOGO_FOR_DARK_BG}" alt="NERA Beauty" style="max-width: 180px; height: auto;" />
    </td>
  </tr>
`;

const emailFooter = `
  <tr>
    <td style="padding: 30px 40px; background: #0a0a0a; border-top: 1px solid #2a2a2a; text-align: center;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
        <tr>
          <td align="center">
            <a href="https://nerabeautyus.com" style="color: #d4af37; text-decoration: none; font-size: 12px; margin: 0 10px;">Shop</a>
            <span style="color: #444;">|</span>
            <a href="https://nerabeautyus.com/account" style="color: #d4af37; text-decoration: none; font-size: 12px; margin: 0 10px;">Account</a>
            <span style="color: #444;">|</span>
            <a href="mailto:info@nerabeautyus.com" style="color: #d4af37; text-decoration: none; font-size: 12px; margin: 0 10px;">Contact</a>
          </td>
        </tr>
      </table>
      <p style="margin: 0 0 10px; font-size: 12px; color: #666;">Questions? Contact us at info@nerabeautyus.com</p>
      <p style="margin: 0; font-size: 11px; color: #444;">&copy; 2025 NERA Beauty. All rights reserved.</p>
    </td>
  </tr>
`;

const getOrderConfirmationEmail = (data: EmailRequest) => {
  const itemsHtml = (data.items || []).map(item => `
    <tr>
      <td style="padding: 15px 0; border-bottom: 1px solid #2a2a2a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="width: 60px; vertical-align: top;">
              ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid #2a2a2a;">` : `<div style="width: 50px; height: 50px; background: #1a1a1a; border-radius: 6px; border: 1px solid #2a2a2a;"></div>`}
            </td>
            <td style="vertical-align: top; padding-left: 15px;">
              <p style="margin: 0 0 5px; font-size: 14px; color: #ffffff;">${item.name}</p>
              <p style="margin: 0; font-size: 12px; color: #888;">Qty: ${item.quantity} &times; $${item.unit_price.toFixed(2)}</p>
            </td>
            <td style="vertical-align: top; text-align: right;">
              <p style="margin: 0; font-size: 14px; color: #d4af37; font-weight: 600;">$${item.line_total.toFixed(2)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background: linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%); border-radius: 16px; overflow: hidden; border: 1px solid #2a2a2a;">
          ${emailHeader}
          <!-- Success Icon -->
          <tr>
            <td style="padding: 40px 40px 0; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td style="width: 70px; height: 70px; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 50%; text-align: center; vertical-align: middle;">
                    <span style="font-size: 32px; line-height: 70px;">&#10003;</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 30px 40px;">
              <h2 style="margin: 0 0 10px; font-size: 24px; font-weight: 400; color: #ffffff; text-align: center;">Order Confirmed!</h2>
              <p style="margin: 0 0 5px; font-size: 14px; color: #888; text-align: center;">Order #${data.orderId || 'N/A'}</p>
              <p style="margin: 0 0 30px; font-size: 14px; color: #888; text-align: center;">${data.orderDate || new Date().toLocaleDateString()}</p>
              
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.7; color: #b0b0b0; text-align: center;">
                Thank you for your order, ${data.name || 'valued customer'}! We're preparing your items and will notify you when they ship.
              </p>

              <!-- Order Items -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                <tr>
                  <td style="padding-bottom: 15px; border-bottom: 1px solid #2a2a2a;">
                    <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: #d4af37; letter-spacing: 2px; text-transform: uppercase;">Order Items</h3>
                  </td>
                </tr>
                ${itemsHtml}
              </table>

              <!-- Order Summary -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #0d0d0d; border-radius: 12px; border: 1px solid #2a2a2a; padding: 20px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 8px 0; color: #888; font-size: 14px;">Subtotal</td>
                        <td style="padding: 8px 0; color: #ffffff; font-size: 14px; text-align: right;">$${(data.subtotal || 0).toFixed(2)}</td>
                      </tr>
                      ${data.discount && data.discount > 0 ? `
                      <tr>
                        <td style="padding: 8px 0; color: #22c55e; font-size: 14px;">Discount ${data.discountCode ? `(${data.discountCode})` : ''}</td>
                        <td style="padding: 8px 0; color: #22c55e; font-size: 14px; text-align: right;">-$${data.discount.toFixed(2)}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 8px 0; color: #888; font-size: 14px;">Tax</td>
                        <td style="padding: 8px 0; color: #ffffff; font-size: 14px; text-align: right;">$${(data.tax || 0).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 15px 0 0; border-top: 1px solid #2a2a2a;"></td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #ffffff; font-size: 18px; font-weight: 600;">Total</td>
                        <td style="padding: 8px 0; color: #d4af37; font-size: 18px; font-weight: 600; text-align: right;">$${(data.total || 0).toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${data.pointsEarned && data.pointsEarned > 0 ? `
              <!-- Points Earned -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 20px;">
                <tr>
                  <td style="padding: 15px 20px; background: rgba(212, 175, 55, 0.1); border-radius: 8px; border: 1px solid rgba(212, 175, 55, 0.2); text-align: center;">
                    <p style="margin: 0; font-size: 14px; color: #d4af37;">
                      &#11088; You earned <strong>${data.pointsEarned} loyalty points</strong> with this order!
                    </p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 30px 0;">
                    <a href="https://nerabeautyus.com/account/orders" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); color: #0a0a0a; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-radius: 4px;">View Order</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${emailFooter}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

const getAbandonedCartEmail = (data: EmailRequest) => {
  const cartItemsHtml = (data.cartItems || []).map(item => `
    <tr>
      <td style="padding: 15px 0; border-bottom: 1px solid #2a2a2a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="width: 80px; vertical-align: top;">
              ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px; border: 1px solid #2a2a2a;">` : `<div style="width: 70px; height: 70px; background: #1a1a1a; border-radius: 8px; border: 1px solid #2a2a2a;"></div>`}
            </td>
            <td style="vertical-align: middle; padding-left: 15px;">
              <p style="margin: 0 0 5px; font-size: 15px; color: #ffffff;">${item.name}</p>
              <p style="margin: 0; font-size: 13px; color: #888;">Qty: ${item.quantity}</p>
            </td>
            <td style="vertical-align: middle; text-align: right;">
              <p style="margin: 0; font-size: 16px; color: #d4af37; font-weight: 600;">$${item.price.toFixed(2)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You left something behind</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background: linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%); border-radius: 16px; overflow: hidden; border: 1px solid #2a2a2a;">
          ${emailHeader}
          <!-- Icon -->
          <tr>
            <td style="padding: 40px 40px 0; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td style="width: 70px; height: 70px; background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); border-radius: 50%; text-align: center; vertical-align: middle;">
                    <span style="font-size: 32px; line-height: 70px;">&#128722;</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 30px 40px;">
              <h2 style="margin: 0 0 10px; font-size: 24px; font-weight: 400; color: #ffffff; text-align: center;">You Left Something Behind</h2>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.7; color: #b0b0b0; text-align: center;">
                Hi ${data.name || 'there'}! We noticed you left some amazing products in your cart. They're waiting for you!
              </p>

              <!-- Cart Items -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="padding-bottom: 15px; border-bottom: 1px solid #2a2a2a;">
                    <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: #d4af37; letter-spacing: 2px; text-transform: uppercase;">Your Cart</h3>
                  </td>
                </tr>
                ${cartItemsHtml}
              </table>

              <!-- Cart Total -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                <tr>
                  <td style="padding: 15px 0; border-top: 2px solid #2a2a2a;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="color: #ffffff; font-size: 16px; font-weight: 600;">Cart Total</td>
                        <td style="color: #d4af37; font-size: 20px; font-weight: 600; text-align: right;">$${(data.cartTotal || 0).toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 10px 0 30px;">
                    <a href="${data.cartUrl || 'https://nerabeautyus.com/cart'}" style="display: inline-block; padding: 18px 60px; background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); color: #0a0a0a; text-decoration: none; font-size: 15px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-radius: 4px;">Complete Your Order</a>
                  </td>
                </tr>
              </table>

              <!-- Urgency Note -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 20px; background: rgba(212, 175, 55, 0.1); border-radius: 8px; border: 1px solid rgba(212, 175, 55, 0.2); text-align: center;">
                    <p style="margin: 0; font-size: 13px; color: #999; line-height: 1.6;">
                      &#9200; Don't wait too long! Items in your cart may sell out.<br>
                      <span style="color: #d4af37;">Free shipping on orders over $50</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${emailFooter}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

const getNewsletterWelcomeEmail = (data: EmailRequest) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to NERA Beauty</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background: linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%); border-radius: 16px; overflow: hidden; border: 1px solid #2a2a2a;">
          ${emailHeader}
          <!-- Welcome Banner -->
          <tr>
            <td style="padding: 40px 40px 0; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td style="width: 80px; height: 80px; background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); border-radius: 50%; text-align: center; vertical-align: middle;">
                    <span style="font-size: 36px; line-height: 80px;">&#10024;</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 30px 40px;">
              <h2 style="margin: 0 0 10px; font-size: 26px; font-weight: 400; color: #ffffff; text-align: center;">Welcome to the Family!</h2>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.7; color: #b0b0b0; text-align: center;">
                Hi ${data.name || 'there'}! Thank you for subscribing to the NERA Beauty newsletter. Get ready for exclusive offers, new product launches, and pro tips delivered straight to your inbox.
              </p>

              ${data.discountCodeWelcome ? `
              <!-- Discount Code -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                <tr>
                  <td style="padding: 30px; background: linear-gradient(135deg, rgba(212, 175, 55, 0.15) 0%, rgba(184, 150, 46, 0.1) 100%); border-radius: 12px; border: 1px solid rgba(212, 175, 55, 0.3); text-align: center;">
                    <p style="margin: 0 0 10px; font-size: 14px; color: #b0b0b0; text-transform: uppercase; letter-spacing: 2px;">Your Exclusive Welcome Gift</p>
                    <p style="margin: 0 0 15px; font-size: 28px; color: #d4af37; font-weight: 600;">20% OFF</p>
                    <p style="margin: 0 0 5px; font-size: 12px; color: #888;">Use code at checkout:</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                      <tr>
                        <td style="padding: 12px 30px; background: #0a0a0a; border-radius: 6px; border: 2px dashed #d4af37;">
                          <span style="font-size: 20px; font-weight: 700; color: #d4af37; letter-spacing: 3px;">${data.discountCodeWelcome}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- What to Expect -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                <tr>
                  <td style="padding-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: #d4af37; letter-spacing: 2px; text-transform: uppercase; text-align: center;">What You'll Get</h3>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 15px; background: #0d0d0d; border-radius: 8px; margin-bottom: 10px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width: 40px; vertical-align: top;">
                                <span style="font-size: 20px;">&#127873;</span>
                              </td>
                              <td>
                                <p style="margin: 0 0 5px; font-size: 14px; color: #ffffff; font-weight: 600;">Exclusive Offers</p>
                                <p style="margin: 0; font-size: 13px; color: #888;">Subscriber-only discounts and early access to sales</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr><td style="height: 10px;"></td></tr>
                      <tr>
                        <td style="padding: 15px; background: #0d0d0d; border-radius: 8px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width: 40px; vertical-align: top;">
                                <span style="font-size: 20px;">&#128142;</span>
                              </td>
                              <td>
                                <p style="margin: 0 0 5px; font-size: 14px; color: #ffffff; font-weight: 600;">New Arrivals</p>
                                <p style="margin: 0; font-size: 13px; color: #888;">Be first to know about our latest products</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr><td style="height: 10px;"></td></tr>
                      <tr>
                        <td style="padding: 15px; background: #0d0d0d; border-radius: 8px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width: 40px; vertical-align: top;">
                                <span style="font-size: 20px;">&#128161;</span>
                              </td>
                              <td>
                                <p style="margin: 0 0 5px; font-size: 14px; color: #ffffff; font-weight: 600;">Pro Tips & Tutorials</p>
                                <p style="margin: 0; font-size: 13px; color: #888;">Expert nail art techniques and trends</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 10px 0 20px;">
                    <a href="https://nerabeautyus.com" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); color: #0a0a0a; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-radius: 4px;">Start Shopping</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${emailFooter}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: EmailRequest = await req.json();
    console.log(`Processing ${data.type} email for ${data.email}`);

    let html: string;
    let subject: string;

    switch (data.type) {
      case "order_confirmation":
        subject = `Order Confirmed - #${data.orderId || 'N/A'}`;
        html = getOrderConfirmationEmail(data);
        break;

      case "abandoned_cart":
        subject = "You left something in your cart!";
        html = getAbandonedCartEmail(data);
        break;

      case "newsletter_welcome":
        subject = "Welcome to NERA Beauty! Here's 20% Off";
        html = getNewsletterWelcomeEmail(data);
        break;

      default:
        throw new Error(`Unknown email type: ${data.type}`);
    }

    const emailResponse = await sendEmail(data.email, subject, html);
    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);