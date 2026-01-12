import React, { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProductMasterPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<any>({
    name: "",
    description: "",
    current_version: "",
    repository_url: "",
    product_url: "",
  });
  const [editing, setEditing] = useState<any | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await apiClient.request<any[]>("/product-master");
      setProducts(res || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const save = async () => {
    try {
      if (editing) {
        await apiClient.request(`/product-master/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
      } else {
        await apiClient.request("/product-master", {
          method: "POST",
          body: JSON.stringify(form),
        });
      }
      setForm({
        name: "",
        description: "",
        current_version: "",
        repository_url: "",
        product_url: "",
      });
      setEditing(null);
      fetchProducts();
    } catch (e) {
      console.error(e);
    }
  };

  const edit = (p: any) => {
    setEditing(p);
    setForm(p);
  };
  const del = async (p: any) => {
    if (!confirm("Delete product?")) return;
    await apiClient.request(`/product-master/${p.id}`, { method: "DELETE" });
    fetchProducts();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Product Master</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Create / Edit Product</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Product Name</Label>
              <Input
                value={form.name}
                onChange={(e: any) =>
                  setForm({ ...form, name: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Current Version</Label>
              <Input
                value={form.current_version}
                onChange={(e: any) =>
                  setForm({ ...form, current_version: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Repository URL</Label>
              <Input
                value={form.repository_url}
                onChange={(e: any) =>
                  setForm({ ...form, repository_url: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Product URL</Label>
              <Input
                value={form.product_url}
                onChange={(e: any) =>
                  setForm({ ...form, product_url: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <textarea
                className="w-full p-2 border rounded"
                value={form.description}
                onChange={(e: any) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={save}>{editing ? "Update" : "Create"}</Button>
            {editing && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setForm({
                    name: "",
                    description: "",
                    current_version: "",
                    repository_url: "",
                    product_url: "",
                  });
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Loading...</div>
          ) : (
            <div className="space-y-2">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="p-3 border rounded flex justify-between items-center"
                >
                  <div>
                    <div className="font-semibold">
                      {p.name}{" "}
                      <span className="text-xs text-gray-500">
                        {p.product_id}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {p.current_version} -{" "}
                      {p.is_active ? "Active" : "Inactive"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => edit(p)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => del(p)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
