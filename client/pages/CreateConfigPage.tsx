import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { Check, ChevronsUpDown, X, Plus, Trash2, CheckCircle } from "lucide-react";

interface User {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
}

interface EmailRule {
  id: string;
  fieldType: "From" | "To" | "Cc" | "Subject" | "Body";
  operator?: "Starts with" | "Contains" | "Ends with" | "domain";
  value: string;
  domain?: string;
  nextOperator: "AND" | "OR" | "END";
}

interface SourceConfig {
  id: string;
  type: "Email" | "Slack";
  emailSource?: string;
  customEmailSource?: string;
  slackType?: "Channel" | "Workspace";
  slackName?: string;
  emailRules?: EmailRule[];
}

interface CreateConfigForm {
  configName: string;
  description: string;
  team: string;
  sources: SourceConfig[];
  assignedTo: number | null;
  watchers: number[];
  prioritySla: string;
}

const TEAMS = ["FinOps", "Product", "Sales"];
const EMAIL_SOURCES = [
  "reconops@mindeed.in",
  "wavegate@pauswiff.com",
  "custom",
];
const DOMAINS = [
  "@razorpay.com",
  "@payswiff.com",
  "@camspay.com",
  "custom",
];
const FIELD_TYPES = ["From", "To", "Cc", "Subject", "Body"];
const OPERATORS = {
  From: ["domain"],
  To: ["domain"],
  Cc: ["domain"],
  Subject: ["Starts with", "Contains", "Ends with"],
  Body: ["Starts with", "Contains", "Ends with"],
};
const SLACK_TYPES = ["Channel", "Workspace"];
const PRIORITY_SLAS = ["2 Hours", "5 Hours", "24 Hours"];

export default function CreateConfigPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [searchAssignee, setSearchAssignee] = useState("");
  const [searchWatchers, setSearchWatchers] = useState("");
  const [openAssignee, setOpenAssignee] = useState(false);
  const [openWatchers, setOpenWatchers] = useState(false);

  const [form, setForm] = useState<CreateConfigForm>({
    configName: "",
    description: "",
    team: "",
    sources: [],
    assignedTo: null,
    watchers: [],
    prioritySla: "",
  });

  const [customEmailSources, setCustomEmailSources] = useState<string[]>([]);
  const [customDomains, setCustomDomains] = useState<string[]>([]);
  const [tempCustomEmailSource, setTempCustomEmailSource] = useState("");
  const [tempCustomDomain, setTempCustomDomain] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const resp = await api.get("/users");
      const list = (resp && (resp.users || resp.data || resp)) || [];
      if (Array.isArray(list) && list.length > 0) {
        setUsers(list as User[]);
      }
    } catch (e) {
      console.warn("Failed to fetch users", e);
    }
  };

  const getUserName = (user?: User): string => {
    if (!user) return "";
    if (user?.name) return user.name.trim();
    if (user.firstname || user.lastname)
      return `${user.firstname || ""} ${user.lastname || ""}`.trim();
    if ((user as any).first_name || (user as any).last_name)
      return `${(user as any).first_name || ""} ${(user as any).last_name || ""}`.trim();
    return "Unknown";
  };

  const addSource = () => {
    const newSource: SourceConfig = {
      id: `source-${Date.now()}`,
      type: "Email",
      emailSource: "",
      emailRules: [
        {
          id: `rule-${Date.now()}`,
          fieldType: "From",
          operator: "domain",
          value: "",
          domain: "",
          nextOperator: "END",
        },
      ],
    };
    setForm({ ...form, sources: [...form.sources, newSource] });
  };

  const removeSource = (sourceId: string) => {
    setForm({
      ...form,
      sources: form.sources.filter((s) => s.id !== sourceId),
    });
  };

  const updateSource = (sourceId: string, updates: Partial<SourceConfig>) => {
    setForm({
      ...form,
      sources: form.sources.map((s) =>
        s.id === sourceId ? { ...s, ...updates } : s
      ),
    });
  };

  const addEmailRule = (sourceId: string) => {
    setForm({
      ...form,
      sources: form.sources.map((s) => {
        if (s.id === sourceId && s.emailRules) {
          const lastRule = s.emailRules[s.emailRules.length - 1];
          lastRule.nextOperator = "AND";
          const newRule: EmailRule = {
            id: `rule-${Date.now()}`,
            fieldType: "From",
            operator: "domain",
            value: "",
            domain: "",
            nextOperator: "END",
          };
          return { ...s, emailRules: [...s.emailRules, newRule] };
        }
        return s;
      }),
    });
  };

  const removeEmailRule = (sourceId: string, ruleId: string) => {
    setForm({
      ...form,
      sources: form.sources.map((s) => {
        if (s.id === sourceId && s.emailRules) {
          const filtered = s.emailRules.filter((r) => r.id !== ruleId);
          if (filtered.length > 0) {
            filtered[filtered.length - 1].nextOperator = "END";
          }
          return { ...s, emailRules: filtered };
        }
        return s;
      }),
    });
  };

  const updateEmailRule = (
    sourceId: string,
    ruleId: string,
    updates: Partial<EmailRule>
  ) => {
    setForm({
      ...form,
      sources: form.sources.map((s) => {
        if (s.id === sourceId && s.emailRules) {
          return {
            ...s,
            emailRules: s.emailRules.map((r) =>
              r.id === ruleId ? { ...r, ...updates } : r
            ),
          };
        }
        return s;
      }),
    });
  };

  const addCustomEmailSource = () => {
    if (tempCustomEmailSource.trim()) {
      setCustomEmailSources([...customEmailSources, tempCustomEmailSource.trim()]);
      setTempCustomEmailSource("");
    }
  };

  const addCustomDomain = () => {
    if (tempCustomDomain.trim()) {
      setCustomDomains([...customDomains, tempCustomDomain.trim()]);
      setTempCustomDomain("");
    }
  };

  const handleAssigneeSelect = (userId: number) => {
    setForm({ ...form, assignedTo: userId });
    setOpenAssignee(false);
  };

  const handleWatcherToggle = (userId: number) => {
    const newWatchers = form.watchers.includes(userId)
      ? form.watchers.filter((id) => id !== userId)
      : [...form.watchers, userId];
    setForm({ ...form, watchers: newWatchers });
  };

  const filteredUsers = users.filter((u) =>
    getUserName(u).toLowerCase().includes(searchAssignee.toLowerCase())
  );

  const filteredWatchers = users.filter((u) =>
    getUserName(u).toLowerCase().includes(searchWatchers.toLowerCase())
  );

  const assignedUser = users.find((u) => u.id === form.assignedTo);
  const selectedWatchers = users.filter((u) => form.watchers.includes(u.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate required fields
      if (!form.configName.trim()) {
        toast({
          title: "Validation Error",
          description: "Config Name is required",
          variant: "destructive",
        });
        return;
      }

      if (!form.team) {
        toast({
          title: "Validation Error",
          description: "Team is required",
          variant: "destructive",
        });
        return;
      }

      if (form.sources.length === 0) {
        toast({
          title: "Validation Error",
          description: "At least one source is required",
          variant: "destructive",
        });
        return;
      }

      if (!form.assignedTo) {
        toast({
          title: "Validation Error",
          description: "Assigned To is required",
          variant: "destructive",
        });
        return;
      }

      if (!form.prioritySla) {
        toast({
          title: "Validation Error",
          description: "Priority SLA is required",
          variant: "destructive",
        });
        return;
      }

      // Validate email rules
      for (const source of form.sources) {
        if (source.type === "Email" && source.emailRules) {
          if (source.emailRules.length === 0) {
            toast({
              title: "Validation Error",
              description: "At least one email rule is required per email source",
              variant: "destructive",
            });
            return;
          }

          for (const rule of source.emailRules) {
            if (!rule.value.trim()) {
              toast({
                title: "Validation Error",
                description: "All rule values are required",
                variant: "destructive",
              });
              return;
            }
          }
        } else if (source.type === "Slack") {
          if (!source.slackType || !source.slackName?.trim()) {
            toast({
              title: "Validation Error",
              description: "Slack source requires type and name",
              variant: "destructive",
            });
            return;
          }
        }
      }

      setIsLoading(true);

      const payload = {
        name: form.configName,
        description: form.description,
        team: form.team,
        sources: form.sources.map((source) => ({
          type: source.type,
          emailSource: source.emailSource,
          customEmailSource:
            source.emailSource === "custom" ? source.customEmailSource : undefined,
          slackType: source.slackType,
          slackName: source.slackName,
          emailRules: source.emailRules?.map((rule) => ({
            fieldType: rule.fieldType,
            operator: rule.operator,
            value: rule.value,
            domain: rule.domain,
            nextOperator: rule.nextOperator,
          })),
        })),
        assigned_to_id: form.assignedTo,
        watcher_user_ids: form.watchers,
        priority_sla: form.prioritySla,
        project_id: 28,
        priority_id: 3,
        field_type: "subject",
        field_value: "ticket",
      };

      const response = await api.post("/mail-configs", payload);

      if (response && response.id) {
        toast({
          title: "Success",
          description: "Configuration created successfully",
        });
        navigate("/mail-configs");
      }
    } catch (error) {
      console.error("Error creating config:", error);
      toast({
        title: "Error",
        description: (error as any)?.message || "Failed to create configuration",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create Config for Ticket</h1>
          <p className="text-gray-600 mt-2">
            Configure email and Slack sources for automatic ticket creation
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Config */}
          <Card>
            <CardHeader>
              <CardTitle>Config</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="configName">Config Name *</Label>
                <Input
                  id="configName"
                  placeholder="Enter configuration name"
                  value={form.configName}
                  onChange={(e) =>
                    setForm({ ...form, configName: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional description"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="team">Team *</Label>
                <Select value={form.team} onValueChange={(value) => setForm({ ...form, team: value })}>
                  <SelectTrigger id="team">
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAMS.map((team) => (
                      <SelectItem key={team} value={team}>
                        {team}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Source */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Source</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSource}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Source
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {form.sources.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">
                  No sources added. Click "Add Source" to begin.
                </p>
              ) : (
                <div className="space-y-6">
                  {form.sources.map((source, sourceIndex) => (
                    <div key={source.id} className="border rounded-lg p-4 space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-sm">Source {sourceIndex + 1}</h3>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSource(source.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Source Type Selection */}
                      <div className="space-y-2">
                        <Label htmlFor={`source-type-${source.id}`}>Source Type *</Label>
                        <Select
                          value={source.type}
                          onValueChange={(value) =>
                            updateSource(source.id, {
                              type: value as "Email" | "Slack",
                              emailRules:
                                value === "Email"
                                  ? [
                                      {
                                        id: `rule-${Date.now()}`,
                                        fieldType: "From",
                                        operator: "domain",
                                        value: "",
                                        domain: "",
                                        nextOperator: "END",
                                      },
                                    ]
                                  : undefined,
                            })
                          }
                        >
                          <SelectTrigger id={`source-type-${source.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Email">E-Mail</SelectItem>
                            <SelectItem value="Slack">Slack</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Email Source Configuration */}
                      {source.type === "Email" && (
                        <div className="space-y-4 border-t pt-4">
                          <div className="space-y-2">
                            <Label htmlFor={`email-source-${source.id}`}>
                              Source Email *
                            </Label>
                            <Select
                              value={source.emailSource || ""}
                              onValueChange={(value) =>
                                updateSource(source.id, { emailSource: value })
                              }
                            >
                              <SelectTrigger id={`email-source-${source.id}`}>
                                <SelectValue placeholder="Select email" />
                              </SelectTrigger>
                              <SelectContent>
                                {EMAIL_SOURCES.map((email) => (
                                  <SelectItem key={email} value={email}>
                                    {email}
                                  </SelectItem>
                                ))}
                                {customEmailSources.map((email) => (
                                  <SelectItem key={email} value={email}>
                                    {email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {source.emailSource === "custom" && (
                            <div className="space-y-2">
                              <Label htmlFor={`custom-email-${source.id}`}>
                                Custom Email Name
                              </Label>
                              <div className="flex gap-2">
                                <Input
                                  id={`custom-email-${source.id}`}
                                  placeholder="Enter custom email"
                                  value={source.customEmailSource || ""}
                                  onChange={(e) =>
                                    updateSource(source.id, {
                                      customEmailSource: e.target.value,
                                    })
                                  }
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    if (source.customEmailSource?.trim()) {
                                      if (
                                        !customEmailSources.includes(
                                          source.customEmailSource
                                        )
                                      ) {
                                        setCustomEmailSources([
                                          ...customEmailSources,
                                          source.customEmailSource,
                                        ]);
                                      }
                                      updateSource(source.id, {
                                        emailSource: source.customEmailSource,
                                        customEmailSource: undefined,
                                      });
                                    }
                                  }}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Email Rules */}
                          <div className="border-t pt-4 space-y-4">
                            <div className="flex justify-between items-center">
                              <h4 className="font-semibold text-sm">Rule Config *</h4>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addEmailRule(source.id)}
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Rule
                              </Button>
                            </div>

                            <div className="space-y-3">
                              {source.emailRules &&
                                source.emailRules.map((rule, ruleIndex) => (
                                  <div key={rule.id} className="space-y-3 bg-gray-50 p-3 rounded">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="space-y-2">
                                        <Label htmlFor={`field-${rule.id}`}>
                                          Field Type
                                        </Label>
                                        <Select
                                          value={rule.fieldType}
                                          onValueChange={(value) =>
                                            updateEmailRule(
                                              source.id,
                                              rule.id,
                                              {
                                                fieldType: value as any,
                                                operator:
                                                  (OPERATORS as any)[value]?.[0] ||
                                                  "domain",
                                              }
                                            )
                                          }
                                        >
                                          <SelectTrigger id={`field-${rule.id}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {FIELD_TYPES.map((field) => (
                                              <SelectItem key={field} value={field}>
                                                {field}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>

                                      <div className="space-y-2">
                                        <Label htmlFor={`operator-${rule.id}`}>
                                          Operator
                                        </Label>
                                        <Select
                                          value={rule.operator || ""}
                                          onValueChange={(value) =>
                                            updateEmailRule(
                                              source.id,
                                              rule.id,
                                              { operator: value as any }
                                            )
                                          }
                                        >
                                          <SelectTrigger id={`operator-${rule.id}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {(
                                              OPERATORS as any
                                            )[rule.fieldType]?.map(
                                              (op: string) => (
                                                <SelectItem key={op} value={op}>
                                                  {op}
                                                </SelectItem>
                                              )
                                            )}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>

                                    {rule.operator === "domain" ? (
                                      <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                          <Label htmlFor={`domain-${rule.id}`}>
                                            Domain
                                          </Label>
                                          <Select
                                            value={rule.domain || ""}
                                            onValueChange={(value) =>
                                              updateEmailRule(
                                                source.id,
                                                rule.id,
                                                { domain: value }
                                              )
                                            }
                                          >
                                            <SelectTrigger id={`domain-${rule.id}`}>
                                              <SelectValue placeholder="Select domain" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {DOMAINS.map((domain) => (
                                                <SelectItem key={domain} value={domain}>
                                                  {domain}
                                                </SelectItem>
                                              ))}
                                              {customDomains.map((domain) => (
                                                <SelectItem key={domain} value={domain}>
                                                  {domain}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>

                                        {rule.domain === "custom" && (
                                          <div className="space-y-2">
                                            <Label htmlFor={`custom-domain-${rule.id}`}>
                                              Custom Domain
                                            </Label>
                                            <div className="flex gap-2">
                                              <Input
                                                id={`custom-domain-${rule.id}`}
                                                placeholder="e.g., @custom.com"
                                                value={tempCustomDomain}
                                                onChange={(e) =>
                                                  setTempCustomDomain(e.target.value)
                                                }
                                              />
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={addCustomDomain}
                                              >
                                                <CheckCircle className="w-4 h-4" />
                                              </Button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        <Label htmlFor={`value-${rule.id}`}>Value</Label>
                                        <Input
                                          id={`value-${rule.id}`}
                                          placeholder="Enter value"
                                          value={rule.value}
                                          onChange={(e) =>
                                            updateEmailRule(
                                              source.id,
                                              rule.id,
                                              { value: e.target.value }
                                            )
                                          }
                                        />
                                      </div>
                                    )}

                                    <div className="flex gap-2 items-end">
                                      <div className="flex-1 space-y-2">
                                        <Label htmlFor={`next-op-${rule.id}`}>
                                          Next Operation
                                        </Label>
                                        <Select
                                          value={rule.nextOperator}
                                          onValueChange={(value) =>
                                            updateEmailRule(
                                              source.id,
                                              rule.id,
                                              { nextOperator: value as any }
                                            )
                                          }
                                        >
                                          <SelectTrigger id={`next-op-${rule.id}`}>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="AND">AND</SelectItem>
                                            <SelectItem value="OR">OR</SelectItem>
                                            <SelectItem value="END">END</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>

                                      {source.emailRules &&
                                        source.emailRules.length > 1 && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              removeEmailRule(source.id, rule.id)
                                            }
                                            className="text-red-600"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </Button>
                                        )}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Slack Source Configuration */}
                      {source.type === "Slack" && (
                        <div className="space-y-4 border-t pt-4">
                          <div className="space-y-2">
                            <Label htmlFor={`slack-type-${source.id}`}>
                              Source Type *
                            </Label>
                            <Select
                              value={source.slackType || ""}
                              onValueChange={(value) =>
                                updateSource(source.id, {
                                  slackType: value as "Channel" | "Workspace",
                                })
                              }
                            >
                              <SelectTrigger id={`slack-type-${source.id}`}>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                {SLACK_TYPES.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`slack-name-${source.id}`}>
                              {source.slackType === "Channel"
                                ? "Channel Name"
                                : "Workspace Name"}{" "}
                              *
                            </Label>
                            <Input
                              id={`slack-name-${source.id}`}
                              placeholder={`Enter ${source.slackType?.toLowerCase()} name`}
                              value={source.slackName || ""}
                              onChange={(e) =>
                                updateSource(source.id, {
                                  slackName: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 3: Allocation */}
          <Card>
            <CardHeader>
              <CardTitle>Allocation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Assigned To */}
              <div className="space-y-2">
                <Label>Assigned To *</Label>
                <Select
                  value={form.assignedTo ? String(form.assignedTo) : ""}
                  onValueChange={(value) =>
                    setForm({ ...form, assignedTo: parseInt(value, 10) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent className="p-0 max-h-60">
                    <div className="sticky top-0 z-10 bg-popover p-2">
                      <Input
                        placeholder="Search users..."
                        value={searchAssignee}
                        onChange={(e) => setSearchAssignee(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="px-2 pb-2">
                      {filteredUsers
                        .sort((a, b) =>
                          getUserName(a).localeCompare(getUserName(b))
                        )
                        .map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {getUserName(u)}
                          </SelectItem>
                        ))}
                    </div>
                  </SelectContent>
                </Select>
              </div>

              {/* Watchers */}
              <div className="space-y-2">
                <Label>Watchers (Optional)</Label>
                <Popover open={openWatchers} onOpenChange={setOpenWatchers}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      {form.watchers.length > 0
                        ? `${form.watchers.length} selected`
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
                          {filteredWatchers.map((user) => (
                            <CommandItem
                              key={user.id}
                              onSelect={() => handleWatcherToggle(user.id)}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  form.watchers.includes(user.id)
                                    ? "opacity-100"
                                    : "opacity-0"
                                }`}
                              />
                              {getUserName(user)}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Display selected watchers */}
                {selectedWatchers.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedWatchers.map((user) => (
                      <div
                        key={user.id}
                        className="bg-primary/10 text-primary px-2 py-1 rounded text-sm flex items-center gap-1"
                      >
                        {getUserName(user)}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => handleWatcherToggle(user.id)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Priority SLA */}
              <div className="space-y-2">
                <Label htmlFor="priority-sla">Priority SLA *</Label>
                <Select
                  value={form.prioritySla}
                  onValueChange={(value) => setForm({ ...form, prioritySla: value })}
                >
                  <SelectTrigger id="priority-sla">
                    <SelectValue placeholder="Select SLA" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_SLAS.map((sla) => (
                      <SelectItem key={sla} value={sla}>
                        {sla}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Form Buttons */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/mail-configs")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
