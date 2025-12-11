import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Eye,
  Clock,
  AlertTriangle,
  CheckCircle,
  Users,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

// Notification icon mapping
const getNotificationIcon = (type: string) => {
  switch (type) {
    case "overdue":
    case "sla_alert":
      return AlertTriangle;
    case "followup":
    case "task_assigned":
      return Users;
    case "missed-eta":
    case "delay_reported":
      return Clock;
    case "completed":
    case "task_completed":
      return CheckCircle;
    default:
      return Eye;
  }
};

const getNotificationColor = (type: string, priority: string) => {
  if (priority === "high") {
    return "text-red-600 bg-red-50";
  }
  switch (type) {
    case "overdue":
    case "sla_alert":
      return "text-red-600 bg-red-50";
    case "followup":
    case "task_assigned":
      return "text-blue-600 bg-blue-50";
    case "missed-eta":
    case "delay_reported":
      return "text-yellow-600 bg-yellow-50";
    case "completed":
    case "task_completed":
      return "text-green-600 bg-green-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
};

export default function AlertsNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const { toast } = useToast();

  // Fetch notifications
  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ["notifications", user?.id, activeTab],
    queryFn: () => {
      const params = new URLSearchParams();
      if (user?.id) params.append("user_id", user.id);
      if (activeTab !== "all") {
        if (activeTab === "unread") params.append("read", "false");
        else params.append("type", activeTab);
      }
      return apiClient.request(`/notifications?${params.toString()}`);
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const notifications = notificationsData?.notifications || [];
  const unreadCount = notificationsData?.unread_count || 0;

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      apiClient.request(`/notifications/${notificationId}/read`, {
        method: "PUT",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: () =>
      apiClient.request("/notifications/read-all", {
        method: "PUT",
        body: JSON.stringify({ user_id: user?.id }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleMarkAsRead = (id: string) => {
    markAsReadMutation.mutate(id);
  };

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  const triggerSLAMutation = useMutation({
    mutationFn: () => apiClient.triggerFinOpsSLACheck(),
    onSuccess: async () => {
      toast({ title: "SLA check triggered", description: "FinOps SLA check started" });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });

      // Try to show a native system notification when running inside Electron (Windows)
      try {
        const title = "SLA check triggered";
        const body = "FinOps SLA check started";
        const notifyOpts = { title, body, silent: false };
        // Electron preload API (exposed via contextBridge) - main process will show native notification
        if ((window as any).electronAPI && typeof (window as any).electronAPI.notify === "function") {
          try {
            await (window as any).electronAPI.notify(notifyOpts);
          } catch (e) {
            // ignore notification errors
          }
        } else if ("Notification" in window) {
          // Fallback to browser Notification API (not native Windows toast)
          try {
            if (Notification.permission === "granted") {
              new Notification(title, { body });
            } else if (Notification.permission !== "denied") {
              const perm = await Notification.requestPermission();
              if (perm === "granted") new Notification(title, { body });
            }
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      }
    },
    onError: (err: any) => {
      toast({ title: "Failed to trigger SLA check", description: String(err) });
    },
  });

  const handleTriggerSLA = () => {
    triggerSLAMutation.mutate();
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Alerts & Notifications
          </h1>
          <p className="text-gray-600 mt-1">
            Stay updated with important events and tasks
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleTriggerSLA}
            disabled={triggerSLAMutation.isLoading}
            variant="secondary"
          >
            {triggerSLAMutation.isLoading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Trigger SLA Check
          </Button>
          <Button
            onClick={handleMarkAllAsRead}
            disabled={markAllAsReadMutation.isPending || unreadCount === 0}
            variant="outline"
          >
            {markAllAsReadMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Mark All Read
          </Button>
          <Badge variant="secondary">{unreadCount} unread</Badge>
        </div>
      </div>

      {/* Notification Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="follow-ups">Follow-ups</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin" />
                <p>Loading notifications...</p>
              </CardContent>
            </Card>
          ) : notifications.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No Notifications
                </h3>
                <p className="text-gray-600">
                  {activeTab === "unread"
                    ? "You're all caught up!"
                    : `No ${activeTab} notifications found.`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {notifications.map((notification: any) => {
                const Icon = getNotificationIcon(notification.type);
                const colorClasses = getNotificationColor(
                  notification.type,
                  notification.priority,
                );
                const isRead = notification.read;

                return (
                  <Card
                    key={notification.id}
                    className={`transition-all duration-200 ${
                      isRead ? "opacity-75" : "border-l-4 border-l-blue-500"
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start space-x-4">
                        <div
                          className={`p-2 rounded-full ${colorClasses.split(" ")[1]}`}
                        >
                          <Icon
                            className={`w-5 h-5 ${colorClasses.split(" ")[0]}`}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-900">
                                {notification.title}
                              </h4>
                              <p className="text-gray-600 mt-1">
                                {notification.description}
                              </p>
                              <div className="flex items-center gap-4 mt-2">
                                <span className="text-sm text-gray-500">
                                  {format(
                                    new Date(notification.created_at),
                                    "MMM d, h:mm a",
                                  )}
                                </span>
                                <Badge variant="outline">
                                  {notification.type}
                                </Badge>
                                {notification.priority === "high" && (
                                  <Badge variant="destructive">
                                    High Priority
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {!isRead && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleMarkAsRead(notification.id)
                                  }
                                  disabled={markAsReadMutation.isPending}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              )}
                              {notification.action_url && (
                                <Button variant="outline" size="sm">
                                  View Details
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
