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
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to send email");
  }
  
  return response.json();
}

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

const getSignupEmail = (name: string, confirmationUrl: string) => `
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
          <!-- Header -->
          <tr>
            <td style="padding: 50px 40px 30px; text-align: center; border-bottom: 1px solid #2a2a2a;">
              <h1 style="margin: 0; font-size: 32px; font-weight: 300; letter-spacing: 8px; color: #d4af37;">NERA</h1>
              <p style="margin: 8px 0 0; font-size: 11px; letter-spacing: 4px; color: #888; text-transform: uppercase;">Beauty</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 50px 40px;">
              <h2 style="margin: 0 0 20px; font-size: 24px; font-weight: 400; color: #ffffff; text-align: center;">Welcome, ${name}!</h2>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.7; color: #b0b0b0; text-align: center;">
                Thank you for joining NERA Beauty. You now have access to our exclusive collection of premium nail supplies designed for professionals.
              </p>
              <!-- Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${confirmationUrl}" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); color: #0a0a0a; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-radius: 4px;">Start Shopping</a>
                  </td>
                </tr>
              </table>
              <!-- Features -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 40px; border-top: 1px solid #2a2a2a; padding-top: 40px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 0 20px; text-align: center;">
                          <p style="margin: 0; font-size: 12px; color: #d4af37; letter-spacing: 2px;">PREMIUM QUALITY</p>
                        </td>
                        <td style="padding: 0 20px; text-align: center;">
                          <p style="margin: 0; font-size: 12px; color: #d4af37; letter-spacing: 2px;">FAST SHIPPING</p>
                        </td>
                        <td style="padding: 0 20px; text-align: center;">
                          <p style="margin: 0; font-size: 12px; color: #d4af37; letter-spacing: 2px;">PRO SUPPORT</p>
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
            <td style="padding: 30px 40px; background: #0a0a0a; border-top: 1px solid #2a2a2a; text-align: center;">
              <p style="margin: 0 0 10px; font-size: 12px; color: #666;">Questions? Contact us at info@nerabeautyus.com</p>
              <p style="margin: 0; font-size: 11px; color: #444;">&copy; 2025 NERA Beauty. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const getPasswordResetEmail = (resetUrl: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background: linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%); border-radius: 16px; overflow: hidden; border: 1px solid #2a2a2a;">
          <!-- Header -->
          <tr>
            <td style="padding: 50px 40px 30px; text-align: center; border-bottom: 1px solid #2a2a2a;">
              <h1 style="margin: 0; font-size: 32px; font-weight: 300; letter-spacing: 8px; color: #d4af37;">NERA</h1>
              <p style="margin: 8px 0 0; font-size: 11px; letter-spacing: 4px; color: #888; text-transform: uppercase;">Beauty</p>
            </td>
          </tr>
          <!-- Icon -->
          <tr>
            <td style="padding: 40px 40px 0; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td style="width: 70px; height: 70px; background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); border-radius: 50%; text-align: center; vertical-align: middle;">
                    <span style="font-size: 28px; line-height: 70px;">&#128274;</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 30px 40px 50px;">
              <h2 style="margin: 0 0 20px; font-size: 24px; font-weight: 400; color: #ffffff; text-align: center;">Reset Your Password</h2>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.7; color: #b0b0b0; text-align: center;">
                We received a request to reset your password. Click the button below to create a new password for your account.
              </p>
              <!-- Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%); color: #0a0a0a; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-radius: 4px;">Reset Password</a>
                  </td>
                </tr>
              </table>
              <!-- Security Note -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 30px;">
                <tr>
                  <td style="padding: 20px; background: rgba(212, 175, 55, 0.1); border-radius: 8px; border: 1px solid rgba(212, 175, 55, 0.2);">
                    <p style="margin: 0; font-size: 13px; color: #999; text-align: center; line-height: 1.6;">
                      This link expires in <strong style="color: #d4af37;">1 hour</strong><br>
                      If you did not request this, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background: #0a0a0a; border-top: 1px solid #2a2a2a; text-align: center;">
              <p style="margin: 0 0 10px; font-size: 12px; color: #666;">Questions? Contact us at info@nerabeautyus.com</p>
              <p style="margin: 0; font-size: 11px; color: #444;">&copy; 2025 NERA Beauty. All rights reserved.</p>
            </td>
          </tr>
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