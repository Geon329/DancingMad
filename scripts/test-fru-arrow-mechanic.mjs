import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const sourcePath = new URL("../src/lib/fru-arrow-mechanic.ts", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
});

const tempDir = await mkdtemp(join(tmpdir(), "fru-arrow-"));
const modulePath = join(tempDir, "fru-arrow-mechanic.mjs");

try {
  await writeFile(modulePath, compiled.outputText, "utf8");
  const mechanic = await import(`file:///${modulePath.replaceAll("\\", "/")}`);

  const plan = mechanic.createArrowDebuffPlan("given-eight-players");

  assert.equal(plan.assignments.length, 8, "Given 8 players, Then 8 assignments are produced");
  assert.equal(
    plan.assignments.filter((assignment) => assignment.first === assignment.second).length,
    4,
    "Given one mechanic roll, Then 4 players receive duplicate directions"
  );
  assert.equal(
    plan.assignments.filter((assignment) => assignment.first !== assignment.second).length,
    4,
    "Given one mechanic roll, Then 4 players receive mixed directions"
  );
  assert.deepEqual(
    mechanic.getResolveSlots().map((slot) => slot.resolveMs),
    [7000, 10000],
    "Given the arrow debuffs, Then the resolve timings are 7s and 10s"
  );

  const drops = mechanic.createArrowDrops(
    plan.assignments,
    "first",
    {
      t1: { x: 50, y: 50 },
      t2: { x: 60, y: 50 },
      h1: { x: 50, y: 40 },
      h2: { x: 40, y: 50 },
      d1: { x: 45, y: 60 },
      d2: { x: 55, y: 60 },
      r1: { x: 35, y: 35 },
      r2: { x: 65, y: 35 }
    },
    7000
  );

  assert.equal(drops.length, 8, "Given first resolve, Then one arrow drop is created per player");

  const standardAssignments = [
    { playerId: "t1", first: "left", second: "left" },
    { playerId: "t2", first: "right", second: "right" },
    { playerId: "h1", first: "up", second: "up" },
    { playerId: "h2", first: "down", second: "down" },
    { playerId: "d1", first: "left", second: "up" },
    { playerId: "d2", first: "right", second: "up" },
    { playerId: "r1", first: "right", second: "down" },
    { playerId: "r2", first: "left", second: "down" }
  ];
  const currentPositions = {
    t1: { x: 10, y: 10 },
    t2: { x: 20, y: 20 },
    h1: { x: 30, y: 30 },
    h2: { x: 40, y: 40 },
    d1: { x: 45, y: 45 },
    d2: { x: 55, y: 55 },
    r1: { x: 65, y: 65 },
    r2: { x: 75, y: 75 }
  };
  const standardPositions = mechanic.createStandardPlayerPositions(standardAssignments, currentPositions, "d1");

  assert.deepEqual(
    standardPositions,
    {
      t1: { x: 50, y: 14 },
      t2: { x: 50, y: 86 },
      h1: { x: 86, y: 50 },
      h2: { x: 14, y: 50 },
      d1: { x: 45, y: 45 },
      d2: { x: 50, y: 34 },
      r1: { x: 66, y: 50 },
      r2: { x: 50, y: 66 }
    },
    "Given standard auto placement, Then each debuff maps to the reference slot while the locked player stays put"
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
