import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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

export default function TicketsCreatePage() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<any>({ priorities: [], statuses: [], categories: [], teams: [], buckets: [], users: [] });
  const [form, setForm] = useState<any>({ subject: "", description: "", priority_id: undefined, category_id: undefined, assigned_to: undefined, team_id: undefined, bucket_id: undefined, status_id: undefined, demand: 0 });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const descriptionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const m = await apiClient.getTicketMetadata();
        // Ensure arrays exist
        const metaObj: any = { priorities: m.priorities || [], statuses: m.statuses || [], categories: m.categories || [], teams: m.teams || [], buckets: m.buckets || [], users: [] };
        // Fetch users list for assignee dropdown
        try {
          const usersResp = await apiClient.request('/users/list/mitra');
          metaObj.users = usersResp || [];
        } catch (uErr) {
          console.warn('Failed to load users for assignee dropdown', uErr);
          metaObj.users = [];
        }
        setMeta(metaObj);
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

  // Rich text editor helper: simple contentEditable implementation
  const RichTextEditor: React.FC<{ value: string; onChange: (html: string) => void }> = ({ value, onChange }) => {
    const ref = React.useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      if (ref.current && value !== ref.current.innerHTML) {
        ref.current.innerHTML = value || "";
      }
    }, [value]);

    const exec = (cmd: string, arg?: string) => {
      document.execCommand(cmd, false, arg as any);
      if (ref.current) onChange(ref.current.innerHTML);
    };

    return (
      <div>
        <div className="flex gap-2 mb-2">
          <button type="button" className="btn" onClick={() => exec('bold')}><strong>B</strong></button>
          <button type="button" className="btn" onClick={() => exec('italic')}><em>I</em></button>
          <button type="button" className="btn" onClick={() => exec('underline')}><u>U</u></button>
          <button type="button" className="btn" onClick={() => exec('insertUnorderedList')}>• List</button>
          <button type="button" className="btn" onClick={() => exec('insertOrderedList')}>1. List</button>
          <button type="button" className="btn" onClick={() => {
            const url = prompt('Enter URL'); if (url) exec('createLink', url);
          }}>Link</button>
        </div>
        <div
          ref={ref}
          contentEditable
          onInput={() => ref.current && onChange(ref.current.innerHTML)}
          className="w-full border rounded p-3 min-h-[140px] prose"
        />
      </div>
    );
  };

  const filteredAssignees = meta.users.filter((u: any) => {
    if (!assigneeSearch) return true;
    const s = assigneeSearch.toLowerCase();
    const name = (u.name || `${u.firstname || u.first_name || ''} ${u.lastname || u.last_name || ''}`).toLowerCase();
    return name.includes(s) || (u.email || '').toLowerCase().includes(s);
  });

  const submit = async () => {
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
            <div>
              <Label className="mb-2">Title</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Brief summary (e.g. 'Login page error')" />
            </div>

            <div>
              <Label className="mb-2">Description</Label>
              {/* Rich text editor */}
              <div>
                <div className="flex gap-2 mb-2">
                  <button type="button" className="px-2 py-1 border rounded" onClick={() => document.execCommand('bold')}><strong>B</strong></button>
                  <button type="button" className="px-2 py-1 border rounded" onClick={() => document.execCommand('italic')}><em>I</em></button>
                  <button type="button" className="px-2 py-1 border rounded" onClick={() => document.execCommand('underline')}><u>U</u></button>
                  <button type="button" className="px-2 py-1 border rounded" onClick={() => document.execCommand('insertUnorderedList')}>• List</button>
                  <button type="button" className="px-2 py-1 border rounded" onClick={() => document.execCommand('insertOrderedList')}>1. List</button>
                  <button type="button" className="px-2 py-1 border rounded" onClick={() => { const url = prompt('Enter URL'); if (url) document.execCommand('createLink', false, url); }}>Link</button>
                </div>
                <div
                  ref={(el) => { (descriptionRef as any).current = el; if (el && form.description && form.description !== el.innerHTML) el.innerHTML = form.description; }}
                  contentEditable
                  onInput={(e:any) => setForm({ ...form, description: e.currentTarget.innerHTML })}
                  className="w-full border rounded p-3 min-h-[140px] prose"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="mb-2">Priority</Label>
                <Select value={form.priority_id?.toString() || ""} onValueChange={(v) => setForm({ ...form, priority_id: v ? parseInt(v) : undefined })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Select</SelectItem>
                    {meta.priorities.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2">Category</Label>
                <Select value={form.category_id?.toString() || ""} onValueChange={(v) => setForm({ ...form, category_id: v ? parseInt(v) : undefined })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Select</SelectItem>
                    {meta.categories.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2">Demand (SLA)</Label>
                <Select value={String(form.demand)} onValueChange={(v) => setForm({ ...form, demand: parseInt(v) })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select demand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Priority 0 — 2 hours</SelectItem>
                    <SelectItem value="1">Priority 1 — 5 hours</SelectItem>
                    <SelectItem value="2">Priority 2 — End of day</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-sm text-muted-foreground mt-1">SLA: {computeSlaLabel(form.demand)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Team and bucket optionally shown if metadata present */}
              {meta.teams && meta.teams.length > 0 && (
                <div>
                  <Label className="mb-2">Team</Label>
                  <Select value={form.team_id ? String(form.team_id) : ""} onValueChange={(v) => setForm({ ...form, team_id: v ? parseInt(v) : undefined })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Select</SelectItem>
                      {meta.teams.map((t: any) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {meta.buckets && meta.buckets.length > 0 && (
                <div>
                  <Label className="mb-2">Bucket</Label>
                  <Select value={form.bucket_id ? String(form.bucket_id) : ""} onValueChange={(v) => setForm({ ...form, bucket_id: v ? parseInt(v) : undefined })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bucket" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Select</SelectItem>
                      {meta.buckets.map((b: any) => (
                        <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="mb-2">Assignee</Label>
                <Input placeholder="Optional assignee (user id)" value={form.assigned_to || ""} onChange={(e) => setForm({ ...form, assigned_to: e.target.value ? parseInt(e.target.value) : undefined })} />
              </div>
            </div>

            <div>
              <Label className="mb-2">Attachments</Label>
              <div className="border-dashed border-2 border-gray-200 rounded p-4 text-center">
                <input type="file" multiple onChange={(e) => setAttachments(Array.from(e.target.files || []))} />
                <div className="text-sm text-gray-500 mt-2">Drag and drop files here, or click to browse. Max 50MB per file.</div>
                {attachments.length > 0 && (
                  <div className="mt-3 text-sm text-left">
                    {attachments.map((f, i) => (
                      <div key={i} className="py-1">{f.name} • {(f.size/1024/1024).toFixed(2)} MB</div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
              <Button onClick={submit} disabled={loading}>{loading ? "Creating..." : "Create Ticket"}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
