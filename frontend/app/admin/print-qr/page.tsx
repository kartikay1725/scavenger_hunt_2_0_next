"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Printer, ArrowLeft, Loader2, Download, CheckCircle2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";

interface LocationRow {
  code: string;
  name: string;
  qr_token: string;
  scan_url?: string;
}

interface LocationWithQR extends LocationRow {
  svg: string;
  dataUrl: string;
}

export default function PrintQRPage() {
  const [locs, setLocs] = useState<LocationWithQR[]>([]);
  const [loading, setLoading] = useState(true);
  const [imagesReady, setImagesReady] = useState(false);
  const [printingCode, setPrintingCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const d = await api<{ locations: LocationRow[] }>("/api/admin/locations");
        const rows = d.locations || [];

        const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3001";

        // Generate vector SVG and high-res PNG dataUrl client-side for 100% reliability
        const withQR: LocationWithQR[] = await Promise.all(
          rows.map(async (loc) => {
            const payload = loc.scan_url || `${origin}/?scan=${encodeURIComponent(loc.qr_token)}`;
            try {
              const svg = await QRCode.toString(payload, {
                type: "svg",
                margin: 1,
                width: 300,
                errorCorrectionLevel: "M",
              });
              const dataUrl = await QRCode.toDataURL(payload, {
                margin: 1,
                width: 600,
                errorCorrectionLevel: "M",
              });
              return { ...loc, svg, dataUrl };
            } catch {
              return { ...loc, svg: "", dataUrl: "" };
            }
          })
        );

        if (!cancelled) {
          setLocs(withQR);
          setImagesReady(true);
        }
      } catch (err) {
        console.error("Failed to load checkpoints for print:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePrintAll = () => {
    if (!imagesReady) return;
    setPrintingCode(null);
    setTimeout(() => {
      window.print();
    }, 50);
  };

  const handlePrintSingle = (code: string) => {
    setPrintingCode(code);
    setTimeout(() => {
      window.print();
      setPrintingCode(null);
    }, 50);
  };

  const handleDownloadSVG = (loc: LocationWithQR) => {
    const blob = new Blob([loc.svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${loc.code}-${loc.name.replace(/\s+/g, "_")}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = (loc: LocationWithQR) => {
    const a = document.createElement("a");
    a.href = loc.dataUrl;
    a.download = `${loc.code}-${loc.name.replace(/\s+/g, "_")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        @media print {
          /* Hide UI chrome */
          .no-print {
            display: none !important;
          }

          /* Reset page canvas */
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body::before {
            display: none !important;
          }

          /* CRITICAL: Disables CSS Grid during print so Chromium paginates properly */
          .print-pages-container {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Single sign filter when printing just one checkpoint */
          .print-single-filter .qr-card:not(.printing-active) {
            display: none !important;
          }

          /* Checkpoint Card Sheet */
          .qr-card {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: space-between !important;
            box-sizing: border-box !important;
            width: 100% !important;
            max-width: 100% !important;
            height: calc(100vh - 20mm) !important;
            min-height: calc(100vh - 20mm) !important;
            max-height: calc(100vh - 20mm) !important;
            margin: 0 0 10mm 0 !important;
            padding: 2.5rem 1.5rem !important;
            border: 6px solid #000000 !important;
            border-radius: 16px !important;
            background: #ffffff !important;
            color: #000000 !important;
          }

          .qr-card:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
            margin-bottom: 0 !important;
          }

          /* Vector SVG inside print sheet */
          .qr-vector-container svg {
            width: 280px !important;
            height: 280px !important;
            display: block !important;
          }
        }
      `}</style>

      <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 sm:p-8">
        {/* On-screen Navigation & Action Bar */}
        <div className="no-print max-w-5xl mx-auto mb-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 sm:p-6 rounded-2xl border border-white/10">
            <div className="space-y-1">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-white transition-colors mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Control Room</span>
              </Link>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-3">
                <span>Checkpoint QR Signage</span>
                <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan">
                  {locs.length} CHECKPOINTS
                </span>
              </h1>
              <p className="text-xs text-neutral-400">
                Print high-resolution, vector-crisp signs for on-campus physical checkpoints. Each sign prints on a full A4 sheet.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
              <button
                onClick={handlePrintAll}
                disabled={!imagesReady || loading}
                className="px-5 py-3 rounded-xl bg-white text-black text-sm font-bold flex items-center gap-2 shadow-xl hover:bg-neutral-200 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
              >
                {loading || !imagesReady ? (
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-800" />
                ) : (
                  <Printer className="w-4 h-4 text-black" />
                )}
                <span>
                  {loading ? "Generating Codes…" : !imagesReady ? "Preparing Signage…" : "Print All Checkpoint Signs"}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-100 border border-border text-xs text-neutral-400">
            <CheckCircle2 className="w-4 h-4 text-brand-cyan flex-shrink-0" />
            <span>
              <b>Print Tips:</b> In your browser's print dialog, set <b>Destination</b> to your printer (or Save as PDF), <b>Margins</b> to Default, and ensure <b>Background graphics</b> is checked.
            </span>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="no-print max-w-md mx-auto py-24 text-center font-mono text-neutral-400 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-brand-violet" />
            <span>Compiling vector checkpoint QR codes…</span>
          </div>
        ) : (
          <div
            className={`print-pages-container max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 ${
              printingCode ? "print-single-filter" : ""
            }`}
          >
            {locs.map((loc) => {
              const isSingleTarget = printingCode === loc.code;
              return (
                <div
                  key={loc.code}
                  className={`qr-card relative bg-white text-black border-4 border-black rounded-3xl p-6 sm:p-8 text-center flex flex-col items-center justify-between min-h-[520px] transition-all shadow-xl ${
                    isSingleTarget ? "printing-active" : ""
                  }`}
                >
                  {/* Per-card individual controls (Hidden during print) */}
                  <div className="no-print absolute top-3 right-3 flex items-center gap-1.5 bg-neutral-100 border border-neutral-200 rounded-xl p-1 shadow-sm">
                    <button
                      onClick={() => handlePrintSingle(loc.code)}
                      title="Print this sign only"
                      className="px-2.5 py-1 text-[11px] font-mono font-bold text-neutral-800 hover:text-black hover:bg-neutral-200 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Print Sign</span>
                    </button>
                    <button
                      onClick={() => handleDownloadSVG(loc)}
                      title="Download Vector SVG"
                      className="p-1.5 text-neutral-600 hover:text-black hover:bg-neutral-200 rounded-lg transition-colors"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Header */}
                  <div className="space-y-2 w-full pt-2">
                    <div className="inline-flex items-center justify-center gap-2 border-2 border-black px-4 py-1 rounded-full">
                      <img src="/logo.svg" alt="CodeChef Logo" className="w-4 h-4 object-contain" />
                      <span className="text-[11px] font-mono font-extrabold tracking-widest uppercase">
                        SCAVENGER HUNT 2.0 — CODECHEF
                      </span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-black tracking-tight uppercase mt-3">
                      {loc.name}
                    </h2>
                  </div>

                  {/* QR Vector Code — 100% Vector SVG rendered directly in DOM */}
                  <div className="my-4 p-4 border-2 border-dashed border-neutral-300 rounded-2xl bg-white flex items-center justify-center">
                    {loc.svg ? (
                      <div
                        className="qr-vector-container w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
                        dangerouslySetInnerHTML={{ __html: loc.svg }}
                      />
                    ) : loc.dataUrl ? (
                      <img
                        src={loc.dataUrl}
                        alt={`QR for ${loc.name}`}
                        width={288}
                        height={288}
                        style={{ width: 288, height: 288, objectFit: "contain" }}
                      />
                    ) : (
                      <div className="w-64 h-64 flex items-center justify-center text-xs font-mono text-neutral-400 border border-neutral-300">
                        QR generation failed
                      </div>
                    )}
                  </div>

                  {/* Footer Directive */}
                  <div className="space-y-1.5 w-full pb-2">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-mono font-bold text-neutral-800">
                      <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                      <span>Scan with in-app camera scanner only</span>
                    </div>
                    <p className="text-[11px] font-mono text-neutral-500 max-w-sm mx-auto leading-relaxed">
                      Scanning an unassigned checkpoint will instantly disqualify your entire team.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
