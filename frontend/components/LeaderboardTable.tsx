"use client";

import React, { useState, useMemo } from "react";
import {
  Trophy,
  Medal,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Search,
  Users,
  Flame,
  X,
  Award,
  AlertCircle,
} from "lucide-react";
import { Badge } from "./ui";
import { formatSeconds } from "@/lib/api";

export interface ResultRow {
  rank: number | string;
  team: string;
  score: number;
  completed: number;
  status: string;
  final_result_seconds?: number | null;
  finish_time?: string | null;
  disqualification_reason?: string | null;
}

export function LeaderboardTable({ results }: { results: ResultRow[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "FINISHERS" | "INCOMPLETE" | "DISQUALIFIED">("ALL");

  // Summary statistics
  const stats = useMemo(() => {
    const total = results?.length || 0;
    const finishers = results?.filter((r) => r.status === "FINISHED" || r.completed >= 10).length || 0;
    const disqualified = results?.filter((r) => r.status === "DISQUALIFIED").length || 0;
    const active = total - finishers - disqualified;
    return { total, finishers, disqualified, active };
  }, [results]);

  // Top 3 Podium finishers (full finishers only)
  const podium = useMemo(() => {
    const fullFinishers = results?.filter((r) => r.status !== "DISQUALIFIED" && (r.completed >= 10 || r.status === "FINISHED")) || [];
    return fullFinishers.slice(0, 3);
  }, [results]);

  // Filtered and searched list
  const filteredResults = useMemo(() => {
    if (!results) return [];
    return results.filter((row) => {
      const matchesSearch = row.team.toLowerCase().includes(search.toLowerCase().trim());
      if (!matchesSearch) return false;

      if (filter === "FINISHERS") {
        return row.status !== "DISQUALIFIED" && (row.completed >= 10 || row.status === "FINISHED");
      }
      if (filter === "INCOMPLETE") {
        return row.status !== "DISQUALIFIED" && row.completed < 10 && row.status !== "FINISHED";
      }
      if (filter === "DISQUALIFIED") {
        return row.status === "DISQUALIFIED";
      }
      return true;
    });
  }, [results, search, filter]);

  if (!results || results.length === 0) {
    return (
      <div className="glass-card rounded-3xl p-12 text-center text-neutral-400 border border-white/10 shadow-2xl">
        <Trophy className="w-14 h-14 text-neutral-600 mx-auto mb-3" />
        <h3 className="text-xl font-bold text-white mb-1">Results Pending</h3>
        <p className="text-sm">The organizers have not published the official rankings yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full">
      {/* 1. Quick Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-violet/15 border border-brand-violet/30 flex items-center justify-center text-brand-violet shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-neutral-400">Total Teams</div>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">{stats.total}</div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-emerald/15 border border-brand-emerald/30 flex items-center justify-center text-brand-emerald shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-neutral-400">Full Finishers</div>
            <div className="text-xl sm:text-2xl font-black text-brand-emerald font-mono">{stats.finishers}</div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-cyan/15 border border-brand-cyan/30 flex items-center justify-center text-brand-cyan shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-neutral-400">Active / Trail</div>
            <div className="text-xl sm:text-2xl font-black text-brand-cyan font-mono">{stats.active}</div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 sm:p-5 border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-neutral-400">Disqualified</div>
            <div className="text-xl sm:text-2xl font-black text-rose-400 font-mono">{stats.disqualified}</div>
          </div>
        </div>
      </div>

      {/* 2. Top 3 Podium (Displays if full finishers exist) */}
      {podium.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 uppercase tracking-wider">
            <Award className="w-4 h-4 text-amber-400" />
            <span>Victory Stage Podium</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 1st Place */}
            {podium[0] && (
              <div className="order-1 sm:order-2 glass-card rounded-3xl p-6 sm:p-7 border-2 border-amber-400/40 bg-gradient-to-b from-amber-500/10 via-surface-100 to-surface-200 text-center relative overflow-hidden shadow-2xl shadow-amber-500/10">
                <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-400/10 rounded-full blur-2xl" />
                <span className="text-4xl mb-2 block">🥇</span>
                <span className="inline-block text-[11px] font-mono font-black tracking-widest text-amber-300 uppercase px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/30 mb-2">
                  CHAMPION • 1ST PLACE
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">
                  {podium[0].team}
                </h3>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-black/40 border border-amber-400/20 text-amber-300 font-mono font-bold text-sm">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatSeconds(podium[0].final_result_seconds)}</span>
                </div>
              </div>
            )}

            {/* 2nd Place */}
            {podium[1] && (
              <div className="order-2 sm:order-1 glass-card rounded-3xl p-5 sm:p-6 border border-slate-300/30 bg-gradient-to-b from-slate-400/10 via-surface-100 to-surface-200 text-center relative overflow-hidden shadow-lg">
                <span className="text-3xl mb-2 block">🥈</span>
                <span className="inline-block text-[10px] font-mono font-bold tracking-widest text-slate-300 uppercase px-2.5 py-0.5 rounded-full bg-slate-400/20 border border-slate-400/30 mb-2">
                  RUNNER UP • 2ND PLACE
                </span>
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight truncate">
                  {podium[1].team}
                </h3>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-black/40 border border-white/10 text-slate-200 font-mono font-bold text-sm">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatSeconds(podium[1].final_result_seconds)}</span>
                </div>
              </div>
            )}

            {/* 3rd Place */}
            {podium[2] && (
              <div className="order-3 glass-card rounded-3xl p-5 sm:p-6 border border-amber-700/30 bg-gradient-to-b from-amber-700/10 via-surface-100 to-surface-200 text-center relative overflow-hidden shadow-lg">
                <span className="text-3xl mb-2 block">🥉</span>
                <span className="inline-block text-[10px] font-mono font-bold tracking-widest text-amber-500 uppercase px-2.5 py-0.5 rounded-full bg-amber-700/20 border border-amber-700/30 mb-2">
                  PODIUM • 3RD PLACE
                </span>
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight truncate">
                  {podium[2].team}
                </h3>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-black/40 border border-white/10 text-amber-400 font-mono font-bold text-sm">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatSeconds(podium[2].final_result_seconds)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all shrink-0 cursor-pointer ${
              filter === "ALL"
                ? "bg-white text-black shadow-md shadow-white/10"
                : "bg-surface-100 text-neutral-400 hover:text-white border border-border hover:bg-surface-200"
            }`}
          >
            All Teams ({stats.total})
          </button>
          <button
            onClick={() => setFilter("FINISHERS")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all shrink-0 cursor-pointer ${
              filter === "FINISHERS"
                ? "bg-brand-emerald text-black shadow-md shadow-brand-emerald/20"
                : "bg-surface-100 text-neutral-400 hover:text-white border border-border hover:bg-surface-200"
            }`}
          >
            Finishers ({stats.finishers})
          </button>
          <button
            onClick={() => setFilter("INCOMPLETE")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all shrink-0 cursor-pointer ${
              filter === "INCOMPLETE"
                ? "bg-brand-cyan text-black shadow-md shadow-brand-cyan/20"
                : "bg-surface-100 text-neutral-400 hover:text-white border border-border hover:bg-surface-200"
            }`}
          >
            In Progress ({stats.active})
          </button>
          <button
            onClick={() => setFilter("DISQUALIFIED")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all shrink-0 cursor-pointer ${
              filter === "DISQUALIFIED"
                ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
                : "bg-surface-100 text-neutral-400 hover:text-white border border-border hover:bg-surface-200"
            }`}
          >
            Disqualified ({stats.disqualified})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative sm:w-64">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team name..."
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-surface-100 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-brand-violet transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Desktop View: High-Density Elegant Table */}
      <div className="hidden md:block glass-card rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-surface-100/60 text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
                <th className="py-4 px-6 w-20">Rank</th>
                <th className="py-4 px-6 min-w-[280px]">Team Name</th>
                <th className="py-4 px-6 text-center w-36 whitespace-nowrap">Score</th>
                <th className="py-4 px-6 text-center w-48 whitespace-nowrap">Checkpoints</th>
                <th className="py-4 px-6 text-right w-40 whitespace-nowrap">Final Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-neutral-400 font-mono text-xs">
                    No teams match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredResults.map((row) => {
                  const isDisqualified = row.status === "DISQUALIFIED";
                  const isFirst = !isDisqualified && row.rank === 1;
                  const isSecond = !isDisqualified && row.rank === 2;
                  const isThird = !isDisqualified && row.rank === 3;
                  const isFinished = !isDisqualified && (row.completed >= 10 || row.status === "FINISHED");

                  return (
                    <tr
                      key={row.team}
                      className={`transition-colors ${
                        isDisqualified
                          ? "bg-rose-500/[0.03] hover:bg-rose-500/[0.06]"
                          : isFirst
                          ? "bg-amber-500/[0.05] hover:bg-amber-500/[0.08]"
                          : isSecond
                          ? "bg-slate-400/[0.03] hover:bg-slate-400/[0.06]"
                          : isThird
                          ? "bg-amber-700/[0.03] hover:bg-amber-700/[0.06]"
                          : "hover:bg-white/[0.02]"
                      }`}
                    >
                      {/* Rank Cell */}
                      <td className="py-4 px-6 font-bold font-mono">
                        {isDisqualified ? (
                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-black">
                            DQ
                          </span>
                        ) : isFirst ? (
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-300 text-base shadow-sm">
                            🥇
                          </span>
                        ) : isSecond ? (
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-slate-400/20 border border-slate-400/40 text-slate-300 text-base shadow-sm">
                            🥈
                          </span>
                        ) : isThird ? (
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-amber-700/20 border border-amber-700/40 text-amber-400 text-base shadow-sm">
                            🥉
                          </span>
                        ) : (
                          <span className="text-neutral-400 font-mono text-sm pl-2">#{row.rank}</span>
                        )}
                      </td>

                      {/* Team Cell */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2.5">
                          <span className="font-extrabold text-white text-base tracking-tight">{row.team}</span>
                          {isDisqualified ? (
                            <Badge variant="danger" className="text-[10px] py-0.5 px-2">
                              DISQUALIFIED
                            </Badge>
                          ) : isFinished ? (
                            <Badge variant="live" className="text-[10px] py-0.5 px-2">
                              <CheckCircle2 className="w-3 h-3" />
                              10 / 10 FINISHER
                            </Badge>
                          ) : (
                            <Badge variant="cyan" className="text-[10px] py-0.5 px-2">
                              IN PROGRESS
                            </Badge>
                          )}
                        </div>

                        {/* Disqualification Reason Callout Box */}
                        {isDisqualified && (
                          <div className="mt-2.5 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2.5 max-w-xl">
                            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <div className="space-y-0.5 font-mono leading-relaxed">
                              <div className="font-bold text-rose-300">Route Elimination Notice:</div>
                              <div className="text-rose-300/80 text-[11px]">
                                {row.disqualification_reason || "Wrong checkpoint scanned outside of assigned team trail."}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Score Cell */}
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-3.5 py-1.5 rounded-xl font-bold font-mono text-sm shadow-sm ${
                            isDisqualified
                              ? "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                              : "bg-surface-100 border border-border text-brand-cyan"
                          }`}
                        >
                          {row.score} / 10 pts
                        </span>
                      </td>

                      {/* Progress Bar Cell */}
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        <div className="w-32 mx-auto space-y-1.5">
                          <div className="w-full bg-surface-100 border border-white/10 rounded-full h-2.5 overflow-hidden p-0.5">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isDisqualified
                                  ? "bg-rose-500/60"
                                  : isFinished
                                  ? "bg-brand-emerald"
                                  : "bg-gradient-to-r from-brand-violet to-brand-cyan"
                              }`}
                              style={{ width: `${Math.min(100, (row.completed / 10) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-neutral-400">
                            {row.completed} of 10 cleared
                          </span>
                        </div>
                      </td>

                      {/* Final Time Cell */}
                      <td className="py-4 px-6 text-right whitespace-nowrap font-mono font-bold">
                        {isDisqualified ? (
                          <span className="inline-block px-3 py-1 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono font-bold">
                            ELIMINATED
                          </span>
                        ) : (
                          <span className="text-white text-sm">
                            {formatSeconds(row.final_result_seconds)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Mobile View: Responsive Glassmorphic Cards (Zero Table Cramping) */}
      <div className="md:hidden space-y-3.5">
        {filteredResults.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center text-neutral-400 font-mono text-xs border border-white/10">
            No teams match your search.
          </div>
        ) : (
          filteredResults.map((row) => {
            const isDisqualified = row.status === "DISQUALIFIED";
            const isFirst = !isDisqualified && row.rank === 1;
            const isSecond = !isDisqualified && row.rank === 2;
            const isThird = !isDisqualified && row.rank === 3;
            const isFinished = !isDisqualified && (row.completed >= 10 || row.status === "FINISHED");

            return (
              <div
                key={row.team}
                className={`glass-card rounded-2xl p-4 sm:p-5 border transition-all space-y-4 ${
                  isDisqualified
                    ? "border-rose-500/30 bg-gradient-to-b from-rose-500/[0.04] to-transparent shadow-lg shadow-rose-500/5"
                    : isFirst
                    ? "border-amber-400/40 bg-gradient-to-b from-amber-500/[0.08] to-transparent shadow-xl shadow-amber-500/10"
                    : isSecond
                    ? "border-slate-300/30 bg-gradient-to-b from-slate-400/[0.05] to-transparent"
                    : isThird
                    ? "border-amber-700/30 bg-gradient-to-b from-amber-700/[0.05] to-transparent"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                {/* Mobile Card Header */}
                <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isDisqualified ? (
                      <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-black font-mono shrink-0">
                        DQ
                      </span>
                    ) : isFirst ? (
                      <span className="text-xl shrink-0">🥇</span>
                    ) : isSecond ? (
                      <span className="text-xl shrink-0">🥈</span>
                    ) : isThird ? (
                      <span className="text-xl shrink-0">🥉</span>
                    ) : (
                      <span className="text-xs font-mono font-bold text-neutral-400 px-2 py-0.5 rounded-lg bg-surface-100 shrink-0">
                        #{row.rank}
                      </span>
                    )}

                    <h4 className="font-extrabold text-white text-base tracking-tight truncate">
                      {row.team}
                    </h4>
                  </div>

                  <div className="shrink-0">
                    {isDisqualified ? (
                      <Badge variant="danger" className="text-[10px] py-0.5 px-2">
                        DISQUALIFIED
                      </Badge>
                    ) : isFinished ? (
                      <Badge variant="live" className="text-[10px] py-0.5 px-2">
                        FINISHER
                      </Badge>
                    ) : (
                      <Badge variant="cyan" className="text-[10px] py-0.5 px-2">
                        ACTIVE
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Mobile Card Metrics (2-Column Grid) */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {/* Score & Progress */}
                  <div className="bg-black/30 border border-white/5 rounded-xl p-2.5 space-y-1.5">
                    <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
                      Checkpoints Cleared
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono font-black text-white">
                        {row.score} <span className="text-xs text-neutral-500 font-normal">/ 10</span>
                      </span>
                      <span className="text-[11px] font-mono text-neutral-400">
                        {Math.round((row.completed / 10) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-surface-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isDisqualified
                            ? "bg-rose-500/70"
                            : isFinished
                            ? "bg-brand-emerald"
                            : "bg-gradient-to-r from-brand-violet to-brand-cyan"
                        }`}
                        style={{ width: `${Math.min(100, (row.completed / 10) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Final Time */}
                  <div className="bg-black/30 border border-white/5 rounded-xl p-2.5 space-y-1">
                    <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
                      Official Time
                    </div>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span className="text-sm font-mono font-black text-white truncate">
                        {isDisqualified ? (
                          <span className="text-rose-400 text-xs">Eliminated</span>
                        ) : (
                          formatSeconds(row.final_result_seconds)
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mobile Disqualification Notice */}
                {isDisqualified && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-mono font-bold text-[11px] text-rose-400">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span>Route Disqualification Reason</span>
                    </div>
                    <p className="text-[11px] font-mono text-rose-300/80 leading-snug">
                      {row.disqualification_reason || "Checkpoint scanned was not the team's assigned route checkpoint."}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
