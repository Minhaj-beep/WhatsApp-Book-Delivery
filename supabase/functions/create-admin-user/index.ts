import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { email = "admin@example.com", password = "admin123", full_name = "Admin User" } = await req.json().catch(() => ({}));

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
      },
    });

    if (authError) {
      if (authError.message.includes("already registered") || authError.message.includes("already been registered")) {
        const { data: users } = await supabase.auth.admin.listUsers();
        const existingUser = users?.users.find((u) => u.email === email);

        if (existingUser) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", existingUser.id)
            .maybeSingle();

          if (!profile) {
            await supabase.from("profiles").insert({
              id: existingUser.id,
              full_name,
              role: "admin",
              phone: "919999999999",
            });
          } else if (profile.role !== "admin") {
            await supabase
              .from("profiles")
              .update({ role: "admin" })
              .eq("id", existingUser.id);
          }

          return new Response(
            JSON.stringify({
              success: true,
              message: "User already exists and profile updated",
              user_id: existingUser.id,
              email,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }
      throw authError;
    }

    await supabase.from("profiles").insert({
      id: authData.user.id,
      full_name,
      role: "admin",
      phone: "919999999999",
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Admin user created successfully",
        user_id: authData.user.id,
        email,
        password,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error creating admin user:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
