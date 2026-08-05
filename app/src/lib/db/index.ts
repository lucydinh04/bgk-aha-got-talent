import "server-only";

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { MIGRATIONS } from "./migrations";
import { SCHEMA_SQL } from "./schema";

/**
 * Một kết nối SQLite, giữ trên globalThis.
 *
 * Vì sao globalThis chứ không phải module-level const: Next dev server nạp lại
 * module khi file đổi, và route handler với server action nằm ở hai đồ thị
 * module khác nhau. Mỗi lần nạp lại mà mở thêm một handle nữa thì WAL sẽ có
 * nhiều writer và ta mất tính tuần tự — đúng thứ duy nhất SQLite hứa hẹn.
 */
const KEY = Symbol.for("aha.talent.db");

type Holder = { db: DatabaseSync | null };

function holder(): Holder {
  const g = globalThis as unknown as Record<symbol, Holder | undefined>;
  return (g[KEY] ??= { db: null });
}

export function dbPath(): string {
  return process.env.AHA_DB_PATH ?? join(process.cwd(), ".data", "aha.db");
}

export function db(): DatabaseSync {
  const h = holder();
  if (h.db) return h.db;

  const file = dbPath();
  mkdirSync(dirname(file), { recursive: true });

  const conn = new DatabaseSync(file);
  // busy_timeout: hai tab Admin bấm cùng lúc thì đợi chứ đừng ném SQLITE_BUSY.
  conn.exec("pragma busy_timeout = 5000;");
  conn.exec(SCHEMA_SQL);
  migrate(conn);
  h.db = conn;
  return conn;
}

/**
 * Đưa DB lên phiên bản mới nhất.
 *
 * `pragma user_version` là bộ đếm 32-bit SQLite dành sẵn cho đúng việc này —
 * không cần bảng migration riêng, và nó nằm trong file DB nên không thể lệch
 * với dữ liệu.
 *
 * `foreign_keys` phải TẮT quanh bước dựng lại bảng: quy trình chuẩn của SQLite
 * là drop bảng cũ rồi rename bảng mới, và với FK đang bật thì thao tác đó bị
 * từ chối. Pragma này không đổi được bên trong transaction, nên nó nằm ngoài.
 */
function migrate(conn: DatabaseSync): void {
  const read = () =>
    (conn.prepare("pragma user_version").get() as { user_version: number })
      .user_version;

  // 0 = DB vừa dựng từ SCHEMA_SQL, hoặc DB cũ có trước khi có migration runner.
  // Cả hai trường hợp đều đang ở đúng cấu trúc v1.
  if (read() === 0) conn.exec("pragma user_version = 1");

  for (const m of MIGRATIONS) {
    if (m.version <= read()) continue;

    const needsFkOff = m.rebuildsTable === true;
    if (needsFkOff) conn.exec("pragma foreign_keys = OFF");
    conn.exec("begin immediate");
    try {
      conn.exec(m.sql);
      conn.exec(`pragma user_version = ${m.version}`);
      conn.exec("commit");
    } catch (err) {
      conn.exec("rollback");
      throw new Error(
        `Migration ${m.version} (${m.name}) thất bại: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      if (needsFkOff) conn.exec("pragma foreign_keys = ON");
    }

    // Dựng lại bảng mà để sót FK gãy thì phải biết ngay, không phải lúc đang diễn.
    if (needsFkOff) {
      const broken = conn.prepare("pragma foreign_key_check").all();
      if (broken.length) {
        throw new Error(
          `Migration ${m.version} để lại ${broken.length} tham chiếu khoá ngoại gãy.`,
        );
      }
    }
  }
}

/** Đóng kết nối — chỉ dùng trong test và script CLI. */
export function closeDb(): void {
  const h = holder();
  h.db?.close();
  h.db = null;
}

/* ── Tiện ích ────────────────────────────────────────────────────────────── */

export const uuid = (): string => randomUUID();

export const now = (): string => new Date().toISOString();

/** SQLite không có boolean; đọc/ghi qua hai hàm này thay vì rải `? 1 : 0`. */
export const toInt = (v: boolean): number => (v ? 1 : 0);
export const toBool = (v: unknown): boolean => v === 1 || v === true;

type Row = Record<string, unknown>;

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return db()
    .prepare(sql)
    .all(...(params as never[])) as T[];
}

export function get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
  return db()
    .prepare(sql)
    .get(...(params as never[])) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): void {
  db()
    .prepare(sql)
    .run(...(params as never[]));
}

/**
 * Chạy `fn` trong một transaction. Lồng nhau được: chỉ lần ngoài cùng mở
 * transaction thật, các lần trong chỉ chạy tiếp.
 */
let depth = 0;
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  const conn = db();
  conn.exec("begin immediate");
  depth += 1;
  try {
    const result = fn();
    conn.exec("commit");
    return result;
  } catch (err) {
    conn.exec("rollback");
    throw err;
  } finally {
    depth -= 1;
  }
}

/** Giá trị cấu hình sinh một lần rồi giữ nguyên (ví dụ secret ký cookie). */
export function settingOrCreate(key: string, create: () => string): string {
  const row = get<{ value: string }>("select value from settings where key = ?", key);
  if (row) return row.value;
  const value = create();
  run(
    "insert into settings (key, value, updated_at) values (?, ?, ?) " +
      "on conflict (key) do nothing",
    key,
    value,
    now(),
  );
  return (
    get<{ value: string }>("select value from settings where key = ?", key)?.value ??
    value
  );
}
