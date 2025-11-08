import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import apiClient from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, MessageSquare, Paperclip } from "lucide-react";

export default function TicketDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    if (!id) return;
    try {
      const t = await apiClient.getTicketById(parseInt(id));
      setTicket(t);
      const c = await apiClient.getTicketComments(parseInt(id));
      setComments(c);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

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
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{
                  __html: ((): string => {
                    try {
                      const raw = ticket.description || "";
                      if (raw.includes("&lt;") || raw.includes("&gt;")) {
                        const parser = new DOMParser();
                        return (
                          parser.parseFromString(raw, "text/html").body
                            .textContent || ""
                        );
                      }
                      return raw;
                    } catch (e) {
                      return ticket.description || "";
                    }
                  })(),
                }}
              />
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
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">Assigned To</div>
                  <div className="font-medium">{assignedName}</div>
                </div>
                <div>
                  <div className="text-gray-500">Status</div>
                  <div className="font-medium">
                    {ticket.status?.name || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Priority</div>
                  <div className="font-medium">
                    {ticket.priority?.name || "-"}
                  </div>
                </div>
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
                <div className="col-span-2">
                  <div className="text-gray-500">Created</div>
                  <div className="font-medium">
                    {new Date(ticket.created_at).toLocaleString()}
                  </div>
                </div>
                {ticket.updated_at && (
                  <div className="col-span-2">
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
