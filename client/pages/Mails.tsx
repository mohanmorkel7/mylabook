import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { azureSilentAuth } from "@/lib/azure-silent-auth";
import { azureSyncService } from "@/lib/azure-sync-service";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { textAlign } from "html2canvas/dist/types/css/property-descriptors/text-align";

type GraphEmail = {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  sender?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  webLink?: string;
};

const TARGET_MAIL =
  (import.meta as any).env?.VITE_MS_TARGET_MAIL || "upialerts@mylapay.com";

const SUBJECT_FILTER = (import.meta as any).env?.VITE_MS_SUBJECT_FILTER || "";

function removeCautionFromText(str: string) {
  if (!str) return "";
  // Remove the common caution banner and variations
  let s = str.replace(/CAUTION:\s*/i, "");
  s = s.replace(
    /this email originated from outside of the organization\.[\s\S]*?safe\.?/i,
    "",
  );
  s = s.replace(/(^|\n)\s*caution[:\s\-–—].*?(\n|$)/gi, "");
  // Collapse whitespace
  return s.replace(/\s+/g, " ").trim();
}

function htmlToText(html: string): string {
  try {
    // Decode HTML entities
    const decoder = document.createElement("textarea");
    decoder.innerHTML = html || "";
    const decoded = decoder.value;

    const doc = new DOMParser().parseFromString(decoded || "", "text/html");
    // remove styles/scripts and meta/link tags that may contain CSS or external refs
    doc.querySelectorAll("style,script,meta,link").forEach((el) => el.remove());

    // Remove any elements containing the caution banner
    Array.from(doc.body.querySelectorAll("*")).forEach((el) => {
      const t = (el.textContent || "").toLowerCase();
      if (
        t.includes("caution:") ||
        t.includes("this email originated from outside of the organization") ||
        t.includes("caution")
      ) {
        el.remove();
      }
    });

    const text = doc.body ? doc.body.textContent || "" : "";
    return removeCautionFromText(text);
  } catch (e) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return removeCautionFromText(
      (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim(),
    );
  }
}

// Sanitize HTML for safe rendering in the UI and remove the CAUTION banner
function sanitizeHtml(html: string): string {
  try {
    const decoder = document.createElement("textarea");
    decoder.innerHTML = html || "";
    const decoded = decoder.value;

    const doc = new DOMParser().parseFromString(decoded || "", "text/html");

    // Remove dangerous or noisy elements
    doc
      .querySelectorAll("script,style,meta,link,iframe,object,embed")
      .forEach((el) => el.remove());

    // Remove elements that contain the caution banner
    Array.from(doc.body.querySelectorAll("*")).forEach((el) => {
      const t = (el.textContent || "").toLowerCase();
      if (
        t.includes("caution:") ||
        t.includes("this email originated from outside of the organization") ||
        t.includes("caution")
      ) {
        el.remove();
      }
    });

    // Remove text nodes containing caution
    const walker = document.createTreeWalker(
      doc.body,
      NodeFilter.SHOW_TEXT,
      null,
    );
    const toRemove: Node[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if ((node.nodeValue || "").toLowerCase().includes("caution")) {
        toRemove.push(node);
      }
    }
    toRemove.forEach((n) => n.parentNode?.removeChild(n));

    // Remove event handler attributes and style attributes
    Array.from(doc.body.querySelectorAll("*")).forEach((el) => {
      Array.from(el.attributes || []).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || name === "style") {
          el.removeAttribute(attr.name);
        }
        if (
          name === "href" &&
          attr.value.trim().toLowerCase().startsWith("javascript:")
        ) {
          el.removeAttribute(attr.name);
        }
      });
    });

    let cleaned = doc.body ? doc.body.innerHTML : "";
    cleaned = cleaned.replace(/CAUTION:\s*/gi, "");
    cleaned = cleaned.replace(
      /this email originated from outside of the organization\.[\s\S]*?safe\.?/gi,
      "",
    );
    return cleaned;
  } catch (e) {
    return htmlToText(html);
  }
}

export default function Mails() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emails, setEmails] = useState<GraphEmail[]>([]);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  const targetUser = useMemo(() => encodeURIComponent(TARGET_MAIL), []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        // Handle return from Azure AD if applicable
        await azureSilentAuth.handleAuthReturn();

        // Check if already authenticated
        const isAuth = await azureSilentAuth.isAuthenticated();
        if (!isAuth) {
          // Don't trigger interactive auth automatically; show sign-in CTA
          if (mounted) setNeedsAuth(true);
          return;
        }

        // Authenticated - fetch emails
        const token = await azureSilentAuth.getAccessToken();
        await fetchEmailsWithToken(token, mounted);
      } catch (e: any) {
        if (mounted) setError(e?.message || "Failed to load emails");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, [targetUser]);

  async function fetchEmailsWithToken(token: string, mounted = true) {
    setLoading(true);
    setError(null);
    try {
      // const url =
      //   `https://graph.microsoft.com/v1.0/users/${targetUser}/messages` +
      //   `?$top=25&$orderby=receivedDateTime%20desc&$select=subject,from,body,receivedDateTime`;

      const url=`https://graph.microsoft.com/v1.0/users/reconops@mylapay.com/mailFolders/inbox/messages`;

      // const url=`https://graph.microsoft.com/v1.0/users/support.wavegate@payswiff.com/messages`;

      // const url=`https://graph.microsoft.com/v1.0/users/mohan.m@mylapay.com/mailFolders/inbox/messages`;

      //dcfb7108-ce83-442b-ba56-0e56a1c1583c

      // const url=`https://graph.microsoft.com/v1.0//users/reconops@mylapay.com/mailFolders`

      

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const rawItems: any[] = Array.isArray(data?.value) ? data.value : [];

      // Normalise items into GraphEmail and sanitize previews/bodies to remove caution banners
      const items: GraphEmail[] = rawItems.map((it) => {
        const rawPreview = it.bodyPreview || "";
        const sanitizedPreview = removeCautionFromText(rawPreview);

        // Sanitize full HTML body if present (will also strip CAUTION banners)
        let sanitizedBody = undefined as any;
        if (it.body && it.body.content) {
          try {
            sanitizedBody = {
              contentType: it.body.contentType,
              content: sanitizeHtml(it.body.content),
            };
          } catch (e) {
            sanitizedBody = {
              contentType: it.body.contentType,
              content: removeCautionFromText(it.body.content),
            };
          }
        }

        return {
          id: it.id,
          subject: it.subject,
          from: it.from,
          sender: it.sender,
          body: sanitizedBody,
          bodyPreview: sanitizedPreview,
          receivedDateTime: it.receivedDateTime,
          hasAttachments: it.hasAttachments,
          webLink: it.webLink,
        };
      });

      // Apply optional subject filter if provided; otherwise show all
      const filtered = SUBJECT_FILTER
        ? items.filter((m) =>
            (m.subject || "")
              .toLowerCase()
              .includes(SUBJECT_FILTER.toLowerCase()),
          )
        : items;

      const top10 = filtered.slice(0, 10);
      if (mounted) setEmails(top10);
    } catch (e: any) {
      setError(e?.message || "Failed to load emails");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    setAuthenticating(true);
    setError(null);
    try {
      // Try popup-based authentication first (will fallback to redirect if needed)
      const token = await azureSyncService.getAccessToken(false);
      // If token available, fetch emails
      if (token) {
        setNeedsAuth(false);
        await fetchEmailsWithToken(token);
      }
    } catch (e: any) {
      // If redirect-based auth was initiated, the page will reload - show message briefly
      if (
        e?.message &&
        e.message.includes("Redirect authentication initiated")
      ) {
        setError("Redirecting to Microsoft for authentication...");
        return;
      }
      setError(e?.message || "Authentication failed");
    } finally {
      setAuthenticating(false);
    }
  }

  // Helpers for grouping and formatting
  function formatTime(dateStr?: string) {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }

  function groupEmailsByDay(items: GraphEmail[]) {
    const groups: Record<string, GraphEmail[]> = {};
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    items.forEach((it) => {
      const d = it.receivedDateTime ? new Date(it.receivedDateTime) : null;
      let label = "Unknown";
      if (d) {
        const startOfItem = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
        ).getTime();
        const diffDays = Math.floor((startOfToday - startOfItem) / MS_PER_DAY);
        if (diffDays === 0) label = "Today";
        else if (diffDays === 1) label = "Yesterday";
        else {
          // show Month day, Year if different year
          const opts: any = { month: "short", day: "numeric" };
          if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
          label = d.toLocaleDateString(undefined, opts);
        }
      }

      if (!groups[label]) groups[label] = [];
      groups[label].push(it);
    });

    // Sort groups by date descending: Today, Yesterday, then other dates
    const ordered: Record<string, GraphEmail[]> = {};
    const priority = ["Today", "Yesterday"];
    priority.forEach((p) => {
      if (groups[p]) ordered[p] = groups[p];
    });

    const others = Object.keys(groups)
      .filter((k) => !priority.includes(k))
      .sort((a, b) => {
        // parse date strings back if possible
        const da = new Date(a).getTime() || 0;
        const db = new Date(b).getTime() || 0;
        return db - da;
      });
    others.forEach((k) => (ordered[k] = groups[k]));
    return ordered;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Mails Inbox</h1>
        {/* <p className="text-gray-600 mt-1">
          Showing latest emails for {decodeURIComponent(targetUser)} containing
          "Invoice" in the subject.
        </p> */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest Messages</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-600">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mr-3"></div>
              Loading emails...
            </div>
          ) : needsAuth ? (
            <div className="space-y-3">
              <div className="text-gray-700">
                You need to sign in to Microsoft to view mails.
              </div>
              <div>
                <button
                  onClick={handleSignIn}
                  className="px-4 py-2 bg-primary text-white rounded"
                  disabled={authenticating}
                >
                  {authenticating ? "Signing in..." : "Sign in with Microsoft"}
                </button>
              </div>
              {error && <div className="text-red-600">{error}</div>}
            </div>
          ) : error ? (
            <div className="text-red-600">{error}</div>
          ) : emails.length === 0 ? (
            <div className="text-gray-600">No matching emails found.</div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupEmailsByDay(emails)).map(
                ([groupLabel, groupEmails]) => (
                  <div key={groupLabel}>
                    <div className="flex items-left justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">
                        {groupLabel}
                      </h3>
                      <span className="text-xs text-gray-500">
                        {groupEmails.length}
                      </span>
                    </div>

                    <Accordion
                      type="single"
                      collapsible
                      onValueChange={async (val) => {
                        if (!val) return;
                        try {
                          const existing = emails.find((e) => e.id === val);
                          if (!existing) return;
                          if (existing.body && existing.body.content) return;

                          const token = await azureSilentAuth.getAccessToken();
                          const url = `https://graph.microsoft.com/v1.0/users/${targetUser}/messages/${encodeURIComponent(val)}?$select=body,bodyPreview`;
                          const res = await fetch(url, {
                            headers: {
                              Authorization: `Bearer ${token}`,
                              "Content-Type": "application/json",
                            },
                          });
                          if (!res.ok) return;
                          const data = await res.json();
                          const fullBody = data?.body;
                          setEmails((prev) =>
                            prev.map((it) =>
                              it.id === val
                                ? {
                                    ...it,
                                    body: fullBody,
                                    bodyPreview:
                                      data?.bodyPreview || it.bodyPreview,
                                  }
                                : it,
                            ),
                          );
                        } catch (e) {
                          // ignore
                        }
                      }}
                    >
                      {groupEmails.map((m) => {
                        const sender =
                          m.from?.emailAddress || m.sender?.emailAddress;
                        const preview = m.bodyPreview || "";
                        const contentType = m.body?.contentType || "text";
                        const rawContent = m.body?.content || "";
                        let bodyText = preview
                          ? preview
                          : contentType.toLowerCase() === "html"
                            ? htmlToText(rawContent)
                            : rawContent;
                        bodyText = (bodyText || "").replace(/\s+/g, " ").trim();

                        return (
                          <AccordionItem key={m.id} value={m.id}>
                            <AccordionTrigger className="px-3">
                              <div className="flex items-start justify-between w-full">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start gap-3">
                                    <div className="flex-1" style={{textAlign:"left"}}>
                                      <div className="text-sm font-medium text-gray-900 truncate">
                                        {m.subject || "(No subject)"}
                                      </div>
                                      <div className="text-xs text-gray-500 truncate">
                                        From:{" "}
                                        {sender?.name ||
                                          sender?.address ||
                                          "Unknown"}
                                      </div>
                                    </div>
                                    <div className="text-xs text-gray-400 ml-3 whitespace-nowrap">
                                      {formatTime(m.receivedDateTime)}
                                    </div>
                                  </div>
                                  <div className="mt-2 text-sm text-gray-700 line-clamp-2 text-left">
                                    {bodyText}
                                  </div>
                                </div>
                              </div>
                            </AccordionTrigger>

                            <AccordionContent className="px-3">
                              <div className="prose max-w-none text-sm text-gray-800">
                                <div className="mb-3 text-xs text-gray-500">
                                  From:{" "}
                                  {sender?.name || sender?.address || "Unknown"}{" "}
                                  •{" "}
                                  {m.receivedDateTime
                                    ? new Date(
                                        m.receivedDateTime,
                                      ).toLocaleString()
                                    : ""}
                                </div>
                                <div className="whitespace-pre-wrap break-words text-left">
                                  {m.body && m.body.content ? (
                                    // Render sanitized HTML when full body is available
                                    <div
                                      className="prose max-w-none"
                                      dangerouslySetInnerHTML={{
                                        __html: sanitizeHtml(m.body.content),
                                      }}
                                    />
                                  ) : (
                                    <div>{m.bodyPreview || bodyText}</div>
                                  )}
                                </div>
                                {m.webLink && (
                                  <div className="mt-3">
                                    <a
                                      href={m.webLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-sm text-primary underline"
                                    >
                                      Open in Outlook
                                    </a>
                                  </div>
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </div>
                ),
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
