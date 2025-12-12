// page.tsx (React client) - Redesigned with Tailwind CSS
"use client";

import React, { useRef, useState } from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

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
  supabase?: any;
  __raw?: any;
};

export default function UploadPage() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ParsedProduct[] | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleHiddenInputClick = () => fileInputRef.current?.click();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files);
    setProducts(null);
    setError(null);
  };

  async function pollJob(job: string, timeoutMs = 120000, intervalMs = 1000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const r = await fetch(`${backendUrl}/ocr-job/${job}`);
        if (!r.ok) {
          const t = await r.text();
          throw new Error(t || "Job status fetch failed");
        }
        const j = await r.json();
        if (j.status === "done") return j;
        await new Promise((res) => setTimeout(res, intervalMs));
      } catch (err) {
        console.error("poll error", err);
        await new Promise((res) => setTimeout(res, intervalMs));
      }
    }
    throw new Error("Job timed out");
  }

  const handleSubmit = async () => {
    if (!files || files.length === 0) {
      setError("Please select images");
      return;
    }
    setError(null);
    setLoading(true);
    setProducts(null);
    setJobId(null);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const resp = await fetch(`${backendUrl}/ocr-bulk`, { method: "POST", body: fd });
      const text = await resp.text();
      let json: any;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (e) {
        console.error("Invalid JSON from server:", text);
        throw new Error("Invalid response from server");
      }
      if (!resp.ok) throw new Error(json?.detail || JSON.stringify(json) || "Upload failed");
      const id = json.batch_id || json.job_id; // handle both naming conventions
      setJobId(id);

      let finalResults = json.results;
      if (!finalResults && id) {
        const jobData = await pollJob(id, 120000, 1200);
        finalResults = jobData.results;
      }

      if (!finalResults) finalResults = [];

      // normalize
      const normalized: ParsedProduct[] = finalResults.map((r: any, idx: number) => {
        const images_in_group = Array.isArray(r.images) ? r.images.map((it: any) => it.filename) : [];
        const raw_text = r.parsed && r.parsed.raw_text ? r.parsed.raw_text : r.parsed ? "" : r.raw_text || "";
        return {
          product_no: r.product_no ?? idx + 1,
          images_in_group,
          raw_text,
          parsed: r.parsed ?? {},
          supabase: r.supabase ?? {},
          __raw: r,
        };
      });
      setProducts(normalized);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen font-sans p-6 md:p-10" style={{ background: "linear-gradient(160deg, #eef2ff 0%, #e0f2fe 50%, #ffffff 100%)" }}>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header - Colorful Gradient */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center p-6 rounded-2xl shadow-xl text-white"
          style={{ background: "linear-gradient(120deg, #2563eb 0%, #6366f1 50%, #f97316 120%)" }}>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Valve OCR Dashboard</h1>
            <p className="mt-1 text-sm opacity-90">Automated nameplate extraction & database processing</p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white text-xs font-bold rounded-full border border-white/30 backdrop-blur-md shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              System Online
            </div>
          </div>
        </header>

        {/* Steps */}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-3 px-4 py-2 bg-blue-50/50 border border-blue-200/60 rounded-full text-blue-900">
            <span className="w-6 h-6 flex items-center justify-center bg-blue-600 text-white text-xs font-bold rounded-full shadow-sm">1</span>
            <div>
              <p className="text-sm font-bold leading-none">Choose images</p>
              <p className="text-[10px] text-blue-600/70 uppercase tracking-wide font-semibold mt-0.5">Valve + Plate + Casting</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-white/60 border border-gray-200 rounded-full text-gray-600">
            <span className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-600 text-xs font-bold rounded-full">2</span>
            <div>
              <p className="text-sm font-bold leading-none">Process</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mt-0.5">AI Extraction</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 bg-white/60 border border-gray-200 rounded-full text-gray-600">
            <span className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-600 text-xs font-bold rounded-full">3</span>
            <div>
              <p className="text-sm font-bold leading-none">Results</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mt-0.5">Database Records</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar / Upload Area */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-white p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-2">1. Upload product images</h2>
              <p className="text-gray-500 text-xs mb-6 leading-relaxed">
                Select multiple images (Ctrl/Cmd+Click). Backend will treat <strong>every 3 images</strong> as 1 product.
              </p>

              <input type="file" multiple ref={fileInputRef} onChange={handleChange} className="hidden" />

              <button
                onClick={handleHiddenInputClick}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 font-bold"
              >
                <span className="text-xl">📁</span>
                Choose Images
              </button>

              {files && files.length > 0 && (
                <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-inner">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Selected files</span>
                    <span className="bg-white text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200">{files.length}</span>
                  </div>
                  <ul className="max-h-32 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                    {Array.from(files).map((f) => (
                      <li key={f.name} className="text-xs text-slate-600 truncate flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
                        📄 {f.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading || !files}
                className={`mt-6 w-full py-3.5 px-6 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 ${loading
                  ? "bg-slate-300 cursor-not-allowed text-slate-500 shadow-none"
                  : "bg-[#f97316] hover:bg-orange-600 shadow-orange-500/30"
                  }`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : "▶ Start OCR & Save"}
              </button>

              {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 font-medium flex items-start gap-2">
                  <span className="text-lg">⚠️</span>
                  {error}
                </div>
              )}

              {products && !error && (
                <div className="mt-4 p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-200 font-medium flex items-start gap-2">
                  <span className="text-lg">✅</span>
                  <div>
                    Saved to Database — <strong>{products.length} product(s)</strong>
                    <div className="text-[10px] font-mono text-emerald-600/70 mt-1 truncate max-w-[200px]">Batch: {jobId}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Results Area */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 min-h-[600px]">
              <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm">2</span>
                Results / Database Records
              </h2>

              {!products && !loading && (
                <div className="h-64 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
                  <p>No results yet. Upload images to begin.</p>
                </div>
              )}

              {loading && (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  <p className="text-gray-500 animate-pulse font-medium">Analyzing images with Google Vision...</p>
                </div>
              )}

              <div className="space-y-6">
                {products && products.map((p) => (
                  <ProductCard key={p.product_no} product={p} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function ProductCard({ product }: { product: ParsedProduct }) {
  const [formData, setFormData] = useState(product.parsed);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success">("idle");

  const handleChange = (key: string, val: string) => {
    setFormData((prev) => ({ ...prev, [key]: val }));
    if (saveStatus === "success") setSaveStatus("idle");
  };

  const handleSave = () => {
    setSaveStatus("saving");
    // Mock save action
    setTimeout(() => {
      setSaveStatus("success");
      // Reset after 3 seconds
      setTimeout(() => setSaveStatus("idle"), 3000);
    }, 800);
  };

  return (
    <div className="border border-blue-100 rounded-xl overflow-hidden hover:shadow-lg transition-all bg-gradient-to-br from-white to-blue-50">
      {/* Card Header */}
      <div className="bg-white/50 px-6 py-4 flex justify-between items-center border-b border-gray-100 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <span className="bg-white border border-gray-300 text-gray-700 font-bold px-3 py-1 rounded-lg shadow-sm text-sm">
            #{product.product_no}
          </span>
          <span className="text-xs text-gray-500 font-medium">
            {product.images_in_group.length} images sourced
          </span>
        </div>
      </div>

      {/* Grid of Editable Fields */}
      <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-6 gap-x-4">
        <EditableField label="Serial No." value={formData.serial_number} onChange={(v) => handleChange("serial_number", v)} />
        <EditableField label="Model" value={formData.model} onChange={(v) => handleChange("model", v)} />
        <EditableField label="DN" value={formData.dn} onChange={(v) => handleChange("dn", v)} />
        <EditableField label="PN" value={formData.pn} onChange={(v) => handleChange("pn", v)} />
        <EditableField label="PT" value={formData.pt} onChange={(v) => handleChange("pt", v)} />
        <EditableField label="Body Mat." value={formData.body} onChange={(v) => handleChange("body", v)} />
        <EditableField label="Disc Mat." value={formData.disc} onChange={(v) => handleChange("disc", v)} />
        <EditableField label="Seat Mat." value={formData.seat} onChange={(v) => handleChange("seat", v)} />
        <EditableField label="Temp." value={formData.temp} onChange={(v) => handleChange("temp", v)} highlight />
      </div>

      {/* Action Footer */}
      <div className="bg-white/40 px-6 py-3 border-t border-blue-100 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saveStatus !== "idle"}
          className={`px-6 py-2 text-sm font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 ${saveStatus === "success"
            ? "bg-emerald-500 text-white hover:bg-emerald-600 scale-105"
            : saveStatus === "saving"
              ? "bg-blue-400 text-white cursor-wait"
              : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
        >
          {saveStatus === "saving" && (
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {saveStatus === "saving" ? "Saving..." : saveStatus === "success" ? "Saved Successfully ✓" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function EditableField({ label, value, onChange, highlight }: { label: string; value?: string | null; onChange: (val: string) => void; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</label>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${highlight ? "text-blue-700 bg-blue-50/50" : "text-gray-900"
          }`}
        placeholder="-"
      />
    </div>
  );
}
