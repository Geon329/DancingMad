"use client";

import {
  AlertTriangle,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  SkipForward
} from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PLAYER_IDS,
  clampToArena,
  createArrowDebuffPlan,
  createArrowDrops,
  detectArrowHits,
  getAssignmentDirection,
  getResolveSlots,
  MechanicGenerationError
} from "@/lib/fru-arrow-mechanic";
import type {
  ArrowAssignment,
  ArrowDrop,
  DebuffSlot,
  Direction,
  PlayerId,
  PlayerPositions,
  Point
} from "@/lib/fru-arrow-mechanic";
import { publicPath } from "@/lib/public-path";

type PlayerView = {
  readonly id: PlayerId;
  readonly label: string;
  readonly asset: string;
};

type DragState = {
  readonly playerId: PlayerId;
} | null;

const PLAYER_VIEWS: readonly PlayerView[] = [
  { id: "t1", label: "T1", asset: publicPath("/fru-arrow/tank1.png") },
  { id: "t2", label: "T2", asset: publicPath("/fru-arrow/tank2.png") },
  { id: "h1", label: "H1", asset: publicPath("/fru-arrow/healer1.png") },
  { id: "h2", label: "H2", asset: publicPath("/fru-arrow/healer2.png") },
  { id: "d1", label: "D1", asset: publicPath("/fru-arrow/dps1.png") },
  { id: "d2", label: "D2", asset: publicPath("/fru-arrow/dps2.png") },
  { id: "r1", label: "R1", asset: publicPath("/fru-arrow/physical-ranged.png") },
  { id: "r2", label: "R2", asset: publicPath("/fru-arrow/magical-ranged.png") }
] as const;

const INITIAL_POSITIONS: PlayerPositions = {
  t1: { x: 50, y: 22 },
  t2: { x: 50, y: 78 },
  h1: { x: 25, y: 50 },
  h2: { x: 75, y: 50 },
  d1: { x: 36, y: 36 },
  d2: { x: 64, y: 36 },
  r1: { x: 36, y: 64 },
  r2: { x: 64, y: 64 }
};

const DIRECTION_ROTATION: Record<Direction, number> = {
  up: 0,
  right: 90,
  down: 180,
  left: 270
};

const DIRECTION_LABEL: Record<Direction, string> = {
  up: "위",
  right: "우",
  down: "아래",
  left: "좌"
};

const SLOT_LABEL: Record<DebuffSlot, string> = {
  first: "1",
  second: "2"
};

const TOTAL_MS = 11000;
const TICK_MS = 100;

export function FruArrowSim() {
  const [seed, setSeed] = useState("fru-arrow-001");
  const [playerPositions, setPlayerPositions] = useState<PlayerPositions>(INITIAL_POSITIONS);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [arrowDrops, setArrowDrops] = useState<readonly ArrowDrop[]>([]);
  const [dragState, setDragState] = useState<DragState>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<PlayerPositions>(INITIAL_POSITIONS);
  const resolvedSlotsRef = useRef<Set<DebuffSlot>>(new Set());
  const plan = useMemo(() => createArrowDebuffPlan(seed), [seed]);
  const assignmentByPlayer = useMemo(() => {
    const next = new Map<PlayerId, ArrowAssignment>();

    for (const assignment of plan.assignments) {
      next.set(assignment.playerId, assignment);
    }

    return next;
  }, [plan.assignments]);
  const resolveSlots = getResolveSlots();
  const hitWarnings = useMemo(() => detectArrowHits(arrowDrops, playerPositions), [arrowDrops, playerPositions]);
  const hitPlayerIds = useMemo(() => {
    const next = new Set<PlayerId>();

    for (const warning of hitWarnings) {
      next.add(warning.targetPlayerId);
    }

    return next;
  }, [hitWarnings]);

  useEffect(() => {
    positionsRef.current = playerPositions;
  }, [playerPositions]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedMs((previous) => {
        const next = Math.min(previous + TICK_MS, TOTAL_MS);

        for (const resolveSlot of resolveSlots) {
          if (
            previous < resolveSlot.resolveMs &&
            next >= resolveSlot.resolveMs &&
            !resolvedSlotsRef.current.has(resolveSlot.slot)
          ) {
            resolvedSlotsRef.current.add(resolveSlot.slot);
            const nextDrops = createArrowDrops(
              plan.assignments,
              resolveSlot.slot,
              positionsRef.current,
              resolveSlot.resolveMs
            );
            setArrowDrops((current) => [...current, ...nextDrops]);
          }
        }

        if (next >= TOTAL_MS) {
          setIsRunning(false);
        }

        return next;
      });
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [isRunning, plan.assignments, resolveSlots]);

  function resetRun(nextSeed?: string): void {
    setIsRunning(false);
    setElapsedMs(0);
    setArrowDrops([]);
    resolvedSlotsRef.current = new Set<DebuffSlot>();
    setPlayerPositions(INITIAL_POSITIONS);

    if (nextSeed !== undefined) {
      setSeed(nextSeed);
    }
  }

  function resolveNow(): void {
    setIsRunning(false);
    resolvedSlotsRef.current = new Set<DebuffSlot>(["first", "second"]);
    setElapsedMs(10000);
    setArrowDrops([
      ...createArrowDrops(plan.assignments, "first", positionsRef.current, 7000),
      ...createArrowDrops(plan.assignments, "second", positionsRef.current, 10000)
    ]);
  }

  function movePlayer(playerId: PlayerId, event: ReactPointerEvent<HTMLElement>): void {
    const arena = arenaRef.current;

    if (arena === null) {
      return;
    }

    const rect = arena.getBoundingClientRect();
    const rawPoint = {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100
    };
    const nextPoint = clampToArena(rawPoint);

    setPlayerPositions((current) => ({
      ...current,
      [playerId]: nextPoint
    }));
  }

  function startDrag(playerId: PlayerId, event: ReactPointerEvent<HTMLButtonElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ playerId });
    movePlayer(playerId, event);
  }

  function continueDrag(playerId: PlayerId, event: ReactPointerEvent<HTMLButtonElement>): void {
    if (dragState?.playerId !== playerId) {
      return;
    }

    movePlayer(playerId, event);
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDragState(null);
  }

  const progressPercent = Math.min(100, (elapsedMs / 10000) * 100);
  const duplicateCount = plan.assignments.filter((assignment) => assignment.first === assignment.second).length;
  const mixedCount = plan.assignments.length - duplicateCount;

  return (
    <main className="min-h-screen bg-[#151719] text-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-1 gap-5 px-4 py-4 lg:grid-cols-[minmax(560px,1fr)_380px] lg:px-6">
        <section className="flex min-h-[calc(100vh-2rem)] items-center justify-center">
          <div
            ref={arenaRef}
            className="relative aspect-square w-full max-w-[780px] overflow-hidden rounded-full border border-slate-200/45 bg-[#222] shadow-[0_34px_90px_rgba(0,0,0,0.52)]"
            style={{
              backgroundImage: `url('${publicPath("/fru-arrow/arena.png")}')`,
              backgroundPosition: "center",
              backgroundSize: "cover"
            }}
          >
            <div className="pointer-events-none absolute inset-[5.5%] rounded-full border border-white/25" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex h-[15%] w-[15%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/20">
              <img className="h-full w-full object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.55)]" src={publicPath("/fru-arrow/boss.png")} alt="Boss" />
            </div>
            {arrowDrops.map((drop) => {
              const isDangerous = hitWarnings.some((warning) => warning.dropId === drop.id);

              return (
                <div key={drop.id} className="pointer-events-none absolute inset-0 z-10">
                  <div className={isDangerous ? "absolute bg-red-500/30" : "absolute bg-amber-200/20"} style={getLaneStyle(drop)} />
                  <img
                    className={isDangerous ? "absolute h-[8%] w-[8%] drop-shadow-[0_0_18px_rgba(248,113,113,0.95)]" : "absolute h-[8%] w-[8%] drop-shadow-[0_0_12px_rgba(251,191,36,0.7)]"}
                    src={publicPath("/fru-arrow/up-arrow.png")}
                    alt={`${DIRECTION_LABEL[drop.direction]} arrow`}
                    style={getArrowStyle(drop.position, drop.direction)}
                  />
                </div>
              );
            })}
            {PLAYER_VIEWS.map((player) => {
              const assignment = assignmentByPlayer.get(player.id);

              if (assignment === undefined) {
                return null;
              }

              return (
                <button
                  key={player.id}
                  type="button"
                  className={getPlayerClassName(hitPlayerIds.has(player.id))}
                  style={getPlayerStyle(playerPositions[player.id])}
                  aria-label={`${player.label} move handle`}
                  onPointerDown={(event) => startDrag(player.id, event)}
                  onPointerMove={(event) => continueDrag(player.id, event)}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <img className="h-full w-full select-none object-contain" src={player.asset} alt={player.label} draggable={false} />
                  <span className="absolute -bottom-2 left-1/2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-black text-white shadow -translate-x-1/2">
                    {player.label}
                  </span>
                  <span className="absolute -top-7 left-1/2 flex -translate-x-1/2 gap-1">
                    <DebuffBadge assignment={assignment} slot="first" elapsedMs={elapsedMs} />
                    <DebuffBadge assignment={assignment} slot="second" elapsedMs={elapsedMs} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="flex min-h-[calc(100vh-2rem)] flex-col gap-4 rounded-lg border border-white/10 bg-[#202327] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] lg:h-[calc(100vh-2rem)] lg:min-h-0 lg:overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-black leading-tight text-white">FRU Arrow Debuff Lab</h1>
              <p className="mt-1 text-sm font-semibold text-slate-400">seed {seed}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-black/25 px-2.5 py-1 text-right">
              <div className="text-2xl font-black tabular-nums text-white">{formatSeconds(elapsedMs)}</div>
              <div className="text-[11px] font-bold uppercase tracking-normal text-slate-400">seconds</div>
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-black/45">
            <div className="h-full rounded-full bg-amber-300 transition-[width] duration-100" style={{ width: `${progressPercent}%` }} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button className="flex h-11 items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-black text-emerald-950 shadow" type="button" onClick={() => setIsRunning((value) => !value)}>
              {isRunning ? <Pause aria-hidden size={18} /> : <Play aria-hidden size={18} />}
              {isRunning ? "Pause" : "Start"}
            </button>
            <button className="flex h-11 items-center justify-center gap-2 rounded-md bg-slate-700 px-3 text-sm font-black text-white shadow" type="button" onClick={() => resetRun()}>
              <RotateCcw aria-hidden size={18} />
              Reset
            </button>
            <button className="flex h-11 items-center justify-center gap-2 rounded-md bg-slate-700 px-3 text-sm font-black text-white shadow" type="button" onClick={resolveNow}>
              <SkipForward aria-hidden size={18} />
              Resolve
            </button>
            <button className="flex h-11 items-center justify-center gap-2 rounded-md bg-amber-300 px-3 text-sm font-black text-amber-950 shadow" type="button" onClick={() => resetRun(createSeed())}>
              <Shuffle aria-hidden size={18} />
              Shuffle
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric label="same" value={duplicateCount.toString()} />
            <Metric label="mixed" value={mixedCount.toString()} />
          </div>

          <section className="rounded-md border border-white/10 bg-black/20 p-3">
            <h2 className="mb-2 text-sm font-black uppercase tracking-normal text-slate-300">Timeline</h2>
            <div className="space-y-2">
              {resolveSlots.map((slot) => (
                <div key={slot.slot} className="grid grid-cols-[46px_1fr_58px] items-center gap-2 text-sm">
                  <span className="font-black text-white">{SLOT_LABEL[slot.slot]}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                    <div className="h-full rounded-full bg-sky-300" style={{ width: `${Math.min(100, (elapsedMs / slot.resolveMs) * 100)}%` }} />
                  </div>
                  <span className="text-right font-black tabular-nums text-slate-200">{formatCountdown(slot.resolveMs, elapsedMs)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-white/10 bg-black/20 p-3">
            <h2 className="mb-2 text-sm font-black uppercase tracking-normal text-slate-300">Party</h2>
            <div className="grid min-h-0 flex-1 gap-2 overflow-auto pr-1">
              {PLAYER_VIEWS.map((player) => {
                const assignment = assignmentByPlayer.get(player.id);

                if (assignment === undefined) {
                  return null;
                }

                return (
                  <div key={player.id} className={hitPlayerIds.has(player.id) ? "grid grid-cols-[34px_1fr_70px] items-center gap-2 rounded-md border border-red-400/60 bg-red-500/15 px-2 py-2" : "grid grid-cols-[34px_1fr_70px] items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-2 py-2"}>
                    <img className="h-8 w-8 object-contain" src={player.asset} alt={player.label} />
                    <div>
                      <div className="text-sm font-black text-white">{player.label}</div>
                      <div className="text-xs font-bold text-slate-400">{renderAssignmentText(assignment)}</div>
                    </div>
                    {hitPlayerIds.has(player.id) ? (
                      <span className="inline-flex items-center justify-end gap-1 text-xs font-black text-red-200">
                        <AlertTriangle aria-hidden size={14} />
                        HIT
                      </span>
                    ) : (
                      <span className="text-right text-xs font-black text-emerald-200">OK</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="max-h-32 overflow-hidden rounded-md border border-white/10 bg-black/20 p-3">
            <h2 className="mb-2 text-sm font-black uppercase tracking-normal text-slate-300">Hits</h2>
            {hitWarnings.length === 0 ? (
              <p className="text-sm font-semibold text-slate-400">0</p>
            ) : (
              <div className="max-h-20 space-y-1 overflow-auto pr-1">
                {hitWarnings.map((warning) => (
                  <p key={`${warning.dropId}-${warning.targetPlayerId}`} className="text-sm font-bold text-red-200">
                    {labelForPlayer(warning.sourcePlayerId)} → {labelForPlayer(warning.targetPlayerId)}
                  </p>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function DebuffBadge({
  assignment,
  slot,
  elapsedMs
}: {
  readonly assignment: ArrowAssignment;
  readonly slot: DebuffSlot;
  readonly elapsedMs: number;
}) {
  const resolveMs = slot === "first" ? 7000 : 10000;
  const direction = getAssignmentDirection(assignment, slot);
  const resolved = elapsedMs >= resolveMs;

  return (
    <span className={resolved ? "relative grid h-8 w-8 place-items-center rounded border border-amber-200/70 bg-amber-300/20 opacity-70 shadow" : "relative grid h-8 w-8 place-items-center rounded border border-amber-200/80 bg-black/65 shadow"}>
      <img
        className="h-6 w-6 object-contain drop-shadow"
        src={publicPath("/fru-arrow/up-arrow.png")}
        alt={DIRECTION_LABEL[direction]}
        style={{ transform: `rotate(${DIRECTION_ROTATION[direction]}deg)` }}
      />
      <span className="absolute -right-1 -bottom-1 grid h-4 min-w-4 place-items-center rounded bg-white px-1 text-[10px] font-black text-slate-950">
        {SLOT_LABEL[slot]}
      </span>
    </span>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[11px] font-black uppercase tracking-normal text-slate-400">{label}</div>
      <div className="text-2xl font-black leading-none text-white">{value}</div>
    </div>
  );
}

function getPlayerClassName(isHit: boolean): string {
  const base =
    "absolute z-30 h-[10%] w-[10%] -translate-x-1/2 -translate-y-1/2 touch-none rounded-md bg-transparent p-0 transition-[filter,transform] duration-150";

  if (isHit) {
    return `${base} drop-shadow-[0_0_18px_rgba(248,113,113,0.95)]`;
  }

  return `${base} drop-shadow-[0_8px_12px_rgba(0,0,0,0.55)]`;
}

function getPlayerStyle(position: Point): CSSProperties {
  return {
    left: `${position.x}%`,
    top: `${position.y}%`
  };
}

function getArrowStyle(position: Point, direction: Direction): CSSProperties {
  return {
    left: `${position.x}%`,
    top: `${position.y}%`,
    transform: `translate(-50%, -50%) rotate(${DIRECTION_ROTATION[direction]}deg)`
  };
}

function getLaneStyle(drop: ArrowDrop): CSSProperties {
  const width = 7;
  const length = 32;

  switch (drop.direction) {
    case "up":
      return {
        left: `${drop.position.x}%`,
        top: `${drop.position.y - length}%`,
        width: `${width}%`,
        height: `${length}%`,
        transform: "translateX(-50%)"
      };
    case "right":
      return {
        left: `${drop.position.x}%`,
        top: `${drop.position.y}%`,
        width: `${length}%`,
        height: `${width}%`,
        transform: "translateY(-50%)"
      };
    case "down":
      return {
        left: `${drop.position.x}%`,
        top: `${drop.position.y}%`,
        width: `${width}%`,
        height: `${length}%`,
        transform: "translateX(-50%)"
      };
    case "left":
      return {
        left: `${drop.position.x - length}%`,
        top: `${drop.position.y}%`,
        width: `${length}%`,
        height: `${width}%`,
        transform: "translateY(-50%)"
      };
    default:
      return assertNever(drop.direction);
  }
}

function formatCountdown(resolveMs: number, elapsedMs: number): string {
  const remaining = Math.max(0, resolveMs - elapsedMs);

  if (remaining === 0) {
    return "0.0";
  }

  return formatSeconds(remaining);
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

function renderAssignmentText(assignment: ArrowAssignment): string {
  return `${DIRECTION_LABEL[assignment.first]}${DIRECTION_LABEL[assignment.second]}`;
}

function labelForPlayer(playerId: PlayerId): string {
  for (const player of PLAYER_VIEWS) {
    if (player.id === playerId) {
      return player.label;
    }
  }

  return playerId;
}

function createSeed(): string {
  return `fru-arrow-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000).toString(36)}`;
}

function assertNever(value: never): never {
  throw new MechanicGenerationError(`Unexpected direction ${String(value)}`);
}
