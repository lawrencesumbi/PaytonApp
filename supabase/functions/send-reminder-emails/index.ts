import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

serve(async (_req) => {
  try {
    // 1. I-initialize ang Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 2. Kuhaa ang petsa karon (YYYY-MM-DD)
    const today = new Date().toISOString().split("T")[0];

    // 3. Pangitaa ang mga 'pending' reminders nga due karon na
    const { data: reminders, error: remError } = await supabaseAdmin
      .from("reminders")
      .select("id, title, amount, due_date, user_id")
      .eq("status", "pending")
      .eq("due_date", today);

    if (remError) throw remError;

    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ message: "Walay reminders para karong adlawa." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. I-process ang matag reminder
    for (const reminder of reminders) {
      // Kuhaa ang email sa user gikan sa Supabase Auth
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
        reminder.user_id
      );

      if (userError || !userData?.user?.email) continue;
      const userEmail = userData.user.email;

      // 5. I-send ang email gamit ang Resend API
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Payton Financial <onboarding@resend.dev>",
          to: [userEmail],
          subject: `Pahinumdom: Hapit na ang Due Date sa ${reminder.title}`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #1F4F59; padding: 20px;">
              <h2>Pahinumdom sa Imong Bayronon 💳</h2>
              <p>Kumusta!</p>
              <p>Gusto namong pahinumdoman ka nga ang imong bayronon nga <strong>${reminder.title}</strong> nga nagkantidad og <strong>₱${reminder.amount.toFixed(2)}</strong> kay due karong adlawa (${reminder.due_date}).</p>
              <p>Palihug ablihi ang imong Payton app aron ma-mark as paid kini.</p>
              <br/>
              <p>Salamat,</p>
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