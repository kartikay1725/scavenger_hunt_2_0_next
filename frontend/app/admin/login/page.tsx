"use client";

import React, { FormEvent, useState } from "react";
import { LockKeyhole, ShieldCheck, ArrowRight, Terminal } from "lucide-react";
import { api } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { MotionDiv, Badge } from "@/components/ui";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      router.push("/admin");
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar admin />
      <main className="flex-1 flex items-center justify-center p-4">
        <MotionDiv className="w-full max-w-md glass-card rounded-3xl p-8 sm:p-10 space-y-6 border border-white/10 shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-surface-100/90 border border-white/10 flex items-center justify-center p-2 shadow-lg shadow-brand-violet/10">
                <img src="/logo.svg" alt="CodeChef Logo" className="w-full h-full object-contain" />
              </div>
              <Badge variant="cyan">
                <ShieldCheck className="w-3.5 h-3.5" />
                ORGANIZER ACCESS
              </Badge>
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">
                Control Room Login
              </h1>
              <p className="text-xs text-neutral-400 mt-1">
                Manage teams, physical checkpoints, puzzle bank assignments, timing, and public results.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-2">
                Username
              </label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-4 py-3 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20 font-mono transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-3 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20 font-mono transition-all"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-brand-rose/10 border border-brand-rose/20 text-rose-300 text-xs flex items-center gap-2">
                <LockKeyhole className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Quick credentials hint */}
            <div className="p-3 rounded-xl bg-surface-100/70 border border-white/5 flex items-center justify-between text-xs font-mono text-neutral-400">
              <div className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-brand-cyan" />
                <span>Default: <strong className="text-white">codechef</strong> / <strong className="text-white">codechef@2026</strong></span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUsername("codechef");
                  setPassword("codechef@2026");
                }}
                className="text-[11px] text-brand-cyan hover:underline"
              >
                Auto-fill
              </button>
            </div>

            <button
              type="submit"
              disabled={busy || !username || !password}
              className="w-full gradient-brand-btn py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50 transition-all mt-2"
            >
              <span>{busy ? "Authenticating..." : "Enter Command Center"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </MotionDiv>
      </main>
    </div>
  );
}
