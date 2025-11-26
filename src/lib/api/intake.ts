import { supabase } from "@/integrations/supabase/client";

export interface ReferenceFile {
  id: string;
  project_id: string;
  uploaded_by: string;
  storage_path: string | null;
  file_name: string | null;
  file_type: string | null;
  size_bytes: number | null;
  status: string;
  error_text: string | null;
  extracted_text: string | null;
  extracted_chunks: any;
  metadata: any;
  user_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractionJob {
  id: string;
  reference_file_id: string;
  project_id: string;
  requested_by: string;
  job_type: string;
  status: string;
  worker_response: any;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export const intakeAPI = {
  async uploadReferenceFile(params: {
    project_id: string;
    storage_path: string;
    file_name: string;
    file_type: string;
    size_bytes: number;
  }) {
    const { data, error } = await supabase.functions.invoke("intake-upload", {
      body: params,
    });
    if (error) throw error;
    return data;
  },

  async addYouTubeLink(params: {
    project_id: string;
    youtube_url: string;
  }) {
    const { data, error } = await supabase.functions.invoke("intake-add-youtube", {
      body: params,
    });
    if (error) throw error;
    return data;
  },

  async addExternalURL(params: {
    project_id: string;
    url: string;
  }) {
    const { data, error } = await supabase.functions.invoke("intake-add-url", {
      body: params,
    });
    if (error) throw error;
    return data;
  },

  async queueExtraction(params: {
    reference_file_id: string;
    job_type: string;
  }) {
    const { data, error } = await supabase.functions.invoke("intake-queue-extraction", {
      body: params,
    });
    if (error) throw error;
    return data;
  },

  async getJobStatus(jobId: string) {
    const { data, error } = await supabase.functions.invoke(`intake-job-status/${jobId}`);
    if (error) throw error;
    return data;
  },

  async generateVersions(params: {
    project_id: string;
    goal: string;
    llm_chat: string;
    vocabulary?: string[];
    reference_file_ids?: string[];
  }) {
    const { data, error } = await supabase.functions.invoke("intake-generate-versions", {
      body: params,
    });
    if (error) throw error;
    return data;
  },

  async augmentV1WithNewReference(params: {
    project_id: string;
    reference_file_id: string;
  }) {
    const { data, error } = await supabase.functions.invoke("intake-augment-v1", {
      body: params,
    });
    if (error) throw error;
    return data;
  },

  async getReferenceFiles(projectId: string) {
    const { data, error } = await supabase
      .from("reference_files")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    return data as ReferenceFile[];
  },

  async getExtractionJobs(projectId: string) {
    const { data, error } = await supabase
      .from("extraction_jobs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    return data as ExtractionJob[];
  },

  async deleteReferenceFile(fileId: string) {
    const { error } = await supabase
      .from("reference_files")
      .delete()
      .eq("id", fileId);
    
    if (error) throw error;
  },
};
