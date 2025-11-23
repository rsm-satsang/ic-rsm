import { useQuery, useQueryClient } from "@tanstack/react-query";
import { intakeAPI } from "@/lib/api/intake";
import { useEffect } from "react";

export const useExtractionJobs = (projectId: string | undefined, enabled = true) => {
  const queryClient = useQueryClient();

  const { data: referenceFiles, isLoading: filesLoading } = useQuery({
    queryKey: ["reference-files", projectId],
    queryFn: () => intakeAPI.getReferenceFiles(projectId!),
    enabled: enabled && !!projectId,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ["extraction-jobs", projectId],
    queryFn: () => intakeAPI.getExtractionJobs(projectId!),
    enabled: enabled && !!projectId,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const allJobsComplete = referenceFiles?.every(
    (file) => file.status === "done" || file.status === "failed"
  );

  const hasFailedJobs = referenceFiles?.some((file) => file.status === "failed");

  const totalJobs = referenceFiles?.length || 0;
  const completedJobs = referenceFiles?.filter((file) => file.status === "done").length || 0;
  const failedJobs = referenceFiles?.filter((file) => file.status === "failed").length || 0;
  const activeJobs = referenceFiles?.filter(
    (file) => file.status === "queued" || file.status === "extracting"
  ).length || 0;

  const invalidateJobs = () => {
    queryClient.invalidateQueries({ queryKey: ["reference-files", projectId] });
    queryClient.invalidateQueries({ queryKey: ["extraction-jobs", projectId] });
  };

  return {
    referenceFiles: referenceFiles || [],
    jobs: jobs || [],
    isLoading: filesLoading || jobsLoading,
    allJobsComplete,
    hasFailedJobs,
    totalJobs,
    completedJobs,
    failedJobs,
    activeJobs,
    invalidateJobs,
  };
};
