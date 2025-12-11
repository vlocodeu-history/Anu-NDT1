// app/page.tsx
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #e2f3ff 0%, #ffffff 60%)",
        padding: "32px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.9rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Valve OCR Demo
        </h1>
        <p style={{ color: "#475569", marginBottom: "1.5rem" }}>
          Upload valve photos → backend runs Google Vision → data saved in Supabase.
        </p>

        <div
          style={{
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <a
            href="/upload"
            style={{
              flex: "0 0 220px",
              background: "#fff",
              borderRadius: "16px",
              padding: "16px",
              boxShadow: "0 12px 30px rgba(15, 118, 255, 0.08)",
              border: "1px solid rgba(15, 118, 255, 0.08)",
              textDecoration: "none",
              color: "#0f172a",
            }}
          >
            <h2 style={{ fontSize: "1.05rem", marginBottom: "0.35rem" }}>
              📤 Upload images
            </h2>
            <p style={{ fontSize: "0.78rem", color: "#64748b" }}>
              Select bulk photos and send to /ocr-bulk.
            </p>
          </a>

          <a
            href="/products"
            style={{
              flex: "0 0 220px",
              background: "#fff",
              borderRadius: "16px",
              padding: "16px",
              boxShadow: "0 12px 30px rgba(15, 118, 255, 0.08)",
              border: "1px solid rgba(15, 118, 255, 0.08)",
              textDecoration: "none",
              color: "#0f172a",
            }}
          >
            <h2 style={{ fontSize: "1.05rem", marginBottom: "0.35rem" }}>
              📦 View products
            </h2>
            <p style={{ fontSize: "0.78rem", color: "#64748b" }}>
              Read rows from Supabase + check what OCR stored.
            </p>
          </a>
        </div>
      </div>
    </main>
  );
}
