import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";

export default function ConnectionEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: connection, isLoading } = useQuery({
    queryKey: ["connection", id],
    queryFn: async () => {
      const conn = await apiClient.getConnection(Number(id));
      return conn;
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<ConnectionFormValues>) =>
      apiClient.updateConnection(Number(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["connection", id] });
      toast({ title: "Updated", description: "Changes saved" });
      navigate("/connections");
    },
    onError: (e: any) => {
      toast({
        title: "Update failed",
        description: String(e?.message),
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (!connection) return <div>Not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Edit member</h1>
          <p className="text-sm text-gray-500">Update connection</p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Member Details</CardTitle>
          <CardDescription>Modify contact and location details</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionForm
            initial={connection}
            onSubmit={(d) => updateMutation.mutate(d)}
            onCancel={() => navigate(-1)}
            submitLabel="Update"
          />
        </CardContent>
      </Card>
    </div>
  );
}
