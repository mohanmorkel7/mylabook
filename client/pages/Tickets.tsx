import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import apiClient from "@/lib/api";
import { formatToISTDateTime } from "@/lib/dateUtils";

export default function TicketsPage() {
  const [filters, setFilters] = useState<any>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [ticketsResp, setTicketsResp] = useState<any>({
    tickets: [],
    total: 0,
    pages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [fallbackInfo, setFallbackInfo] = useState<{mode?: string; status?: string; message?: string} | null>(null);
  const [tab, setTab] = useState<"assignedToMe" | "assignedByMe" | "all">(
    "assignedToMe",
  );
  const [search, setSearch] = useState("");

  const fetchTickets = async () => {
  setLoading(true);

  console.log("working...");

  try {
    const localFilters: any = { ...filters };

    // ✅ Get current user from localStorage
    let currentUser: any = null;
    try {
      const raw = localStorage.getItem("banani_user");
      if (raw) currentUser = JSON.parse(raw);
    } catch (e) {
      console.warn("Failed to parse user data:", e);
    }

    // ✅ Check admin role
    const isAdmin = currentUser?.role?.toLowerCase?.() === "admin";

    

    // ✅ Apply filters based on role & tab
    if (!isAdmin) {
      if (tab === "assignedToMe" && currentUser?.id) {
        localFilters.assigned_to = currentUser.id;
      } else if (tab === "assignedByMe" && currentUser?.id) {
        localFilters.created_by = currentUser.id;
      }
      // 🔹 Non-admin "all" tab could show everything they created or assigned
      else if (tab === "all" && currentUser?.id) {
        localFilters.created_or_assigned_to = currentUser.id;
      }
    } else {
      // ✅ Admin — no filters (see ALL tickets)
      if (tab === "all") {
        Object.keys(localFilters).forEach((key) => delete localFilters[key]);
      }
    }

    // ✅ Apply search
    if (search) localFilters.search = search;

    console.log("[TicketsPage] Filters applied:", localFilters);

    // ✅ Fetch tickets from backend
    // Request a lightweight/simple listing to avoid heavy joins and SLA calculations
    localFilters.simple = "1";
    const resp = await apiClient.getTickets(localFilters, page, limit);
    console.log("[TicketsPage] API response:", resp);
    setTicketsResp(resp);
    // Capture fallback/mode info if server indicates it's returning fallback/mock data
    try {
      const status = resp?.status || resp?.mode || null;
      const message = resp?.message || resp?.msg || null;
      if (status === "fallback" || status === "mock" || resp?.status === "fallback") {
        setFallbackInfo({ mode: resp?.mode, status: resp?.status, message });
      } else {
        setFallbackInfo(null);
      }
    } catch (e) {
      setFallbackInfo(null);
    }
  } catch (err) {
    console.error("Failed to load tickets:", err);
  } finally {
    setLoading(false);
  }
};

// 1️⃣ Run once on mount: set admin tab (if needed) and then fetch tickets
useEffect(() => {

  

  const init = async () => {
    try {
      const raw = localStorage.getItem("banani_user");
      let defaultTab: "assignedToMe" | "assignedByMe" | "all" = "assignedToMe";

      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && String(parsed.role).toLowerCase() === "admin") {
          defaultTab = "all";
        }
      }

      setTab(defaultTab); // this triggers re-render
      // wait until tab state updates before fetching
      await new Promise((r) => setTimeout(r, 0)); 
      fetchTickets(); // ✅ guaranteed to run once on mount
    } catch (e) {
      console.warn("Error reading user from localStorage:", e);
      fetchTickets(); // still call if user not found
    }
  };

  init();
}, []);

// 2️⃣ Re-fetch when filters, page, limit, tab, or search change
useEffect(() => {

  console.log("🔥 First useEffect running");
  
  if (!loading) {
    console.log("[TicketsPage] auto refetch due to state change");
    fetchTickets();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [filters, page, limit, tab, search]);


  return (
    <div className="p-4">
      {fallbackInfo && (
        <div className="mb-4 p-3 rounded bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
          <strong>Notice:</strong>{' '}
          {fallbackInfo.message || "Showing fallback/mock tickets because the server or database is unavailable."}
          {fallbackInfo.mode && <span className="ml-2">(mode: {fallbackInfo.mode})</span>}
        </div>
      )}
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
          <Button
            variant={tab === "assignedToMe" ? "default" : "ghost"}
            onClick={() => {
              setTab("assignedToMe");
              setPage(1);
            }}
          >
            Assigned to me
          </Button>
          <Button
            variant={tab === "assignedByMe" ? "default" : "ghost"}
            onClick={() => {
              setTab("assignedByMe");
              setPage(1);
            }}
          >
            Assigned by me
          </Button>
          {/* Show All tab for admin users */}
          {(() => {
            try {
              const raw = localStorage.getItem("banani_user");
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && String(parsed.role).toLowerCase() === "admin") {
                  return (
                    <Button
                      variant={tab === "all" ? "default" : "ghost"}
                      onClick={() => {
                        setTab("all");
                        setPage(1);
                      }}
                    >
                      All
                    </Button>
                  );
                }
              }
            } catch (e) {
              return null;
            }
            return null;
          })()}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Input
          placeholder="Search tickets"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          onClick={() => {
            setPage(1);
            fetchTickets();
          }}
        >
          Search
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Label>Per page</Label>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value));
              setPage(1);
            }}
            className="border rounded px-2 py-1"
          >
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
            {ticketsResp.tickets && ticketsResp.tickets.length > 0 ? (
              ticketsResp.tickets.map((t: any) => (
                <tr key={t.id} className="border-t">
                  <td className="p-2">{t.track_id}</td>
                  <td className="p-2">
                    <Link to={`/tickets/${t.id}`} className="text-blue-600">
                      {t.subject}
                    </Link>
                  </td>
                  <td className="p-2">{t.priority?.name}</td>
                  <td className="p-2">{t.status?.name}</td>
                  <td className="p-2">{t.assignee?.name || "-"}</td>
                  <td className="p-2">
                    {t.created_at ? formatToISTDateTime(t.created_at) : "-"}
                  </td>
                  <td className="p-2">
                    <Link
                      to={`/tickets/${t.id}`}
                      className="mr-2 text-sm text-blue-600"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="p-4 text-center" colSpan={7}>
                  {loading ? "Loading tickets..." : "No tickets to display"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div>
          Page {page} of {ticketsResp.pages || 1} — Total:{" "}
          {ticketsResp.total || 0}
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            disabled={page >= (ticketsResp.pages || 1)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
