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
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
