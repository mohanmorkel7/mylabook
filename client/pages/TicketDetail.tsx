import React, { useEffect, useState, useLayoutEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import apiClient from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Edit,
  MessageSquare,
  Paperclip,
  ArrowLeft,
  X,
  Check,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronsUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

// Inline styles for email content rendering
const emailBodyStyles = `
  .email-body-content {
    line-height: 1.6;
    color: #374151;
  }
  .email-body-content table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5rem 0;
    font-size: 0.875rem;
    background-color: #ffffff;
    border: 1px solid #d1d5db;
  }
  .email-body-content table thead {
    background-color: #f3f4f6;
  }
  .email-body-content table tbody tr {
    border-bottom: 1px solid #e5e7eb;
  }
  .email-body-content table tbody tr:nth-child(even) {
    background-color: #f9fafb;
  }
  .email-body-content table tbody tr:hover {
    background-color: #f3f4f6;
  }
  .email-body-content table th {
    border: 1px solid #d1d5db;
    padding: 0.75rem;
    text-align: left;
    font-weight: 600;
    background-color: #f3f4f6;
  }
  .email-body-content table td {
    border: 1px solid #d1d5db;
    padding: 0.75rem;
    text-align: left;
  }
  .email-body-content p {
    margin: 0.75rem 0;
    line-height: 1.6;
  }
  .email-body-content a {
    color: #2563eb;
    text-decoration: underline;
  }
  .email-body-content strong, .email-body-content b {
    font-weight: 600;
  }
  .email-body-content em, .email-body-content i {
    font-style: italic;
  }
  .email-body-content hr {
    margin: 1rem 0;
    border: none;
    border-top: 1px solid #e5e7eb;
  }
  .email-body-content blockquote {
    border-left: 4px solid #d1d5db;
    padding-left: 1rem;
    margin-left: 0;
    color: #6b7280;
  }
  .email-body-content pre {
    background-color: #f3f4f6;
    padding: 1rem;
    border-radius: 0.375rem;
    overflow-x: auto;
    font-size: 0.875rem;
  }
  .email-body-content code {
    background-color: #f3f4f6;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-family: monospace;
    font-size: 0.875rem;
  }
  .email-body-content pre code {
    background-color: transparent;
    padding: 0;
  }
  .email-body-content img {
    max-width: 100%;
    height: auto;
    margin: 1rem 0;
    border-radius: 0.375rem;
    display: block;
  }
  .email-body-content h1 {
    font-size: 1.875rem;
    font-weight: 700;
    margin: 1.5rem 0 1rem 0;
  }
  .email-body-content h2 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 1.25rem 0 0.75rem 0;
  }
  .email-body-content h3 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 1rem 0 0.5rem 0;
  }
  .email-body-content h4,
  .email-body-content h5,
  .email-body-content h6 {
    font-weight: 600;
    margin: 0.75rem 0 0.5rem 0;
  }
  .email-body-content ul,
  .email-body-content ol {
    margin: 1rem 0;
    padding-left: 2rem;
  }
  .email-body-content li {
    margin: 0.5rem 0;
  }
  .email-body-content div {
    margin: 0.5rem 0;
  }
  .email-body-content span {
    display: inline;
  }
`;

interface User {
  id: number;
  name?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
}

interface TicketStatus {
  id: number;
  name: string;
  color: string;
  is_closed: boolean;
  sort_order: number;
}

export default function TicketDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editData, setEditData] = useState({
    status_id: null,
    assigned_to_id: null,
    watcher_user_ids: [],
  });
  const [users, setUsers] = useState<User[]>([]);
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [openWatchers, setOpenWatchers] = useState(false);
  const [searchWatchers, setSearchWatchers] = useState("");
  const [openAssignedTo, setOpenAssignedTo] = useState(false);
  const [searchAssignedTo, setSearchAssignedTo] = useState("");

  const fetchUsers = async () => {
    try {
      const resp = await api.get("/users");

      // Normalize different possible response shapes. api.get returns parsed JSON.
      let usersList: any[] = [];
      if (Array.isArray(resp)) {
        usersList = resp as any[];
      } else if (resp && Array.isArray((resp as any).users)) {
        usersList = (resp as any).users;
      } else if (resp && Array.isArray((resp as any).data)) {
        usersList = (resp as any).data;
      } else if (resp && Array.isArray((resp as any).result)) {
        usersList = (resp as any).result;
      } else if (resp && typeof resp === "object") {
        // Fallback: collect object values that look like user objects
        usersList = Object.values(resp).filter(
          (v) => v && typeof v === "object",
        );
      }

      const normalized = (usersList as any[]).map((u) => {
        const fullName =
          `${u.firstname || u.first_name || u.firstName || ""} ${u.lastname || u.last_name || u.lastName || ""}`.trim();
        return {
          id: Number(u.id),
          name: u.name ?? (fullName || u.email),
          firstname: u.firstname || u.first_name || u.firstName,
          lastname: u.lastname || u.last_name || u.lastName,
          email: u.email,
        };
      });
      setUsers(normalized);
    } catch (e) {
      console.error("Error fetching users:", e);
    }
  };

  const fetchStatuses = async () => {
    try {
      const meta = await api.get("/tickets/metadata");
      if (meta && meta.statuses) {
        setStatuses(meta.statuses);
      }
    } catch (e) {
      console.error("Error fetching statuses:", e);
    }
  };

  const load = async () => {
    if (!id) return;
    try {
      const t = await apiClient.getTicketById(parseInt(id));
      setTicket(t);
      setEditData({
        status_id: t.status_id,
        assigned_to_id: t.assigned_to,
        watcher_user_ids: t.watchers || [],
      });
      const c = await apiClient.getTicketComments(parseInt(id));
      setComments(c);
    } catch (e) {
      console.error(e);
    }
  };

  const saveChanges = async () => {
    if (!ticket) return;
    try {
      setIsSaving(true);
      const updateData: any = {};
      if (editData.status_id !== ticket.status_id) {
        updateData.status_id = editData.status_id;
      }
      if (editData.assigned_to_id !== ticket.assigned_to) {
        updateData.assigned_to = editData.assigned_to_id;
      }
      if (editData.watcher_user_ids.length > 0) {
        updateData.watchers = editData.watcher_user_ids;
      }

      if (Object.keys(updateData).length === 0) {
        setIsEditingDetails(false);
        return;
      }

      await api.put(`/tickets/${ticket.id}`, updateData);
      toast({
        title: "Success",
        description: "Ticket updated successfully",
      });
      setIsEditingDetails(false);
      load();
    } catch (e) {
      console.error("Error saving ticket:", e);
      toast({
        title: "Error",
        description: "Failed to update ticket",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Inject email body styles (must be before any early returns)
  useLayoutEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.textContent = emailBodyStyles;
    document.head.appendChild(styleEl);
    return () => styleEl.remove();
  }, []);

  useEffect(() => {
    load();
    fetchUsers();
    fetchStatuses();
  }, [id]);

  // Clear search input when popovers open so stale filters don't hide users
  useEffect(() => {
    if (openAssignedTo) setSearchAssignedTo("");
  }, [openAssignedTo]);

  useEffect(() => {
    if (openWatchers) setSearchWatchers("");
  }, [openWatchers]);

  const postComment = async () => {
    if (!id || !commentText) return;
    try {
      const payload = {
        content: commentText,
        is_internal: false,
        user_id: JSON.parse(localStorage.getItem("banani_user") || "{}").id,
      };
      const res = await apiClient.addTicketComment(parseInt(id), payload);
      setComments((s) => [...s, res]);
      setCommentText("");
      if (file) {
        await apiClient.uploadTicketAttachment(
          parseInt(id),
          file,
          res.id,
          payload.user_id,
        );
        setFile(null);
        load();
      }
    } catch (e) {
      console.error(e);
      alert("Failed to post comment");
    }
  };

  if (!ticket) return <div className="p-6">Loading...</div>;

  const assignedName =
    ticket.assignee?.name ||
    ticket.assigned_to?.name ||
    ticket.assigned_to_name ||
    ticket.assigned_to ||
    "Unassigned";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">{ticket.subject}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <Badge variant="secondary">
              {ticket.track_id || `TKT-${String(ticket.id).padStart(4, "0")}`}
            </Badge>
            {ticket.status?.name && (
              <Badge variant="outline">{ticket.status.name}</Badge>
            )}
            {ticket.priority?.name && (
              <Badge className="bg-orange-100 text-orange-800">
                {ticket.priority.name}
              </Badge>
            )}
            <span>Created {new Date(ticket.created_at).toLocaleString()}</span>
            {ticket.updated_at && (
              <span>
                • Updated {new Date(ticket.updated_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate("/tickets")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Tickets
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/tickets/${ticket.id}/edit`)}
          >
            <Edit className="w-4 h-4 mr-2" /> Edit
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Description and Comments */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(() => {
                  const raw = ticket.description || "";
                  const lines = raw.split("\n");

                  // Extract email header info (lines before "---")
                  const separatorIndex = lines.findIndex((line) =>
                    line.trim().startsWith("---"),
                  );
                  let emailHeaderLines: string[] = [];
                  let emailBody: string[] = [];

                  if (separatorIndex > -1) {
                    emailHeaderLines = lines.slice(0, separatorIndex);
                    emailBody = lines.slice(separatorIndex + 1);
                  } else {
                    emailBody = lines;
                  }

                  // Process headers to hide long Email ID
                  const emailHeaders = emailHeaderLines.map((line) => {
                    if (line.includes("Email ID:")) {
                      return "Email ID: [Message ID]";
                    }
                    return line;
                  });

                  // Check if body looks like plain text table (contains numbers and field names without HTML)
                  const bodyText = emailBody.join("\n");
                  const hasHTMLTags = /<[^>]+>/.test(bodyText);
                  const looksLikeTableData =
                    !hasHTMLTags &&
                    /[A-Z][a-z]*\s+[A-Z][a-z]*|Count|Amount|Network|Visa|MasterCard|RuPay|0{3,}/i.test(
                      bodyText,
                    );

                  return (
                    <>
                      {/* Email Headers */}
                      {emailHeaders.length > 0 && (
                        <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded text-sm text-gray-700 space-y-1">
                          {emailHeaders.map((line, idx) => (
                            <div key={idx} className="break-words">
                              {line}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Email Body - Rendered as HTML or Plain Text */}
                      <div className="w-full overflow-x-auto">
                        {looksLikeTableData ? (
                          // Plain text table data - display as preformatted text with monospace font
                          <pre className="bg-gray-50 border border-gray-300 rounded p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap break-words">
                            <code>{bodyText}</code>
                          </pre>
                        ) : (
                          // HTML content - render with rich formatting
                          <div
                            className="email-body-content text-gray-800 break-words"
                            dangerouslySetInnerHTML={{
                              __html: bodyText,
                            }}
                          />
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" /> Comments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {comments.map((c) => (
                  <div key={c.id} className="p-4 border rounded-lg bg-white">
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <div className="font-medium">
                        {c.user?.name || "User"}
                      </div>
                      <div>{new Date(c.created_at).toLocaleString()}</div>
                    </div>
                    <div
                      className="mt-2 text-gray-900"
                      dangerouslySetInnerHTML={{ __html: c.content }}
                    />
                    {c.attachments && c.attachments.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-3 text-sm">
                        {c.attachments.map((a: any) => (
                          <a
                            key={a.id}
                            href={a.file_path}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-gray-50"
                          >
                            <Paperclip className="w-4 h-4" />{" "}
                            {a.original_filename}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Add Comment */}
                <div className="p-4 border rounded-lg bg-gray-50">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="w-full border rounded p-2 h-24"
                    placeholder="Write a comment..."
                  />
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="file"
                      onChange={(e) =>
                        setFile(e.target.files ? e.target.files[0] : null)
                      }
                    />
                    <Button onClick={postComment}>Post Comment</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Details */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Details</CardTitle>
              {!isEditingDetails ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingDetails(true)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingDetails(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  <Button size="sm" onClick={saveChanges} disabled={isSaving}>
                    <Check className="w-4 h-4 mr-1" />{" "}
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                {/* Status */}
                <div>
                  <div className="text-gray-500 mb-1">Status</div>
                  {isEditingDetails ? (
                    <Select
                      value={String(editData.status_id || "")}
                      onValueChange={(v) =>
                        setEditData({
                          ...editData,
                          status_id: parseInt(v),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="font-medium">
                      {ticket.status?.name || "-"}
                    </div>
                  )}
                </div>

                {/* Assigned To */}
                <div>
                  <div className="text-gray-500 mb-1">Assigned To</div>
                  {isEditingDetails ? (
                    <Popover
                      open={openAssignedTo}
                      onOpenChange={setOpenAssignedTo}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between"
                        >
                          {editData.assigned_to_id
                            ? users.find(
                                (u) => u.id === editData.assigned_to_id,
                              )?.name || "Unknown"
                            : "Select user..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput
                            placeholder="Search users..."
                            value={searchAssignedTo}
                            onValueChange={setSearchAssignedTo}
                          />
                          <CommandEmpty>No user found.</CommandEmpty>
                          <CommandList className="max-h-64">
                            <CommandGroup>
                              {users
                                .filter((user) => {
                                  const displayName =
                                    user.name || `${user.firstname || ''} ${user.lastname || ''}`.trim();
                                  const q = searchAssignedTo.toLowerCase();
                                  return (
                                    displayName.toLowerCase().includes(q) ||
                                    (user.email || '').toLowerCase().includes(q)
                                  );
                                })
                                .map((user) => (
                                  <CommandItem
                                    key={user.id}
                                    onSelect={() => {
                                      setEditData({
                                        ...editData,
                                        assigned_to_id: user.id,
                                      });
                                      setOpenAssignedTo(false);
                                      setSearchAssignedTo("");
                                    }}
                                  >
                                    <Check
                                      className={`mr-2 h-4 w-4 ${
                                        editData.assigned_to_id === user.id
                                          ? "opacity-100"
                                          : "opacity-0"
                                      }`}
                                    />
                                    {user.name || user.email || `${user.firstname || ''} ${user.lastname || ''}`}
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <div className="font-medium">{assignedName}</div>
                  )}
                </div>

                {/* Watchers */}
                {isEditingDetails && (
                  <div>
                    <div className="text-gray-500 mb-1">
                      Watchers (Optional)
                    </div>
                    <Popover open={openWatchers} onOpenChange={setOpenWatchers}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between"
                        >
                          {editData.watcher_user_ids.length > 0
                            ? `${editData.watcher_user_ids.length} selected`
                            : "Select watchers..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput
                            placeholder="Search watchers..."
                            value={searchWatchers}
                            onValueChange={setSearchWatchers}
                          />
                          <CommandEmpty>No user found.</CommandEmpty>
                          <CommandList className="max-h-64">
                            <CommandGroup>
                              {users
                                .filter((user) => {
                                  const displayName =
                                    user.name || `${user.firstname || ''} ${user.lastname || ''}`.trim();
                                  const q = searchWatchers.toLowerCase();
                                  return (
                                    displayName.toLowerCase().includes(q) ||
                                    (user.email || '').toLowerCase().includes(q)
                                  );
                                })
                                .map((user) => (
                                  <CommandItem
                                    key={user.id}
                                    onSelect={() => {
                                      const isSelected =
                                        editData.watcher_user_ids.includes(
                                          user.id,
                                        );
                                      const newWatchers = isSelected
                                        ? editData.watcher_user_ids.filter(
                                            (w) => w !== user.id,
                                          )
                                        : [
                                            ...editData.watcher_user_ids,
                                            user.id,
                                          ];
                                      setEditData({
                                        ...editData,
                                        watcher_user_ids: newWatchers,
                                      });
                                    }}
                                  >
                                    <Check
                                      className={`mr-2 h-4 w-4 ${
                                        editData.watcher_user_ids.includes(
                                          user.id,
                                        )
                                          ? "opacity-100"
                                          : "opacity-0"
                                      }`}
                                    />
                                    {user.name || user.email || `${user.firstname || ''} ${user.lastname || ''}`}
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    {/* Display selected watchers */}
                    {editData.watcher_user_ids.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {editData.watcher_user_ids.map((watcherId) => {
                          const watcher = users.find((u) => u.id === watcherId);
                          return (
                            <div
                              key={watcherId}
                              className="bg-primary/10 text-primary px-2 py-1 rounded text-xs flex items-center gap-1"
                            >
                              {watcher?.name || "Unknown"}
                              <X
                                className="h-3 w-3 cursor-pointer"
                                onClick={() =>
                                  setEditData({
                                    ...editData,
                                    watcher_user_ids:
                                      editData.watcher_user_ids.filter(
                                        (w) => w !== watcherId,
                                      ),
                                  })
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Priority */}
                <div>
                  <div className="text-gray-500">Priority</div>
                  <div className="font-medium">
                    {ticket.priority?.name || "-"}
                  </div>
                </div>

                {/* Track ID */}
                <div>
                  <div className="text-gray-500">Track ID</div>
                  <div className="font-medium">
                    {ticket.track_id ||
                      `TKT-${String(ticket.id).padStart(4, "0")}`}
                  </div>
                </div>

                {ticket.team?.name && (
                  <div>
                    <div className="text-gray-500">Team</div>
                    <div className="font-medium">{ticket.team.name}</div>
                  </div>
                )}

                {ticket.bucket?.name && (
                  <div>
                    <div className="text-gray-500">Bucket</div>
                    <div className="font-medium">{ticket.bucket.name}</div>
                  </div>
                )}

                {/* Created */}
                <div>
                  <div className="text-gray-500">Created</div>
                  <div className="font-medium">
                    {new Date(ticket.created_at).toLocaleString()}
                  </div>
                </div>

                {ticket.updated_at && (
                  <div>
                    <div className="text-gray-500">Last Updated</div>
                    <div className="font-medium">
                      {new Date(ticket.updated_at).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
