import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiClient from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function TicketDetailPage() {
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

  useEffect(() => { load(); }, [id]);

  const postComment = async () => {
    if (!id || !commentText) return;
    try {
      const payload = { content: commentText, is_internal: false, user_id: JSON.parse(localStorage.getItem('banani_user')|| '{}').id };
      const res = await apiClient.addTicketComment(parseInt(id), payload);
      setComments((s) => [...s, res]);
      setCommentText("");
      if (file) {
        await apiClient.uploadTicketAttachment(parseInt(id), file, res.id, payload.user_id);
        setFile(null);
        load();
      }
    } catch (e) {
      console.error(e);
      alert("Failed to post comment");
    }
  };

  if (!ticket) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">{ticket.subject} ({ticket.track_id})</h1>
      <p className="text-sm text-gray-600">Status: {ticket.status?.name} • Priority: {ticket.priority?.name}</p>

      <div className="mt-4 bg-white p-4 rounded shadow">
        <h2 className="font-semibold">Description</h2>
        <div dangerouslySetInnerHTML={{ __html: ticket.description || "" }} />
      </div>

      <div className="mt-4">
        <h2 className="font-semibold">Comments</h2>
        <div className="space-y-3 mt-2">
          {comments.map((c) => (
            <div key={c.id} className="p-3 border rounded">
              <div className="text-sm text-gray-700">{c.user?.name} • {new Date(c.created_at).toLocaleString()}</div>
              <div className="mt-2" dangerouslySetInnerHTML={{ __html: c.content }} />
              {c.attachments && c.attachments.length > 0 && (
                <div className="mt-2">
                  {c.attachments.map((a: any) => (
                    <div key={a.id}><a href={a.file_path} target="_blank" rel="noreferrer">{a.original_filename}</a></div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4">
          <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} className="w-full border rounded p-2 h-24" />
          <div className="flex items-center gap-2 mt-2">
            <input type="file" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} />
            <Button onClick={postComment}>Post Comment</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
