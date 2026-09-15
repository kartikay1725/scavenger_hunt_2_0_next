"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import React, { ReactNode } from "react";

export function MotionDiv({
  children,
  className = "",
  delay = 0,
  ...props
}: HTMLMotionProps<"div"> & { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35, delay, ease: [0.2, 0.8, 0.2, 1] }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function Badge({
  children,
  variant = "default",
  className = "",
}: {
  children: ReactNode;
  variant?: "default" | "live" | "danger" | "amber" | "cyan";
  className?: string;
}) {
  const styles = {
    default: "bg-surface-100 text-neutral-300 border-border",
    live: "bg-brand-emerald/10 text-emerald-300 border-brand-emerald/30",
    danger: "bg-brand-rose/10 text-rose-300 border-brand-rose/30",
    amber: "bg-brand-amber/10 text-amber-300 border-brand-amber/30",
    cyan: "bg-brand-cyan/10 text-cyan-300 border-brand-cyan/30",
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-full border ${styles} ${className}`}
    >
      {variant === "live" && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
      )}
      {children}
    </span>
  );
}

export function Toast({
  message,
  type = "info",
}: {
  message: string;
  type?: "info" | "error" | "success";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-surface-100/95 border border-white/10 text-white shadow-2xl backdrop-blur-xl text-sm"
    >
      {type === "error" && <span className="text-brand-rose">⚠</span>}
      {type === "success" && <span className="text-brand-emerald">✓</span>}
      <span>{message}</span>
    </motion.div>
  );
}
