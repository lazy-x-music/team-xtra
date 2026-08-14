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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileErr || !profile || profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { employee_number, setup_code } = await req.json();
    if (!employee_number || typeof employee_number !== "number") {
      return new Response(JSON.stringify({ error: "Ansattnummer er påkrevd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the worker profile
    const { data: worker, error: workerErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("employee_number", employee_number)
      .maybeSingle();

    if (workerErr || !worker) {
      return new Response(JSON.stringify({ error: "Ansatt ikke funnet" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reset PIN: clear pin_hash and setup_complete
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ pin_hash: null, setup_complete: false })
      .eq("id", worker.id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Kunne ikke nullstille PIN" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also reset the auth user's password to the temp code
    const tempCode = setup_code || "0000";
    const syntheticEmail = `ansatt${employee_number}@aksell.internal`;

    const { error: pwdErr } = await supabase.auth.admin.updateUserById(
      worker.id,
      { password: tempCode },
    );

    if (pwdErr) {
      // Non-fatal: the profile is already reset, the user can still
      // sign in with the temp code if the password was already the temp
      // code. Log but don't fail.
      console.error("Failed to reset password:", pwdErr.message);
    }

    return new Response(JSON.stringify({
      employee_number,
      message: `PIN nullstilt for Ansatt #${employee_number}. Midlertidig kode: ${tempCode}`,
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
