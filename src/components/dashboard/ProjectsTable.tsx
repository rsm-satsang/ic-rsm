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
  Trash2,
  MoreVertical,
  Search,
  X,
  FileText,
  Users,
  ArrowUpDown,
  MessageSquare,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const [outcomeTypeFilter, setOutcomeTypeFilter] = useState<string>("all");
  const [themeFilter, setThemeFilter] = useState<string>("all");
  
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
      const [versionsRes, collaboratorsRes, tasksRes, notesRes] = await Promise.all([
        // Get latest version for each project (for last updated by)
        supabase
          .from("versions")
          .select("project_id, created_by")
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
        
        // Get latest note for each project
        supabase
          .from("version_notes")
          .select("project_id, content")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false }),
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
        // Find latest version (for last updated by)
        const latestVersion = versionsRes.data?.find(v => v.project_id === project.id);
        
        // Count collaborators (add 1 for owner)
        const collabCount = (collaboratorsRes.data?.filter(c => c.project_id === project.id).length || 0) + 1;
        
        // Find assigned user (first pending/in_progress task assignee)
        const activeTask = tasksRes.data?.find(t => t.project_id === project.id);
        
        // Find latest note
        const latestNote = notesRes.data?.find(n => n.project_id === project.id);
        
        return {
          ...project,
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
    setOutcomeTypeFilter("all");
    setThemeFilter("all");
  };

  const hasActiveFilters = nameFilter || statusFilter !== "all" || assignedToFilter || outcomeTypeFilter !== "all" || themeFilter !== "all";

  // Filter and sort projects
  // Format goal value for display
  const formatGoal = (goal: string | undefined) => {
    if (!goal) return "-";
    const goalLabels: Record<string, string> = {
      substack_newsletter: "Substack Newsletter",
      wordpress_blog: "WordPress Blog",
      note: "Note",
      book_article: "Book Article",
      story_children: "Story (Children)",
      story_adults: "Story (Adults)",
      proofreading: "Proofreading",
      translation: "Translation",
      other: "Other",
    };
    return goalLabels[goal] || goal.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  const filteredProjects = projectsWithDetails
    .filter(project => {
      const matchesName = project.title.toLowerCase().includes(nameFilter.toLowerCase());
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      const matchesAssigned = !assignedToFilter || 
        (project.assignedToName?.toLowerCase().includes(assignedToFilter.toLowerCase()));
      const projectGoal = (project.metadata as any)?.goal || "";
      const matchesOutcomeType = outcomeTypeFilter === "all" || projectGoal === outcomeTypeFilter;
      const projectTheme = (project.metadata as any)?.theme || "";
      const matchesTheme = themeFilter === "all" || projectTheme === themeFilter;
      return matchesName && matchesStatus && matchesAssigned && matchesOutcomeType && matchesTheme;
    })
    .sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortField) {
        case "title":
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case "type":
          aVal = (a.metadata as any)?.goal || "";
          bVal = (b.metadata as any)?.goal || "";
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
  const uniqueGoals = [...new Set(projects.map(p => (p.metadata as any)?.goal).filter(Boolean))];
  const uniqueThemes = [...new Set(projects.map(p => (p.metadata as any)?.theme).filter(Boolean))];

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-muted rounded w-full"></div>
        <div className="h-64 bg-muted rounded w-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/20 rounded-xl border border-border/50">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="h-9 bg-background/50"
          />
        </div>
        
        <Select value={outcomeTypeFilter} onValueChange={setOutcomeTypeFilter}>
          <SelectTrigger className="w-[180px] h-9 bg-background/50">
            <SelectValue placeholder="Outcome Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {uniqueGoals.map(goal => (
              <SelectItem key={goal} value={goal}>
                {formatGoal(goal)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={themeFilter} onValueChange={setThemeFilter}>
          <SelectTrigger className="w-[150px] h-9 bg-background/50">
            <SelectValue placeholder="Theme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Themes</SelectItem>
            {uniqueThemes.map(theme => (
              <SelectItem key={theme} value={theme}>
                {theme}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9 bg-background/50">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {uniqueStatuses.map(status => (
              <SelectItem key={status} value={status} className="capitalize">
                {status.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Input
          placeholder="Assigned to..."
          value={assignedToFilter}
          onChange={(e) => setAssignedToFilter(e.target.value)}
          className="w-[160px] h-9 bg-background/50"
        />
        
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 border-b">
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 transition-colors py-4"
                onClick={() => handleSort("title")}
              >
                <div className="flex items-center gap-2 font-semibold">
                  Project
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </TableHead>
              <TableHead className="py-4">
                <span className="font-semibold">Currently Assigned to</span>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 transition-colors py-4"
                onClick={() => handleSort("updated_at")}
              >
                <div className="flex items-center gap-2 font-semibold">
                  Last Updated
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50 transition-colors py-4 text-center"
                onClick={() => handleSort("collaboratorCount")}
              >
                <div className="flex items-center justify-center gap-2 font-semibold">
                  <Users className="h-4 w-4" />
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </TableHead>
              <TableHead className="w-[50px] py-4"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <div className="p-4 rounded-full bg-muted/50">
                      <FileText className="h-8 w-8" />
                    </div>
                    <span className="text-base">No projects found</span>
                    <span className="text-sm">Try adjusting your filters</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredProjects.map((project) => (
                <TableRow 
                  key={project.id} 
                  className="hover:bg-muted/20 transition-colors border-b last:border-b-0"
                >
                  {/* Merged Project Column */}
                  <TableCell className="py-4">
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleOpenProject(project)}
                        className="text-left font-semibold text-foreground hover:text-primary transition-colors text-base"
                      >
                        {project.title}
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge 
                          variant="secondary" 
                          className="text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 border-0"
                        >
                          {formatGoal((project.metadata as any)?.goal)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground font-medium">
                          {(project.metadata as any)?.theme || "General"}
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <Badge 
                          variant={getStatusColor(project.status)}
                          className="text-xs capitalize"
                        >
                          {project.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  
                  {/* Assigned To */}
                  <TableCell className="py-4">
                    <span className="text-sm text-muted-foreground">
                      {project.assignedToName || "—"}
                    </span>
                  </TableCell>
                  
                  {/* Last Updated */}
                  <TableCell className="py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{project.lastUpdatedByName || "—"}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(project.updated_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric"
                          })}{" · "}
                          {new Date(project.updated_at).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                      </div>
                      {project.lastNote && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors">
                                <MessageSquare className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[300px] p-3">
                              <p className="text-sm leading-relaxed">{project.lastNote}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                  
                  {/* Collaborators */}
                  <TableCell className="text-center py-4">
                    <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-muted/50 text-sm font-medium">
                      {project.collaboratorCount}
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/50">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => handleOpenProject(project)}>
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
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>
          Showing <span className="font-medium text-foreground">{filteredProjects.length}</span> of{" "}
          <span className="font-medium text-foreground">{projectsWithDetails.length}</span> projects
        </span>
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
