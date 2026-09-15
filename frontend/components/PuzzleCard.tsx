"use client";

import React, { useState } from "react";
import { Code2, Sparkles, Copy, Check, ArrowRight, Lightbulb } from "lucide-react";
import { Badge } from "./ui";

interface Puzzle {
  title: string;
  language: string;
  difficulty: string;
  code: string;
  hint1?: string;
  hint2?: string;
}

interface PuzzleCardProps {
  puzzle: Puzzle;
  answer: string;
  setAnswer: (val: string) => void;
  onSubmit: () => void;
  onGetHint: (level: number) => void;
  hintText: string;
  busy: boolean;
}

export function PuzzleCard({
  puzzle,
  answer,
  setAnswer,
  onSubmit,
  onGetHint,
  hintText,
  busy,
}: PuzzleCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(puzzle.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={puzzle.language === "Python" ? "cyan" : "amber"}>
              {puzzle.language}
            </Badge>
            <Badge variant="default">{puzzle.difficulty}</Badge>
            <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
              Exclusive Team Assignment
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            {puzzle.title}
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Trace or execute the program. The final output is an indirect clue to your next physical location.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-100 hover:bg-surface-50 border border-border text-xs font-mono text-neutral-300 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-brand-emerald" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "COPIED" : "COPY CODE"}
          </button>
        </div>
      </div>

      {/* Code Container */}
      <div className="rounded-2xl border border-white/10 bg-[#07070d] overflow-hidden shadow-inner">
        <div className="px-4 py-2.5 bg-surface-100/80 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-brand-rose/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-brand-amber/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-brand-emerald/60" />
            <span className="ml-2 text-xs font-mono text-neutral-400">
              checkpoint_challenge.{puzzle.language === "Python" ? "py" : "cpp"}
            </span>
          </div>
          <span className="text-[10px] font-mono text-brand-cyan tracking-wider">READ-ONLY</span>
        </div>
        <pre className="p-4 sm:p-6 overflow-x-auto text-xs sm:text-sm font-mono text-neutral-200 leading-relaxed max-h-[420px] select-text">
          <code>{puzzle.code}</code>
        </pre>
      </div>

      {/* Answer Submission */}
      <div className="pt-2 space-y-4">
        <div>
          <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-2">
            Enter Interpreted Clue / Answer
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && answer.trim() && !busy && onSubmit()}
              placeholder="e.g. STAGE MIC SHOW or auditorium"
              className="flex-1 px-4 py-3.5 rounded-xl bg-surface-100 border border-border focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20 text-white placeholder-neutral-500 font-mono text-sm outline-none transition-all"
            />
            <button
              onClick={onSubmit}
              disabled={busy || !answer.trim()}
              className="gradient-brand-btn px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50 disabled:pointer-events-none"
            >
              <span>Submit Answer</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hints */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          <span className="text-xs text-neutral-500 flex items-center gap-1 mr-2">
            <Lightbulb className="w-3.5 h-3.5 text-brand-amber" />
            Stuck?
          </span>
          <button
            onClick={() => onGetHint(1)}
            className="px-3 py-1.5 rounded-xl bg-surface-100 hover:bg-surface-50 border border-border text-xs text-neutral-300 font-medium transition-colors"
          >
            Hint 1
          </button>
          <button
            onClick={() => onGetHint(2)}
            className="px-3 py-1.5 rounded-xl bg-surface-100 hover:bg-surface-50 border border-border text-xs text-neutral-300 font-medium transition-colors"
          >
            Hint 2
          </button>

          {hintText && (
            <div className="w-full mt-2 p-3 rounded-xl bg-brand-amber/10 border border-brand-amber/20 text-amber-200 text-xs font-mono">
              💡 {hintText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
