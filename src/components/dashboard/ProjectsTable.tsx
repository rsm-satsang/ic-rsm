import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ExternalLink,
  Trash2,
  MoreVertical,
  Search,
  X,
  FileText,
  Users,
  ArrowUpDown,
} from "lucide-react";

interface Project {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
  owner_id: string;
  metadata: any;
}

interface ProjectWithDetails extends Project {
  lastVersionName: string | null;
  assignedToName: string | null;
  lastUpdatedByName: string | null;
  lastNote: string | null;
  collaboratorCount: number;
}

interface ProjectsTableProps {
  projects: Project[];
  userId: string;
  onProjectDeleted: (projectId: string) => void;
}

const ProjectsTable = ({ projects, userId, onProjectDeleted }: ProjectsTableProps) => {
  const navigate = useNavigate();
  const [projectsWithDetails, setProjectsWithDetails] = useState<ProjectWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  
  // Filter states
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignedToFilter, setAssignedToFilter] = useState("");
  
  // Sort state
  const [sortField, setSortField] = useState<string>("updated_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetchProjectDetails();
  }, [projects]);

  const fetchProjectDetails = async () => {
    if (projects.length === 0) {
      setProjectsWithDetails([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const projectIds = projects.map(p => p.id);
      
      // Fetch all related data in parallel
      const [versionsRes, notesRes, collaboratorsRes, tasksRes] = await Promise.all([
        // Get latest version for each project
        supabase
          .from("versions")
          .select("project_id, title, version_number, created_by")
          .in("project_id", projectIds)
          .order("version_number", { ascending: false }),
        
        // Get latest note for each project
        supabase
          .from("version_notes")
          .select("project_id, content, created_at")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false }),
        
        // Get collaborator counts
        supabase
          .from("collaborators")
          .select("project_id, user_id")
          .in("project_id", projectIds),
        
        // Get active tasks to find "assigned to" users
        supabase
          .from("user_tasks")
          .select("project_id, assigned_to")
          .in("project_id", projectIds)
          .in("status", ["pending", "in_progress"]),
      ]);

      // Get unique user IDs we need to fetch names for
      const userIds = new Set<string>();
      
      versionsRes.data?.forEach(v => userIds.add(v.created_by));
      tasksRes.data?.forEach(t => userIds.add(t.assigned_to));
      projects.forEach(p => userIds.add(p.owner_id));

      // Fetch user names
      const { data: usersData } = await supabase
        .from("users")
        .select("id, name")
        .in("id", Array.from(userIds));

      const userMap = new Map(usersData?.map(u => [u.id, u.name]) || []);

      // Build the enhanced project data
      const enhanced = projects.map(project => {
        // Find latest version
        const latestVersion = versionsRes.data?.find(v => v.project_id === project.id);
        
        // Find latest note
        const latestNote = notesRes.data?.find(n => n.project_id === project.id);
        
        // Count collaborators (add 1 for owner)
        const collabCount = (collaboratorsRes.data?.filter(c => c.project_id === project.id).length || 0) + 1;
        
        // Find assigned user (first pending/in_progress task assignee)
        const activeTask = tasksRes.data?.find(t => t.project_id === project.id);
        
        return {
          ...project,
          lastVersionName: latestVersion?.title || (latestVersion ? `v${latestVersion.version_number}` : null),
          assignedToName: activeTask ? userMap.get(activeTask.assigned_to) || null : null,
          lastUpdatedByName: latestVersion ? userMap.get(latestVersion.created_by) || null : userMap.get(project.owner_id) || null,
          lastNote: latestNote?.content || null,
          collaboratorCount: collabCount,
        };
      });

      setProjectsWithDetails(enhanced);
    } catch (error) {
      console.error("Error fetching project details:", error);
      toast.error("Failed to load project details");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProject = async (project: Project) => {
    const { data: references } = await supabase
      .from("reference_files")
      .select("id")
      .eq("project_id", project.id)
      .limit(1);
    
    if (references && references.length > 0) {
      navigate(`/workspace/${project.id}`);
    } else {
      navigate(`/project/${project.id}/intake`);
    }
  };

  const handleDeleteProject = async () => {
    if (!deletingProject) return;

    try {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", deletingProject.id);

      if (error) throw error;

      toast.success("Project deleted successfully");
      onProjectDeleted(deletingProject.id);
      setDeletingProject(null);
    } catch (error: any) {
      console.error("Delete failed:", error);
      toast.error(error?.message || "Failed to delete project");
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published":
        return "default";
      case "approved":
        return "default";
      case "review":
        return "secondary";
      case "in_progress":
        return "secondary";
      default:
        return "outline";
    }
  };

  const clearFilters = () => {
    setNameFilter("");
    setStatusFilter("all");
    setAssignedToFilter("");
  };

  const hasActiveFilters = nameFilter || statusFilter !== "all" || assignedToFilter;

  // Filter and sort projects
  const filteredProjects = projectsWithDetails
    .filter(project => {
      const matchesName = project.title.toLowerCase().includes(nameFilter.toLowerCase());
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      const matchesAssigned = !assignedToFilter || 
        (project.assignedToName?.toLowerCase().includes(assignedToFilter.toLowerCase()));
      return matchesName && matchesStatus && matchesAssigned;
    })
    .sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortField) {
        case "title":
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "updated_at":
          aVal = new Date(a.updated_at).getTime();
          bVal = new Date(b.updated_at).getTime();
          break;
        case "collaboratorCount":
          aVal = a.collaboratorCount;
          bVal = b.collaboratorCount;
          break;
        default:
          aVal = a.updated_at;
          bVal = b.updated_at;
      }
      
      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

  const uniqueStatuses = [...new Set(projects.map(p => p.status))];

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-muted rounded w-full"></div>
        <div className="h-64 bg-muted rounded w-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by project name..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="h-9"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {uniqueStatuses.map(status => (
              <SelectItem key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Input
          placeholder="Filter by assigned to..."
          value={assignedToFilter}
          onChange={(e) => setAssignedToFilter(e.target.value)}
          className="w-[180px] h-9"
        />
        
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead 
                className="cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("title")}
              >
                <div className="flex items-center gap-1">
                  Project Name
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead>Last Version</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("status")}
              >
                <div className="flex items-center gap-1">
                  Status
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead>Currently With</TableHead>
              <TableHead>Last Updated By</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/80"
                onClick={() => handleSort("updated_at")}
              >
                <div className="flex items-center gap-1">
                  Last Updated
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead>Last Note</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/80 text-center"
                onClick={() => handleSort("collaboratorCount")}
              >
                <div className="flex items-center justify-center gap-1">
                  <Users className="h-3 w-3" />
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileText className="h-8 w-8" />
                    <span>No projects found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredProjects.map((project) => (
                <TableRow key={project.id} className="hover:bg-muted/30">
                  <TableCell>
                    <button
                      onClick={() => handleOpenProject(project)}
                      className="text-left font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      {project.title}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {project.lastVersionName || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(project.status)}>
                      {project.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {project.assignedToName || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {project.lastUpdatedByName || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="flex flex-col">
                      <span>{new Date(project.updated_at).toLocaleDateString()}</span>
                      <span className="text-xs">
                        {new Date(project.updated_at).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {project.lastNote ? (
                      <span className="text-muted-foreground text-sm line-clamp-2 max-w-[200px]">
                        {project.lastNote}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="font-normal">
                      {project.collaboratorCount}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenProject(project)}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/project/${project.id}/intake`)}>
                          Add References
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setDeletingProject(project)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredProjects.length} of {projectsWithDetails.length} projects
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingProject} onOpenChange={() => setDeletingProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingProject?.title}"? This action cannot be undone and will delete all versions, comments, and related data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteProject} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectsTable;
