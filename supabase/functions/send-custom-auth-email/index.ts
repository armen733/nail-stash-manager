import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  type: "signup" | "password_reset";
  email: string;
  name?: string;
  confirmationUrl?: string;
  resetUrl?: string;
}

async function sendEmail(to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "NERA Beauty <no-reply@nerabeautyus.com>",
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
      <p>Please confirm your email address to get started:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${confirmationUrl}" class="button">Confirm Email</a>
      </p>
      <p style="font-size: 14px; color: #718096;">If you didn't create this account, you can safely ignore this email.</p>
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

  try {
    const { type, email, name, confirmationUrl, resetUrl }: EmailRequest = await req.json();

    console.log(`Sending ${type} email to ${email}`);

    let html: string;
    let subject: string;

    switch (type) {
      case "signup":
        if (!confirmationUrl) {
          throw new Error("confirmationUrl is required for signup emails");
        }
        html = getSignupEmail(name || "there", confirmationUrl);
        subject = "Welcome to NERA Beauty - Confirm Your Email";
        break;

      case "password_reset":
        if (!resetUrl) {
          throw new Error("resetUrl is required for password reset emails");
        }
        html = getPasswordResetEmail(resetUrl);
        subject = "Reset Your NERA Beauty Password";
        break;

      default:
        throw new Error(`Unknown email type: ${type}`);
    }

    const emailResponse = await sendEmail(email, subject, html);
    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending email:", error);
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
