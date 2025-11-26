import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PublishRequest {
  title: string;
  content: string;
  subtitle?: string;
  isDraft?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUBSTACK_API_KEY = Deno.env.get("SUBSTACK_API_KEY");
    
    if (!SUBSTACK_API_KEY) {
      console.error("SUBSTACK_API_KEY is not configured");
      return new Response(
        JSON.stringify({ 
          error: "Substack API key not configured. Please add it in project settings." 
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("Authentication error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { title, content, subtitle, isDraft = true }: PublishRequest = await req.json();

    if (!title || !content) {
      return new Response(
        JSON.stringify({ error: "Title and content are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log("Publishing to Substack:", { title, isDraft });

    // Convert HTML content to Substack format
    // Substack supports HTML but we'll clean it up
    const cleanContent = content;

    // Publish to Substack using their API
    // Note: Substack API endpoint varies by publication
    const substackResponse = await fetch("https://api.substack.com/v1/posts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUBSTACK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        subtitle: subtitle || "",
        body_html: cleanContent,
        is_published: !isDraft,
        audience: "everyone",
      }),
    });

    if (!substackResponse.ok) {
      const errorText = await substackResponse.text();
      console.error("Substack API error:", substackResponse.status, errorText);
      
      return new Response(
        JSON.stringify({ 
          error: `Failed to publish to Substack: ${substackResponse.status}`,
          details: errorText
        }),
        {
          status: substackResponse.status,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const result = await substackResponse.json();
    console.log("Successfully published to Substack:", result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: isDraft ? "Draft created on Substack" : "Published to Substack",
        postUrl: result.canonical_url || result.web_url,
        postId: result.id
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in publish-to-substack function:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "An unexpected error occurred",
        stack: error.stack
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
