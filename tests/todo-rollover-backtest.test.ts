import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDailyTodoIfMissing,
  createHabitLogIfMissing,
  patchDailyTodo,
  rolloverIncompleteTodos,
  writeDailyTodo,
  writeHabitLog,
} from "../lib/firebase/daily-record-writes";

/**
 * 며칠에 걸친 실제 사용 흐름을 그대로 돌려보는 백테스트.
 * 규칙: 체크한 할 일은 다음날 보이면 안 되고, 체크 안 한 할 일은 다음날로 넘어와야 한다.
 */

type Row = Record<string, unknown>;

function createFakeFirestore() {
  const collections = new Map<string, Map<string, Row>>();

  function rowsOf(name: string) {
    let rows = collections.get(name);
    if (!rows) {
      rows = new Map();
      collections.set(name, rows);
    }
    return rows;
  }

  function makeQuery(rows: Map<string, Row>, filters: Array<(row: Row) => boolean>) {
    return {
      where(field: string, op: string, value: string) {
        const filter = (row: Row) => {
          const actual = String(row[field] ?? "");
          if (op === ">=") return actual >= value;
          if (op === "<") return actual < value;
          if (op === "==") return actual === value;
          throw new Error(`unsupported op: ${op}`);
        };
        return makeQuery(rows, [...filters, filter]);
      },
      async get() {
        const docs = [...rows.values()]
          .filter((row) => filters.every((filter) => filter(row)))
          .map((row) => {
            const id = String(row.id);
            return {
              id,
              data: () => ({ ...row }),
              ref: {
                async set(data: Row, options?: { merge: boolean }) {
                  const existing = rows.get(id);
                  rows.set(id, options?.merge && existing ? { ...existing, ...data } : { ...data });
                },
              },
            };
          });
        return { docs };
      },
    };
  }

  const db = {
    collection(name: string) {
      const rows = rowsOf(name);
      return Object.assign(makeQuery(rows, []), {
        doc(id: string) {
          return {
            async set(data: Row, options?: { merge: boolean }) {
              const existing = rows.get(id);
              rows.set(id, options?.merge && existing ? { ...existing, ...data } : { ...data });
            },
            async create(data: Row) {
              if (rows.has(id)) {
                const error = new Error(`6 ALREADY_EXISTS: ${id}`) as Error & { code: number };
                error.code = 6;
                throw error;
              }
              rows.set(id, { ...data });
            },
            async delete() {
              rows.delete(id);
            },
          };
        },
      });
    },
  };

  function todosOn(date: string) {
    return [...rowsOf("daily_todos").values()]
      .filter((row) => row.date === date)
      .map((row) => ({ id: String(row.id), completed: row.completed === true }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  return { db, todosOn, rowsIn: rowsOf };
}

/** GET /api/todos 가 오늘 날짜로 하는 일: 이월 후 그 날짜 목록 조회. */
async function openTodayList(store: ReturnType<typeof createFakeFirestore>, today: string) {
  await rolloverIncompleteTodos({ today }, store.db);
  return store.todosOn(today);
}

describe("todo rollover backtest", () => {
  it("3일 흐름: 체크한 것은 그날에 남고, 안 한 것만 다음날로 넘어온다", async () => {
    const store = createFakeFirestore();

    // 8/25: 할 일 둘 추가, A만 체크
    await writeDailyTodo({ id: "todo_a", date: "2026-08-25", text: "A" }, store.db);
    await writeDailyTodo({ id: "todo_b", date: "2026-08-25", text: "B" }, store.db);
    await patchDailyTodo({ id: "todo_a", date: "2026-08-25", completed: true }, store.db);

    // 8/26 아침에 목록을 연다
    const day2 = await openTodayList(store, "2026-08-26");
    assert.deepEqual(day2, [{ id: "todo_b", completed: false }], "미완료 B만 넘어와야 한다");
    assert.deepEqual(
      store.todosOn("2026-08-25"),
      [{ id: "todo_a", completed: true }],
      "체크한 A는 원래 날짜에 완료 상태로 남아야 한다",
    );

    // 8/26에 B를 체크
    await patchDailyTodo({ id: "todo_b", date: "2026-08-26", completed: true }, store.db);

    // 8/27 아침: 아무것도 넘어오지 않아야 한다
    const day3 = await openTodayList(store, "2026-08-27");
    assert.deepEqual(day3, [], "전부 체크했으니 8/27로 넘어올 것이 없다");
    assert.deepEqual(store.todosOn("2026-08-26"), [{ id: "todo_b", completed: true }]);
  });

  it("체크를 계속 안 하면 며칠이고 계속 따라온다", async () => {
    const store = createFakeFirestore();
    await writeDailyTodo({ id: "todo_x", date: "2026-08-25", text: "X" }, store.db);

    for (const day of ["2026-08-26", "2026-08-27", "2026-08-28"]) {
      const list = await openTodayList(store, day);
      assert.deepEqual(list, [{ id: "todo_x", completed: false }], `${day} 에도 X가 보여야 한다`);
    }
  });

  it("버그 재현: 예전 백업 sync(무조건 덮어쓰기)는 체크·이월을 과거 상태로 되돌렸다", async () => {
    const store = createFakeFirestore();
    await writeDailyTodo({ id: "todo_a", date: "2026-08-25", text: "A" }, store.db);
    await patchDailyTodo({ id: "todo_a", date: "2026-08-25", completed: true }, store.db);

    // 예전 sync 경로: 낡은 localStorage 스냅샷(8/25, 미완료)을 writeDailyTodo 로 덮어씀
    await writeDailyTodo({ id: "todo_a", date: "2026-08-25", text: "A", completed: false }, store.db);

    // → 체크가 풀린 채 과거로 돌아갔으니, 다음날 목록에 다시 나타난다 (사용자가 본 증상)
    const day2 = await openTodayList(store, "2026-08-26");
    assert.deepEqual(day2, [{ id: "todo_a", completed: false }]);
  });

  it("수정 확인: 새 백업 sync(없을 때만 생성)는 체크·이월 상태를 건드리지 못한다", async () => {
    const store = createFakeFirestore();

    // 8/25: A는 체크됨, B는 미완료 → 8/26 아침 B만 이월
    await writeDailyTodo({ id: "todo_a", date: "2026-08-25", text: "A" }, store.db);
    await writeDailyTodo({ id: "todo_b", date: "2026-08-25", text: "B" }, store.db);
    await patchDailyTodo({ id: "todo_a", date: "2026-08-25", completed: true }, store.db);
    await openTodayList(store, "2026-08-26");
    await patchDailyTodo({ id: "todo_b", date: "2026-08-26", completed: true }, store.db);

    // 낡은 8/25 스냅샷 [A 미완료, B 미완료] 가 sync 로 들어온다
    const syncA = await createDailyTodoIfMissing(
      { id: "todo_a", date: "2026-08-25", text: "A", completed: false },
      store.db,
    );
    const syncB = await createDailyTodoIfMissing(
      { id: "todo_b", date: "2026-08-25", text: "B", completed: false },
      store.db,
    );
    assert.equal(syncA.created, false, "이미 있는 A는 건너뛰어야 한다");
    assert.equal(syncB.created, false, "이미 있는 B는 건너뛰어야 한다");

    // 서버 상태는 그대로: A는 8/25 완료, B는 8/26 완료
    assert.deepEqual(store.todosOn("2026-08-25"), [{ id: "todo_a", completed: true }]);
    assert.deepEqual(store.todosOn("2026-08-26"), [{ id: "todo_b", completed: true }]);

    // 8/27 아침에도 아무것도 되살아나지 않는다
    const day3 = await openTodayList(store, "2026-08-27");
    assert.deepEqual(day3, []);

    // 반면 서버에서 사라진(유실된) 항목은 백업이 복원해 준다
    const restored = await createDailyTodoIfMissing(
      { id: "todo_lost", date: "2026-08-25", text: "유실된 항목", completed: false },
      store.db,
    );
    assert.equal(restored.created, true);
  });

  it("습관도 동일: 체크 해제한 습관을 낡은 스냅샷이 다시 체크하지 못한다", async () => {
    const store = createFakeFirestore();
    const habitLogs = () =>
      [...store.rowsIn("habit_logs").values()].map((row) => ({
        id: String(row.id),
        completed: row.completed === true,
      }));

    // 메인 페이지에서 체크 → 위젯에서 해제
    await writeHabitLog({ habit_id: "exercise", date: "2026-08-25", completed: true }, store.db);
    await writeHabitLog({ habit_id: "exercise", date: "2026-08-25", completed: false }, store.db);

    // 낡은 localStorage 스냅샷(체크됨)이 sync 로 들어와도 해제 상태가 유지된다
    const synced = await createHabitLogIfMissing(
      { habit_id: "exercise", date: "2026-08-25", completed: true },
      store.db,
    );
    assert.equal(synced.created, false, "이미 로그가 있으니 건너뛰어야 한다");
    assert.deepEqual(habitLogs(), [
      { id: "habit_logs_exercise_2026-08-25", completed: false },
    ]);

    // 서버에 로그가 아예 없는 날짜는 백업이 복원해 준다
    const restored = await createHabitLogIfMissing(
      { habit_id: "exercise", date: "2026-08-24", completed: true },
      store.db,
    );
    assert.equal(restored.created, true);
    assert.equal(
      store.rowsIn("habit_logs").get("habit_logs_exercise_2026-08-24")?.completed,
      true,
    );
  });
});
