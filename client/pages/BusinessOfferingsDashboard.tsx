import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, Plus } from "lucide-react";

export default function BusinessOfferingsDashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-blue-600" /> Business Offerings
          </h1>
          <p className="text-gray-600 mt-1">
            Manage business offerings and pipeline
          </p>
        </div>
        <Button onClick={() => navigate("/business-offerings/create")}>
          <Plus className="w-4 h-4 mr-2" /> Create Sales
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Total Offerings</CardTitle>
            <CardDescription>All captured business offerings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Domestic</CardTitle>
            <CardDescription>India-based clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>International</CardTitle>
            <CardDescription>Non-India clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">0</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Offerings</CardTitle>
          <CardDescription>Search and browse entries</CardDescription>
          <div className="flex gap-3 items-end w-full">
            <div className="flex-1">
              <Label className="text-sm">Search</Label>
              <Input
                placeholder="Search by client, product or solution"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-gray-600">No Business Offerings found.</div>
        </CardContent>
      </Card>
    </div>
  );
}
