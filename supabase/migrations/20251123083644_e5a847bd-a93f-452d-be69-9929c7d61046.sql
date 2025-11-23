-- Create reference_files table
CREATE TABLE public.reference_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES public.users(id),
  storage_path TEXT, -- Supabase storage path or external URL
  file_name TEXT,
  file_type TEXT, -- 'pdf','docx','txt','image','audio','video','youtube','url'
  size_bytes BIGINT,
  status TEXT DEFAULT 'uploaded', -- 'uploaded','queued','extracting','done','failed'
  error_text TEXT,
  extracted_text TEXT,
  extracted_chunks JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create extraction_jobs table
CREATE TABLE public.extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_file_id UUID REFERENCES public.reference_files(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES public.users(id),
  job_type TEXT, -- 'pdf_parse','docx_parse','txt_parse','image_ocr','audio_transcribe','youtube_transcribe','url_parse'
  status TEXT DEFAULT 'queued', -- 'queued','running','succeeded','failed'
  worker_response JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.reference_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reference_files
CREATE POLICY "Users can view reference files of accessible projects"
ON public.reference_files FOR SELECT
USING (has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can create reference files in accessible projects"
ON public.reference_files FOR INSERT
WITH CHECK (has_project_access(auth.uid(), project_id) AND uploaded_by = auth.uid());

CREATE POLICY "Users can update their reference files in accessible projects"
ON public.reference_files FOR UPDATE
USING (has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can delete reference files in accessible projects"
ON public.reference_files FOR DELETE
USING (has_project_access(auth.uid(), project_id));

-- RLS Policies for extraction_jobs
CREATE POLICY "Users can view extraction jobs of accessible projects"
ON public.extraction_jobs FOR SELECT
USING (has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can create extraction jobs in accessible projects"
ON public.extraction_jobs FOR INSERT
WITH CHECK (has_project_access(auth.uid(), project_id) AND requested_by = auth.uid());

CREATE POLICY "System can update extraction jobs"
ON public.extraction_jobs FOR UPDATE
USING (has_project_access(auth.uid(), project_id));

-- Create indexes for performance
CREATE INDEX idx_reference_files_project_id ON public.reference_files(project_id);
CREATE INDEX idx_reference_files_status ON public.reference_files(status);
CREATE INDEX idx_extraction_jobs_project_id ON public.extraction_jobs(project_id);
CREATE INDEX idx_extraction_jobs_status ON public.extraction_jobs(status);
CREATE INDEX idx_extraction_jobs_reference_file_id ON public.extraction_jobs(reference_file_id);

-- Trigger to update updated_at on reference_files
CREATE TRIGGER update_reference_files_updated_at
BEFORE UPDATE ON public.reference_files
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();