import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import ConnectionForm, {
  ConnectionFormValues,
} from "@/components/ConnectionForm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

export default function ConnectionNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: Partial<ConnectionFormValues>) =>
      apiClient.createConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      toast({ title: "Saved", description: "Connection created" });
      navigate(returnTo || "/connections");
    },
    onError: (e: any) => {
      toast({
        title: "Create failed",
        description: String(e?.message),
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Add member</h1>
          <p className="text-sm text-gray-500">Create a new connection</p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Member Details</CardTitle>
          <CardDescription>Enter contact and location details</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionForm
            onSubmit={(d) => createMutation.mutate(d)}
            onCancel={() => navigate(-1)}
            submitLabel="Create"
          />
        </CardContent>
      </Card>
    </div>
  );
}
