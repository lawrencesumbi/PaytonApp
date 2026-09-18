import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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

      // 5. Send email using Resend API
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Payton Financial <onboarding@resend.dev>",
          to: [userEmail],
          subject: `Reminder: Due Date for ${reminder.title} Today`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #1F4F59; padding: 20px;">
              <h2>Bill Payment Reminder 💳</h2>
              <p>Hello!</p>
              <p>This is a friendly reminder that your bill for <strong>${reminder.title}</strong> amounting to <strong>₱${reminder.amount.toFixed(2)}</strong> is due today (${reminder.due_date}).</p>
              <p>Please open your Payton app to mark it as paid.</p>
              <br/>
              <p>Best regards,</p>
              <p><strong>Payton Team</strong></p>
            </div>
          `,
        }),
      });
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