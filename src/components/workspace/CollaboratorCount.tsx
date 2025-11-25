import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CollaboratorCountProps {
  projectId: string;
  ownerId: string;
  userId: string;
}

const CollaboratorCount = ({ projectId, ownerId, userId }: CollaboratorCountProps) => {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCollaboratorCount();
  }, [projectId]);

  const fetchCollaboratorCount = async () => {
    try {
      // Count active collaborators
      const { count, error } = await supabase
        .from("collaborators")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId);

      if (error) {
        console.error("Error fetching collaborator count:", error);
        // Fallback: just show owner
        setCount(1);
      } else {
        // Add 1 for the owner
        const totalCount = (count || 0) + 1;
        setCount(totalCount);
      }
    } catch (error) {
      console.error("Error fetching collaborator count:", error);
      setCount(1); // Default to owner only
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <span>...</span>;
  }

  if (count === 1) {
    return <span>Solo</span>;
  }

  return <span>{count} collaborators</span>;
};

export default CollaboratorCount;
