import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { project_id, url } = await req.json();

    // Verify access
    const { data: hasAccess } = await supabase.rpc('has_project_access', {
      _project_id: project_id,
      _user_id: user.id,
    });

    if (!hasAccess) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fileName = new URL(url).hostname;

    // Create reference_file record
    const { data: refFile, error: refError } = await supabase
      .from('reference_files')
      .insert({
        project_id,
        uploaded_by: user.id,
        storage_path: url,
        file_name: fileName,
        file_type: 'url',
        status: 'queued',
        metadata: { url },
      })
      .select()
      .single();

    if (refError) throw refError;

    // Create extraction job
    const { data: job, error: jobError } = await supabase
      .from('extraction_jobs')
      .insert({
        reference_file_id: refFile.id,
        project_id,
        requested_by: user.id,
        job_type: 'url_parse',
        status: 'queued',
      })
      .select()
      .single();

    if (jobError) throw jobError;

    // Trigger async processing
    await supabase.functions.invoke('intake-process-job', {
      body: { job_id: job.id },
    });

    return new Response(
      JSON.stringify({
        reference_file_id: refFile.id,
        queued_job_id: job.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in intake-add-url:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
