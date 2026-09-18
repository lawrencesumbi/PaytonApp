import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { friendEmail, friendName, amount, description } = await req.json()

    if (!friendEmail || !amount || !description) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields (friendEmail, amount, description)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call the Resend API
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Payton Financial <onboarding@resend.dev>', // Or your verified domain in Resend
        to: [friendEmail],
        subject: `Payment Reminder: Balance for ${description}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #0b4f34;">Payton Financial Reminder</h2>
            <p>Hi <strong>${friendName}</strong>,</p>
            <p>This is a friendly reminder that you have a remaining balance of <strong>₱${amount}</strong> for the expense labeled: <em>"${description}"</em>.</p>
            <p>Please settle this at your earliest convenience. Thank you very much!</p>
            <br>
            <p style="font-size: 12px; color: #777;">This is an automated email sent from the Payton App.</p>
          </div>
        `,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.message || 'Failed to send email via Resend')
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})