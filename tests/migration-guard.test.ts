import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * STATIC GUARD (runnable without a database)
 * ==========================================
 * The real enforcement of UNIQUE(habit_id, day) lives in SQL migration 0003,
 * which can only be executed against a live Postgres/Supabase (NOT TESTED here).
 * This test statically verifies the migration actually (a) drops the misleading
 * non-unique index from 0001 and (b) creates a real UNIQUE index with the exact
 * name the Drizzle schema + the app rely on. It catches regressions where a
 * migration is edited but the guard/index is silently dropped.
 */

const migrationPath = resolve(process.cwd(), "supabase/migrations/0003_task_snapshots_and_habit_uniqueness.sql");
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("migration 0003: habit_logs uniqueness (static guard)", () => {
  it("drops the old NON-unique index that 0001 misleadingly created", () => {
    // 0003 must remove the duplicate-prone index from 0001 so rows can't slip
    // past with two entries per (habit_id, day).
    expect(normalized).toMatch(/drop\s+index\s+if\s+exists\s+(?:public\.)?habit_logs_habit_day_idx/i);
  });

  it("creates a real UNIQUE index on habit_logs(habit_id, day)", () => {
    expect(normalized).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+habit_logs_habit_day_uidx/i);
    // The index must cover exactly the pair that the unique constraint needs.
    expect(normalized).toMatch(/on\s+public\.habit_logs\s*\(\s*habit_id\s*,\s*day\s*\)/i);
  });

  it("adds the four snapshot columns to task_progress_logs", () => {
    for (const col of [
      "target_value_at_record",
      "max_points_at_record",
      "measure_type_at_record",
      "unit_at_record",
    ]) {
      expect(normalized).toMatch(
        new RegExp(`add\\s+column\\s+(if\\s+not\\s+exists\\s+)?${col}\\b`, "i"),
      );
    }
  });
});
