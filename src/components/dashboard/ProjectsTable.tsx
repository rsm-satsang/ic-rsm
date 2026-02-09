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
  DropdownMenuSeparator,
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
  Archive,
  ArchiveRestore,
  Clock,
  Calendar,
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
  daysOld: number;
  timeSinceUpdate: string;
  isArchived: boolean;
}

interface ProjectsTableProps {
  projects: Project[];
  userId: string;
  onProjectDeleted: (projectId: string) => void;
}

// Helper to calculate days between two dates
const daysBetween = (date1: Date, date2: Date) => {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

// Helper to format time since last update
const formatTimeSince = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return `${Math.floor(diffDays / 7)}w ago`;
  }
};

const ProjectsTable = ({ projects, userId, onProjectDeleted }: ProjectsTableProps) => {
  const navigate = useNavigate();
  const [projectsWithDetails, setProjectsWithDetails] = useState<ProjectWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [dbThemes, setDbThemes] = useState<string[]>([]);
  
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
    fetchDbThemes();
  }, [projects]);

  const fetchDbThemes = async () => {
    try {
      const { data, error } = await supabase
        .from("themes")
        .select("name")
        .order("name", { ascending: true });
      if (error) throw error;
      setDbThemes((data || []).map(t => t.name));
    } catch (error) {
      console.error("Error fetching themes:", error);
    }
  };

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
        supabase
          .from("versions")
          .select("project_id, created_by")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false }),
        
        supabase
          .from("collaborators")
          .select("project_id, user_id")
          .in("project_id", projectIds),
        
        supabase
          .from("user_tasks")
          .select("project_id, assigned_to")
          .in("project_id", projectIds)
          .in("status", ["pending", "in_progress"]),
        
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
      const now = new Date();

      // Build the enhanced project data
      const enhanced = projects.map(project => {
        const latestVersion = versionsRes.data?.find(v => v.project_id === project.id);
        const collabCount = (collaboratorsRes.data?.filter(c => c.project_id === project.id).length || 0) + 1;
        const activeTask = tasksRes.data?.find(t => t.project_id === project.id);
        const latestNote = notesRes.data?.find(n => n.project_id === project.id);
        
        const createdDate = new Date(project.created_at);
        const updatedDate = new Date(project.updated_at);
        const isArchived = (project.metadata as any)?.archived === true;
        
        return {
          ...project,
          assignedToName: activeTask ? userMap.get(activeTask.assigned_to) || null : null,
          lastUpdatedByName: latestVersion ? userMap.get(latestVersion.created_by) || null : userMap.get(project.owner_id) || null,
          lastNote: latestNote?.content || null,
          collaboratorCount: collabCount,
          daysOld: daysBetween(createdDate, now),
          timeSinceUpdate: formatTimeSince(updatedDate),
          isArchived,
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

  const handleArchiveProject = async (project: ProjectWithDetails) => {
    try {
      const currentMetadata = project.metadata || {};
      const newArchiveState = !project.isArchived;
      
      const { error } = await supabase
        .from("projects")
        .update({
          metadata: { ...currentMetadata, archived: newArchiveState }
        })
        .eq("id", project.id);

      if (error) throw error;

      toast.success(newArchiveState ? "Project archived" : "Project restored");
      
      // Update local state
      setProjectsWithDetails(prev => 
        prev.map(p => 
          p.id === project.id 
            ? { ...p, isArchived: newArchiveState, metadata: { ...currentMetadata, archived: newArchiveState } }
            : p
        )
      );
    } catch (error: any) {
      console.error("Archive failed:", error);
      toast.error(error?.message || "Failed to archive project");
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

  // Separate active and archived projects
  const activeProjects = projectsWithDetails.filter(p => !p.isArchived);
  const archivedProjects = projectsWithDetails.filter(p => p.isArchived);

  const filterAndSortProjects = (projectList: ProjectWithDetails[]) => {
    return projectList
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
          case "daysOld":
            aVal = a.daysOld;
            bVal = b.daysOld;
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
  };

  const filteredActiveProjects = filterAndSortProjects(activeProjects);
  const filteredArchivedProjects = filterAndSortProjects(archivedProjects);

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

  const renderProjectRow = (project: ProjectWithDetails) => (
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
          <div className="flex items-center gap-1 text-xs text-muted-foreground/70 mt-1">
            <Calendar className="h-3 w-3" />
            <span>{project.daysOld} days old</span>
          </div>
        </div>
      </TableCell>
      
      {/* Assigned To */}
      <TableCell className="py-4">
        <span className="text-sm text-muted-foreground">
          {project.assignedToName || "—"}
        </span>
      </TableCell>
      
      {/* Last Updated with time since */}
      <TableCell className="py-4">
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{project.lastUpdatedByName || "—"}</span>
              {project.lastNote && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[300px] p-3">
                      <p className="text-sm leading-relaxed">{project.lastNote}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(project.updated_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
              })}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground/70 mt-0.5">
              <Clock className="h-3 w-3" />
              <span>{project.timeSinceUpdate}</span>
            </div>
          </div>
        </div>
      </TableCell>
      
      {/* Collaborators */}
      <TableCell className="text-center py-4">
        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-muted/50 text-sm font-medium">
          {project.collaboratorCount}
        </div>
      </TableCell>
      
      {/* Actions */}
      <TableCell className="py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/50">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => handleOpenProject(project)}>
              Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/project/${project.id}/intake`)}>
              Add References
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleArchiveProject(project)}>
              {project.isArchived ? (
                <>
                  <ArchiveRestore className="h-4 w-4 mr-2" />
                  Restore
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
  );

  return (
    <div className="space-y-6">
      {/* Filters - Single Row */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/20 rounded-xl border border-border/50">
        <div className="flex items-center gap-2 min-w-[200px] flex-1">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="h-9 bg-background/50"
          />
        </div>
        
        <Select value={outcomeTypeFilter} onValueChange={setOutcomeTypeFilter}>
          <SelectTrigger className="w-[160px] h-9 bg-background/50">
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
          <SelectTrigger className="w-[130px] h-9 bg-background/50">
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
          <SelectTrigger className="w-[120px] h-9 bg-background/50">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
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
          className="w-[140px] h-9 bg-background/50"
        />
        
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Active Projects Table */}
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
            {filteredActiveProjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <div className="p-4 rounded-full bg-muted/50">
                      <FileText className="h-8 w-8" />
                    </div>
                    <span className="text-base">No active projects found</span>
                    <span className="text-sm">Try adjusting your filters</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredActiveProjects.map(renderProjectRow)
            )}
          </TableBody>
        </Table>
      </div>

      {/* Results count for active */}
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>
          Showing <span className="font-medium text-foreground">{filteredActiveProjects.length}</span> of{" "}
          <span className="font-medium text-foreground">{activeProjects.length}</span> active projects
        </span>
      </div>

      {/* Archived Projects Table */}
      {archivedProjects.length > 0 && (
        <>
          <div className="flex items-center gap-2 mt-8 pt-6 border-t">
            <Archive className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-muted-foreground">Archived Projects</h3>
            <Badge variant="secondary" className="ml-2">
              {archivedProjects.length}
            </Badge>
          </div>

          <div className="border rounded-xl overflow-hidden shadow-sm bg-card/50 opacity-80">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 border-b">
                  <TableHead className="py-3">
                    <span className="font-semibold text-muted-foreground">Project</span>
                  </TableHead>
                  <TableHead className="py-3">
                    <span className="font-semibold text-muted-foreground">Currently Assigned to</span>
                  </TableHead>
                  <TableHead className="py-3">
                    <span className="font-semibold text-muted-foreground">Last Updated</span>
                  </TableHead>
                  <TableHead className="py-3 text-center">
                    <Users className="h-4 w-4 mx-auto text-muted-foreground" />
                  </TableHead>
                  <TableHead className="w-[50px] py-3"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredArchivedProjects.map(renderProjectRow)}
              </TableBody>
            </Table>
          </div>
        </>
      )}

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
