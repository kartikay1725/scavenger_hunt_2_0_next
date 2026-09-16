"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock,
  Flag,
  LogIn,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users,
  MapPin,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { api, formatSeconds } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { MotionDiv, Badge, Toast } from "@/components/ui";
import { QRScannerModal } from "@/components/QRScannerModal";
import { PuzzleCard } from "@/components/PuzzleCard";
import { LeaderboardTable, ResultRow } from "@/components/LeaderboardTable";

interface GameState {
  status: string;
  start_at?: string;
  end_at?: string;
  duration_seconds: number;
  starting_room: string;
  results_published: boolean;
}

interface Player {
  name: string;
}

interface Puzzle {
  title: string;
  language: string;
  difficulty: string;
  code: string;
  hint1?: string;
  hint2?: string;
}

interface TeamState {
  name: string;
  code: string;
  status: string;
  score: number;
  completed: number;
  members_count: number;
  total: number;
  next_location_code?: string | null;
  next_location_name?: string | null;
  puzzle?: Puzzle | null;
  scanned?: boolean;
}

interface MeResponse {
  ok: boolean;
  authenticated: boolean;
  game: GameState;
  player?: Player;
  team?: TeamState;
}

export default function Home() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [answer, setAnswer] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type?: "info" | "error" | "success" } | null>(null);
  const [hintText, setHintText] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const errorCountRef = React.useRef(0);

  const showToast = (msg: string, type: "info" | "error" | "success" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const refresh = async () => {
    try {
      const data = await api<MeResponse>("/api/me");
      errorCountRef.current = 0; // reset on success
      setMe(data);
      if (data.game?.results_published) {
        const res = await api<{ published: boolean; results: ResultRow[] }>("/api/results");
        setResults(res.results || []);
      }
    } catch (e: any) {
      errorCountRef.current += 1;
      // Offline or network error — silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();

    let timer: NodeJS.Timeout | null = null;

    const scheduleNext = () => {
      setNow(Date.now());
      const isHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      const baseDelay = isHidden ? 25000 : 6000;
      const errorBackoff = Math.min(errorCountRef.current * 3000, 15000);
      const nextDelay = baseDelay + errorBackoff;

      timer = setTimeout(() => {
        refresh();
        scheduleNext();
      }, nextDelay);
    };

    scheduleNext();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const remaining = useMemo(() => {
    if (!me?.game?.end_at) return 0;
    const end = new Date(me.game.end_at).getTime();
    return Math.max(0, Math.floor((end - now) / 1000));
  }, [me, now]);

  const handleJoin = async () => {
    if (!code.trim() || !name.trim()) return;
    setBusy(true);
    try {
      await api("/api/join", {
        method: "POST",
        body: JSON.stringify({ team_code: code.trim().toUpperCase(), name: name.trim() }),
      });
      showToast("Team joined! You are locked into the hunt.", "success");
      setCode("");
      setName("");
      await refresh();
    } catch (e: any) {
      showToast(e.message || "Failed to join team", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleScan = async (qrToken: string) => {
    setScannerOpen(false);
    setBusy(true);
    try {
      const res: any = await api("/api/scan", {
        method: "POST",
        body: JSON.stringify({ qr_token: qrToken }),
      });
      if (res.already_cleared) {
        if (res.finished) {
          showToast("🎉 All 10 checkpoints already completed by your team! Return to base.", "success");
        } else if (res.next_location_name) {
          showToast(
            `✓ Checkpoint already cleared by your teammate! Head to ${res.next_location_name} (${res.next_location_code})`,
            "info"
          );
        } else {
          showToast(res.message || "✓ Checkpoint already cleared by your teammate!", "info");
        }
      } else {
        showToast(`Checkpoint verified: ${res.checkpoint?.name || res.checkpoint?.code || ""}`, "success");
      }
      await refresh();
    } catch (e: any) {
      showToast(e.message || "Scan validation failed", "error");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!answer.trim()) return;
    setBusy(true);
    try {
      const res: any = await api("/api/answer", {
        method: "POST",
        body: JSON.stringify({ answer: answer.trim() }),
      });
      if (res.correct) {
        if (res.finished) {
          showToast("🎉 10 / 10 Complete! You have finished the Scavenger Hunt!", "success");
        } else if (res.already_completed) {
          showToast(res.message || "Checkpoint already cleared!", "info");
        } else {
          showToast(
            res.next_location_name
              ? `✓ Correct! Next checkpoint unlocked: ${res.next_location_name}`
              : "✓ Correct answer! +1 point awarded.",
            "success"
          );
        }
        setAnswer("");
        setHintText("");
      } else {
        showToast(res.error || "Incorrect answer", "error");
      }
      await refresh();
    } catch (e: any) {
      showToast(e.message || "Submission failed", "error");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleGetHint = async (level: number) => {
    try {
      const res: any = await api("/api/hint", {
        method: "POST",
        body: JSON.stringify({ level }),
      });
      setHintText(res.hint || "No hint available.");
    } catch (e: any) {
      showToast(e.message || "Failed to fetch hint", "error");
    }
  };

  // 1. Loading Skeleton
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-16 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-surface-100/90 border border-white/10 flex items-center justify-center p-2.5 mx-auto animate-pulse shadow-xl shadow-brand-violet/10">
              <img src="/logo.svg" alt="CodeChef Logo" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-lg font-mono text-neutral-400 tracking-wider">
              CONNECTING TO HUNT ENGINE...
            </h2>
          </div>
        </main>
      </div>
    );
  }

  const game = me?.game || {
    status: "SETUP",
    duration_seconds: 3600,
    starting_room: "Seminar Hall 2",
    results_published: false,
  };

  // 2. Public Results View
  if (game.results_published) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar gameStatus="RESULTS OUT" />
        <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8 w-full">
          <MotionDiv className="text-center space-y-3 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-emerald/10 border border-brand-emerald/30 text-brand-emerald text-xs font-mono font-bold">
              <Trophy className="w-3.5 h-3.5" />
              <span>OFFICIAL FINAL LEADERBOARD</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight gradient-brand-text">
              The Hunt Has Concluded
            </h1>
            <p className="text-sm sm:text-base text-neutral-400 leading-relaxed max-w-2xl mx-auto">
              Rankings prioritize full finishers who completed all 10 checkpoints by lowest final calculated time. Disqualified teams are listed with route elimination notices.
            </p>
          </MotionDiv>

          <LeaderboardTable results={results} />

          <div className="text-center py-6 text-xs font-mono text-neutral-500 border-t border-white/5 max-w-xl mx-auto">
            Please remain in <span className="text-neutral-300 font-bold">{game.starting_room}</span> until organizers announce the stage awards.
          </div>
        </main>
      </div>
    );
  }

  // 3. Team Disqualified Screen (Immediate, Irreversible)
  if (me?.team?.status === "DISQUALIFIED") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar gameStatus="DISQUALIFIED" />
        <main className="flex-1 flex items-center justify-center p-4">
          <MotionDiv className="max-w-md w-full glass-card-danger rounded-3xl p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-brand-rose/20 border border-brand-rose/40 flex items-center justify-center mx-auto text-brand-rose">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Team Disqualified
              </h1>
              <p className="text-sm text-neutral-300 mt-2 leading-relaxed">
                A checkpoint outside of your team's assigned route was scanned. In accordance with Rule 12, the entire team has been eliminated.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-black/40 border border-brand-rose/20 text-xs font-mono text-neutral-300 leading-relaxed">
              Please go back to <b className="text-white">{game.starting_room}</b> and contact OC for re-entering competition if your reason is valid.
            </div>
          </MotionDiv>
        </main>
      </div>
    );
  }

  // 4. Game Ended or Team Finished Screen
  if (game.status === "ENDED" || me?.team?.status === "FINISHED") {
    const isFinished = me?.team?.status === "FINISHED";
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar gameStatus={isFinished ? "FINISHED" : "ENDED"} />
        <main className="flex-1 flex items-center justify-center p-4">
          <MotionDiv className="max-w-md w-full glass-card rounded-3xl p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-brand-emerald/20 border border-brand-emerald/40 flex items-center justify-center mx-auto text-brand-emerald">
              {isFinished ? <Trophy className="w-8 h-8" /> : <Flag className="w-8 h-8" />}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {isFinished ? "10/10 Checkpoints Complete!" : "Game Concluded"}
              </h1>
              <p className="text-sm text-neutral-300 mt-2 leading-relaxed">
                {isFinished
                  ? "Congratulations! Your team cleared all 10 physical checkpoints. Your final time has been logged."
                  : "The official event timer has expired. Checkpoint verification and submissions are now closed."}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-surface-100 border border-border text-xs font-mono text-neutral-300">
              Please return to <b className="text-brand-cyan">{game.starting_room}</b>, where you started, and wait for official results.
            </div>
            <Badge variant="amber" className="mx-auto">
              RESULTS WILL BE PUBLISHED HERE
            </Badge>
          </MotionDiv>
        </main>
      </div>
    );
  }

  // 5. Main Screen: Join Lobby OR Active Gameplay
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar
        gameStatus={game.status}
        teamCode={me?.team?.code}
      />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full space-y-10">
        {!me?.authenticated ? (
          /* Join Team Lobby */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <MotionDiv className="lg:col-span-7 space-y-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-surface-100/80 border border-white/10 shadow-sm backdrop-blur-md">
                  <img src="/logo.svg" alt="CodeChef Logo" className="w-5 h-5 object-contain" />
                  <span className="text-xs font-mono font-bold tracking-wider text-neutral-300">CODECHEF HUNT</span>
                  <Badge variant={game.status === "LIVE" ? "live" : "amber"}>
                    {game.status === "LIVE" ? "GAME IS LIVE" : "LOBBY OPEN"}
                  </Badge>
                </div>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight gradient-brand-text">
                  Solve Code.<br />Chase Physical Clues.
                </h1>
                <p className="text-sm sm:text-base text-neutral-400 leading-relaxed max-w-xl">
                  Ten physical campus checkpoints. Every team receives a separate randomized route and unique Python & C++ challenges.
                </p>
              </div>

              {/* Join Form */}
              <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6 border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-surface-100 border border-border flex items-center justify-center text-brand-violet">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white">Enter Team Portal</h3>
                    <p className="text-xs text-neutral-400 font-mono">
                      Each team can have 1 to 3 members.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-2">
                      Team Code
                    </label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="e.g. X7K4P9"
                      maxLength={8}
                      className="w-full px-4 py-3.5 rounded-xl bg-surface-100 border border-border focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20 text-white font-mono uppercase tracking-widest text-base outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider mb-2">
                      Your Full Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Aryan Sharma"
                      className="w-full px-4 py-3.5 rounded-xl bg-surface-100 border border-border focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20 text-white text-base outline-none transition-all"
                    />
                  </div>

                  <button
                    onClick={handleJoin}
                    disabled={busy || !code.trim() || !name.trim()}
                    className="w-full gradient-brand-btn py-4 rounded-xl flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50 transition-all"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Join Team Session</span>
                  </button>
                </div>
              </div>
            </MotionDiv>

            {/* Rules Checklist Sidebar */}
            <MotionDiv delay={0.1} className="lg:col-span-5 space-y-6">
              <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-5 border border-white/10">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-brand-cyan" />
                  Authoritative Rules
                </h3>
                <ul className="space-y-3.5 text-xs text-neutral-300">
                  <li className="flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-brand-cyan flex-shrink-0 mt-0.5" />
                    <span><b>Server-side clock:</b> Your join timestamp and clear timestamps are logged by the server in IST.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Trophy className="w-4 h-4 text-brand-amber flex-shrink-0 mt-0.5" />
                    <span><b>10 Checkpoints Compulsory:</b> All 10 must be visited in your designated randomized order.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-brand-rose flex-shrink-0 mt-0.5" />
                    <span><b>Wrong QR = Instant Disqualification:</b> Scanning another checkpoint eliminates the whole team.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-brand-violet flex-shrink-0 mt-0.5" />
                    <span><b>Unique Programming Challenges:</b> Each team gets unique Python or C++ encrypted clues.</span>
                  </li>
                </ul>

                <div className="pt-4 border-t border-white/10">
                  <div className="text-xs font-mono text-neutral-400">
                    Starting Location: <b className="text-white">{game.starting_room}</b>
                  </div>
                  {game.start_at && (
                    <div className="text-xs font-mono text-neutral-400 mt-1">
                      Scheduled Start: <b className="text-brand-cyan">{new Date(game.start_at).toLocaleString("en-IN")}</b>
                    </div>
                  )}
                </div>
              </div>
            </MotionDiv>
          </div>
        ) : (
          /* Active Gameplay View */
          <div className="space-y-8">
            {/* Top Stat Ribbon */}
            <MotionDiv className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="glass-card rounded-2xl p-4 sm:p-5">
                <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">Team</span>
                <span className="text-lg sm:text-xl font-black text-white truncate block mt-1">
                  {me.team?.name}
                </span>
                <span className="text-xs font-mono text-brand-cyan">{me.team?.code}</span>
              </div>

              <div className="glass-card rounded-2xl p-4 sm:p-5">
                <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">Score</span>
                <span className="text-2xl sm:text-3xl font-black text-white block mt-1">
                  {me.team?.score || 0} <span className="text-sm font-normal text-neutral-400">/ 10</span>
                </span>
              </div>

              <div className="glass-card rounded-2xl p-4 sm:p-5">
                <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">Progress</span>
                <span className="text-2xl sm:text-3xl font-black text-brand-cyan block mt-1">
                  {me.team?.completed || 0} <span className="text-sm font-normal text-neutral-400">/ 10</span>
                </span>
                <div className="w-full bg-surface-100 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-brand-violet to-brand-cyan h-full rounded-full"
                    style={{ width: `${Math.min(100, (me.team?.completed || 0) * 10)}%` }}
                  />
                </div>
              </div>

              <div className="glass-card rounded-2xl p-4 sm:p-5">
                <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">Time Left</span>
                <span className="text-2xl sm:text-3xl font-black font-mono text-neutral-100 block mt-1">
                  {formatSeconds(remaining)}
                </span>
              </div>
            </MotionDiv>

            {/* Status Clue Box & Scanner Trigger */}
            <MotionDiv delay={0.08} className="glass-card rounded-3xl p-6 sm:p-8 space-y-6 border border-white/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-brand-cyan" />
                    <span className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                      Current Directive
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white">
                    {me.team?.completed === 0 && me.team?.next_location_name ? (
                      <span>
                        Head to first checkpoint: <span className="text-brand-cyan">{me.team.next_location_name}</span>
                      </span>
                    ) : me.team?.scanned ? (
                      <span>Checkpoint Verified. Solve the puzzle below!</span>
                    ) : me.team?.next_location_name ? (
                      <span>
                        Head to next checkpoint:{" "}
                        <span className="text-brand-cyan">{me.team.next_location_name}</span>
                      </span>
                    ) : (
                      <span>Travel to your next checkpoint and scan its physical QR code.</span>
                    )}
                  </h3>
                  <p className="text-xs sm:text-sm text-neutral-400">
                    Warning: Do not scan arbitrary QRs. Scanning a wrong location will immediately disqualify your team!
                  </p>
                </div>

                <button
                  onClick={() => setScannerOpen(true)}
                  disabled={busy}
                  className="gradient-brand-btn px-6 py-4 rounded-2xl flex items-center justify-center gap-2.5 text-sm font-bold flex-shrink-0 shadow-xl"
                >
                  <Camera className="w-5 h-5" />
                  <span>Scan Checkpoint QR</span>
                </button>
              </div>
            </MotionDiv>

            {/* Active Puzzle Card (Revealed after valid scan) */}
            {me.team?.puzzle ? (
              <MotionDiv delay={0.12}>
                <PuzzleCard
                  puzzle={me.team.puzzle}
                  answer={answer}
                  setAnswer={setAnswer}
                  onSubmit={handleSubmitAnswer}
                  onGetHint={handleGetHint}
                  hintText={hintText}
                  busy={busy}
                />
              </MotionDiv>
            ) : (
              <MotionDiv delay={0.12} className="glass-card rounded-3xl p-10 text-center space-y-4 border border-white/5">
                <div className="w-14 h-14 rounded-2xl bg-surface-100 border border-border flex items-center justify-center mx-auto text-neutral-500">
                  <Camera className="w-7 h-7" />
                </div>
                <div className="max-w-md mx-auto">
                  <h4 className="font-bold text-white text-base">Awaiting Physical QR Scan</h4>
                  <p className="text-xs text-neutral-400 mt-1">
                    Your exclusive code puzzle is unlocked immediately once you arrive at the target location and scan the physical QR code.
                  </p>
                </div>
              </MotionDiv>
            )}
          </div>
        )}
      </main>

      {/* QR Scanner Camera Modal */}
      <QRScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        busy={busy}
      />

      {/* Floating Toast Notification */}
      {toast && <Toast message={toast.msg} type={toast.type} />}
    </div>
  );
}
