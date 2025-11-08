import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import apiClient from "@/lib/api";
import RichTextEditor from "@/components/RichTextEditor";

export default function TicketsCreatePage() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<any>({
    priorities: [],
    statuses: [],
    categories: [],
    teams: [],
    buckets: [],
    users: [],
  });
  const [form, setForm] = useState<any>({
    subject: "",
    description: "",
    priority_id: undefined,
    category_id: undefined,
    assigned_to: undefined,
    team_id: undefined,
    bucket_id: undefined,
    status_id: undefined,
    demand: 0,
    reason: "",
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const descriptionRef = useRef<HTMLDivElement | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const m = await apiClient.getTicketMetadata();
        // Ensure arrays exist
        const metaObj: any = {
          priorities: m.priorities || [],
          statuses: m.statuses || [],
          categories: m.categories || [],
          teams: m.teams || [],
          buckets: m.buckets || [],
          users: [],
        };

        // Provide sensible defaults for teams and buckets when backend doesn't return them
        const defaultTeams = [
          { id: 1, name: "Product" },
          { id: 2, name: "Infra" },
          { id: 3, name: "Development" },
          { id: 4, name: "Design" },
          { id: 5, name: "Finance" },
          { id: 6, name: "HR" },
          { id: 7, name: "Finops" },
          { id: 8, name: "Database" },
          { id: 9, name: "Switch" },
        ];

        const defaultBucketsPerTeam: Record<number, string[]> = {
          1: ["Roadmap", "Feature Requests", "Bugs", "Improvements"],
          2: ["Deployments", "Monitoring", "CI/CD", "Incidents"],
          3: ["Backlog", "Sprint", "Hotfixes", "Tech Debt"],
          4: ["UI", "UX Research", "Prototypes", "Assets"],
          5: ["Billing", "Invoices", "Expense Requests", "Reconciliations"],
          6: ["Recruitment", "Onboarding", "Policies", "Payroll"],
          7: ["Cost Optimization", "Budgeting", "Alerts", "Reporting"],
          8: ["Migrations", "Backups", "Performance", "Schema Changes"],
          9: ["Integrations", "Switch Ops", "Switch Incidents", "Releases"],
        };

        // Use backend teams if available, otherwise fall back to defaults
        const teamsToUse =
          metaObj.teams && metaObj.teams.length > 0
            ? metaObj.teams
            : defaultTeams;

        // Build buckets array expected by the rest of the page: { id, name, team_id }
        let bucketsToUse: any[] = [];
        if (metaObj.buckets && metaObj.buckets.length > 0) {
          bucketsToUse = metaObj.buckets;
        } else {
          let bucketId = 1;
          for (const t of teamsToUse) {
            const names = defaultBucketsPerTeam[t.id] || [];
            for (const n of names) {
              bucketsToUse.push({ id: bucketId++, name: n, team_id: t.id });
            }
          }
        }

        metaObj.teams = teamsToUse;
        metaObj.buckets = bucketsToUse;

        // Provide default statuses if backend doesn't return them
        const defaultStatuses = [
          { id: 1, name: "Open" },
          { id: 2, name: "In Progress" },
          { id: 3, name: "Pending" },
          { id: 4, name: "Overdue" },
          { id: 5, name: "Closed" },
        ];

        metaObj.statuses =
          metaObj.statuses && metaObj.statuses.length > 0
            ? metaObj.statuses
            : defaultStatuses;

        // Restrict priorities to High, Medium, Low (preferred order)
        const allowedPriorityNames = ["High", "Medium", "Low"];
        if (metaObj.priorities && metaObj.priorities.length > 0) {
          const prioritiesMap: Record<string, any> = {};
          metaObj.priorities.forEach((p: any) => {
            prioritiesMap[String(p.name).toLowerCase()] = p;
          });
          const ordered: any[] = [];
          let idCounter = 1;
          for (const name of allowedPriorityNames) {
            const found = prioritiesMap[name.toLowerCase()];
            if (found) ordered.push(found);
            else ordered.push({ id: idCounter++, name });
          }
          metaObj.priorities = ordered;
        } else {
          // Provide client-side defaults
          metaObj.priorities = [
            { id: 3, name: "High", level: 3, color: "#EF4444" },
            { id: 2, name: "Medium", level: 2, color: "#F59E0B" },
            { id: 1, name: "Low", level: 1, color: "#10B981" },
          ];
        }

        // Fetch users list for assignee dropdown
        try {
          // Load users from local users table (server-side users endpoint)
          const usersResp = await apiClient.request("/users");
          metaObj.users = usersResp || [];
        } catch (uErr) {
          console.warn("Failed to load users for assignee dropdown", uErr);
          metaObj.users = [];
        }
        setMeta(metaObj);

        // Set default status to 'Open' if not already set
        try {
          const openStatus = (metaObj.statuses || []).find(
            (s: any) => String(s.name).toLowerCase() === "open",
          );
          if (openStatus) {
            setForm((prev: any) => ({
              ...prev,
              status_id: prev.status_id || openStatus.id,
            }));
          }
        } catch (e) {
          // ignore
        }
      } catch (e) {
        console.warn(e);
      }
    })();
  }, []);

  const computeSlaLabel = (demand: number) => {
    switch (demand) {
      case 0:
        return "2 hours";
      case 1:
        return "5 hours";
      case 2:
        return "End of day";
      default:
        return "—";
    }
  };

  const filteredAssignees = meta.users.filter((u: any) => {
    if (!assigneeSearch) return true;
    const s = assigneeSearch.toLowerCase();
    const name = (
      u.name ||
      `${u.firstname || u.first_name || ""} ${u.lastname || u.last_name || ""}`
    ).toLowerCase();
    return name.includes(s) || (u.email || "").toLowerCase().includes(s);
  });

  const submit = async () => {
    // Client-side validation
    const newErrors: Record<string, string> = {};
    if (!form.team_id) newErrors.team_id = "Team is required";
    if (!form.bucket_id) newErrors.bucket_id = "Bucket is required";
    if (!form.status_id) newErrors.status_id = "Status is required";
    if (!form.subject || String(form.subject).trim() === "")
      newErrors.subject = "Title is required";
    if (!form.description || String(form.description).trim() === "")
      newErrors.description = "Description is required";
    if (!form.priority_id) newErrors.priority_id = "Priority is required";
    if (
      form.demand === undefined ||
      form.demand === null ||
      ![0, 1, 2].includes(Number(form.demand))
    )
      newErrors.demand = "Demand is required";
    if (!form.assigned_to) newErrors.assigned_to = "Assignee is required";

    const selectedStatus = meta.statuses
      ? meta.statuses.find((s: any) => s.id === form.status_id)
      : null;
    if (
      selectedStatus &&
      String(selectedStatus.name).toLowerCase().includes("overdue")
    ) {
      if (!form.reason || String(form.reason).trim() === "")
        newErrors.reason = "Reason is required when status is Overdue";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Scroll to first error field (optional)
      const firstKey = Object.keys(newErrors)[0];
      // Keep user on form and do not submit
      return;
    }

    setLoading(true);
    try {
      const created = await apiClient.createTicket(form, attachments);
      navigate(`/tickets/${created.id}`);
    } catch (err) {
      console.error("Failed to create ticket:", err);
      alert("Failed to create ticket");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Create Support Ticket</h1>

      <Card>
        <CardHeader>
          <CardTitle>Ticket Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Team select (always shown) */}
              <div>
                <Label className="mb-2">
                  Team<span className="text-red-500 ml-1">*</span>
                </Label>
                <Select
                  value={form.team_id ? String(form.team_id) : ""}
                  onValueChange={(v) => {
                    const teamId = v ? parseInt(v) : undefined;
                    setForm({ ...form, team_id: teamId, bucket_id: undefined });
                    setErrors((prev) => ({ ...prev, team_id: undefined }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Select</SelectItem>
                    {meta.teams && meta.teams.length > 0 ? (
                      meta.teams.map((t: any) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-teams" disabled>
                        No teams available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {errors.team_id && (
                  <div className="text-sm text-red-600 mt-1">
                    {errors.team_id}
                  </div>
                )}
              </div>

              {/* Bucket select (always shown) - filtered by selected team */}
              <div>
                <Label className="mb-2">
                  Bucket<span className="text-red-500 ml-1">*</span>
                </Label>
                <Select
                  value={form.bucket_id ? String(form.bucket_id) : ""}
                  onValueChange={(v) => {
                    setForm({
                      ...form,
                      bucket_id: v ? parseInt(v) : undefined,
                    });
                    setErrors((prev) => ({ ...prev, bucket_id: undefined }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bucket" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Select</SelectItem>
                    {(() => {
                      const teamId = form.team_id;
                      const buckets = (meta.buckets || []).filter((b: any) =>
                        teamId ? String(b.team_id) === String(teamId) : true,
                      );
                      if (buckets.length === 0)
                        return (
                          <SelectItem value="no-buckets" disabled>
                            No buckets available
                          </SelectItem>
                        );
                      return buckets.map((b: any) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
                {errors.bucket_id && (
                  <div className="text-sm text-red-600 mt-1">
                    {errors.bucket_id}
                  </div>
                )}
              </div>

              <div>
                <Label className="mb-2">
                  Status<span className="text-red-500 ml-1">*</span>
                </Label>
                <Select
                  value={form.status_id ? String(form.status_id) : ""}
                  onValueChange={(v) => {
                    setForm({
                      ...form,
                      status_id: v ? parseInt(v) : undefined,
                    });
                    setErrors((prev) => ({ ...prev, status_id: undefined }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Select</SelectItem>
                    {meta.statuses.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.status_id && (
                  <div className="text-sm text-red-600 mt-1">
                    {errors.status_id}
                  </div>
                )}
              </div>
            </div>

            {/* Reason when status is Overdue */}
            {(() => {
              const selectedStatus = meta.statuses.find(
                (s: any) => String(s.id) === String(form.status_id),
              );
              const isOverdue =
                selectedStatus &&
                String(selectedStatus.name).toLowerCase().includes("overdue");
              return isOverdue ? (
                <div>
                  <Label className="mb-2">Reason for overdue</Label>
                  <Input
                    value={form.reason}
                    onChange={(e) => {
                      setForm({ ...form, reason: e.target.value });
                      setErrors((prev) => ({ ...prev, reason: undefined }));
                    }}
                    placeholder="Describe why this ticket is overdue"
                  />
                  {errors.reason && (
                    <div className="text-sm text-red-600 mt-1">
                      {errors.reason}
                    </div>
                  )}
                </div>
              ) : null;
            })()}

            <div>
              <Label className="mb-2">
                Title<span className="text-red-500 ml-1">*</span>
              </Label>
              <Input
                value={form.subject}
                onChange={(e) => {
                  setForm({ ...form, subject: e.target.value });
                  setErrors((prev) => ({ ...prev, subject: undefined }));
                }}
                placeholder="Brief summary (e.g. 'Login page error')"
              />
              {errors.subject && (
                <div className="text-sm text-red-600 mt-1">
                  {errors.subject}
                </div>
              )}
            </div>

            <div>
              <Label className="mb-2">
                Description<span className="text-red-500 ml-1">*</span>
              </Label>
              <RichTextEditor
                value={form.description}
                onChange={(html) => {
                  setForm({ ...form, description: html });
                  setErrors((prev) => ({ ...prev, description: undefined }));
                }}
                placeholder="Describe the issue in detail... Include steps to reproduce, expected vs actual behavior, and any relevant links."
              />
              {errors.description && (
                <div className="text-sm text-red-600 mt-1">
                  {errors.description}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="mb-2">
                  Priority<span className="text-red-500 ml-1">*</span>
                </Label>
                <Select
                  value={form.priority_id?.toString() || ""}
                  onValueChange={(v) => {
                    setForm({
                      ...form,
                      priority_id: v ? parseInt(v) : undefined,
                    });
                    setErrors((prev) => ({ ...prev, priority_id: undefined }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Select</SelectItem>
                    {meta.priorities.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.priority_id && (
                  <div className="text-sm text-red-600 mt-1">
                    {errors.priority_id}
                  </div>
                )}
              </div>

              <div>
                <Label className="mb-2">
                  Demand (SLA)<span className="text-red-500 ml-1">*</span>
                </Label>
                <Select
                  value={String(form.demand)}
                  onValueChange={(v) => {
                    setForm({ ...form, demand: parseInt(v) });
                    setErrors((prev) => ({ ...prev, demand: undefined }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select demand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Priority 0 — 2 hours</SelectItem>
                    <SelectItem value="1">Priority 1 — 5 hours</SelectItem>
                    <SelectItem value="2">Priority 2 — End of day</SelectItem>
                  </SelectContent>
                </Select>
                {errors.demand && (
                  <div className="text-sm text-red-600 mt-1">
                    {errors.demand}
                  </div>
                )}
                <div className="text-sm text-muted-foreground mt-1">
                  SLA: {computeSlaLabel(form.demand)}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <Label className="mb-2">
                Assignee<span className="text-red-500 ml-1">*</span>
              </Label>
              <Select
                value={form.assigned_to ? String(form.assigned_to) : ""}
                onValueChange={(v) => {
                  setForm({
                    ...form,
                    assigned_to: v ? parseInt(v) : undefined,
                  });
                  setErrors((prev) => ({ ...prev, assigned_to: undefined }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Search and select user" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2 border-b">
                    <Input
                      placeholder="Search users"
                      value={assigneeSearch}
                      onChange={(e) => setAssigneeSearch(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredAssignees.map((user: any) => (
                      <SelectItem key={user.id} value={String(user.id)}>
                        {user.firstname || user.first_name
                          ? `${user.firstname || user.first_name} ${user.lastname || user.last_name}`.trim()
                          : user.name}{" "}
                        {user.email ? `• ${user.email}` : ""}
                      </SelectItem>
                    ))}
                    {filteredAssignees.length === 0 && (
                      <SelectItem value="no-users" disabled>
                        No users found
                      </SelectItem>
                    )}
                  </div>
                </SelectContent>
              </Select>
              {errors.assigned_to && (
                <div className="text-sm text-red-600 mt-1">
                  {errors.assigned_to}
                </div>
              )}
            </div>

            <div>
              <Label className="mb-2">Attachments</Label>
              <div className="border-dashed border-2 border-gray-200 rounded p-4 text-center">
                <input
                  type="file"
                  multiple
                  onChange={(e) =>
                    setAttachments(Array.from(e.target.files || []))
                  }
                />
                <div className="text-sm text-gray-500 mt-2">
                  Drag and drop files here, or click to browse. Max 50MB per
                  file.
                </div>
                {attachments.length > 0 && (
                  <div className="mt-3 text-sm text-left">
                    {attachments.map((f, i) => (
                      <div key={i} className="py-1">
                        {f.name} • {(f.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/tickets")}
              >
                Cancel
              </Button>
              <Button type="button" onClick={submit} disabled={loading}>
                {loading ? "Creating..." : "Create Ticket"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
