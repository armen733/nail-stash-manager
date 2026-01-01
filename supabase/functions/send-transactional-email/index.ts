import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Logo URLs - hosted on the app's public folder
const LOGO_URL_LIGHT_BG = "https://nerabeautyus.com/images/nera-logo-light-bg.png";
const LOGO_URL_DARK_BG = "https://nerabeautyus.com/images/nera-logo-dark-bg.png";

// Brand colors
const BRAND_GOLD = "#CC9F5C";
const DARK_BG = "#0A0A0A";
const DARK_CARD = "#121212";
const DARK_MUTED = "#242424";
const DARK_BORDER = "#262626";
const DARK_TEXT = "#EBEBEB";
const DARK_MUTED_TEXT = "#737373";

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

// Email header with NERA logo for light backgrounds
const emailHeaderLight = `
  <tr>
    <td align="center" style="padding: 40px 40px 24px; text-align: center; background-color: #ffffff;">
      <img src="${LOGO_URL_LIGHT_BG}" alt="NERA Beauty" style="max-width: 160px; height: auto; display: block; margin: 0 auto;" />
    </td>
  </tr>
  <tr>
    <td align="center" style="padding: 0 40px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="height: 1px; background: linear-gradient(90deg, transparent, ${BRAND_GOLD}, transparent);"></td>
        </tr>
      </table>
    </td>
  </tr>
`;

// Email header with NERA logo for dark backgrounds
const emailHeaderDark = `
  <tr>
    <td align="center" style="padding: 40px 40px 24px; text-align: center; background-color: ${DARK_BG};">
      <img src="${LOGO_URL_DARK_BG}" alt="NERA Beauty" style="max-width: 160px; height: auto; display: block; margin: 0 auto;" />
    </td>
  </tr>
  <tr>
    <td align="center" style="padding: 0 40px; background-color: ${DARK_BG};">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="height: 1px; background: linear-gradient(90deg, transparent, ${BRAND_GOLD}, transparent);"></td>
        </tr>
      </table>
    </td>
  </tr>
`;

const emailFooterLight = `
  <tr>
    <td align="center" style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e6e6e6;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 16px;">
        <tr>
          <td align="center">
            <a href="https://nerabeautyus.com" style="color: ${BRAND_GOLD}; text-decoration: none; font-size: 12px; margin: 0 10px;">Shop</a>
            <span style="color: #e6e6e6;">|</span>
            <a href="https://nerabeautyus.com/account" style="color: ${BRAND_GOLD}; text-decoration: none; font-size: 12px; margin: 0 10px;">Account</a>
            <span style="color: #e6e6e6;">|</span>
            <a href="mailto:info@nerabeautyus.com" style="color: ${BRAND_GOLD}; text-decoration: none; font-size: 12px; margin: 0 10px;">Contact</a>
          </td>
        </tr>
      </table>
      <p style="margin: 0 0 8px; font-size: 13px; color: #737373; text-align: center;">Need help? Contact us at <a href="mailto:info@nerabeautyus.com" style="color: ${BRAND_GOLD}; text-decoration: none;">info@nerabeautyus.com</a></p>
      <p style="margin: 0; font-size: 12px; color: #737373; text-align: center;">© 2025 NERA Beauty. Professional nail supplies.</p>
    </td>
  </tr>
`;

const emailFooterDark = `
  <tr>
    <td align="center" style="padding: 32px 40px; background-color: ${DARK_CARD}; border-top: 1px solid ${DARK_BORDER};">
      <!-- Contact Info -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
        <tr>
          <td align="center">
            <p style="margin: 0 0 8px; font-size: 11px; font-weight: 600; color: ${BRAND_GOLD}; letter-spacing: 2px; text-transform: uppercase;">Contact Us</p>
          </td>
        </tr>
        <tr>
          <td align="center">
            <p style="margin: 0 0 4px; font-size: 13px; color: ${DARK_MUTED_TEXT};">📞 +1 (213) 563-1090 &nbsp;|&nbsp; +1 (424) 599-8214</p>
            <p style="margin: 0; font-size: 13px; color: ${DARK_MUTED_TEXT};">📧 info@nerabeautyus.com</p>
          </td>
        </tr>
      </table>
      
      <!-- Social & Links -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 16px;">
        <tr>
          <td align="center">
            <a href="https://nerabeautyus.com" style="color: ${BRAND_GOLD}; text-decoration: none; font-size: 12px; margin: 0 10px;">Shop</a>
            <span style="color: ${DARK_BORDER};">|</span>
            <a href="https://instagram.com/nerabeauty.lab" style="color: ${BRAND_GOLD}; text-decoration: none; font-size: 12px; margin: 0 10px;">@nerabeauty.lab</a>
            <span style="color: ${DARK_BORDER};">|</span>
            <a href="https://nerabeautyus.com/account" style="color: ${BRAND_GOLD}; text-decoration: none; font-size: 12px; margin: 0 10px;">Account</a>
          </td>
        </tr>
      </table>
      
      <p style="margin: 0 0 8px; font-size: 12px; color: ${DARK_MUTED_TEXT}; text-align: center;">Premium Nail Tools & Accessories with free delivery</p>
      <p style="margin: 0; font-size: 11px; color: ${DARK_MUTED_TEXT}; text-align: center;">© 2025 NERA Beauty. All rights reserved.</p>
    </td>
  </tr>
`;

const getOrderConfirmationEmail = (data: EmailRequest) => {
  const itemsHtml = (data.items || []).map(item => `
    <tr>
      <td style="padding: 16px 0; border-bottom: 1px solid ${DARK_BORDER};">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="width: 70px; vertical-align: top;">
              ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 1px solid ${DARK_BORDER};">` : `<div style="width: 60px; height: 60px; background: ${DARK_MUTED}; border-radius: 8px; border: 1px solid ${DARK_BORDER};"></div>`}
            </td>
            <td style="vertical-align: top; padding-left: 16px;">
              <p style="margin: 0 0 6px; font-size: 15px; color: ${DARK_TEXT}; font-weight: 500;">${item.name}</p>
              <p style="margin: 0; font-size: 13px; color: ${DARK_MUTED_TEXT};">Qty: ${item.quantity} × $${item.unit_price.toFixed(2)}</p>
            </td>
            <td style="vertical-align: top; text-align: right;">
              <p style="margin: 0; font-size: 16px; color: ${BRAND_GOLD}; font-weight: 600;">$${item.line_total.toFixed(2)}</p>
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
  <title>Order Confirmation - NERA Beauty</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${DARK_BG}; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${DARK_BG};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%; background-color: ${DARK_CARD}; border-radius: 16px; overflow: hidden; border: 1px solid ${DARK_BORDER};">
          ${emailHeaderDark}
          <!-- Content -->
          <tr>
            <td align="center" style="padding: 32px 40px 40px; background-color: ${DARK_CARD};">
              <!-- Thank You Message -->
              <h1 style="margin: 0 0 8px; font-size: 32px; font-weight: 600; color: ${BRAND_GOLD}; text-align: center; font-family: 'Playfair Display', Georgia, serif;">Thank You!</h1>
              <p style="margin: 0 0 24px; font-size: 18px; color: ${DARK_TEXT}; text-align: center;">Your order has been confirmed</p>
              
              <!-- Order Info -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 28px; background-color: ${DARK_MUTED}; border-radius: 12px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="text-align: center; padding: 0 16px;">
                          <p style="margin: 0 0 4px; font-size: 11px; color: ${DARK_MUTED_TEXT}; text-transform: uppercase; letter-spacing: 1px;">Order ID</p>
                          <p style="margin: 0; font-size: 16px; color: ${BRAND_GOLD}; font-weight: 600;">#${data.orderId || 'N/A'}</p>
                        </td>
                        <td style="width: 1px; background-color: ${DARK_BORDER};"></td>
                        <td style="text-align: center; padding: 0 16px;">
                          <p style="margin: 0 0 4px; font-size: 11px; color: ${DARK_MUTED_TEXT}; text-transform: uppercase; letter-spacing: 1px;">Order Date</p>
                          <p style="margin: 0; font-size: 16px; color: ${DARK_TEXT}; font-weight: 500;">${data.orderDate || new Date().toLocaleDateString()}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 28px; font-size: 16px; line-height: 1.7; color: ${DARK_TEXT}; text-align: center;">
                Thank you for your purchase, ${data.name || 'valued customer'}! We are preparing your items and will notify you when they ship.
              </p>

              <!-- Order Items -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding-bottom: 12px; border-bottom: 1px solid ${DARK_BORDER};">
                    <h3 style="margin: 0; font-size: 12px; font-weight: 600; color: ${BRAND_GOLD}; letter-spacing: 2px; text-transform: uppercase;">Your Order</h3>
                  </td>
                </tr>
                ${itemsHtml}
              </table>

              <!-- Order Summary -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${DARK_MUTED}; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding: 8px 0; color: ${DARK_MUTED_TEXT}; font-size: 14px;">Subtotal</td>
                        <td style="padding: 8px 0; color: ${DARK_TEXT}; font-size: 14px; text-align: right;">$${(data.subtotal || 0).toFixed(2)}</td>
                      </tr>
                      ${data.discount && data.discount > 0 ? `
                      <tr>
                        <td style="padding: 8px 0; color: #22c55e; font-size: 14px;">Discount ${data.discountCode ? '(' + data.discountCode + ')' : ''}</td>
                        <td style="padding: 8px 0; color: #22c55e; font-size: 14px; text-align: right;">-$${data.discount.toFixed(2)}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 8px 0; color: ${DARK_MUTED_TEXT}; font-size: 14px;">Tax</td>
                        <td style="padding: 8px 0; color: ${DARK_TEXT}; font-size: 14px; text-align: right;">$${(data.tax || 0).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 12px 0 0; border-top: 1px solid ${DARK_BORDER};"></td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: ${DARK_TEXT}; font-size: 18px; font-weight: 600;">Total</td>
                        <td style="padding: 8px 0; color: ${BRAND_GOLD}; font-size: 20px; font-weight: 600; text-align: right;">$${(data.total || 0).toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${data.pointsEarned && data.pointsEarned > 0 ? `
              <!-- Points Earned -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center" style="padding: 16px 20px; background-color: ${DARK_MUTED}; border-radius: 12px; border: 1px solid ${BRAND_GOLD}40;">
                    <p style="margin: 0; font-size: 14px; color: ${BRAND_GOLD};">
                      ⭐ You earned <strong>${data.pointsEarned} loyalty points</strong> with this order!
                    </p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- CTA Button - Continue Shopping -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding: 8px 0 0; text-align: center;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                      <tr>
                        <td align="center" style="background-color: ${BRAND_GOLD}; border-radius: 8px;">
                          <a href="https://nerabeautyus.com" style="display: inline-block; padding: 16px 48px; background-color: ${BRAND_GOLD}; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-radius: 8px;">Continue Shopping</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0; font-size: 14px; color: ${DARK_MUTED_TEXT}; text-align: center; line-height: 1.6;">
                Check out more products at <a href="https://nerabeautyus.com" style="color: ${BRAND_GOLD}; text-decoration: none;">nerabeautyus.com</a>
              </p>
            </td>
          </tr>
          ${emailFooterDark}
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
      <td style="padding: 15px 0; border-bottom: 1px solid #e6e6e6;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="width: 80px; vertical-align: top;">
              ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px; border: 1px solid #e6e6e6;">` : `<div style="width: 70px; height: 70px; background: #f0f0f0; border-radius: 8px; border: 1px solid #e6e6e6;"></div>`}
            </td>
            <td style="vertical-align: middle; padding-left: 15px;">
              <p style="margin: 0 0 5px; font-size: 15px; color: #141414;">${item.name}</p>
              <p style="margin: 0; font-size: 13px; color: #737373;">Qty: ${item.quantity}</p>
            </td>
            <td style="vertical-align: middle; text-align: right;">
              <p style="margin: 0; font-size: 16px; color: ${BRAND_GOLD}; font-weight: 600;">$${item.price.toFixed(2)}</p>
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
  <title>You left something behind - NERA Beauty</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e6e6e6;">
          ${emailHeaderLight}
          <!-- Content -->
          <tr>
            <td align="center" style="padding: 32px 40px 40px;">
              <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 600; color: #141414; text-align: center; font-family: 'Playfair Display', Georgia, serif;">You Left Something Behind</h1>
              <p style="margin: 0 0 28px; font-size: 16px; line-height: 1.7; color: #141414; text-align: center;">
                Hi ${data.name || 'there'}! We noticed you left some amazing products in your cart. They're waiting for you!
              </p>

              <!-- Cart Items -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="padding-bottom: 12px; border-bottom: 1px solid #e6e6e6;">
                    <h3 style="margin: 0; font-size: 12px; font-weight: 600; color: ${BRAND_GOLD}; letter-spacing: 2px; text-transform: uppercase;">Your Cart</h3>
                  </td>
                </tr>
                ${cartItemsHtml}
              </table>

              <!-- Cart Total -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 28px;">
                <tr>
                  <td style="padding: 15px 0; border-top: 2px solid #e6e6e6;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="color: #141414; font-size: 16px; font-weight: 600;">Cart Total</td>
                        <td style="color: ${BRAND_GOLD}; font-size: 20px; font-weight: 600; text-align: right;">$${(data.cartTotal || 0).toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding: 0 0 28px; text-align: center;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                      <tr>
                        <td align="center" style="background-color: ${BRAND_GOLD}; border-radius: 8px;">
                          <a href="${data.cartUrl || 'https://nerabeautyus.com/products'}" style="display: inline-block; padding: 16px 48px; background-color: ${BRAND_GOLD}; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-radius: 8px;">Complete Your Order</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Urgency Note -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding: 20px; background-color: #f0f0f0; border-radius: 12px;">
                    <p style="margin: 0; font-size: 14px; color: #141414; line-height: 1.6; text-align: center;">
                      <span style="color: ${BRAND_GOLD}; font-weight: 600;">Don't wait too long!</span><br />
                      <span style="color: #737373;">Items in your cart may sell out. Free shipping on orders over $50.</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${emailFooterLight}
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
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e6e6e6;">
          ${emailHeaderLight}
          <!-- Content -->
          <tr>
            <td align="center" style="padding: 32px 40px 40px;">
              <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 600; color: #141414; text-align: center; font-family: 'Playfair Display', Georgia, serif;">Welcome to the Family!</h1>
              <p style="margin: 0 0 28px; font-size: 16px; line-height: 1.7; color: #141414; text-align: center;">
                Hi ${data.name || 'there'}! Thank you for subscribing to the NERA Beauty newsletter. Get ready for exclusive offers, new product launches, and pro tips delivered straight to your inbox.
              </p>

              ${data.discountCodeWelcome ? `
              <!-- Discount Code -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center" style="padding: 28px; background-color: #f0f0f0; border-radius: 12px;">
                    <p style="margin: 0 0 8px; font-size: 12px; color: #737373; text-transform: uppercase; letter-spacing: 2px;">Your Exclusive Welcome Gift</p>
                    <p style="margin: 0 0 12px; font-size: 28px; color: ${BRAND_GOLD}; font-weight: 600;">20% OFF</p>
                    <p style="margin: 0 0 8px; font-size: 12px; color: #737373;">Use code at checkout:</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                      <tr>
                        <td align="center" style="padding: 12px 30px; background-color: #ffffff; border-radius: 8px; border: 2px dashed ${BRAND_GOLD};">
                          <span style="font-size: 20px; font-weight: 700; color: ${BRAND_GOLD}; letter-spacing: 3px;">${data.discountCodeWelcome}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- What to Expect -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 28px;">
                <tr>
                  <td style="padding-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 12px; font-weight: 600; color: ${BRAND_GOLD}; letter-spacing: 2px; text-transform: uppercase; text-align: center;">What You'll Get</h3>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding: 16px; background-color: #f0f0f0; border-radius: 8px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="width: 40px; vertical-align: top;">
                                <span style="font-size: 20px;">🎁</span>
                              </td>
                              <td>
                                <p style="margin: 0 0 4px; font-size: 14px; color: #141414; font-weight: 600;">Exclusive Offers</p>
                                <p style="margin: 0; font-size: 13px; color: #737373;">Subscriber-only discounts and early access to sales</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr><td style="height: 8px;"></td></tr>
                      <tr>
                        <td style="padding: 16px; background-color: #f0f0f0; border-radius: 8px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="width: 40px; vertical-align: top;">
                                <span style="font-size: 20px;">💎</span>
                              </td>
                              <td>
                                <p style="margin: 0 0 4px; font-size: 14px; color: #141414; font-weight: 600;">New Arrivals</p>
                                <p style="margin: 0; font-size: 13px; color: #737373;">Be first to know about our latest products</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr><td style="height: 8px;"></td></tr>
                      <tr>
                        <td style="padding: 16px; background-color: #f0f0f0; border-radius: 8px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="width: 40px; vertical-align: top;">
                                <span style="font-size: 20px;">💡</span>
                              </td>
                              <td>
                                <p style="margin: 0 0 4px; font-size: 14px; color: #141414; font-weight: 600;">Pro Tips & Tutorials</p>
                                <p style="margin: 0; font-size: 13px; color: #737373;">Expert nail art techniques and trends</p>
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
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="text-align: center;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                      <tr>
                        <td align="center" style="background-color: ${BRAND_GOLD}; border-radius: 8px;">
                          <a href="https://nerabeautyus.com" style="display: inline-block; padding: 16px 48px; background-color: ${BRAND_GOLD}; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-radius: 8px;">Start Shopping</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${emailFooterLight}
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