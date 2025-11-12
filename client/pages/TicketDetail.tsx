import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import apiClient from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, MessageSquare, Paperclip, ArrowLeft } from "lucide-react";

// Inline styles for email content rendering
const emailBodyStyles = `
  .email-body-content table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    font-size: 0.875rem;
  }
  .email-body-content table tr {
    border-bottom: 1px solid #d1d5db;
  }
  .email-body-content table tr:nth-child(even) {
    background-color: #f9fafb;
  }
  .email-body-content table tr:hover {
    background-color: #f3f4f6;
  }
  .email-body-content table th,
  .email-body-content table td {
    border: 1px solid #d1d5db;
    padding: 0.5rem;
    text-align: left;
  }
  .email-body-content table th {
    background-color: #f3f4f6;
    font-weight: 600;
  }
  .email-body-content p {
    margin: 0.5rem 0;
    line-height: 1.5;
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
`;

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

                  return (
                    <>
                      {/* Email Headers */}
                      {emailHeaders.length > 0 && (
                        <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded text-sm text-gray-700 space-y-1">
                          {emailHeaders.map((line, idx) => (
                            <div key={idx} className="break-words">{line}</div>
                          ))}
                        </div>
                      )}

                      {/* Email Body - Rendered as HTML */}
                      <div className="w-full overflow-x-auto">
                        <div
                          className="text-gray-800 space-y-3 break-words min-w-max
                            [&_table]:border-collapse [&_table]:text-xs [&_table]:my-4 [&_table]:border [&_table]:border-gray-400
                            [&_thead]:bg-gray-200
                            [&_th]:border [&_th]:border-gray-400 [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold [&_th]:bg-gray-200
                            [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1
                            [&_tr]:even:bg-gray-50
                            [&_p]:my-2 [&_p]:leading-relaxed [&_p]:text-gray-800
                            [&_div]:text-gray-800
                            [&_pre]:bg-gray-100 [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:text-xs
                            [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs
                            [&_a]:text-blue-600 [&_a]:underline
                            [&_strong]:font-semibold
                            [&_b]:font-semibold
                            [&_em]:italic
                            [&_i]:italic
                            [&_hr]:my-4 [&_hr]:border-gray-300
                            [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:py-2 [&_blockquote]:my-2 [&_blockquote]:text-gray-600"
                          dangerouslySetInnerHTML={{
                            __html: emailBody.join("\n"),
                          }}
                        />
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
