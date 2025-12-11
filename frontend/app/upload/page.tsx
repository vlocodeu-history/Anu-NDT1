"use client";

import React, { useRef, useState } from "react";

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

type ParsedProduct = {
  product_no: number;
  images_in_group: string[];
  raw_text: string;
  parsed: {
    serial_number?: string | null;
    model?: string | null;
    dn?: string | null;
    pn?: string | null;
    pt?: string | null;
    body?: string | null;
    disc?: string | null;
    seat?: string | null;
    temp?: string | null;
    date?: string | null;
    [k: string]: any;
  };
  supabase: any;
  // keep original raw result (if you need it)
  __raw?: any;
};

type NormalizedResult = {
  batch_id: string;
  product_count: number;
  products: ParsedProduct[];
};

export default function UploadPage() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NormalizedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ref to hidden input
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleHiddenInputClick = () => {
    fileInputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files);
    setResult(null);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!files || files.length === 0) {
      setError("Please select some images first");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("files", f));

      const resp = await fetch(`${backendUrl}/ocr-bulk`, {
        method: "POST",
        body: formData,
      });

      const text = await resp.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (err) {
        console.error("Failed to parse JSON response:", text);
        throw new Error("Invalid JSON from server");
      }

      console.log("raw /ocr-bulk response:", json);

      if (!resp.ok) {
        const errMsg = (json && (json.detail || json.error || JSON.stringify(json))) || "Upload failed";
        throw new Error(errMsg);
      }

      // Normalize: server you showed returns { batch_id, count, results: [...] }
      // But accept flexible shapes too (products/results).
      const rawResults: any[] =
        Array.isArray(json?.results)
          ? json.results
          : Array.isArray(json?.products)
          ? json.products
          : Array.isArray(json?.results?.results)
          ? json.results.results
          : [];

      // Build normalized products array from server items
      const productsFromServer: ParsedProduct[] = (rawResults || []).map((r, idx) => {
        // images_in_group may be provided in different shapes; fallbacks:
        const images_in_group =
          Array.isArray(r.images_in_group) && r.images_in_group.length > 0
            ? r.images_in_group
            : Array.isArray(r.images_json) && r.images_json.length > 0
            ? r.images_json.map((it: any) => it.filename).filter(Boolean)
            : r.file
            ? [r.file]
            : [];

        const raw_text =
          r.raw_text ||
          r.text ||
          (Array.isArray(r.images_json) ? r.images_json.map((it: any) => it.text || "").join("\n") : "") ||
          "";

        return {
          product_no: typeof r.product_no === "number" ? r.product_no : idx + 1,
          images_in_group,
          raw_text,
          parsed: r.parsed ?? {},
          supabase: r.supabase ?? {},
          __raw: r,
        };
      });

      const normalized: NormalizedResult = {
        batch_id: String(json?.batch_id ?? ""),
        product_count: typeof json?.count === "number" ? json.count : productsFromServer.length,
        products: productsFromServer,
      };

      console.log("normalized result:", normalized);
      setResult(normalized);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #eef2ff 0%, #e0f2fe 50%, #ffffff 100%)",
        padding: "28px 16px 42px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 1150 }}>
        {/* colorful header */}
        <div
          style={{
            background:
              "linear-gradient(120deg, #2563eb 0%, #6366f1 50%, #f97316 120%)",
            borderRadius: 16,
            padding: "18px 20px",
            color: "#fff",
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 16px 30px rgba(37,99,235,.35)",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>Valve / Nameplate OCR</h1>
            <p style={{ margin: "4px 0 0", opacity: 0.95, fontSize: 13 }}>
              Drop photos → backend groups x3 → Google Vision → Supabase
            </p>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,.18)",
              border: "1px solid rgba(255,255,255,.35)",
              borderRadius: 999,
              padding: "5px 14px",
              fontSize: 12,
            }}
          >
            Backend: <strong>{backendUrl}</strong>
          </div>
        </div>

        {/* steps */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <StepBox number={1} title="Choose images" desc="Valve + plate + casting" active />
          <StepBox number={2} title="Send to API" desc="/ocr-bulk" />
          <StepBox number={3} title="Review & save" desc="Supabase rows" />
        </div>

        {/* main card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            boxShadow: "0 12px 40px rgba(15,23,42,.08)",
            padding: 20,
            display: "grid",
            gridTemplateColumns: "360px 1fr",
            gap: 20,
          }}
        >
          {/* LEFT */}
          <div
            style={{
              borderRight: "1px solid #eff1f5",
              paddingRight: 20,
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: 4, fontSize: 15 }}>
              1. Upload product images
            </p>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
              You can select multiple images (in Chrome you can open the folder and select all).
              Backend will treat <b>every 3 images</b> as 1 product.
            </p>

            {/* hidden input */}
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleChange}
              style={{ display: "none" }}
            />

            {/* choose button */}
            <button
              onClick={handleHiddenInputClick}
              style={{
                background: "linear-gradient(120deg, #2563eb 0%, #6366f1 100%)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "10px 16px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 8px 20px rgba(37,99,235,.35)",
              }}
            >
              📁 Choose images
            </button>

            {files && files.length > 0 && (
              <p style={{ fontSize: 12, marginTop: 6, color: "#334155" }}>
                {files.length} file(s) selected
              </p>
            )}

            {/* selected file list */}
            {files && files.length > 0 && (
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: 10,
                  marginTop: 10,
                  maxHeight: 150,
                  overflowY: "auto",
                  fontSize: 12.5,
                }}
              >
                <p style={{ marginBottom: 6, fontWeight: 500 }}>
                  Selected files:
                </p>
                <ul style={{ paddingLeft: 16 }}>
                  {Array.from(files).map((f) => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* run OCR button */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                marginTop: 16,
                width: "100%",
                background: loading ? "#cbd5f5" : "#f97316",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "10px 16px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "transform .08s ease-out",
              }}
            >
              {loading ? "Processing…" : "▶ Start OCR & Save"}
            </button>

            {/* messages */}
            {error && (
              <p style={{ color: "#b91c1c", fontSize: 12.8, marginTop: 10 }}>
                {error}
              </p>
            )}
            {!error && result && (
              <p
                style={{
                  marginTop: 10,
                  fontSize: 12.8,
                  background: "#ecfdf3",
                  border: "1px solid #bbf7d0",
                  borderRadius: 8,
                  padding: "6px 10px",
                  color: "#166534",
                }}
              >
                ✅ Stored to Supabase — <b>{result.product_count}</b> product(s) in{" "}
                {result.batch_id}
              </p>
            )}
          </div>

          {/* RIGHT */}
          <div>
            <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>
              2. OCR / parsed result
            </p>
            {!result && !loading && (
              <p style={{ fontSize: 13, color: "#94a3b8" }}>
                After upload, grouped products will appear here.
              </p>
            )}

            {loading && (
              <p style={{ fontSize: 13, color: "#334155" }}>
                Running OCR… this may take a moment…
              </p>
            )}

            {result && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {(Array.isArray(result.products) ? result.products : []).map(
                  (p, idx) => (
                    <div
                      key={`${result.batch_id ?? "batch"}-${p.product_no ?? "no"}-${idx}`}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        background: "linear-gradient(160deg, #ffffff 0%, #eff6ff 100%)",
                        padding: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span
                            style={{
                              background: "#dbeafe",
                              color: "#1d4ed8",
                              borderRadius: 999,
                              padding: "2px 10px",
                              fontWeight: 600,
                              fontSize: 12,
                            }}
                          >
                            Product #{p.product_no}
                          </span>
                          <span style={{ fontSize: 11, color: "#475569" }}>
                            {Array.isArray(p.images_in_group) ? p.images_in_group.length : 0} image(s)
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: "#64748b" }}>
                          Supabase: {p.supabase?.ok ? "✅" : "⚠️"}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <Field label="Serial" value={p.parsed?.serial_number} />
                        <Field label="Model" value={p.parsed?.model} />
                        <Field label="DN" value={p.parsed?.dn} />
                        <Field label="PN" value={p.parsed?.pn} />
                        <Field label="PT" value={p.parsed?.pt} />
                        <Field label="Body" value={p.parsed?.body} />
                        <Field label="Disc" value={p.parsed?.disc} />
                        <Field label="Seat" value={p.parsed?.seat} />
                        <Field label="Temp" value={p.parsed?.temp} />
                      </div>

                      <details style={{ marginTop: 8 }}>
                        <summary style={{ cursor: "pointer", fontSize: 12.5 }}>
                          Show raw OCR text
                        </summary>
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: 8,
                            padding: 6,
                            fontSize: 12,
                            marginTop: 6,
                          }}
                        >
                          {p.raw_text}
                        </pre>
                      </details>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ---- helper components ---- */

function StepBox({
  number,
  title,
  desc,
  active = false,
}: {
  number: number;
  title: string;
  desc: string;
  active?: boolean;
}) {
  return (
    <div
      style={{
        background: active ? "rgba(37,99,235,.12)" : "rgba(255,255,255,.5)",
        border: active ? "1px solid rgba(37,99,235,.45)" : "1px solid rgba(148,163,184,.1)",
        borderRadius: 999,
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "999px",
          background: active ? "#2563eb" : "#cbd5f5",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        {number}
      </span>
      <div>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{title}</p>
        <p style={{ margin: 0, fontSize: 11, color: "#475569" }}>{desc}</p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ minWidth: 115 }}>
      <p style={{ fontSize: 10.5, textTransform: "uppercase", color: "#94a3b8" }}>
        {label}
      </p>
      <p style={{ fontSize: 13.3, fontWeight: 500 }}>
        {value && typeof value === "string" && value.trim().length > 0 ? value : "—"}
      </p>
    </div>
  );
}
