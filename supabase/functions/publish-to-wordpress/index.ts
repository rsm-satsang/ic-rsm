import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PublishRequest {
  title: string;
  content: string;
  status?: "publish" | "draft" | "pending" | "private";
  excerpt?: string;
  categories?: number[];
  tags?: number[];
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const WORDPRESS_SITE_URL = Deno.env.get("WORDPRESS_SITE_URL");
    const WORDPRESS_USERNAME = Deno.env.get("WORDPRESS_USERNAME");
    const WORDPRESS_APP_PASSWORD = Deno.env.get("WORDPRESS_APP_PASSWORD");

    if (!WORDPRESS_SITE_URL || !WORDPRESS_USERNAME || !WORDPRESS_APP_PASSWORD) {
      console.error("WordPress credentials not configured");
      return new Response(
        JSON.stringify({ 
          error: "WordPress credentials not configured. Please add them in project settings." 
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }


    const { 
      title, 
      content, 
      status = "draft",
      excerpt = "",
      categories = [],
      tags = []
    }: PublishRequest = await req.json();

    if (!title || !content) {
      return new Response(
        JSON.stringify({ error: "Title and content are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log("Publishing to WordPress:", { title, status, site: WORDPRESS_SITE_URL });

    // Normalize site URL to ensure it has a scheme
    let siteUrl = WORDPRESS_SITE_URL.trim();
    if (!/^https?:\/\//i.test(siteUrl)) {
      siteUrl = `https://${siteUrl}`;
    }

    // Create WordPress REST API URL
    const wpApiUrl = `${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`;

    // Create Basic Auth header for WordPress
    const wpAuthHeader = `Basic ${btoa(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`)}`;

    // Publish to WordPress using REST API
    const wpResponse = await fetch(wpApiUrl, {
      method: "POST",
      headers: {
        "Authorization": wpAuthHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: title,
        content: content,
        status: status,
        excerpt: excerpt,
        categories: categories,
        tags: tags,
      }),
    });

    if (!wpResponse.ok) {
      const errorText = await wpResponse.text();
      console.error("WordPress API error:", wpResponse.status, errorText);
      
      let errorMessage = `Failed to publish to WordPress: ${wpResponse.status}`;
      
      // Provide helpful error messages
      if (wpResponse.status === 401) {
        errorMessage = "WordPress authentication failed. Please check your username and application password.";
      } else if (wpResponse.status === 403) {
        errorMessage = "WordPress access forbidden. Please ensure your application password has the correct permissions.";
      } else if (wpResponse.status === 404) {
        errorMessage = "WordPress site not found. Please check your site URL.";
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          details: errorText
        }),
        {
          status: wpResponse.status,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const result = await wpResponse.json();
    console.log("Successfully published to WordPress:", result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: status === "publish" ? "Published to WordPress" : `Created as ${status} on WordPress`,
        postUrl: result.link,
        postId: result.id,
        editUrl: `${WORDPRESS_SITE_URL.replace(/\/$/, '')}/wp-admin/post.php?post=${result.id}&action=edit`
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in publish-to-wordpress function:", error);
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
