import React, { useEffect, useState } from "react";
import apiClient from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Link } from "react-router-dom";

const ProductsPage: React.FC = () => {
  const [stats, setStats] = useState<any>({
    total: 0,
    totalDev: 0,
    statuses: {},
  });
  const [products, setProducts] = useState<any[]>([]);

  const fetchStats = async () => {
    try {
      // Use workflow dashboard for stats
      const data = await apiClient.request<any>("/workflow/dashboard");
      // Map into expected shape
      const total = (data.project_stats || []).reduce(
        (s: number, p: any) => s + (p.count || 0),
        0,
      );
      const totalDev = data.total_developers || 0 || 0;
      const statuses: Record<string, number> = {};
      (data.project_stats || []).forEach(
        (p: any) => (statuses[p.status] = p.count),
      );
      setStats({ total, totalDev, statuses });
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await apiClient.request<any>("/workflow/projects");
      // workflow returns array of projects
      const list = Array.isArray(data) ? data : data.projects || data;
      // normalize fields to match previous UI expectations
      const normalized = (list || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        progress: p.progress_percentage ?? p.progress ?? 0,
        status: p.status,
      }));
      setProducts(normalized);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchProducts();
  }, []);

  const chartData = Object.entries(stats.statuses || {}).map(([k, v]) => ({
    name: k,
    value: v,
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Product Management</h1>
        <Link to="/create-product" className="btn btn-primary">
          Create Product
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-white rounded shadow">
          <div className="text-sm text-gray-500">Total Projects</div>
          <div className="text-2xl font-semibold">{stats.total}</div>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <div className="text-sm text-gray-500">Total Developers</div>
          <div className="text-2xl font-semibold">{stats.totalDev}</div>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <div className="text-sm text-gray-500">Open</div>
          <div className="text-2xl font-semibold">
            {stats.statuses?.open || 0}
          </div>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <div className="text-sm text-gray-500">In Progress</div>
          <div className="text-2xl font-semibold">
            {stats.statuses?.in_progress || 0}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="p-4 bg-white rounded shadow h-64">
          <h3 className="mb-2">Status Breakdown</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" />
              <Tooltip />
              <Bar dataKey="value" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="p-4 bg-white rounded shadow">
          <h3 className="mb-2">Projects</h3>
          <div className="space-y-3 overflow-auto max-h-64">
            {products.map((p) => (
              <Link
                to={`/product_dashboard/${p.id}`}
                key={p.id}
                className="block p-3 border rounded hover:shadow"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm text-gray-500">{p.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">{p.progress}%</div>
                    <div className="text-sm text-gray-500">{p.status}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductsPage;
