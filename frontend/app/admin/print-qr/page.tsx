"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Printer, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

interface LocationRow {
  code: string;
  name: string;
  qr_token: string;
}

interface LocationWithQR extends LocationRow {
  dataUrl: string | null; // base64 PNG data URI
}

export default function PrintQRPage() {
  const [locs, setLocs] = useState<LocationWithQR[]>([]);
  const [loading, setLoading] = useState(true);
  const [imagesReady, setImagesReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const d = await api<{ locations: LocationRow[] }>("/api/admin/locations");
        const rows = d.locations || [];

        // Fetch each QR image as a blob and convert to data: URI
        // so it's fully embedded (bypasses auth cookie issues in print preview)
        const withQR: LocationWithQR[] = await Promise.all(
          rows.map(async (loc) => {
            try {
              const resp = await fetch(`/api/admin/qr/${loc.code}.png`, {
                credentials: "include",
              });
              if (!resp.ok) return { ...loc, dataUrl: null };
              const blob = await resp.blob();
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              return { ...loc, dataUrl };
            } catch {
              return { ...loc, dataUrl: null };
            }
          })
        );

        if (!cancelled) {
          setLocs(withQR);
          setImagesReady(true);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  const handlePrint = () => {
    if (!imagesReady) return;
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          .qr-card {
            page-break-after: always;
            break-after: page;
            min-height: 100vh;
            border: 8px solid black !important;
            border-radius: 0 !important;
            padding: 4rem !important;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
          }
          .qr-card:last-child { page-break-after: avoid; break-after: avoid; }
        }
      `}</style>

      <div className="min-h-screen bg-white text-black p-6 sm:p-12">
        {/* Non-print action header */}
        <div className="no-print max-w-4xl mx-auto mb-8 flex items-center justify-between">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-sm text-neutral-600 hover:text-black font-mono transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </Link>
          <button
            onClick={handlePrint}
            disabled={!imagesReady || loading}
            className="px-5 py-2.5 rounded-xl bg-black text-white text-sm font-bold flex items-center gap-2 shadow-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors"
          >
            {loading || !imagesReady ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            <span>{loading ? "Loading QR Codes…" : !imagesReady ? "Preparing…" : "Print All Checkpoint Signs"}</span>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-24 font-mono text-neutral-400 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
            <span>Loading and embedding QR codes…</span>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            {locs.map((loc) => (
              <div
                key={loc.code}
                className="qr-card border-4 border-black rounded-3xl p-8 text-center flex flex-col items-center justify-between min-h-[500px] my-4"
              >
                <div className="space-y-2">
                  <div className="text-xs font-mono font-bold tracking-widest uppercase border border-black px-3 py-1 rounded-full inline-block">
                    SCAVENGER HUNT 2.0 — CODECHEF
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight uppercase mt-2">
                    {loc.name}
                  </h1>
                  <div className="text-xl font-mono font-bold text-neutral-600">
                    {loc.code}
                  </div>
                </div>

                {/* QR Image — embedded as data: URI so it renders in print preview */}
                <div className="my-6 p-4 border-2 border-dashed border-neutral-300 rounded-2xl">
                  {loc.dataUrl ? (
                    <img
                      src={loc.dataUrl}
                      alt={`QR for ${loc.code}`}
                      width={288}
                      height={288}
                      style={{ width: 288, height: 288, objectFit: "contain" }}
                    />
                  ) : (
                    <div className="w-72 h-72 flex items-center justify-center text-xs font-mono text-neutral-400 border border-neutral-300">
                      QR unavailable
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-mono text-neutral-600">
                    Scan using the in-app camera scanner.
                  </p>
                  <p className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                    TOKEN: {loc.qr_token}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
