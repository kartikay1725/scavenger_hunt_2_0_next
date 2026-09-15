"use client";

import React from "react";
import { Trophy, Medal, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "./ui";
import { formatSeconds } from "@/lib/api";

export interface ResultRow {
  rank: number;
  team: string;
  score: number;
  completed: number;
  status: string;
  final_result_seconds?: number | null;
  finish_time?: string | null;
}

export function LeaderboardTable({ results }: { results: ResultRow[] }) {
  if (!results || results.length === 0) {
    return (
      <div className="glass-card rounded-3xl p-12 text-center text-neutral-400">
        <Trophy className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-white mb-1">Results Pending</h3>
        <p className="text-sm">The admin has not published the final rankings yet.</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl overflow-hidden border border-white/10">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-surface-100/50 text-xs font-mono text-neutral-400 uppercase tracking-wider">
              <th className="py-4 px-4 sm:px-6">Rank</th>
              <th className="py-4 px-4 sm:px-6">Team</th>
              <th className="py-4 px-4 sm:px-6 text-center">Score</th>
              <th className="py-4 px-4 sm:px-6 text-center">Progress</th>
              <th className="py-4 px-4 sm:px-6 text-right">Final Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-sm">
            {results.map((row) => {
              const isFirst = row.rank === 1;
              const isSecond = row.rank === 2;
              const isThird = row.rank === 3;
              const isFinished = row.completed === 10 || row.status === "FINISHED";

              return (
                <tr
                  key={row.team}
                  className={`transition-colors hover:bg-white/[0.02] ${
                    isFirst ? "bg-amber-500/[0.04]" : ""
                  }`}
                >
                  <td className="py-4 px-4 sm:px-6 font-bold font-mono">
                    {isFirst ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-400/20 text-amber-300">
                        🥇
                      </span>
                    ) : isSecond ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-400/20 text-slate-300">
                        🥈
                      </span>
                    ) : isThird ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-700/20 text-amber-500">
                        🥉
                      </span>
                    ) : (
                      <span className="text-neutral-400 ml-2">#{row.rank}</span>
                    )}
                  </td>
                  <td className="py-4 px-4 sm:px-6">
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>{row.team}</span>
                      {isFinished && (
                        <CheckCircle2 className="w-4 h-4 text-brand-emerald inline" />
                      )}
                    </div>
                    <div className="text-xs text-neutral-400 font-mono">
                      {isFinished ? "10/10 FINISHER" : `${row.completed}/10 checkpoints`}
                    </div>
                  </td>
                  <td className="py-4 px-4 sm:px-6 text-center">
                    <span className="inline-block px-3 py-1 rounded-xl bg-surface-100 font-bold font-mono text-brand-cyan">
                      {row.score} / 10
                    </span>
                  </td>
                  <td className="py-4 px-4 sm:px-6 text-center font-mono text-neutral-300">
                    <div className="w-24 mx-auto bg-surface-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-brand-violet to-brand-cyan h-full rounded-full"
                        style={{ width: `${Math.min(100, row.completed * 10)}%` }}
                      />
                    </div>
                    <span className="text-xs text-neutral-400 mt-1 block">
                      {row.completed} / 10
                    </span>
                  </td>
                  <td className="py-4 px-4 sm:px-6 text-right font-mono font-bold text-neutral-200">
                    {formatSeconds(row.final_result_seconds)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
