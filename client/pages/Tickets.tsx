import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import apiClient from "@/lib/api";

export default function TicketsPage() {
  const [filters, setFilters] = useState<any>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [ticketsResp, setTicketsResp] = useState<any>({ tickets: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"assignedToMe" | "assignedByMe">("assignedToMe");
  const [search, setSearch] = useState("");

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const localFilters = { ...filters };
      if (tab === "assignedToMe") {
        const raw = localStorage.getItem("banani_user");
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id) localFilters.assigned_to = parsed.id;
          } catch {}
        }
      } else {
        const raw = localStorage.getItem("banani_user");
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id) localFilters.created_by = parsed.id;
          } catch {}
        }
      }
      if (search) localFilters.search = search;
      const resp = await apiClient.getTickets(localFilters, page, limit);
      setTicketsResp(resp);
    } catch (err) {
      console.error("Failed to load tickets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, limit, tab]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Tickets</h1>
        <div className="flex items-center gap-2">
          <Link to="/tickets/create">
            <Button>Create Ticket</Button>
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex gap-2">
          <Button variant={tab === "assignedToMe" ? "default" : "ghost"} onClick={() => { setTab("assignedToMe"); setPage(1); }}>Assigned to me</Button>
          <Button variant={tab === "assignedByMe" ? "default" : "ghost"} onClick={() => { setTab("assignedByMe"); setPage(1); }}>Assigned by me</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Input placeholder="Search tickets" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button onClick={() => { setPage(1); fetchTickets(); }}>Search</Button>
        <div className="ml-auto flex items-center gap-2">
          <Label>Per page</Label>
          <select value={limit} onChange={(e) => { setLimit(parseInt(e.target.value)); setPage(1); }} className="border rounded px-2 py-1">
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr>
              <th className="p-2 text-left">Track</th>
              <th className="p-2 text-left">Title</th>
              <th className="p-2 text-left">Priority</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Assigned To</th>
              <th className="p-2 text-left">Created At</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ticketsResp.tickets.map((t: any) => (
              <tr key={t.id} className="border-t">
                <td className="p-2">{t.track_id}</td>
                <td className="p-2"><Link to={`/tickets/${t.id}`} className="text-blue-600">{t.subject}</Link></td>
                <td className="p-2">{t.priority?.name}</td>
                <td className="p-2">{t.status?.name}</td>
                <td className="p-2">{t.assignee?.name || "-"}</td>
                <td className="p-2">{new Date(t.created_at).toLocaleString()}</td>
                <td className="p-2">
                  <Link to={`/tickets/${t.id}`} className="mr-2 text-sm text-blue-600">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div>
          Page {page} of {ticketsResp.pages || 1} — Total: {ticketsResp.total || 0}
        </div>
        <div className="flex items-center gap-2">
          <Button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
          <Button disabled={page >= (ticketsResp.pages || 1)} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
