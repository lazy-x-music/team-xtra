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

    // Check if employee number already exists
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("employee_number", employee_number)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Ansattnummeret er allerede i bruk" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use setup_code or default "0000"
    const tempCode = setup_code || "0000";

    // Create a Supabase auth user. We use a synthetic email based on the
    // employee number so Supabase auth can manage sessions. The email is
    // never shown to users and contains no personal information.
    const syntheticEmail = `ansatt${employee_number}@aksell.internal`;

    const { data: authData, error: createErr } = await supabase.auth.admin.createUser({
      email: syntheticEmail,
      password: tempCode,
      email_confirm: true,
      user_metadata: {
        employee_number: String(employee_number),
        setup_complete: false,
      },
    });

    if (createErr || !authData.user) {
      return new Response(JSON.stringify({ error: createErr?.message || "Kunne ikke opprette ansatt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      employee_number,
      user_id: authData.user.id,
      message: `Ansatt #${employee_number} opprettet. Midlertidig kode: ${tempCode}`,
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
