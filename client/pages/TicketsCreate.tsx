import React, { useEffect, useState } from "react";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import apiClient from "@/lib/api";

export default function TicketsCreatePage() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<any>({ priorities: [], statuses: [], categories: [] });
  const [form, setForm] = useState<any>({ subject: "", description: "", priority_id: undefined, category_id: undefined, assigned_to: undefined, team_id: undefined, bucket_id: undefined, demand: 0 });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.getTicketMetadata().then(setMeta).catch((e) => console.warn(e));
  }, []);

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
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Create Ticket</h1>
      <div className="grid grid-cols-1 gap-4 max-w-2xl">
        <div>
          <Label>Title</Label>
          <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        </div>
        <div>
          <Label>Description</Label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded p-2 h-32" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>Priority</Label>
            <select value={form.priority_id || ""} onChange={(e) => setForm({ ...form, priority_id: e.target.value ? parseInt(e.target.value) : undefined })} className="w-full border p-2 rounded">
              <option value="">Select</option>
              {meta.priorities.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Category</Label>
            <select value={form.category_id || ""} onChange={(e) => setForm({ ...form, category_id: e.target.value ? parseInt(e.target.value) : undefined })} className="w-full border p-2 rounded">
              <option value="">Select</option>
              {meta.categories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Demand</Label>
            <select value={form.demand} onChange={(e) => setForm({ ...form, demand: parseInt(e.target.value) })} className="w-full border p-2 rounded">
              <option value={0}>Priority 0 (2 hours)</option>
              <option value={1}>Priority 1 (5 hours)</option>
              <option value={2}>Priority 2 (Within day)</option>
            </select>
          </div>
        </div>

        <div>
          <Label>Attachments</Label>
          <input type="file" multiple onChange={(e) => setAttachments(Array.from(e.target.files || []))} />
        </div>

        <div className="flex gap-2">
          <Button onClick={submit} disabled={loading}>Create</Button>
          <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
