import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAILJS_SERVICE_ID = Deno.env.get("EMAILJS_SERVICE_ID");
const EMAILJS_TEMPLATE_ID = Deno.env.get("EMAILJS_TEMPLATE_ID");
const EMAILJS_PUBLIC_KEY = Deno.env.get("EMAILJS_PUBLIC_KEY");

serve(async (_req) => {
  try {
    // 1. Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 2. Get current date (YYYY-MM-DD)
    const today = new Date().toISOString().split("T")[0];

    // 3. Find pending reminders due today
    const { data: reminders, error: remError } = await supabaseAdmin
      .from("reminders")
      .select("id, title, amount, due_date, user_id")
      .eq("status", "pending")
      .eq("due_date", today);

    if (remError) throw remError;

    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ message: "No reminders due for today." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. Process each reminder
    for (const reminder of reminders) {
      // Get user email from Supabase Auth
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
        reminder.user_id
      );

      if (userError || !userData?.user?.email) continue;
      const userEmail = userData.user.email;

      // 5. Send email using EmailJS REST API (Updated parameter names to match EmailJS template)
      const emailData = {
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          email: userEmail,          // Gihimo gikan sa to_email aron mo-match sa {{email}}
          name: "User",              // Gidugang para mo-match sa {{name}} sa template
          title: reminder.title,     // Gihimo gikan sa reminder_title aron mo-match sa {{title}}
          amount: reminder.amount.toFixed(2),
          due_date: reminder.due_date,
        },
      };

      const emailResponse = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailData),
      });

      const responseText = await emailResponse.text();
      console.log(`EmailJS response for ${userEmail}:`, responseText);

      if (!emailResponse.ok) {
        console.error(`Failed to send email to ${userEmail}:`, responseText);
      }
    }

    return new Response(JSON.stringify({ success: true, count: reminders.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});