import React, { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ProductSidebar() {
  const [counts, setCounts] = useState({
    total: 0,
    pending: 0,
    inprogress: 0,
    completed: 0,
  });
  const [products, setProducts] = useState<any[]>([]);
  const navigate = useNavigate();

  const fetch = async () => {
    try {
      const res = await apiClient.request("/product-master");
      const arr = Array.isArray(res) ? res : [];
      setProducts(arr.slice(0, 5));
      setCounts({
        total: arr.length,
        pending: arr.filter((p: any) => p.status === "pending").length,
        inprogress: arr.filter((p: any) => p.status === "inprogress").length,
        completed: arr.filter((p: any) => p.status === "completed").length,
      });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetch();
  }, []);

  return (
    <div className="p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Products</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 bg-white rounded shadow">
            Total
            <br />
            {counts.total}
          </div>
          <div className="p-2 bg-white rounded shadow">
            Pending
            <br />
            {counts.pending}
          </div>
          <div className="p-2 bg-white rounded shadow">
            In Progress
            <br />
            {counts.inprogress}
          </div>
          <div className="p-2 bg-white rounded shadow">
            Completed
            <br />
            {counts.completed}
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2">Recent Products</h4>
        <div className="space-y-2">
          {products.map((p) => (
            <Card key={p.id} className="p-2">
              <CardContent className="p-2 flex justify-between items-start">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-gray-500">{p.product_id}</div>
                  <div className="text-xs">
                    {p.current_version} • {p.status}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => navigate(`/products/${p.id}`)}
                  >
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
