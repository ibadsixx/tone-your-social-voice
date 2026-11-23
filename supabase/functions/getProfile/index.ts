// Tone Gateway Edge Function — getProfile
//
// Verifies the central Auth JWT (from the Authorization header) against the
// central Auth project, then reads the authenticated user's profile from the
// profiles domain project using a service-role client.
//
// Authorized callers only: a valid central Auth JWT is required. The function
// never trusts a user ID supplied in the request body; the user ID is derived
// exclusively from the verified JWT.
//
// Secrets (configured as Supabase Function Secrets, never in source):
//   CENTRAL_AUTH_URL         - URL of the central Auth project
//   CENTRAL_AUTH_ANON_KEY    - Anon key of the central Auth project (for JWT verification)
//   PROFILES_PROJECT_URL     - URL of the profiles domain project
//   PROFILES_SERVICE_ROLE_KEY- Service-role key of the profiles project
//
// Deploy only with explicit approval. Do not place secrets in source.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GetProfileRequest {
  profileId?: string;
}

interface ProfileRow {
  id: string;
  email?: string;
  username?: string;
  display_name?: string;
  profile_pic?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/**
 * Verify the central Auth JWT and return the authenticated user ID.
 * The JWT is verified against the central Auth project's JWKS via
 * supabase.auth.getUser(). The frontend never handles the JWT secret.
 */
async function verifyCentralAuthToken(
  authHeader: string | null
): Promise<{ userId: string; error: string | null }> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { userId: "", error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.slice(7);
  const centralAuthUrl = Deno.env.get("CENTRAL_AUTH_URL");
  const centralAuthAnonKey = Deno.env.get("CENTRAL_AUTH_ANON_KEY");

  if (!centralAuthUrl || !centralAuthAnonKey) {
    return {
      userId: "",
      error: "Central Auth project not configured",
    };
  }

  try {
    const authClient = createClient(centralAuthUrl, centralAuthAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await authClient.auth.getUser(token);

    if (error || !data?.user) {
      return {
        userId: "",
        error: error?.message || "Invalid or expired token",
      };
    }

    return { userId: data.user.id, error: null };
  } catch (err) {
    return {
      userId: "",
      error: err instanceof Error ? err.message : "Token verification failed",
    };
  }
}

/**
 * Read the user's profile from the profiles domain project using a
 * service-role client. Authorization is enforced by matching the verified
 * userId against the profile row's id.
 */
async function readProfile(
  userId: string
): Promise<{ data: ProfileRow | null; error: string | null }> {
  const profilesUrl = Deno.env.get("PROFILES_PROJECT_URL");
  const profilesServiceKey = Deno.env.get("PROFILES_SERVICE_ROLE_KEY");

  if (!profilesUrl || !profilesServiceKey) {
    return {
      data: null,
      error: "Profiles project not configured",
    };
  }

  try {
    const profilesClient = createClient(
      profilesUrl,
      profilesServiceKey,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const { data, error } = await profilesClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return { data: null, error: null }; // No profile found
      }
      return { data: null, error: error.message };
    }

    return { data: data as ProfileRow, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Profile read failed",
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Step 1: Verify the central Auth JWT
    const authHeader = req.headers.get("Authorization");
    const { userId, error: authError } = await verifyCentralAuthToken(
      authHeader
    );

    if (authError || !userId) {
      return new Response(
        JSON.stringify({ error: authError || "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 2: Read the profile from the profiles domain project
    const { data, error } = await readProfile(userId);

    if (error) {
      return new Response(
        JSON.stringify({ error }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ data }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error in getProfile function:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
