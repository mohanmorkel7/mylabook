import React, { useEffect, useState } from "react";
import apiClient from "@/lib/api";
import { useNavigate } from "react-router-dom";

const teams = [
  "Product Team",
  "Frontend Team",
  "Backend Team",
  "Devops Team",
  "Full stack Team",
];

const CreateProduct: React.FC = () => {
  const [name, setName] = useState("");
  const [assignedTeam, setAssignedTeam] = useState<string | null>(teams[0]);
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [managerId, setManagerId] = useState<number | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [estimatedHours, setEstimatedHours] = useState<number | null>(null);
  const [steps, setSteps] = useState<any[]>([]);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Fetch templates (filter: category=Product)
    const fetchTemplates = async () => {
      try {
        const res = await apiClient.request<any>("/templates");
        const list = res || [];
        setTemplates(
          list.filter(
            (t: any) =>
              (t.category || "").toLowerCase() === "product" ||
              (t.type || "").toLowerCase() === "product",
          ),
        );
      } catch (e) {
        console.error(e);
      }
    };
    const fetchUsers = async () => {
      try {
        const r = await apiClient.request<any>("/users");
        setUsers(r.users || r || []);
      } catch (e) {
        console.error(e);
      }
    };
    fetchTemplates();
    fetchUsers();
  }, []);

  const addStep = () => {
    setSteps((s) => [
      ...s,
      { name: "New Step", description: "", probability: 0, eta: null },
    ]);
  };

  const save = async () => {
    try {
      const payload: any = {
        name,
        description,
        assigned_team_id: null,
        template_id: templateId,
        project_manager_id: managerId,
        target_completion_date: targetDate,
        estimated_hours: estimatedHours,
        status: "open",
        progress: 0,
      };
      const created = await apiClient.request<any>("/workflow/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Create steps
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        await apiClient.request<any>(`/workflow/projects/${created.id}/steps`, {
          method: "POST",
          body: JSON.stringify({
            step_name: s.name,
            step_description: s.description,
            step_order: i + 1,
            probability: s.probability ?? 0,
            eta: s.eta,
            status: s.status || "pending",
            estimated_hours: s.estimated_hours ?? null,
          }),
        });
      }

      navigate(`/product_dashboard/${created.id}`);
    } catch (e) {
      console.error(e);
      alert("Failed to create product");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Create Product</h1>
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Project Configuration</h3>
          <div className="space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project Name"
              className="input w-full"
            />
            <select
              value={assignedTeam || ""}
              onChange={(e) => setAssignedTeam(e.target.value)}
              className="input w-full"
            >
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Project Description"
              className="input w-full"
            />
            <select
              value={templateId ?? ""}
              onChange={(e) =>
                setTemplateId(e.target.value ? Number(e.target.value) : null)
              }
              className="input w-full"
            >
              <option value="">-- Select template --</option>
              {templates.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={managerId ?? ""}
              onChange={(e) =>
                setManagerId(e.target.value ? Number(e.target.value) : null)
              }
              className="input w-full"
            >
              <option value="">-- Select Manager --</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={targetDate ?? ""}
              onChange={(e) => setTargetDate(e.target.value)}
              className="input w-full"
            />
            <input
              type="number"
              value={estimatedHours ?? ""}
              onChange={(e) => setEstimatedHours(Number(e.target.value))}
              placeholder="Estimated Hours"
              className="input w-full"
            />
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">Project Steps</h3>
            <button className="btn" onClick={addStep}>
              Add step
            </button>
          </div>
          <div className="space-y-2">
            {steps.map((s, idx) => (
              <div key={idx} className="p-3 border rounded">
                <input
                  value={s.name}
                  onChange={(e) => {
                    const copy = [...steps];
                    copy[idx].name = e.target.value;
                    setSteps(copy);
                  }}
                  className="input w-full mb-1"
                />
                <textarea
                  value={s.description}
                  onChange={(e) => {
                    const copy = [...steps];
                    copy[idx].description = e.target.value;
                    setSteps(copy);
                  }}
                  className="input w-full mb-1"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={s.probability}
                    onChange={(e) => {
                      const copy = [...steps];
                      copy[idx].probability = Number(e.target.value);
                      setSteps(copy);
                    }}
                    className="input w-24"
                    placeholder="Probability %"
                  />
                  <input
                    type="datetime-local"
                    value={s.eta || ""}
                    onChange={(e) => {
                      const copy = [...steps];
                      copy[idx].eta = e.target.value;
                      setSteps(copy);
                    }}
                    className="input flex-1"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <button className="btn btn-primary" onClick={save}>
          Create Product
        </button>
      </div>
    </div>
  );
};

export default CreateProduct;
