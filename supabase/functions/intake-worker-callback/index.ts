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

    const { 
      job_id, 
      status, 
      extracted_text, 
      extracted_chunks, 
      error_message,
      worker_response 
    } = await req.json();

    // Update extraction job
    await supabase
      .from('extraction_jobs')
      .update({
        status,
        finished_at: new Date().toISOString(),
        error_message,
        worker_response,
      })
      .eq('id', job_id);

    // Get job to find reference_file_id
    const { data: job } = await supabase
      .from('extraction_jobs')
      .select('reference_file_id')
      .eq('id', job_id)
      .single();

    if (job) {
      // Update reference file
      await supabase
        .from('reference_files')
        .update({
          status: status === 'succeeded' ? 'done' : 'failed',
          extracted_text,
          extracted_chunks,
          error_text: error_message,
        })
        .eq('id', job.reference_file_id);

      // If extraction succeeded, check if we should augment v1
      if (status === 'succeeded' && extracted_text) {
        // Get the reference file to access project_id
        const { data: refFile } = await supabase
          .from('reference_files')
          .select('project_id, file_name')
          .eq('id', job.reference_file_id)
          .single();

        if (refFile) {
          // Check if intake is completed for this project
          const { data: project } = await supabase
            .from('projects')
            .select('metadata')
            .eq('id', refFile.project_id)
            .single();

          const metadata = project?.metadata as any;
          const intakeCompleted = metadata?.intake_completed === true;

          // If intake is completed, augment v1 with new content
          if (intakeCompleted) {
            await supabase.rpc('append_to_v1_version', {
              _project_id: refFile.project_id,
              _new_content: extracted_text,
              _source_name: refFile.file_name || 'Unknown Source',
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in intake-worker-callback:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
