"use client";

import React, { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { X, Camera, AlertCircle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (token: string) => void;
  busy?: boolean;
}

export function QRScannerModal({ isOpen, onClose, onScan, busy }: QRScannerModalProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDetected = (results: any) => {
    if (busy) return;
    try {
      const raw = Array.isArray(results) ? results[0] : results;
      const text = typeof raw === "string" ? raw : raw?.rawValue || "";
      if (!text) return;

      // Extract scan token if full URL is passed
      let token = text.trim();
      if (token.includes("scan=")) {
        token = decodeURIComponent(token.split("scan=")[1].split("&")[0]);
      }
      onScan(token);
    } catch (e: any) {
      setErrorMsg("Failed to read QR. Ensure code is clearly visible.");
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md rounded-3xl glass-card border border-white/10 p-6 overflow-hidden shadow-2xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-white">
              <Camera className="w-5 h-5 text-brand-cyan" />
              <h3 className="font-bold text-lg">Scan Checkpoint QR</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-surface-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-xs text-neutral-400 mb-4">
            Align the physical location QR code within the frame below.
          </p>

          <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-black border border-white/10">
            <Scanner
              onScan={handleDetected}
              onError={(e: any) => {
                setErrorMsg(
                  typeof e === "string"
                    ? e
                    : e?.message || "Camera access denied or unavailable. Grant camera permissions."
                );
              }}
              constraints={{ facingMode: "environment" }}
              styles={{ container: { width: "100%", height: "100%" } }}
            />

            {/* Scan Reticle & Animated Scan Line */}
            <div className="absolute inset-10 border-2 border-brand-cyan/80 rounded-2xl pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-scan-line" />
            </div>

            {busy && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-white gap-2">
                <RefreshCw className="w-8 h-8 animate-spin text-brand-cyan" />
                <span className="text-sm font-mono">Verifying checkpoint...</span>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="mt-4 p-3 rounded-xl bg-brand-rose/10 border border-brand-rose/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="mt-4 text-center">
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-surface-100 hover:bg-surface-50 text-neutral-300 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
