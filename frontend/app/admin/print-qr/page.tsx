"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface LocationRow {
  code: string;
  name: string;
  qr_token: string;
}

export default function PrintQRPage() {
  const [locs, setLocs] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ locations: LocationRow[] }>("/api/admin/locations")
      .then((d) => setLocs(d.locations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-white text-black p-6 sm:p-12 print:p-0">
      {/* Non-print action header */}
      <div className="max-w-4xl mx-auto mb-8 flex items-center justify-between print:hidden">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-sm text-neutral-600 hover:text-black font-mono transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </Link>
        <button
          onClick={() => window.print()}
          className="px-5 py-2.5 rounded-xl bg-black text-white text-sm font-bold flex items-center gap-2 shadow-lg hover:bg-neutral-800 transition-colors"
        >
          <Printer className="w-4 h-4" />
          <span>Print All Checkpoint Signs</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-24 font-mono text-neutral-400">
          Loading checkpoint cards...
        </div>
      ) : (
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 print:block">
          {locs.map((loc) => (
            <div
              key={loc.code}
              className="border-4 border-black rounded-3xl p-8 text-center flex flex-col items-center justify-between min-h-[500px] print:break-after-page print:min-h-screen print:rounded-none print:border-8 print:p-16 my-4"
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

              {/* QR Image */}
              <div className="my-6 p-4 border-2 border-dashed border-neutral-300 rounded-2xl">
                <img
                  src={`/api/admin/qr/${loc.code}.png`}
                  alt={`QR for ${loc.code}`}
                  className="w-64 h-64 sm:w-72 sm:h-72 object-contain mx-auto"
                />
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
  );
}
