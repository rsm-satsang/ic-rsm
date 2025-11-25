import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

    const { project_id, reference_file_id } = await req.json();

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

    // Get the reference file
    const { data: referenceFile, error: fileError } = await supabase
      .from('reference_files')
      .select('*')
      .eq('id', reference_file_id)
      .single();

    if (fileError) throw fileError;

    if (!referenceFile || referenceFile.status !== 'done') {
      return new Response(JSON.stringify({ error: 'Reference file not ready' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use the helper function to append to v1
    const { data: v1Id, error: appendError } = await supabase.rpc('append_to_v1_version', {
      _project_id: project_id,
      _new_content: referenceFile.extracted_text || '',
      _source_name: referenceFile.file_name || 'Unknown Source',
    });

    if (appendError) throw appendError;

    // Create timeline event
    const { data: userData } = await supabase
      .from('users')
      .select('name')
      .eq('id', user.id)
      .single();

    await supabase.from('timeline').insert({
      project_id,
      event_type: 'edited',
      event_details: {
        action: 'reference_added',
        file_name: referenceFile.file_name,
        augmented_v1: true,
      },
      user_id: user.id,
      user_name: userData?.name || 'Unknown User',
    });

    return new Response(
      JSON.stringify({
        v1_version_id: v1Id,
        status: 'augmented',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in intake-augment-v1:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
