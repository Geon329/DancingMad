export const PLAYER_IDS = ["t1", "t2", "h1", "h2", "d1", "d2", "r1", "r2"] as const;
export const DIRECTIONS = ["left", "right", "up", "down"] as const;

export type PlayerId = (typeof PLAYER_IDS)[number];
export type Direction = (typeof DIRECTIONS)[number];
export type DebuffSlot = "first" | "second";

export type Point = {
  readonly x: number;
  readonly y: number;
};

export type ArrowAssignment = {
  readonly playerId: PlayerId;
  readonly first: Direction;
  readonly second: Direction;
};

export type ArrowDebuffPlan = {
  readonly seed: string;
  readonly assignments: readonly ArrowAssignment[];
};

export type ResolveSlot = {
  readonly slot: DebuffSlot;
  readonly resolveMs: number;
};

export type ArrowDrop = {
  readonly id: string;
  readonly playerId: PlayerId;
  readonly slot: DebuffSlot;
  readonly direction: Direction;
  readonly position: Point;
  readonly resolvedAtMs: number;
};

export type ArrowHit = {
  readonly dropId: string;
  readonly sourcePlayerId: PlayerId;
  readonly targetPlayerId: PlayerId;
};

export type PlayerPositions = Record<PlayerId, Point>;

const SAME_DIRECTION_PAIRS: readonly (readonly [Direction, Direction])[] = [
  ["left", "left"],
  ["right", "right"],
  ["up", "up"],
  ["down", "down"]
] as const;

const MIXED_DIRECTION_PAIRS: readonly (readonly [Direction, Direction])[] = [
  ["left", "up"],
  ["up", "right"],
  ["right", "down"],
  ["down", "left"]
] as const;

const RESOLVE_SLOTS: readonly ResolveSlot[] = [
  { slot: "first", resolveMs: 7000 },
  { slot: "second", resolveMs: 10000 }
] as const;

const LANE_WIDTH_PERCENT = 7;
const LANE_LENGTH_PERCENT = 32;

export class MechanicGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MechanicGenerationError";
  }
}

export function getResolveSlots(): readonly ResolveSlot[] {
  return RESOLVE_SLOTS;
}

export function getAssignmentDirection(assignment: ArrowAssignment, slot: DebuffSlot): Direction {
  return slot === "first" ? assignment.first : assignment.second;
}

export function createArrowDebuffPlan(seed: string): ArrowDebuffPlan {
  const rng = createSeededRandom(seed);
  const players = shuffle(PLAYER_IDS, rng);
  const samePairs = shuffle(SAME_DIRECTION_PAIRS, rng);
  const mixedPairs = shuffle(MIXED_DIRECTION_PAIRS, rng).map((pair) => maybeReversePair(pair, rng));
  const assignments: ArrowAssignment[] = [];

  for (let index = 0; index < players.length; index += 1) {
    const playerId = players[index];
    const pair = index < samePairs.length ? samePairs[index] : mixedPairs[index - samePairs.length];

    if (playerId === undefined || pair === undefined) {
      throw new MechanicGenerationError("Arrow debuff generation could not assign all players.");
    }

    assignments.push({
      playerId,
      first: pair[0],
      second: pair[1]
    });
  }

  return {
    seed,
    assignments
  };
}

export function createArrowDrops(
  assignments: readonly ArrowAssignment[],
  slot: DebuffSlot,
  positions: PlayerPositions,
  resolvedAtMs: number
): readonly ArrowDrop[] {
  return assignments.map((assignment) => {
    const position = positions[assignment.playerId];
    const direction = getAssignmentDirection(assignment, slot);

    return {
      id: `${assignment.playerId}-${slot}-${resolvedAtMs}`,
      playerId: assignment.playerId,
      slot,
      direction,
      position,
      resolvedAtMs
    };
  });
}

export function detectArrowHits(drops: readonly ArrowDrop[], positions: PlayerPositions): readonly ArrowHit[] {
  const hits: ArrowHit[] = [];

  for (const drop of drops) {
    for (const playerId of PLAYER_IDS) {
      if (playerId !== drop.playerId && isPointInArrowLane(drop.position, drop.direction, positions[playerId])) {
        hits.push({
          dropId: drop.id,
          sourcePlayerId: drop.playerId,
          targetPlayerId: playerId
        });
      }
    }
  }

  return hits;
}

export function clampToArena(point: Point): Point {
  const center = 50;
  const radius = 43;
  const dx = point.x - center;
  const dy = point.y - center;
  const distance = Math.hypot(dx, dy);

  if (distance <= radius) {
    return point;
  }

  const ratio = radius / distance;

  return {
    x: center + dx * ratio,
    y: center + dy * ratio
  };
}

function isPointInArrowLane(origin: Point, direction: Direction, target: Point): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;

  switch (direction) {
    case "up":
      return dy < 0 && Math.abs(dx) <= LANE_WIDTH_PERCENT && Math.abs(dy) <= LANE_LENGTH_PERCENT;
    case "right":
      return dx > 0 && Math.abs(dy) <= LANE_WIDTH_PERCENT && Math.abs(dx) <= LANE_LENGTH_PERCENT;
    case "down":
      return dy > 0 && Math.abs(dx) <= LANE_WIDTH_PERCENT && Math.abs(dy) <= LANE_LENGTH_PERCENT;
    case "left":
      return dx < 0 && Math.abs(dy) <= LANE_WIDTH_PERCENT && Math.abs(dx) <= LANE_LENGTH_PERCENT;
    default:
      return assertNever(direction);
  }
}

function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed);

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(rng() * (index + 1));
    const current = shuffled[index];
    const target = shuffled[targetIndex];

    if (current === undefined || target === undefined) {
      throw new MechanicGenerationError("Shuffle received an invalid index.");
    }

    shuffled[index] = target;
    shuffled[targetIndex] = current;
  }

  return shuffled;
}

function maybeReversePair(
  pair: readonly [Direction, Direction],
  rng: () => number
): readonly [Direction, Direction] {
  if (rng() < 0.5) {
    return pair;
  }

  return [pair[1], pair[0]] as const;
}

function assertNever(value: never): never {
  throw new MechanicGenerationError(`Unexpected mechanic variant: ${String(value)}`);
}
