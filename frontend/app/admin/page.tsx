"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Download,
  Flag,
  LogOut,
  MapPinned,
  Megaphone,
  Pause,
  Play,
  Plus,
  PlusCircle,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldAlert,
  Sparkles,
  Square,
  Timer,
  Trash2,
  Trophy,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api, formatSeconds, downloadBlob } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { MotionDiv, Badge, Toast } from "@/components/ui";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface GameState {
  status: string;
  start_at?: string;
  end_at?: string;
  duration_seconds: number;
  token_buffer_seconds: number;
  session_limit_minutes: number;
  checkpoint_count: number;
  starting_room: string;
  results_published: boolean;
  remaining_seconds?: number;
  server_time?: string;
}

interface Team {
  id: string;
  team_name: string;
  team_code: string;
  members: { name: string; created_at?: string }[];
  members_count: number;
  score: number;
  completed: number;
  status: string;
  current_location?: string;
  final_result_seconds?: number;
  game_elapsed_seconds?: number;
  entry_differential_seconds?: number;
  result_token_seconds?: number;
  finish_at?: string;
  disqualification_reason?: string;
  disqualified_at?: string;
}

interface PlayerRow {
  id: string;
  name: string;
  team_name: string;
  team_code: string;
  team_status: string;
  joined_at?: string;
}

interface LocationRow {
  code: string;
  name: string;
  qr_token: string;
}

interface PuzzleRow {
  id: string;
  puzzle_key: string;
  location_code: string;
  location_name: string;
  language: string;
  difficulty: string;
  title: string;
  code?: string;
  answer?: string;
}

interface ScanRow {
  id: string;
  team_name: string;
  player_name: string;
  location_code: string;
  location_name: string;
  expected_code: string;
  expected_name: string;
  valid: boolean;
  reason?: string;
  timestamp?: string;
}

interface DisqualificationRow {
  id: string;
  team_name: string;
  team_code: string;
  members: string[];
  reason: string;
  expected: string;
  scanned: string;
  disqualified_at?: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<
    "overview" | "teams" | "players" | "locations" | "puzzles" | "config" | "scans" | "disqualifications" | "results"
  >("overview");

  const [game, setGame] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [locs, setLocs] = useState<LocationRow[]>([]);
  const [puzzles, setPuzzles] = useState<PuzzleRow[]>([]);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [disqualifications, setDisqualifications] = useState<DisqualificationRow[]>([]);

  const [toast, setToast] = useState<{ msg: string; type?: "info" | "error" | "success" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form states
  const [teamName, setTeamName] = useState("");
  const [startAt, setStartAt] = useState("");
  const [durationMins, setDurationMins] = useState(60);
  const [bufferSec, setBufferSec] = useState(20);
  const [sessionMins, setSessionMins] = useState(180);
  const [startingRoom, setStartingRoom] = useState("Seminar Hall 2");
  const configDirtyRef = React.useRef(false); // useRef so polling interval always reads current value

  // Direct member addition modal/state
  const [memberInputTeamId, setMemberInputTeamId] = useState<string | null>(null);
  const [newMemberName, setNewMemberName] = useState("");

  // Inline disqualify modal
  const [dqTeam, setDqTeam] = useState<{ id: string; name: string } | null>(null);
  const [dqReason, setDqReason] = useState("Out-of-order scan / misconduct");

  // Inline delete confirmation
  const [deleteTeam, setDeleteTeam] = useState<{ id: string; name: string } | null>(null);

  // Generic confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{ msg: string; onConfirm: () => void } | null>(null);

  // Custom puzzle form
  const [puzzleLoc, setPuzzleLoc] = useState("LOC-01");
  const [puzzleLang, setPuzzleLang] = useState("Python");
  const [puzzleDiff, setPuzzleDiff] = useState("Medium");
  const [puzzleTitle, setPuzzleTitle] = useState("");
  const [puzzleCode, setPuzzleCode] = useState("");
  const [puzzleAnswer, setPuzzleAnswer] = useState("");
  const [puzzleHint1, setPuzzleHint1] = useState("");
  const [puzzleHint2, setPuzzleHint2] = useState("");

  // Live countdown clock state
  const [liveSecondsRemaining, setLiveSecondsRemaining] = useState<number | null>(null);

  const showToast = (msg: string, type: "info" | "error" | "success" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    showToast(`Copied ${text} to clipboard!`, "success");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const loadData = async () => {
    try {
      const [g, t, l, p, pl, sc, dq] = await Promise.all([
        api<any>("/api/game"),
        api<any>("/api/admin/teams"),
        api<any>("/api/admin/locations"),
        api<any>("/api/admin/puzzles"),
        api<any>("/api/admin/players").catch(() => ({ players: [] })),
        api<any>("/api/admin/scans").catch(() => ({ scans: [] })),
        api<any>("/api/admin/disqualifications").catch(() => ({ disqualifications: [] })),
      ]);

      setGame(g.game);
      setTeams(t.teams || []);
      setLocs(l.locations || []);
      setPuzzles(p.puzzles || []);
      setPlayers(pl.players || []);
      setScans(sc.scans || []);
      setDisqualifications(dq.disqualifications || []);

      if (g.game && typeof g.game.remaining_seconds === "number") {
        setLiveSecondsRemaining(g.game.remaining_seconds);
      }

      if (g.game && !configDirtyRef.current) {
        setDurationMins(Math.round((g.game.duration_seconds || 3600) / 60));
        setBufferSec(g.game.token_buffer_seconds ?? 20);
        setSessionMins(g.game.session_limit_minutes ?? 180);
        setStartingRoom(g.game.starting_room || "Seminar Hall 2");
        if (g.game.start_at) {
          const d = new Date(g.game.start_at);
          const pad = (n: number) => String(n).padStart(2, "0");
          const localStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          setStartAt(localStr);
        } else {
          setStartAt("");
        }
      }
    } catch (e: any) {
      if (String(e.message).includes("Admin authentication")) {
        router.push("/admin/login");
      } else {
        showToast(e.message, "error");
      }
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  // 1-second interval for real-time countdown decrement when LIVE
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveSecondsRemaining((prev) => {
        if (prev == null || prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handlePost = async (path: string, body: any = {}) => {
    setBusy(true);
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      showToast("Action completed successfully", "success");
      await loadData();
    } catch (e: any) {
      showToast(e.message || "Failed to execute", "error");
      await loadData();
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api("/api/admin/logout", { method: "POST" });
    } finally {
      router.push("/admin/login");
    }
  };

  const isLive = game?.status === "LIVE";
  const isPaused = game?.status === "PAUSED";
  const isEnded = game?.status === "ENDED";
  const isSetup = game?.status === "SETUP" || game?.status === "READY" || !game?.status;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar admin gameStatus={game?.status} onLogout={handleLogout} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full space-y-8">
        {/* Header Ribbon & Live Status Bar */}
        <div className="glass-card rounded-3xl p-6 sm:p-8 border border-white/[0.1] space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="cyan">CONTROL ROOM</Badge>
                <span className="text-xs font-mono text-neutral-400">
                  Authoritative Server Engine
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Event Command Center
              </h1>
              <p className="text-xs text-neutral-400 mt-1">
                Active Room: <strong className="text-white">{game?.starting_room || "Seminar Hall 2"}</strong> · Venue: In-person Checkpoints
              </p>
            </div>

            {/* Live Clock & Countdown Widget */}
            <div className="flex flex-wrap items-center gap-4 bg-surface-100/80 border border-white/10 rounded-2xl p-4 sm:p-5">
              <div className="space-y-1">
                <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brand-cyan" />
                  <span>GAME STATUS</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={isLive ? "live" : isPaused ? "amber" : isEnded ? "danger" : "cyan"}
                    className="text-xs px-3 py-1 font-mono uppercase font-bold"
                  >
                    {game?.status || "SETUP"}
                  </Badge>
                  {game?.results_published && (
                    <Badge variant="live" className="text-[10px]">
                      RESULTS LIVE ON /
                    </Badge>
                  )}
                </div>
              </div>

              <div className="h-10 w-[1px] bg-white/10 hidden sm:block" />

              <div className="space-y-1">
                <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-brand-violet" />
                  <span>COUNTDOWN CLOCK</span>
                </div>
                <div className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight">
                  {formatSeconds(liveSecondsRemaining ?? game?.duration_seconds ?? 3600)}
                </div>
              </div>

              <div className="h-10 w-[1px] bg-white/10 hidden sm:block" />

              {/* Quick Lifecycle Action Suite */}
              <div className="flex flex-wrap items-center gap-2">
                {isSetup && (
                  <button
                    onClick={() => handlePost("/api/admin/start")}
                    disabled={busy}
                    className="gradient-brand-btn px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>START GAME NOW</span>
                  </button>
                )}

                {isLive && (
                  <>
                    <button
                      onClick={() => handlePost("/api/admin/pause")}
                      disabled={busy}
                      className="px-3.5 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </button>
                    <button
                      onClick={() => setConfirmDialog({ msg: "End the game now? Checkpoint scanning will stop.", onConfirm: () => handlePost("/api/admin/end") })}
                      disabled={busy}
                      className="px-3.5 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>End Game</span>
                    </button>
                  </>
                )}

                {isPaused && (
                  <button
                    onClick={() => handlePost("/api/admin/resume")}
                    disabled={busy}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume Game</span>
                  </button>
                )}

                {(isLive || isEnded) && (
                  <button
                    onClick={() => setConfirmDialog({ msg: "Reset game back to SETUP? This clears scores and routes.", onConfirm: () => handlePost("/api/admin/reset") })}
                    disabled={busy}
                    className="px-3 py-2.5 rounded-xl bg-surface-200 hover:bg-surface-50 border border-white/10 text-neutral-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Secondary Quick Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin/print-qr"
                target="_blank"
                className="px-4 py-2 rounded-xl bg-surface-100 hover:bg-surface-50 border border-border text-xs font-mono text-neutral-200 flex items-center gap-2 transition-colors"
              >
                <Printer className="w-4 h-4 text-brand-cyan" />
                <span>Print Checkpoint QR Cards</span>
              </Link>

              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await downloadBlob("/api/admin/qr/all", "scavenger-hunt-qr-codes.zip");
                    showToast("QR ZIP downloaded!", "success");
                  } catch (e: any) {
                    showToast(e.message || "QR download failed", "error");
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-surface-100 hover:bg-surface-50 border border-border text-xs font-mono text-neutral-200 flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4 text-brand-violet" />
                <span>Download All QR Codes (.ZIP)</span>
              </button>

              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await downloadBlob("/api/admin/export-results", "scavenger_hunt_results.csv");
                    showToast("Results CSV downloaded!", "success");
                  } catch (e: any) {
                    showToast(e.message || "CSV download failed", "error");
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-surface-100 hover:bg-surface-50 border border-border text-xs font-mono text-neutral-200 flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4 text-brand-emerald" />
                <span>Export Leaderboard (.CSV)</span>
              </button>
            </div>

            <div className="text-xs font-mono text-neutral-400">
              {game?.server_time ? `Server IST: ${new Date(game.server_time).toLocaleTimeString("en-IN")}` : ""}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/5 scrollbar-none">
          {[
            { id: "overview", label: "Overview", icon: Trophy },
            { id: "teams", label: `Teams (${teams.length})`, icon: Users },
            { id: "players", label: `Players (${players.length})`, icon: UserCheck },
            { id: "locations", label: "10 Locations", icon: MapPinned },
            { id: "puzzles", label: "Question Bank", icon: Code2 },
            { id: "config", label: "Game Clock & Setup", icon: Settings2 },
            { id: "scans", label: `Scan Logs (${scans.length})`, icon: Activity },
            { id: "disqualifications", label: `Disqualifications (${disqualifications.length})`, icon: ShieldAlert },
            { id: "results", label: "Results & Publish", icon: Megaphone },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                tab === id
                  ? "bg-gradient-to-r from-brand-violet to-brand-cyan text-white shadow-lg shadow-brand-violet/20 font-semibold"
                  : "bg-surface-200 text-neutral-400 hover:text-white hover:bg-surface-100"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Tab 1: Overview */}
        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-card rounded-2xl p-5">
                <span className="text-xs font-mono text-neutral-400 uppercase">Game Status</span>
                <span className="text-2xl font-black text-white block mt-1">{game?.status || "SETUP"}</span>
                <span className="text-[11px] font-mono text-neutral-500">
                  {game?.start_at ? `Start: ${new Date(game.start_at).toLocaleTimeString("en-IN")}` : "Manual / Scheduled"}
                </span>
              </div>
              <div className="glass-card rounded-2xl p-5">
                <span className="text-xs font-mono text-neutral-400 uppercase">Total Teams</span>
                <span className="text-2xl font-black text-brand-cyan block mt-1">{teams.length}</span>
                <span className="text-[11px] font-mono text-neutral-500">
                  {teams.filter((t) => t.status === "FINISHED").length} finished · {teams.filter((t) => t.status === "DISQUALIFIED").length} eliminated
                </span>
              </div>
              <div className="glass-card rounded-2xl p-5">
                <span className="text-xs font-mono text-neutral-400 uppercase">Registered Players</span>
                <span className="text-2xl font-black text-brand-violet block mt-1">{players.length}</span>
                <span className="text-[11px] font-mono text-neutral-500">Max 3 players per team</span>
              </div>
              <div className="glass-card rounded-2xl p-5">
                <span className="text-xs font-mono text-neutral-400 uppercase">Total Clears</span>
                <span className="text-2xl font-black text-brand-emerald block mt-1">
                  {teams.reduce((acc, t) => acc + (t.completed || 0), 0)}
                </span>
                <span className="text-[11px] font-mono text-neutral-500">Across 10 locations</span>
              </div>
            </div>

            {/* Standings Table */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-brand-cyan" />
                  Live Standings (Real-time)
                </h3>
                <span className="text-xs font-mono text-neutral-400">Updates every 5 seconds</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs font-mono text-neutral-400 uppercase">
                      <th className="py-3 px-4">Team</th>
                      <th className="py-3 px-4">Members</th>
                      <th className="py-3 px-4">Score</th>
                      <th className="py-3 px-4">Progress</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Calculated Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {teams.map((t) => (
                      <tr key={t.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{t.team_name}</div>
                          <div className="text-xs font-mono text-brand-cyan flex items-center gap-1.5">
                            <span>CODE: {t.team_code}</span>
                            <button
                              onClick={() => copyToClipboard(t.team_code)}
                              className="text-neutral-400 hover:text-white"
                              title="Copy code"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-neutral-300 font-mono">
                          {t.members.length > 0
                            ? t.members.map((m) => m.name).join(", ")
                            : "0 / 3 players"}
                        </td>
                        <td className="py-3 px-4 font-bold text-white">{t.score} / 10</td>
                        <td className="py-3 px-4 text-neutral-300 font-mono">{t.completed} / 10</td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              t.status === "FINISHED"
                                ? "live"
                                : t.status === "DISQUALIFIED"
                                ? "danger"
                                : t.status === "LIVE"
                                ? "live"
                                : "amber"
                            }
                          >
                            {t.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-neutral-200">
                          {formatSeconds(t.final_result_seconds)}
                        </td>
                      </tr>
                    ))}
                    {teams.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-neutral-500">
                          No teams registered yet. Create teams in the Teams tab below.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Teams Management */}
        {tab === "teams" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Create Team Form */}
            <div className="lg:col-span-5 glass-card rounded-3xl p-6 sm:p-8 space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-brand-cyan" />
                  Register New Team
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Generates an authoritative, secure 6-character team join code for participants.
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-2">
                    Team Name
                  </label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g. Byte Busters"
                    className="w-full px-4 py-3 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none focus:border-brand-violet font-medium"
                  />
                </div>
                <button
                  onClick={() => {
                    handlePost("/api/admin/teams", { team_name: teamName, force: true });
                    setTeamName("");
                  }}
                  disabled={busy || !teamName.trim()}
                  className="w-full gradient-brand-btn py-3.5 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Create Team & Generate Join Code</span>
                </button>
              </div>
            </div>

            {/* Teams List */}
            <div className="lg:col-span-7 glass-card rounded-3xl p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <h3 className="text-xl font-bold text-white">Registered Teams ({teams.length})</h3>
                <span className="text-xs font-mono text-neutral-400">Max 3 players / team</span>
              </div>

              <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto pr-2 space-y-3">
                {teams.map((t) => (
                  <div key={t.id} className="pt-3 pb-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-bold text-white text-base flex items-center gap-2">
                          <span>{t.team_name}</span>
                          <Badge
                            variant={
                              t.status === "FINISHED"
                                ? "live"
                                : t.status === "DISQUALIFIED"
                                ? "danger"
                                : "cyan"
                            }
                            className="text-[10px] uppercase font-mono"
                          >
                            {t.status}
                          </Badge>
                        </div>
                        <div className="text-xs font-mono text-brand-cyan tracking-wider mt-1 flex items-center gap-2">
                          <span>JOIN CODE: <strong className="text-white bg-surface-100 px-2 py-0.5 rounded border border-white/10">{t.team_code}</strong></span>
                          <button
                            onClick={() => copyToClipboard(t.team_code)}
                            className="text-xs text-brand-violet hover:text-white flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copiedCode === t.team_code ? "Copied!" : "Copy"}</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {t.status === "DISQUALIFIED" ? (
                          <button
                            onClick={() => handlePost("/api/admin/teams/reinstate", { team_id: t.id })}
                            disabled={busy}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-mono transition-all"
                          >
                            Reinstate
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setDqTeam({ id: t.id, name: t.team_name });
                              setDqReason("Out-of-order scan / misconduct");
                            }}
                            disabled={busy}
                            className="px-2.5 py-1.5 rounded-lg bg-surface-100 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-300 text-xs font-mono transition-all"
                          >
                            Disqualify
                          </button>
                        )}

                        <button
                          onClick={() => setDeleteTeam({ id: t.id, name: t.team_name })}
                          disabled={busy}
                          className="p-1.5 rounded-lg bg-surface-100 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-300 transition-all"
                          title="Delete team"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Members Pill List & Add Member Inline */}
                    <div className="bg-surface-100/50 rounded-xl p-3 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
                        <span>MEMBERS ({t.members.length} / 3)</span>
                        {t.members.length < 3 && memberInputTeamId !== t.id && (
                          <button
                            onClick={() => {
                              setMemberInputTeamId(t.id);
                              setNewMemberName("");
                            }}
                            className="text-brand-cyan hover:underline flex items-center gap-1 text-[11px]"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>+ Add Player Name</span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {t.members.map((m) => (
                          <span
                            key={m.name}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-200 border border-white/10 text-xs text-neutral-200 font-medium"
                          >
                            <UserCheck className="w-3 h-3 text-brand-emerald" />
                            <span>{m.name}</span>
                            <button
                              onClick={() => {
                                setConfirmDialog({ msg: `Remove "${m.name}" from ${t.team_name}?`, onConfirm: () => handlePost("/api/admin/teams/remove-member", { team_id: t.id, name: m.name }) });
                              }}
                              className="text-neutral-400 hover:text-rose-400 ml-0.5"
                              title="Remove player"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        {t.members.length === 0 && (
                          <span className="text-xs text-neutral-500 italic">No players joined yet.</span>
                        )}
                      </div>

                      {/* Inline Add Member Box */}
                      {memberInputTeamId === t.id && (
                        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                          <input
                            type="text"
                            placeholder="Student Name..."
                            value={newMemberName}
                            onChange={(e) => setNewMemberName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newMemberName.trim()) {
                                handlePost("/api/admin/teams/add-member", { team_id: t.id, name: newMemberName.trim() });
                                setNewMemberName("");
                                setMemberInputTeamId(null);
                              }
                            }}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-surface-200 border border-border text-white text-xs outline-none focus:border-brand-violet"
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              if (newMemberName.trim()) {
                                handlePost("/api/admin/teams/add-member", { team_id: t.id, name: newMemberName.trim() });
                                setNewMemberName("");
                                setMemberInputTeamId(null);
                              }
                            }}
                            disabled={!newMemberName.trim()}
                            className="px-3 py-1.5 rounded-lg bg-brand-violet text-white text-xs font-bold disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setMemberInputTeamId(null)}
                            className="px-2 py-1.5 text-neutral-400 hover:text-white text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {teams.length === 0 && (
                  <div className="py-8 text-center text-neutral-500 text-sm">
                    No teams registered yet. Use the form on the left to create your first team.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Players */}
        {tab === "players" && (
          <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">All Registered Players ({players.length})</h3>
              <span className="text-xs font-mono text-neutral-400">Total Participants</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs font-mono text-neutral-400 uppercase">
                    <th className="py-3 px-4">Player Name</th>
                    <th className="py-3 px-4">Team</th>
                    <th className="py-3 px-4">Team Code</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Join Timestamp (IST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {players.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-bold text-white">{p.name}</td>
                      <td className="py-3 px-4 text-neutral-300">{p.team_name}</td>
                      <td className="py-3 px-4 font-mono text-brand-cyan">{p.team_code}</td>
                      <td className="py-3 px-4">
                        <Badge variant={p.team_status === "DISQUALIFIED" ? "danger" : "cyan"}>
                          {p.team_status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-neutral-400">
                        {p.joined_at ? new Date(p.joined_at).toLocaleString("en-IN") : "—"}
                      </td>
                    </tr>
                  ))}
                  {players.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-neutral-500">
                        No players have joined yet. Add players under the Teams tab or join via the homepage.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Locations */}
        {tab === "locations" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">10 Physical Checkpoints</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Fixed locations for Scavenger Hunt 2.0. Each checkpoint contains only an opaque token.
                </p>
              </div>
              <Link
                href="/admin/print-qr"
                target="_blank"
                className="gradient-brand-btn px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Open Printable Signage</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {locs.map((l) => (
                <div key={l.code} className="glass-card rounded-2xl p-5 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-mono text-brand-cyan font-bold">{l.code}</span>
                    <h4 className="text-lg font-bold text-white mt-0.5">{l.name}</h4>
                    <div className="text-[11px] font-mono text-neutral-500 truncate max-w-xs mt-1">
                      TOKEN: {l.qr_token}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-xl bg-surface-100 border border-border flex items-center justify-center text-neutral-400">
                      <QrCode className="w-6 h-6 text-brand-cyan" />
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await downloadBlob(`/api/admin/qr/${l.code}.png`, `${l.code}-qr.png`);
                        } catch (e: any) {
                          showToast(e.message || "QR download failed", "error");
                        }
                      }}
                      className="text-[10px] font-mono text-brand-violet hover:text-white transition-colors flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>PNG</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 5: Question Bank */}
        {tab === "puzzles" && (
          <div className="space-y-6">
            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-brand-violet" />
                  Add Custom Question to Bank
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Puzzles are randomized server-side per team so no two teams solve the same problem at the same location.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">Location</label>
                  <select
                    value={puzzleLoc}
                    onChange={(e) => setPuzzleLoc(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  >
                    {locs.map((l) => (
                      <option key={l.code} value={l.code} className="bg-surface-200">
                        {l.code} — {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">Language</label>
                  <select
                    value={puzzleLang}
                    onChange={(e) => setPuzzleLang(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  >
                    <option value="Python" className="bg-surface-200">Python</option>
                    <option value="C++" className="bg-surface-200">C++</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">Difficulty</label>
                  <select
                    value={puzzleDiff}
                    onChange={(e) => setPuzzleDiff(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  >
                    <option value="Easy" className="bg-surface-200">Easy</option>
                    <option value="Medium" className="bg-surface-200">Medium</option>
                    <option value="Hard" className="bg-surface-200">Hard</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">Challenge Title</label>
                  <input
                    type="text"
                    value={puzzleTitle}
                    onChange={(e) => setPuzzleTitle(e.target.value)}
                    placeholder="e.g. Auditorium Bitwise Challenge"
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">Code Snippet</label>
                  <textarea
                    rows={4}
                    value={puzzleCode}
                    onChange={(e) => setPuzzleCode(e.target.value)}
                    placeholder="print('...')"
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm font-mono outline-none"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                    Exact Expected Answer / Output
                  </label>
                  <input
                    type="text"
                    value={puzzleAnswer}
                    onChange={(e) => setPuzzleAnswer(e.target.value)}
                    placeholder="e.g. stage mic show"
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  handlePost("/api/admin/puzzles", {
                    location_code: puzzleLoc,
                    language: puzzleLang,
                    difficulty: puzzleDiff,
                    title: puzzleTitle,
                    code: puzzleCode,
                    answer: puzzleAnswer,
                    hint1: puzzleHint1,
                    hint2: puzzleHint2,
                  });
                  setPuzzleTitle("");
                  setPuzzleCode("");
                  setPuzzleAnswer("");
                }}
                disabled={busy || !puzzleCode.trim() || !puzzleAnswer.trim()}
                className="gradient-brand-btn px-6 py-3 rounded-xl text-xs font-bold disabled:opacity-50"
              >
                Save Question to Bank
              </button>
            </div>

            {/* Questions Bank Table */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-4">
              <h3 className="text-xl font-bold text-white">Active Question Bank ({puzzles.length})</h3>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs font-mono text-neutral-400 uppercase">
                      <th className="py-3 px-4">Key</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Language</th>
                      <th className="py-3 px-4">Difficulty</th>
                      <th className="py-3 px-4">Expected Answer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-xs">
                    {puzzles.map((p) => (
                      <tr key={p.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4 text-brand-cyan">{p.puzzle_key}</td>
                        <td className="py-3 px-4 text-white">{p.location_name || p.location_code}</td>
                        <td className="py-3 px-4 text-neutral-300">{p.language}</td>
                        <td className="py-3 px-4 text-neutral-300">{p.difficulty}</td>
                        <td className="py-3 px-4 text-neutral-400 font-bold">{p.answer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Game Clock & Controls */}
        {tab === "config" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Clock Settings */}
            <div className="lg:col-span-7 glass-card rounded-3xl p-6 sm:p-8 space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-brand-cyan" />
                  Configure Event Timing & Venue
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Adjust duration, token buffer tolerance, session limit, and display room venue.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                    Scheduled Start (IST)
                  </label>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => {
                      setStartAt(e.target.value);
                      configDirtyRef.current = true;
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  />
                  <span className="text-[10px] text-neutral-500 font-mono mt-1 block">Leave blank for manual start</span>
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                    Game Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    value={durationMins}
                    onChange={(e) => {
                      setDurationMins(+e.target.value);
                      configDirtyRef.current = true;
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                    Result Token Buffer (Seconds)
                  </label>
                  <input
                    type="number"
                    value={bufferSec}
                    onChange={(e) => {
                      setBufferSec(+e.target.value);
                      configDirtyRef.current = true;
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                    Session Limit (Minutes)
                  </label>
                  <input
                    type="number"
                    value={sessionMins}
                    onChange={(e) => {
                      setSessionMins(+e.target.value);
                      configDirtyRef.current = true;
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                    Starting Room (Display Venue)
                  </label>
                  <input
                    type="text"
                    value={startingRoom}
                    onChange={(e) => {
                      setStartingRoom(e.target.value);
                      configDirtyRef.current = true;
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/10">
                <button
                  onClick={async () => {
                    await handlePost("/api/admin/config", {
                      start_at: startAt,
                      duration_seconds: durationMins * 60,
                      token_buffer_seconds: bufferSec,
                      session_limit_minutes: sessionMins,
                      starting_room: startingRoom,
                      force: true,
                    });
                    configDirtyRef.current = false;
                  }}
                  disabled={busy}
                  className="px-5 py-3 rounded-xl gradient-brand-btn text-xs font-bold text-white flex items-center gap-2 disabled:opacity-50 shadow-lg"
                >
                  <CalendarClock className="w-4 h-4" />
                  <span>Save Timing & Room Configuration</span>
                </button>

                <button
                  onClick={() => handlePost("/api/admin/prepare")}
                  disabled={busy}
                  className="px-5 py-3 rounded-xl bg-surface-100 hover:bg-surface-50 border border-border text-xs font-bold text-white flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4 text-brand-violet" />
                  <span>Pre-generate & Freeze Routes</span>
                </button>
              </div>
            </div>

            {/* Complete Game Lifecycle Controls */}
            <div className="lg:col-span-5 glass-card rounded-3xl p-6 sm:p-8 space-y-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Flag className="w-5 h-5 text-brand-rose" />
                Game Lifecycle Controls
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Full authoritative controls to start, pause, resume, extend, end, or reset the event.
              </p>

              <div className="space-y-4 pt-2">
                {/* State Card */}
                <div className="p-4 rounded-2xl bg-surface-100 border border-border flex items-center justify-between">
                  <span className="text-xs font-mono text-neutral-400">CURRENT ENGINE STATE:</span>
                  <Badge
                    variant={isLive ? "live" : isPaused ? "amber" : isEnded ? "danger" : "cyan"}
                    className="font-mono font-bold"
                  >
                    {game?.status || "SETUP"}
                  </Badge>
                </div>

                {/* Primary Action Button */}
                {isSetup && (
                  <button
                    onClick={() => handlePost("/api/admin/start")}
                    disabled={busy}
                    className="w-full gradient-brand-btn py-4 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold shadow-xl"
                  >
                    <Play className="w-4 h-4" />
                    <span>START GAME NOW</span>
                  </button>
                )}

                {isLive && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-brand-emerald/10 border border-brand-emerald/30 text-emerald-300 text-xs font-mono">
                      ✓ GAME IS CURRENTLY LIVE. Checkpoint scanning and timers are active.
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handlePost("/api/admin/pause")}
                        disabled={busy}
                        className="py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center justify-center gap-2"
                      >
                        <Pause className="w-4 h-4" />
                        <span>Pause Game</span>
                      </button>
                      <button
                        onClick={() => setConfirmDialog({ msg: "Force end the game now? Checkpoint scanning will stop.", onConfirm: () => handlePost("/api/admin/end") })}
                        disabled={busy}
                        className="py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center justify-center gap-2"
                      >
                        <Square className="w-4 h-4" />
                        <span>End Game Now</span>
                      </button>
                    </div>
                    {/* Extend Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[11px] font-mono text-neutral-400">Extend Timer:</span>
                      <button
                        onClick={() => handlePost("/api/admin/extend", { seconds: 300 })}
                        disabled={busy}
                        className="px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-50 border border-white/10 text-white text-xs font-mono"
                      >
                        +5 Mins
                      </button>
                      <button
                        onClick={() => handlePost("/api/admin/extend", { seconds: 900 })}
                        disabled={busy}
                        className="px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-50 border border-white/10 text-white text-xs font-mono"
                      >
                        +15 Mins
                      </button>
                    </div>
                  </div>
                )}

                {isPaused && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
                      ⏸ GAME IS PAUSED. Timers are frozen.
                    </div>
                    <button
                      onClick={() => handlePost("/api/admin/resume")}
                      disabled={busy}
                      className="w-full py-3.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-sm font-bold flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4" />
                      <span>Resume Live Game</span>
                    </button>
                  </div>
                )}

                {isEnded && (
                  <div className="p-4 rounded-2xl bg-brand-rose/10 border border-brand-rose/30 text-rose-300 text-xs font-mono">
                    ✓ GAME HAS ENDED. Checkpoint scanning is closed. You can now publish final rankings in the Results tab.
                  </div>
                )}

                {/* Reset Control */}
                <div className="pt-4 border-t border-white/10">
                  <button
                    onClick={() => setConfirmDialog({ msg: "Reset game to SETUP? This clears scores, routes, and scans.", onConfirm: () => handlePost("/api/admin/reset") })}
                    disabled={busy}
                    className="w-full py-3 rounded-xl bg-surface-100 hover:bg-surface-50 border border-white/10 text-neutral-300 hover:text-white text-xs font-mono flex items-center justify-center gap-2 transition-all"
                  >
                    <RotateCcw className="w-4 h-4 text-brand-amber" />
                    <span>Reset Game to SETUP (Clear Scores & Routes)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 7: Scan Logs */}
        {tab === "scans" && (
          <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Live Physical QR Scans Audit ({scans.length})</h3>
              <span className="text-xs font-mono text-neutral-400">Auto-refreshing stream</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs font-mono text-neutral-400 uppercase">
                    <th className="py-3 px-4">Team</th>
                    <th className="py-3 px-4">Player</th>
                    <th className="py-3 px-4">Scanned Location</th>
                    <th className="py-3 px-4">Expected Location</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Timestamp (IST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {scans.map((s) => (
                    <tr key={s.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-bold text-white">{s.team_name}</td>
                      <td className="py-3 px-4 text-neutral-300">{s.player_name}</td>
                      <td className="py-3 px-4 font-mono text-brand-cyan">{s.location_name || s.location_code}</td>
                      <td className="py-3 px-4 font-mono text-neutral-400">{s.expected_name || s.expected_code}</td>
                      <td className="py-3 px-4">
                        <Badge variant={s.valid ? "live" : "danger"}>
                          {s.valid ? "VALID" : "WRONG QR (DISQUALIFIED)"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-neutral-400">
                        {s.timestamp ? new Date(s.timestamp).toLocaleString("en-IN") : "—"}
                      </td>
                    </tr>
                  ))}
                  {scans.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-neutral-500">
                        No scans recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 8: Disqualifications */}
        {tab === "disqualifications" && (
          <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-4 border border-brand-rose/20">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-brand-rose" />
              Disqualified Teams Audit ({disqualifications.length})
            </h3>
            <p className="text-xs text-neutral-400">
              Audit log of all teams eliminated due to out-of-order physical QR scans or organizer intervention.
            </p>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs font-mono text-neutral-400 uppercase">
                    <th className="py-3 px-4">Team</th>
                    <th className="py-3 px-4">Members</th>
                    <th className="py-3 px-4">Expected</th>
                    <th className="py-3 px-4">Scanned</th>
                    <th className="py-3 px-4">Elimination Reason</th>
                    <th className="py-3 px-4 text-right">Timestamp (IST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {disqualifications.map((dq) => (
                    <tr key={dq.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-bold text-rose-300">
                        {dq.team_name} <span className="text-xs font-mono">({dq.team_code})</span>
                      </td>
                      <td className="py-3 px-4 text-xs text-neutral-300">{dq.members.join(", ")}</td>
                      <td className="py-3 px-4 font-mono text-brand-cyan">{dq.expected}</td>
                      <td className="py-3 px-4 font-mono text-brand-rose font-bold">{dq.scanned}</td>
                      <td className="py-3 px-4 text-xs text-neutral-300">{dq.reason}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-neutral-400">
                        {dq.disqualified_at ? new Date(dq.disqualified_at).toLocaleString("en-IN") : "—"}
                      </td>
                    </tr>
                  ))}
                  {disqualifications.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-neutral-500">
                        No teams have been disqualified.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 9: Final Results & Publish */}
        {tab === "results" && (
          <div className="space-y-6">
            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-brand-amber" />
                    Final Calculated Results & Public Release
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Publishing results displays the authoritative leaderboard on the homepage (<span className="text-white font-mono">/</span>) without requiring login.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await downloadBlob("/api/admin/export-results", "scavenger_hunt_results.csv");
                        showToast("Results CSV exported!", "success");
                      } catch (e: any) {
                        showToast(e.message || "Export failed", "error");
                      } finally {
                        setBusy(false);
                      }
                    }}
                    disabled={busy}
                    className="px-4 py-3 rounded-2xl bg-surface-100 hover:bg-surface-50 border border-white/10 text-xs font-mono text-white flex items-center gap-2 transition-all"
                  >
                    <Download className="w-4 h-4 text-brand-emerald" />
                    <span>Download CSV</span>
                  </button>

                  {!game?.results_published ? (
                    <button
                      onClick={() => handlePost("/api/admin/show-results", { force: true })}
                      disabled={busy}
                      className="gradient-brand-btn px-6 py-3.5 rounded-2xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 shadow-xl"
                    >
                      <Megaphone className="w-4 h-4" />
                      <span>PUBLISH RESULTS ON /</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePost("/api/admin/unpublish-results")}
                      disabled={busy}
                      className="px-5 py-3.5 rounded-2xl bg-surface-100 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2 transition-all shadow-xl"
                    >
                      <X className="w-4 h-4" />
                      <span>UNPUBLISH RESULTS (HIDE FROM /)</span>
                    </button>
                  )}
                </div>
              </div>

              {game?.results_published && (
                <div className="p-4 rounded-2xl bg-brand-emerald/10 border border-brand-emerald/30 text-emerald-300 text-xs font-mono flex items-center justify-between">
                  <span>✓ Results are currently published publicly at the root homepage URL (/).</span>
                  <Link href="/" target="_blank" className="underline font-bold text-white hover:text-emerald-200">
                    Open Public Homepage →
                  </Link>
                </div>
              )}

              {/* Full Audit Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs font-mono text-neutral-400 uppercase">
                      <th className="py-3 px-4">Rank</th>
                      <th className="py-3 px-4">Team</th>
                      <th className="py-3 px-4">Score</th>
                      <th className="py-3 px-4">Checkpoints</th>
                      <th className="py-3 px-4">Elapsed</th>
                      <th className="py-3 px-4">Entry Diff</th>
                      <th className="py-3 px-4">Buffer Token</th>
                      <th className="py-3 px-4 text-right">Final Calculated Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-xs">
                    {teams
                      .filter((t) => t.status !== "DISQUALIFIED")
                      .sort((a, b) => {
                        const aFull = a.completed === 10;
                        const bFull = b.completed === 10;
                        if (aFull && !bFull) return -1;
                        if (!aFull && bFull) return 1;
                        if (aFull && bFull) {
                          return (a.final_result_seconds || 999999) - (b.final_result_seconds || 999999);
                        }
                        return (b.score || 0) - (a.score || 0);
                      })
                      .map((t, idx) => (
                        <tr key={t.id} className="hover:bg-white/[0.02]">
                          <td className="py-3 px-4 font-bold text-brand-cyan">
                            #{idx + 1}
                          </td>
                          <td className="py-3 px-4 font-bold text-white font-sans text-sm">
                            {t.team_name}
                            <span className="text-xs font-mono text-neutral-400 ml-2">({t.team_code})</span>
                          </td>
                          <td className="py-3 px-4 text-brand-cyan font-bold">{t.score} / 10</td>
                          <td className="py-3 px-4 text-neutral-300">{t.completed} / 10</td>
                          <td className="py-3 px-4 text-neutral-400">{formatSeconds(t.game_elapsed_seconds)}</td>
                          <td className="py-3 px-4 text-neutral-400">+{t.entry_differential_seconds || 0}s</td>
                          <td className="py-3 px-4 text-neutral-400">+{t.result_token_seconds || 20}s</td>
                          <td className="py-3 px-4 text-right font-bold text-white text-sm">
                            {formatSeconds(t.final_result_seconds)}
                          </td>
                        </tr>
                      ))}
                    {teams.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-neutral-500 font-sans">
                          No teams registered yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Inline Disqualify Modal */}
      {dqTeam && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-3xl p-6 w-full max-w-md space-y-4 border border-rose-500/40 shadow-2xl">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-rose-400" />
              <div>
                <h3 className="text-lg font-bold text-white">Disqualify Team</h3>
                <p className="text-xs text-neutral-400 mt-0.5">Team: <strong className="text-rose-300">{dqTeam.name}</strong></p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">Reason for Disqualification</label>
              <textarea
                rows={3}
                value={dqReason}
                onChange={(e) => setDqReason(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-rose-500/30 text-white text-sm outline-none focus:border-rose-400 resize-none"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  if (dqReason.trim()) {
                    handlePost("/api/admin/teams/disqualify", { team_id: dqTeam.id, reason: dqReason.trim() });
                  }
                  setDqTeam(null);
                }}
                disabled={busy || !dqReason.trim()}
                className="flex-1 py-2.5 rounded-xl bg-rose-500/30 hover:bg-rose-500/50 border border-rose-500/50 text-rose-200 font-bold text-sm disabled:opacity-50 transition-all"
              >
                Confirm Disqualify
              </button>
              <button
                onClick={() => setDqTeam(null)}
                className="px-4 py-2.5 rounded-xl bg-surface-100 hover:bg-surface-50 border border-white/10 text-neutral-300 text-sm transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Delete Confirmation Modal */}
      {deleteTeam && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-3xl p-6 w-full max-w-sm space-y-4 border border-rose-500/30 shadow-2xl">
            <div className="flex items-center gap-3">
              <Trash2 className="w-6 h-6 text-rose-400" />
              <h3 className="text-lg font-bold text-white">Delete Team?</h3>
            </div>
            <p className="text-sm text-neutral-300">
              This will permanently delete <strong className="text-white">{deleteTeam.name}</strong> and remove all joined players. This cannot be undone.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  handlePost("/api/admin/teams/delete", { team_id: deleteTeam.id });
                  setDeleteTeam(null);
                }}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-rose-500/30 hover:bg-rose-500/50 border border-rose-500/50 text-rose-200 font-bold text-sm disabled:opacity-50 transition-all"
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setDeleteTeam(null)}
                className="px-4 py-2.5 rounded-xl bg-surface-100 hover:bg-surface-50 border border-white/10 text-neutral-300 text-sm transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generic Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-3xl p-6 w-full max-w-sm space-y-4 border border-white/20 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
              <p className="text-sm text-neutral-200 leading-relaxed">{confirmDialog.msg}</p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-brand-cyan/20 hover:bg-brand-cyan/30 border border-brand-cyan/40 text-brand-cyan font-bold text-sm disabled:opacity-50 transition-all"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2.5 rounded-xl bg-surface-100 hover:bg-surface-50 border border-white/10 text-neutral-300 text-sm transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && <Toast message={toast.msg} type={toast.type} />}
    </div>
  );
}
