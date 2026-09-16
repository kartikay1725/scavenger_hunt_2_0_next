"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "./ui";
import { Shield, LogOut } from "lucide-react";

interface NavbarProps {
  admin?: boolean;
  gameStatus?: string;
  onLogout?: () => void;
  teamCode?: string;
}

export function Navbar({ admin = false, gameStatus, onLogout, teamCode }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href={admin ? "/admin" : "/"} className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-surface-100/90 border border-white/10 flex items-center justify-center p-1.5 shadow-lg shadow-brand-violet/10 group-hover:scale-105 group-hover:border-brand-violet/40 transition-all duration-200">
            <img
              src="/logo.svg"
              alt="CodeChef Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="font-extrabold text-sm sm:text-base tracking-tight text-white flex items-center gap-2">
              SCAVENGER HUNT <span className="text-brand-cyan">2.0</span>
            </div>
            <div className="text-[10px] tracking-wider uppercase text-neutral-400 font-mono">
              CodeChef Campus Edition
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {teamCode && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-surface-100 border border-border text-xs font-mono">
              <span className="text-neutral-400">TEAM:</span>
              <span className="text-brand-cyan font-bold">{teamCode}</span>
            </div>
          )}

          {gameStatus && (
            <Badge variant={gameStatus === "LIVE" ? "live" : gameStatus === "ENDED" ? "danger" : "amber"}>
              {gameStatus}
            </Badge>
          )}

          {admin && (
            <div className="flex items-center gap-2">
              <Badge variant="cyan" className="hidden sm:inline-flex">
                <Shield className="w-3 h-3" />
                ADMIN
              </Badge>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-surface-100 transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
