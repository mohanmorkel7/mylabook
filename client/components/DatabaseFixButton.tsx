import { useState } from "react";
import { Button } from "./ui/button";

export function DatabaseFixButton() {
  const [isFixing, setIsFixing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const fixConstraint = async () => {
    setIsFixing(true);
    setResult(null);

    try {
      const response = await fetch(
        "/api/database-fix/fix-follow-ups-constraint",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const data = await response.json();

      if (data.success) {
        setResult("✅ Follow-ups constraint fixed successfully!");
      } else {
        setResult(`❌ Fix failed: ${data.error}`);
      }
    } catch (error) {
      setResult(`❌ Fix failed: ${error.message}`);
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-yellow-50 border-yellow-200">
      <h3 className="font-semibold text-yellow-800 mb-2">
        Database Constraint Fix
      </h3>
      <p className="text-sm text-yellow-700 mb-3">
        If you're seeing follow-up creation errors, click below to fix the
        database constraint:
      </p>
      <Button
        onClick={fixConstraint}
        disabled={isFixing}
        variant="outline"
        className="border-yellow-300 text-yellow-800 hover:bg-yellow-100"
      >
        {isFixing ? "Fixing..." : "Fix Follow-ups Constraint"}
      </Button>
      {result && <p className="mt-2 text-sm font-medium">{result}</p>}
    </div>
  );
}
