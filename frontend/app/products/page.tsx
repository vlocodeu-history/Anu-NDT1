// app/products/page.tsx
"use client";

import { useEffect, useState } from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

type Product = {
  id: string;
  batch_id: string | null;
  product_no: number | null;
  serial_number: string | null;
  model: string | null;
  dn: string | null;
  pn: string | null;
  pt: string | null;
  body?: string | null;
  disc?: string | null;
  seat?: string | null;
  temp?: string | null;
  casting_summary: string | null;
  images_json?: Array<{ filename: string; text?: string }>;
  created_at: string | null;
};

export default function ProductsPage() {
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [batch, setBatch] = useState("");

  // Upload response items (from /ocr-bulk)
  const [items, setItems] = useState<any[]>([]);

  // Robust upload handler (keeps items as an array)
  async function handleSubmit(formData: FormData) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/ocr-bulk`,
        {
          method: "POST",
          body: formData,
        }
      );

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (err) {
        console.error("Response is not JSON:", text);
        throw new Error("Invalid JSON from server");
      }

      console.log("OCR /ocr-bulk response:", res.status, data);

      if (!res.ok) {
        console.error("Server error:", data);
        setItems([]);
        return;
      }

      const newItems = data?.results ?? data?.products ?? [];
      setItems(Array.isArray(newItems) ? newItems : []);
    } catch (err) {
      console.error("Network or JS error:", err);
      setItems([]);
    }
  }

  // load once
  useEffect(() => {
    fetchRows();
  }, []);

  // Robust fetchRows: always sets an array into state and logs the server response
  async function fetchRows(batchId?: string) {
    try {
      setLoading(true);
      setError("");

      const urlBase = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      let url = `${urlBase}/rest/v1/products?select=*&order=created_at.desc`;

      if (batchId && batchId.trim() !== "") {
        url = `${urlBase}/rest/v1/products?batch_id=eq.${batchId}&select=*&order=created_at.desc`;
      }

      const res = await fetch(url, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log("fetchRows: server returned:", data);

      // Accept either an array or an object with a `results` field
      const arr = Array.isArray(data)
        ? data
        : Array.isArray((data as any).results)
        ? (data as any).results
        : [];

      setRows(arr);
    } catch (err: any) {
      console.error("fetchRows error:", err);
      setError(err.message || "Failed to load");
      setRows([]); // ensure rows is always an array
    } finally {
      setLoading(false);
    }
  }

  // PATCH to your FastAPI
  async function saveField(id: string, field: string, value: string) {
    try {
      const res = await fetch(`${backendUrl}/ocr-bulk`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ [field]: value }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      // update UI
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
      );
    } catch (e) {
      console.error(e);
      alert("Save failed");
    }
  }

  // CSV export
  function exportCsv(currentRows: Product[]) {
    if (!currentRows || currentRows.length === 0) {
      alert("No data to export");
      return;
    }

    const headers = [
      "id",
      "batch_id",
      "product_no",
      "serial_number",
      "model",
      "dn",
      "pn",
      "pt",
      "body",
      "disc",
      "seat",
      "temp",
      "casting_summary",
      "created_at",
    ];

    const lines: string[] = [];
    lines.push(headers.join(",")); // header

    for (const r of currentRows) {
      const line = headers
        .map((h) => {
          const v = (r as any)[h];
          const safe = v === null || v === undefined ? "" : String(v);
          const s = safe.replace(/"/g, '""');
          return `"${s}"`;
        })
        .join(",");
      lines.push(line);
    }

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // for debugging: watch items and rows updates
  useEffect(() => {
    console.log("items updated:", items);
  }, [items]);

  useEffect(() => {
    console.log("rows updated:", rows);
  }, [rows]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #e2f3ff 0%, #ffffff 60%)",
        padding: "28px",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.55rem", fontWeight: 700, marginBottom: 12 }}>
          Stored products (from Supabase)
        </h1>

        {/* top controls */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          <input
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            placeholder="Filter by batch_id (eg. batch-8db99b4d)"
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #cbd5f5",
              fontSize: 13,
              background: "#fff",
            }}
          />
          <button
            onClick={() => fetchRows(batch)}
            style={{
              background: "#0f766e",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "8px 14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Load
          </button>
          <button
            onClick={() => {
              setBatch("");
              fetchRows();
            }}
            style={{
              background: "#e2e8f0",
              color: "#0f172a",
              border: "none",
              borderRadius: 10,
              padding: "8px 14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
          <button
            onClick={() => exportCsv(rows)}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "8px 14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Export CSV
          </button>
        </div>

        {loading && <p>Loading...</p>}
        {error && <p style={{ color: "red", marginBottom: 16 }}>Error: {error}</p>}

        {/* list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(rows ?? []).map((r) => (
            <div
              key={r.id}
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: "14px 16px 12px 16px",
                border: "1px solid rgba(15,118,255,0.05)",
                boxShadow: "0 10px 30px rgba(15,118,255,0.03)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {r.batch_id} · #{r.product_no}
                </span>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  {r.created_at}
                </span>
              </div>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <EditableField
                  label="SERIAL"
                  value={r.serial_number}
                  onSave={(v) => saveField(r.id, "serial_number", v)}
                />
                <EditableField
                  label="MODEL"
                  value={r.model}
                  onSave={(v) => saveField(r.id, "model", v)}
                />
                <EditableField
                  label="DN"
                  value={r.dn}
                  onSave={(v) => saveField(r.id, "dn", v)}
                />
                <EditableField
                  label="PN"
                  value={r.pn}
                  onSave={(v) => saveField(r.id, "pn", v)}
                />
                <EditableField
                  label="PT"
                  value={r.pt}
                  onSave={(v) => saveField(r.id, "pt", v)}
                />
              </div>

              {r.casting_summary ? (
                <p style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>
                  Casting: {r.casting_summary}
                </p>
              ) : null}

              {/* SAFELY MAP images_json (always use an array fallback) */}
              {(Array.isArray(r.images_json) ? r.images_json : []).length ? (
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  {(Array.isArray(r.images_json) ? r.images_json : []).map(
                    (img, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "#e2e8f0",
                          borderRadius: 8,
                          padding: "4px 6px",
                          fontSize: 11,
                        }}
                      >
                        📷 {img.filename}
                      </div>
                    )
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function EditableField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (v: string) => Promise<void> | void;
}) {
  const [val, setVal] = useState(value ?? "");
  const [status, setStatus] =
    useState<"idle" | "saving" | "ok" | "err">("idle");

  async function handleSave() {
    try {
      setStatus("saving");
      await onSave(val);
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (e) {
      setStatus("err");
      setTimeout(() => setStatus("idle"), 2500);
    }
  }

  return (
    <div style={{ minWidth: 120 }}>
      <div
        style={{
          fontSize: 10,
          color: "#94a3b8",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            fontSize: 12,
            padding: "2px 4px",
            flex: 1,
          }}
        />
        <button
          onClick={handleSave}
          disabled={status === "saving"}
          style={{
            border: "none",
            background: status === "saving" ? "#134e4a" : "#0f766e",
            color: "#fff",
            borderRadius: 6,
            padding: "2px 6px",
            fontSize: 11,
            cursor: "pointer",
            opacity: status === "saving" ? 0.7 : 1,
          }}
        >
          {status === "saving" ? "..." : "Save"}
        </button>
        {status === "ok" && (
          <span style={{ fontSize: 11, color: "#16a34a" }}>Saved ✓</span>
        )}
        {status === "err" && (
          <span style={{ fontSize: 11, color: "#dc2626" }}>Failed</span>
        )}
      </div>
    </div>
  );
}
