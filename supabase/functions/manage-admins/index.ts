import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifyAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return null;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role, id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileErr || !profile || profile.role !== "admin") return null;

  return { supabase, userId: userData.user.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const ctx = await verifyAdmin(req);
    if (!ctx) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabase, userId } = ctx;
    const body = await req.json();
    const action = body.action;

    // ============================================================
    // LIST: return all admin profiles with their emails
    // ============================================================
    if (action === "list") {
      const { data: admins, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, created_at")
        .eq("role", "admin")
        .order("created_at", { ascending: true });

      if (error) {
        return new Response(JSON.stringify({ error: "Kunne ikke hente administratorer" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch emails from auth.users via admin API
      const adminsWithEmail = [];
      for (const admin of admins || []) {
        const { data: user, error: userErr } = await supabase.auth.admin.getUserById(admin.id);
        adminsWithEmail.push({
          ...admin,
          email: user?.user?.email || "",
        });
      }

      return new Response(JSON.stringify({ admins: adminsWithEmail }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // CREATE: create a new admin account
    // ============================================================
    if (action === "create") {
      const { email, password, full_name } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "E-post og passord er påkrevd" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (password.length < 6) {
        return new Response(JSON.stringify({ error: "Passordet må ha minst 6 tegn" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: authData, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || "" },
      });

      if (createErr) {
        const msg = createErr.message.includes("already")
          ? "Denne e-posten er allerede registrert"
          : createErr.message;
        return new Response(JSON.stringify({ error: msg }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // The handle_new_user trigger will create the profile as 'worker'
      // because an admin already exists. We need to update it to 'admin'.
      if (authData.user) {
        await supabase
          .from("profiles")
          .update({ role: "admin", full_name: full_name || "" })
          .eq("id", authData.user.id);
      }

      return new Response(JSON.stringify({
        message: `Admin opprettet: ${email}`,
        user_id: authData.user?.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // UPDATE: change admin password or name
    // ============================================================
    if (action === "update") {
      const { user_id, password, full_name } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "Bruker-ID er påkrevd" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: Record<string, string> = {};
      if (password) {
        if (password.length < 6) {
          return new Response(JSON.stringify({ error: "Passordet må ha minst 6 tegn" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error: pwdErr } = await supabase.auth.admin.updateUserById(user_id, { password });
        if (pwdErr) {
          return new Response(JSON.stringify({ error: "Kunne ikke oppdatere passord" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (full_name !== undefined) {
        const { error: nameErr } = await supabase
          .from("profiles")
          .update({ full_name })
          .eq("id", user_id);
        if (nameErr) {
          return new Response(JSON.stringify({ error: "Kunne ikke oppdatere navn" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ message: "Admin oppdatert" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // DELETE: remove an admin account (safeguard: cannot delete self)
    // ============================================================
    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "Bruker-ID er påkrevd" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Safeguard: cannot delete your own account
      if (user_id === userId) {
        return new Response(JSON.stringify({ error: "Du kan ikke slette din egen konto" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check that at least one admin will remain
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin");

      if ((admins || []).length <= 1) {
        return new Response(JSON.stringify({ error: "Du kan ikke slette den siste administratoren" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: delErr } = await supabase.auth.admin.deleteUser(user_id);
      if (delErr) {
        return new Response(JSON.stringify({ error: "Kunne ikke slette admin" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ message: "Admin slettet" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ukjent handling" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
