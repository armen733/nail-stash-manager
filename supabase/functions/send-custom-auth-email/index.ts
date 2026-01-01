import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa; margin: 0; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px 30px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 600; }
    .header p { color: rgba(255,255,255,0.8); margin: 10px 0 0; font-size: 14px; }
    .content { padding: 40px 30px; }
    .content h2 { color: #1a1a2e; margin: 0 0 20px; font-size: 22px; }
    .content p { color: #4a5568; line-height: 1.6; margin: 0 0 20px; }
    .button { display: inline-block; background: linear-gradient(135deg, #d4af37 0%, #c9a227 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; }
    .footer { background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #eee; }
    .footer p { color: #718096; font-size: 12px; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>NERA Beauty</h1>
      <p>Professional Nail Supplies</p>
    </div>
    <div class="content">
      <h2>Welcome, ${name}!</h2>
      <p>Thank you for creating an account with NERA Beauty. We're excited to have you join our community of beauty professionals.</p>
      <p>You can now start shopping for premium nail supplies.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${confirmationUrl}" class="button">Start Shopping</a>
      </p>
    </div>
    <div class="footer">
      <p>© 2024 NERA Beauty. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

const getPasswordResetEmail = (resetUrl: string) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa; margin: 0; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px 30px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 600; }
    .header p { color: rgba(255,255,255,0.8); margin: 10px 0 0; font-size: 14px; }
    .content { padding: 40px 30px; }
    .content h2 { color: #1a1a2e; margin: 0 0 20px; font-size: 22px; }
    .content p { color: #4a5568; line-height: 1.6; margin: 0 0 20px; }
    .button { display: inline-block; background: linear-gradient(135deg, #d4af37 0%, #c9a227 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; }
    .footer { background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #eee; }
    .footer p { color: #718096; font-size: 12px; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>NERA Beauty</h1>
      <p>Professional Nail Supplies</p>
    </div>
    <div class="content">
      <h2>Reset Your Password</h2>
      <p>We received a request to reset your password. Click the button below to create a new password:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" class="button">Reset Password</a>
      </p>
      <p style="font-size: 14px; color: #718096;">This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>© 2024 NERA Beauty. All rights reserved.</p>
    </div>
  </div>
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
