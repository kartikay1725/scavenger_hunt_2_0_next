"use client";

import React, { useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  Download,
  Flag,
  LogOut,
  Play,
  QrCode,
  RefreshCw,
  Settings2,
  Trophy,
  Users,
  MapPinned,
  Code2,
  Megaphone,
  UserCheck,
  ShieldAlert,
  Activity,
  Printer,
  FileSpreadsheet,
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

  // Form states
  const [teamName, setTeamName] = useState("");
  const [startAt, setStartAt] = useState("");
  const [durationMins, setDurationMins] = useState(60);
  const [bufferSec, setBufferSec] = useState(20);
  const [sessionMins, setSessionMins] = useState(180);
  const [startingRoom, setStartingRoom] = useState("Seminar Hall 2");
  const [configDirty, setConfigDirty] = useState(false);

  // Custom puzzle form
  const [puzzleLoc, setPuzzleLoc] = useState("LOC-01");
  const [puzzleLang, setPuzzleLang] = useState("Python");
  const [puzzleDiff, setPuzzleDiff] = useState("Medium");
  const [puzzleTitle, setPuzzleTitle] = useState("");
  const [puzzleCode, setPuzzleCode] = useState("");
  const [puzzleAnswer, setPuzzleAnswer] = useState("");
  const [puzzleHint1, setPuzzleHint1] = useState("");
  const [puzzleHint2, setPuzzleHint2] = useState("");

  const showToast = (msg: string, type: "info" | "error" | "success" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
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

      if (g.game && !configDirty) {
        setDurationMins(Math.round((g.game.duration_seconds || 3600) / 60));
        setBufferSec(g.game.token_buffer_seconds ?? 20);
        setSessionMins(g.game.session_limit_minutes ?? 180);
        setStartingRoom(g.game.starting_room || "Seminar Hall 2");
        if (g.game.start_at) {
          const d = new Date(g.game.start_at);
          // Format in local timezone for datetime-local input (YYYY-MM-DDTHH:mm)
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
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
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
  const isEnded = game?.status === "ENDED";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar admin gameStatus={game?.status} onLogout={handleLogout} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full space-y-8">
        {/* Header Ribbon */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="cyan">CONTROL ROOM</Badge>
              <span className="text-xs font-mono text-neutral-400">
                Authoritative Server Engine
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Event Command Center
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/print-qr"
              target="_blank"
              className="px-4 py-2.5 rounded-xl bg-surface-100 hover:bg-surface-50 border border-border text-xs font-mono text-neutral-200 flex items-center gap-2 transition-colors"
            >
              <Printer className="w-4 h-4 text-brand-cyan" />
              <span>Printable Checkpoint Cards</span>
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
              className="px-4 py-2.5 rounded-xl bg-surface-100 hover:bg-surface-50 border border-border text-xs font-mono text-neutral-200 flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4 text-brand-violet" />
              <span>Download QR ZIP</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/5 scrollbar-none">
          {[
            { id: "overview", label: "Overview", icon: Trophy },
            { id: "teams", label: "Teams", icon: Users },
            { id: "players", label: "Players", icon: UserCheck },
            { id: "locations", label: "10 Locations", icon: MapPinned },
            { id: "puzzles", label: "Question Bank", icon: Code2 },
            { id: "config", label: "Game Clock & Setup", icon: Settings2 },
            { id: "scans", label: "Scan Logs", icon: Activity },
            { id: "disqualifications", label: "Disqualifications", icon: ShieldAlert },
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
                  {game?.start_at ? `Start: ${new Date(game.start_at).toLocaleTimeString("en-IN")}` : "No start configured"}
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

            {/* Quick Live Table */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-brand-cyan" />
                Live Standings (Real-time)
              </h3>
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
                          <div className="text-xs font-mono text-brand-cyan">{t.team_code}</div>
                        </td>
                        <td className="py-3 px-4 text-neutral-300 font-mono">{t.members_count} / 3</td>
                        <td className="py-3 px-4 font-bold text-white">{t.score} / 10</td>
                        <td className="py-3 px-4 text-neutral-300 font-mono">{t.completed} / 10</td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              t.status === "FINISHED"
                                ? "live"
                                : t.status === "DISQUALIFIED"
                                ? "danger"
                                : "default"
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
                          No teams registered yet. Create teams in the Teams tab.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Teams */}
        {tab === "teams" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 glass-card rounded-3xl p-6 sm:p-8 space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white">Create New Team</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Generates an authoritative, secure 6-character team join code.
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
                    className="w-full px-4 py-3 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none focus:border-brand-violet"
                  />
                </div>
                <button
                  onClick={() => {
                    handlePost("/api/admin/teams", { team_name: teamName });
                    setTeamName("");
                  }}
                  disabled={busy || !teamName.trim() || isLive || isEnded}
                  className="w-full gradient-brand-btn py-3.5 rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  Create Team & Generate Code
                </button>
                {isLive && (
                  <p className="text-xs text-brand-amber font-mono">
                    ⚠ Registration is locked because the game is LIVE.
                  </p>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 glass-card rounded-3xl p-6 sm:p-8 space-y-4">
              <h3 className="text-xl font-bold text-white">Registered Teams ({teams.length})</h3>
              <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto pr-2">
                {teams.map((t) => (
                  <div key={t.id} className="py-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-bold text-white text-base">{t.team_name}</div>
                      <div className="text-xs font-mono text-brand-cyan tracking-wider">
                        CODE: {t.team_code}
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        Members: {t.members.map((m) => m.name).join(", ") || "No members joined yet"}
                      </div>
                    </div>
                    <Badge variant={t.status === "DISQUALIFIED" ? "danger" : "default"}>
                      {t.members_count} / 3 Players
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Players */}
        {tab === "players" && (
          <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-4">
            <h3 className="text-xl font-bold text-white">All Registered Players ({players.length})</h3>
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
                        <Badge variant={p.team_status === "DISQUALIFIED" ? "danger" : "default"}>
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
                        No players have joined yet.
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
                      PNG
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 5: Question Bank */}
        {tab === "puzzles" && (
          <div className="space-y-8">
            {/* Create Custom Puzzle */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white">Add Custom Puzzle to Pool</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Puzzles are uniquely selected from the bank so no two teams receive the same problem at the same location.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">Location</label>
                  <select
                    value={puzzleLoc}
                    onChange={(e) => setPuzzleLoc(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  >
                    {locs.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.code} - {l.name}
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
                    <option value="Python">Python</option>
                    <option value="C++">C++</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">Difficulty</label>
                  <select
                    value={puzzleDiff}
                    onChange={(e) => setPuzzleDiff(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">Title</label>
                  <input
                    type="text"
                    value={puzzleTitle}
                    onChange={(e) => setPuzzleTitle(e.target.value)}
                    placeholder="e.g. Auditorium Encryption"
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">
                  Scrambled Code
                </label>
                <textarea
                  value={puzzleCode}
                  onChange={(e) => setPuzzleCode(e.target.value)}
                  placeholder="Paste Python or C++ encrypted program..."
                  rows={6}
                  className="w-full p-4 rounded-xl bg-[#080810] border border-border font-mono text-xs text-white outline-none focus:border-brand-violet"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">Expected Clue Answer</label>
                  <input
                    type="text"
                    value={puzzleAnswer}
                    onChange={(e) => setPuzzleAnswer(e.target.value)}
                    placeholder="e.g. STAGE MIC SHOW"
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">Hint 1</label>
                  <input
                    type="text"
                    value={puzzleHint1}
                    onChange={(e) => setPuzzleHint1(e.target.value)}
                    placeholder="e.g. Trace loop 2 carefully"
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-neutral-400 uppercase mb-2">Hint 2</label>
                  <input
                    type="text"
                    value={puzzleHint2}
                    onChange={(e) => setPuzzleHint2(e.target.value)}
                    placeholder="e.g. Output points to music"
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
                  setPuzzleHint1("");
                  setPuzzleHint2("");
                }}
                disabled={busy || !puzzleCode.trim() || !puzzleAnswer.trim()}
                className="gradient-brand-btn px-6 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
              >
                Publish Custom Challenge
              </button>
            </div>

            {/* Puzzles Pool List */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-4">
              <h3 className="text-xl font-bold text-white">Loaded Puzzle Bank ({puzzles.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-2">
                {puzzles.map((p) => (
                  <div key={p.id} className="p-4 rounded-2xl bg-surface-100 border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{p.title}</span>
                      <Badge variant={p.language === "Python" ? "cyan" : "amber"}>{p.language}</Badge>
                    </div>
                    <div className="text-xs text-neutral-400 font-mono">
                      {p.location_code} ({p.location_name}) · {p.difficulty}
                    </div>
                    <div className="text-xs text-neutral-300 font-mono bg-black/40 p-2 rounded-lg truncate">
                      {p.code}
                    </div>
                    <div className="text-[11px] font-mono text-brand-emerald">
                      ANSWER: {p.answer}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Game Clock & Controls */}
        {tab === "config" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 glass-card rounded-3xl p-6 sm:p-8 space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white">Configure Event Clock</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Once LIVE, the game becomes irreversible and clock settings cannot be altered.
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
                      setConfigDirty(true);
                    }}
                    disabled={isLive || isEnded}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none disabled:opacity-50"
                  />
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
                      setConfigDirty(true);
                    }}
                    disabled={isLive || isEnded}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none disabled:opacity-50"
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
                      setConfigDirty(true);
                    }}
                    disabled={isLive || isEnded}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none disabled:opacity-50"
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
                      setConfigDirty(true);
                    }}
                    disabled={isLive || isEnded}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none disabled:opacity-50"
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
                      setConfigDirty(true);
                    }}
                    disabled={isLive || isEnded}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-100 border border-border text-white text-sm outline-none disabled:opacity-50"
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
                    });
                    setConfigDirty(false);
                  }}
                  disabled={busy || isLive || isEnded}
                  className="px-5 py-3 rounded-xl bg-surface-100 hover:bg-surface-50 border border-border text-xs font-bold text-white flex items-center gap-2 disabled:opacity-50"
                >
                  <CalendarClock className="w-4 h-4 text-brand-cyan" />
                  <span>Save Configuration</span>
                </button>

                <button
                  onClick={() => handlePost("/api/admin/prepare")}
                  disabled={busy || isLive || isEnded}
                  className="px-5 py-3 rounded-xl bg-surface-100 hover:bg-surface-50 border border-border text-xs font-bold text-white flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4 text-brand-violet" />
                  <span>Pre-generate & Freeze Routes</span>
                </button>
              </div>
            </div>

            {/* Irreversible Game Controls */}
            <div className="lg:col-span-5 glass-card rounded-3xl p-6 sm:p-8 space-y-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Flag className="w-5 h-5 text-brand-rose" />
                Irreversible Game Controls
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Critical Rule 6: Once LIVE, the game cannot be paused, stopped, reset, or restarted by any administrator.
              </p>

              <div className="space-y-4 pt-2">
                <div className="p-4 rounded-2xl bg-surface-100 border border-border flex items-center justify-between">
                  <span className="text-xs font-mono text-neutral-400">STATE:</span>
                  <Badge variant={isLive ? "live" : isEnded ? "danger" : "amber"}>
                    {game?.status || "SETUP"}
                  </Badge>
                </div>

                {!isLive && !isEnded && (
                  <button
                    onClick={() => handlePost("/api/admin/start")}
                    disabled={busy}
                    className="w-full gradient-brand-btn py-4 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold shadow-xl"
                  >
                    <Play className="w-4 h-4" />
                    <span>START GAME NOW (IRREVERSIBLE)</span>
                  </button>
                )}

                {isLive && (
                  <div className="p-4 rounded-2xl bg-brand-emerald/10 border border-brand-emerald/30 text-emerald-300 text-xs font-mono">
                    ✓ GAME IS CURRENTLY LIVE. All live scoring and timing are governed autonomously by the server.
                  </div>
                )}

                {isEnded && (
                  <div className="p-4 rounded-2xl bg-brand-rose/10 border border-brand-rose/30 text-rose-300 text-xs font-mono">
                    ✓ GAME TIMER HAS EXPIRED. Checkpoint scanning is officially closed.
                  </div>
                )}
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
              Audit log of all teams eliminated due to out-of-order or invalid physical QR scans.
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
                    Pressing SHOW RESULTS publishes the final leaderboard publicly at <span className="text-white font-mono">/</span> with no login required.
                  </p>
                </div>

                {!game?.results_published ? (
                  <button
                    onClick={() => handlePost("/api/admin/show-results")}
                    disabled={busy || !isEnded}
                    className="gradient-brand-btn px-6 py-3.5 rounded-2xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 shadow-xl"
                  >
                    <Megaphone className="w-4 h-4" />
                    <span>SHOW RESULTS ON /</span>
                  </button>
                ) : (
                  <Badge variant="live">RESULTS PUBLISHED PUBLICLY</Badge>
                )}
              </div>

              {!isEnded && !game?.results_published && (
                <div className="p-4 rounded-2xl bg-surface-100 border border-border text-xs text-neutral-400 font-mono">
                  Notice: In accordance with Rule 22, results can be published only after the game reaches ENDED status.
                </div>
              )}

              {/* Full Audit Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs font-mono text-neutral-400 uppercase">
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
                          <td className="py-3 px-4 font-bold text-white font-sans text-sm">
                            #{idx + 1} {t.team_name}
                          </td>
                          <td className="py-3 px-4 text-brand-cyan">{t.score} / 10</td>
                          <td className="py-3 px-4 text-neutral-300">{t.completed} / 10</td>
                          <td className="py-3 px-4 text-neutral-400">{formatSeconds(t.game_elapsed_seconds)}</td>
                          <td className="py-3 px-4 text-neutral-400">+{t.entry_differential_seconds || 0}s</td>
                          <td className="py-3 px-4 text-neutral-400">+{t.result_token_seconds || 20}s</td>
                          <td className="py-3 px-4 text-right font-bold text-white text-sm">
                            {formatSeconds(t.final_result_seconds)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Toast Notification */}
      {toast && <Toast message={toast.msg} type={toast.type} />}
    </div>
  );
}
