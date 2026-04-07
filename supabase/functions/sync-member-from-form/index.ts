import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, message: "Method not allowed" }), { status: 405 });
    }

    const apiKey = req.headers.get("x-api-key");
    const expectedKey = Deno.env.get("FORM_SYNC_API_KEY");

    if (!expectedKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();

    const { data, error } = await supabase.rpc("create_member_from_google_form", {
      p_full_name: body.full_name,
      p_phone: body.phone,
      p_main_park_name: body.main_park,
      p_so_name: body.so_name,
      p_nickname: body.nickname ?? null,
      p_sex: body.sex ?? null,
      p_date_of_birth: body.date_of_birth ?? null,
      p_marital_status: body.marital_status ?? null,
      p_category_of_client: body.category_of_client ?? null,
      p_specific_park: body.specific_park ?? null,
      p_park_destination: body.park_destination ?? null,
      p_default_status: "ACTIVE",
    });

    if (error) {
      return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify(data?.[0] ?? { success: false, message: "No response" }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { status: 500 });
  }
});