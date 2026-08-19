import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { employee_number, pin } = await req.json();

    if (!employee_number || typeof employee_number !== "number") {
      return new Response(JSON.stringify({ error: "Ansattnummer er påkrevd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pin || !/^\d{4}$/.test(pin)) {
      return new Response(JSON.stringify({ error: "PIN må være 4 siffer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate the PIN against pin_hash in the database
    const { data: userId, error: rpcError } = await supabase.rpc(
      "verify_worker_pin",
      { p_employee_number: employee_number, p_pin: pin },
    );

    if (rpcError || !userId) {
      return new Response(JSON.stringify({ error: "Feil ansattnummer eller PIN" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a session for the worker using the service role key.
    // We sign in with the synthetic email and the PIN as password.
    // If the auth password doesn't match (because it was never synced),
    // we update it to match the current pin_hash, then retry.
    const syntheticEmail = `ansatt${employee_number}@aksell.internal`;

    let session = null;
    let sessionError = null;

    // Attempt 1: try signing in with the provided PIN
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password: pin,
    });

    if (signInData.session) {
      session = signInData.session;
    } else {
      sessionError = signInErr;
    }

    // Attempt 2: if sign-in failed, sync the auth password to the PIN
    // (the DB already confirmed the PIN is correct), then retry
    if (!session && sessionError) {
      const { error: pwdErr } = await supabase.auth.admin.updateUserById(
        userId as string,
        { password: pin },
      );

      if (pwdErr) {
        return new Response(JSON.stringify({ error: "Kunne ikke logge inn" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: retryData, error: retryErr } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password: pin,
      });

      if (retryData.session) {
        session = retryData.session;
      } else {
        sessionError = retryErr;
      }
    }

    if (!session) {
      return new Response(JSON.stringify({ error: "Kunne ikke logge inn" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: {
        id: session.user.id,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
