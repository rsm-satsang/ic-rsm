import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { job_id } = await req.json();

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('extraction_jobs')
      .select('*, reference_files(*)')
      .eq('id', job_id)
      .single();

    if (jobError || !job) {
      throw new Error('Job not found');
    }

    const refFile = job.reference_files;

    // Update job status to running
    await supabase
      .from('extraction_jobs')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', job_id);

    await supabase
      .from('reference_files')
      .update({ status: 'extracting' })
      .eq('id', refFile.id);

    let extractedText = '';
    let errorMessage = '';
    let status = 'succeeded';

    try {
      // Route to appropriate extraction method
      switch (job.job_type) {
        case 'pdf_parse':
          extractedText = await extractPDF(supabase, refFile);
          break;
        case 'docx_parse':
          extractedText = await extractDOCX(supabase, refFile);
          break;
        case 'txt_parse':
          extractedText = await extractTXT(supabase, refFile);
          break;
        case 'image_ocr':
          extractedText = await extractImageOCR(supabase, refFile);
          break;
        case 'audio_transcribe':
        case 'video_transcribe':
          extractedText = await transcribeAudioVideo(supabase, refFile);
          break;
        case 'youtube_transcribe':
          extractedText = await transcribeYouTube(refFile);
          break;
        case 'url_parse':
          extractedText = await extractURL(refFile);
          break;
        default:
          throw new Error(`Unknown job type: ${job.job_type}`);
      }
    } catch (error: any) {
      console.error('Extraction error:', error);
      errorMessage = error.message;
      status = 'failed';
    }

    // Update via worker callback
    await supabase.functions.invoke('intake-worker-callback', {
      body: {
        job_id,
        status,
        extracted_text: extractedText,
        error_message: errorMessage,
        worker_response: { processed_at: new Date().toISOString() },
      },
    });

    return new Response(
      JSON.stringify({ success: true, status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in intake-process-job:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function extractPDF(supabase: any, refFile: any): Promise<string> {
  // For PDFs, we'll use Gemini Vision OCR for ALL pages as requested
  // Download file from storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('project-references')
    .download(refFile.storage_path);

  if (downloadError) throw new Error(`Failed to download PDF: ${downloadError.message}`);

  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  // Convert PDF to base64 for Gemini (handle large files)
  const arrayBuffer = await fileData.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);

  // Call Gemini Vision for OCR (send entire PDF)
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: 'Extract all text from this PDF document. Preserve structure and formatting as much as possible. Return only the extracted text without any additional commentary.'
            },
            {
              inline_data: {
                mime_type: 'application/pdf',
                data: base64
              }
            }
          ]
        }]
      }),
    }
  );

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

async function extractDOCX(supabase: any, refFile: any): Promise<string> {
  // For DOCX, we'll use a simple text extraction approach
  // In a production environment, you'd use mammoth.js or similar
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('project-references')
    .download(refFile.storage_path);

  if (downloadError) throw new Error(`Failed to download DOCX: ${downloadError.message}`);

  // Note: This is a simplified implementation
  // In production, you would parse the DOCX properly
  // For now, we'll use Gemini to extract text from DOCX as well
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: 'Extract all text from this Word document. Preserve structure and return only the text.'
            },
            {
              inline_data: {
                mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                data: base64
              }
            }
          ]
        }]
      }),
    }
  );

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function extractTXT(supabase: any, refFile: any): Promise<string> {
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('project-references')
    .download(refFile.storage_path);

  if (downloadError) throw new Error(`Failed to download TXT: ${downloadError.message}`);

  const text = await fileData.text();
  return text;
}

async function extractImageOCR(supabase: any, refFile: any): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('project-references')
    .download(refFile.storage_path);

  if (downloadError) throw new Error(`Failed to download image: ${downloadError.message}`);

  const arrayBuffer = await fileData.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);

  // Determine MIME type
  const ext = refFile.file_name?.split('.').pop()?.toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  const mimeType = mimeTypes[ext || ''] || 'image/jpeg';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: 'Extract all text visible in this image using OCR. Return only the extracted text without additional commentary.'
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64
              }
            }
          ]
        }]
      }),
    }
  );

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function transcribeAudioVideo(supabase: any, refFile: any): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('project-references')
    .download(refFile.storage_path);

  if (downloadError) throw new Error(`Failed to download audio/video: ${downloadError.message}`);

  const arrayBuffer = await fileData.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);

  // Determine MIME type
  const ext = refFile.file_name?.split('.').pop()?.toLowerCase();
  const audioMimeTypes: { [key: string]: string } = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
  };
  const mimeType = audioMimeTypes[ext || ''] || 'audio/mpeg';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: 'Transcribe all speech from this audio/video file. Return only the transcription.'
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64
              }
            }
          ]
        }]
      }),
    }
  );

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function transcribeYouTube(refFile: any): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const youtubeUrl = refFile.metadata?.youtube_url || refFile.storage_path;

  // Try to use Gemini with YouTube URL directly
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: `Transcribe the speech from this YouTube video: ${youtubeUrl}. Return only the transcription without additional commentary.`
            }
          ]
        }]
      }),
    }
  );

  const data = await response.json();
  
  if (data.error || !data.candidates) {
    throw new Error('YouTube video may be private or unavailable. Please upload the audio file directly.');
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function extractURL(refFile: any): Promise<string> {
  const url = refFile.metadata?.url || refFile.storage_path;

  // Fetch the HTML
  const response = await fetch(url);
  const html = await response.text();

  // Basic text extraction (remove HTML tags)
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return textContent.slice(0, 50000); // Limit to 50k chars
}
