import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Log API key status (first 8 chars only for debugging)
console.log("RESEND_API_KEY loaded:", RESEND_API_KEY ? `${RESEND_API_KEY.substring(0, 8)}...` : "NOT SET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  type: "signup" | "request_reset" | "verify_reset";
  email: string;
  name?: string;
  confirmationUrl?: string;
  redirectUrl?: string;
  token?: string;
  newPassword?: string;
}

async function sendEmail(to: string, subject: string, html: string) {
  console.log(`Sending email to: ${to}, subject: ${subject}`);
  console.log(`HTML content length: ${html.length} characters`);
  
  if (!html || html.trim().length === 0) {
    throw new Error("Email HTML content is empty");
  }
  
  const emailPayload = {
    from: "NERA Beauty <info@nerabeautyus.com>",
    to: [to],
    subject,
    html,
  };
  
  console.log("Email payload (without html):", JSON.stringify({ ...emailPayload, html: `[${html.length} chars]` }));
  
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });
  
  const responseData = await response.json();
  console.log("Resend API response:", JSON.stringify(responseData));
  
  if (!response.ok) {
    throw new Error(responseData.message || "Failed to send email");
  }
  
  return responseData;
}

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

const getSignupEmail = (name: string, confirmationUrl: string) => {
  const logoUrl = "https://nerabeautyus.com/images/nera-logo-dark-bg.png";
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to NERA Beauty</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background: linear-gradient(180deg, #141414 0%, #0a0a0a 100%); border-radius: 24px; overflow: hidden; border: 1px solid rgba(42, 179, 140, 0.2);">
          
          <!-- Logo Header -->
          <tr>
            <td style="padding: 48px 40px 32px; text-align: center;">
              <img src="${logoUrl}" alt="NERA Beauty" width="180" height="auto" style="display: block; margin: 0 auto; max-width: 180px;" />
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(42, 179, 140, 0.3), transparent);"></div>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 48px 48px 40px;">
              <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 300; color: #ffffff; text-align: center; letter-spacing: 1px;">Welcome, ${name}!</h1>
              <p style="margin: 0 0 32px; font-size: 16px; line-height: 1.8; color: #9ca3af; text-align: center;">
                Thank you for joining NERA Beauty. You now have access to our exclusive collection of premium nail supplies designed for professionals.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 32px;">
                    <a href="${confirmationUrl}" style="display: inline-block; padding: 18px 56px; background: linear-gradient(135deg, #2ab38c 0%, #1e8a6b 100%); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 24px -4px rgba(42, 179, 140, 0.4);">Start Shopping</a>
                  </td>
                </tr>
              </table>
              
              <!-- Features -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 24px; background: rgba(42, 179, 140, 0.08); border-radius: 16px; border: 1px solid rgba(42, 179, 140, 0.15);">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="33%" style="text-align: center; padding: 8px;">
                          <p style="margin: 0; font-size: 12px; color: #2ab38c; letter-spacing: 1px; font-weight: 500;">PREMIUM QUALITY</p>
                        </td>
                        <td width="33%" style="text-align: center; padding: 8px;">
                          <p style="margin: 0; font-size: 12px; color: #2ab38c; letter-spacing: 1px; font-weight: 500;">FAST SHIPPING</p>
                        </td>
                        <td width="33%" style="text-align: center; padding: 8px;">
                          <p style="margin: 0; font-size: 12px; color: #2ab38c; letter-spacing: 1px; font-weight: 500;">PRO SUPPORT</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px; background: #080808; border-top: 1px solid rgba(42, 179, 140, 0.1);">
              <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; text-align: center;">Need help? Contact us at <a href="mailto:info@nerabeautyus.com" style="color: #2ab38c; text-decoration: none;">info@nerabeautyus.com</a></p>
              <p style="margin: 0; font-size: 12px; color: #4b5563; text-align: center;">© 2025 NERA Beauty. Professional nail supplies.</p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};


const getPasswordResetEmail = (resetUrl: string) => {
  // Using the logo from the deployed app's public folder - for dark background
  const logoUrl = "https://nerabeautyus.com/images/nera-logo-dark-bg.png";
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - NERA Beauty</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background: linear-gradient(180deg, #141414 0%, #0a0a0a 100%); border-radius: 24px; overflow: hidden; border: 1px solid rgba(42, 179, 140, 0.2);">
          
          <!-- Logo Header -->
          <tr>
            <td style="padding: 48px 40px 32px; text-align: center;">
              <img src="${logoUrl}" alt="NERA Beauty" width="180" height="auto" style="display: block; margin: 0 auto; max-width: 180px;" />
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(42, 179, 140, 0.3), transparent);"></div>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 48px 48px 40px;">
              <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 300; color: #ffffff; text-align: center; letter-spacing: 1px;">Reset Your Password</h1>
              <p style="margin: 0 0 32px; font-size: 16px; line-height: 1.8; color: #9ca3af; text-align: center;">
                We received a request to reset your password. Click the button below to create a new secure password for your account.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 32px;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 18px 56px; background: linear-gradient(135deg, #2ab38c 0%, #1e8a6b 100%); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 24px -4px rgba(42, 179, 140, 0.4);">Reset Password</a>
                  </td>
                </tr>
              </table>
              
              <!-- Security Notice -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 24px; background: rgba(42, 179, 140, 0.08); border-radius: 16px; border: 1px solid rgba(42, 179, 140, 0.15);">
                    <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center; line-height: 1.7;">
                      <span style="color: #2ab38c; font-weight: 500;">⏱ Link expires in 1 hour</span><br />
                      If you didn't request this reset, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px; background: #080808; border-top: 1px solid rgba(42, 179, 140, 0.1);">
              <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; text-align: center;">Need help? Contact us at <a href="mailto:info@nerabeautyus.com" style="color: #2ab38c; text-decoration: none;">info@nerabeautyus.com</a></p>
              <p style="margin: 0; font-size: 12px; color: #4b5563; text-align: center;">© 2025 NERA Beauty. Professional nail supplies.</p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const { type, email, name, confirmationUrl, redirectUrl, token, newPassword }: EmailRequest = await req.json();

    console.log(`Processing ${type} request for ${email}`);

    switch (type) {
      case "signup": {
        const html = getSignupEmail(name || "there", confirmationUrl || "https://nerabeautyus.com");
        const emailResponse = await sendEmail(email, "Welcome to NERA Beauty!", html);
        console.log("Welcome email sent:", emailResponse);
        return new Response(JSON.stringify({ success: true, data: emailResponse }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      case "request_reset": {
        // Find user by email
        const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
        if (userError) throw userError;
        
        const user = userData.users.find(u => u.email === email);
        if (!user) {
          // Don't reveal if email exists or not for security
          console.log("User not found, but returning success for security");
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // Generate reset token
        const resetToken = generateToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Invalidate any existing tokens for this email
        await supabase
          .from("password_reset_tokens")
          .update({ used: true })
          .eq("email", email)
          .eq("used", false);

        // Store new token
        const { error: insertError } = await supabase
          .from("password_reset_tokens")
          .insert({
            user_id: user.id,
            email: email,
            token: resetToken,
            expires_at: expiresAt.toISOString(),
          });

        if (insertError) throw insertError;

        // Send reset email
        const resetUrl = `${redirectUrl || "https://nerabeautyus.com"}/reset-password?token=${resetToken}`;
        const html = getPasswordResetEmail(resetUrl);
        await sendEmail(email, "Reset Your NERA Beauty Password", html);

        console.log("Password reset email sent");
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      case "verify_reset": {
        if (!token || !newPassword) {
          throw new Error("Token and new password are required");
        }

        // Find and validate token
        const { data: tokenData, error: tokenError } = await supabase
          .from("password_reset_tokens")
          .select("*")
          .eq("token", token)
          .eq("used", false)
          .single();

        if (tokenError || !tokenData) {
          throw new Error("Invalid or expired reset token");
        }

        if (new Date(tokenData.expires_at) < new Date()) {
          throw new Error("Reset token has expired");
        }

        // Update user password
        const { error: updateError } = await supabase.auth.admin.updateUserById(
          tokenData.user_id,
          { password: newPassword }
        );

        if (updateError) throw updateError;

        // Mark token as used
        await supabase
          .from("password_reset_tokens")
          .update({ used: true })
          .eq("id", tokenData.id);

        console.log("Password reset successful");
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      default:
        throw new Error(`Unknown request type: ${type}`);
    }
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