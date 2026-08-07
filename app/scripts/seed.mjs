#!/usr/bin/env node
/**
 * Seed dữ liệu kiểm thử — docs Phase 3 §12.
 *
 *   npm run db:seed          # tạo DB nếu chưa có, thêm user + phân công + điểm mẫu
 *   npm run db:reset         # xoá sạch rồi seed lại
 *
 * Tiết mục lấy từ data/snapshot.json (kết quả normalize Google Sheet thật).
 * Điểm mẫu chỉ đặt ở SGN; HAN để trắng để kiểm chứng hai đầu cầu độc lập.
 *
 * Chạy trực tiếp bằng node — không qua Next — nên nó dùng node:sqlite thẳng và
 * chỉ mượn đúng một thứ từ app: chuỗi DDL. Một schema, không hai bản.
 */

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SCHEMA_SQL } from "../src/lib/db/schema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const DB_PATH = process.env.AHA_DB_PATH ?? join(APP, ".data", "aha.db");
const SNAPSHOT_CANDIDATES = [
  process.env.AHA_SNAPSHOT_PATH,
  join(HERE, "snapshot.json"),
  "/data/snapshot.json",
  "/app/seed-data/snapshot.json",
  resolve(APP, "..", "data", "snapshot.json"),
  resolve(APP, "data", "snapshot.json"),
].filter(Boolean);

const SNAPSHOT = SNAPSHOT_CANDIDATES.find((p) => existsSync(p));

if (!SNAPSHOT) {
  throw new Error(
    `Cannot find snapshot.json. Checked: ${SNAPSHOT_CANDIDATES.join(", ")}`
  );
}

const reset = process.argv.includes("--reset");
const now = () => new Date().toISOString();

/* ── Danh sách người dùng kiểm thử ────────────────────────────────────────
 * Email @ahamove.com là allow-list đăng nhập: không có tên ở đây thì không vào
 * được, kể cả gõ đúng địa chỉ tồn tại thật.
 */
const USERS = [
  // location: null = quản/chấm cả hai đầu cầu. Cả BTC và hội đồng BGK dùng
  // chung một tài khoản cho SGN 07/08 và HAN 14/08.
  { email: "nhidvm@ahamove.com", full_name: "Nhidvm", role: "admin", title: "Ban Tổ chức", location: null },

  { email: "duyennt@ahamove.com",  full_name: "Duyennt",  role: "judge", title: "Giám khảo", location: null },
  { email: "trangdlh@ahamove.com", full_name: "Trangdlh", role: "judge", title: "Giám khảo", location: null },
  { email: "thangls@ahamove.com",  full_name: "Thangls",  role: "judge", title: "Giám khảo", location: null },
  { email: "tuan@ahamove.com",     full_name: "Tuan",     role: "judge", title: "Giám khảo", location: null },
  { email: "ngon@ahamove.com",     full_name: "Ngon",     role: "judge", title: "Giám khảo", location: null },
  { email: "chunglh@ahamove.com",  full_name: "Chunglh",  role: "judge", title: "Giám khảo", location: null },
  { email: "tuannq@ahamove.com",   full_name: "Tuannq",   role: "judge", title: "Giám khảo", location: null },
  { email: "vyphb@ahamove.com",    full_name: "Vyphb",    role: "judge", title: "Giám khảo", location: null },
  /*
   * Hai BGK bổ sung. BTC đã xác nhận chấm cả hai đầu cầu như tám người trên, nên
   * không còn cờ `autoAssign` — seed phân công họ bình thường.
   *
   * `full_name` vẫn là email vì chưa ai gửi tên thật, và cột đó NOT NULL nên
   * không để trống được. Không bịa tên. `title` để null; Admin hiển thị nhãn mặc
   * định "Giám khảo" qua fallback ở views.ts.
   */
  { email: "linhth@ahamove.com", full_name: "linhth@ahamove.com", role: "judge", title: null, location: null },
  { email: "tamntm@ahamove.com", full_name: "tamntm@ahamove.com", role: "judge", title: null, location: null },
];

/* ── Mở DB ───────────────────────────────────────────────────────────────── */

if (reset) {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
  console.log(`Đã xoá ${DB_PATH}`);
}

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("pragma busy_timeout = 5000;");
db.exec(SCHEMA_SQL);

const run = (sql, ...args) => db.prepare(sql).run(...args);
const get = (sql, ...args) => db.prepare(sql).get(...args);
const all = (sql, ...args) => db.prepare(sql).all(...args);

/* ── Tiết mục ────────────────────────────────────────────────────────────── */

const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
const orderCounter = { SGN: 0, HAN: 0 };
let created = 0;

for (const p of snapshot.performances) {
  if (!p.location || !p.registration_code) continue;
  orderCounter[p.location] += 1;

  const existing = get(
    "select id from performances where registration_code = ?",
    p.registration_code,
  );
  if (existing) continue;

  const t = now();
  run(
    `insert into performances
       (id, registration_code, location, performance_order, performance_name,
        performance_type, participation_type, duration_minutes,
        representative_name, department, member_count,
        concept_description, transformation_highlight, costume_idea,
        ai_technology_usage, review_status, info_incomplete,
        last_synced_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)`,
    randomUUID(),
    p.registration_code,
    p.location,
    orderCounter[p.location],
    p.performance_name ?? "(chưa đặt tên)",
    p.performance_type,
    p.participation_type,
    p.duration_minutes,
    p.representative_name,
    p.department,
    p.member_count,
    p.concept_description,
    p.transformation_highlight,
    p.costume_idea,
    p.ai_technology_usage,
    // Thiếu mô tả ý tưởng hoặc thời lượng thì gắn cờ để Admin thấy ngay
    p.concept_description && p.duration_minutes ? 0 : 1,
    t,
    t,
    t,
  );
  created += 1;
}

/* ── Người dùng ──────────────────────────────────────────────────────────── */

for (const u of USERS) {
  const t = now();
  /*
   * Chuẩn hoá email trước khi ghi. Cột `email` là UNIQUE và mọi truy vấn đăng
   * nhập đi qua `normalizeEmail()` ở src/lib/server/users.ts, thứ luôn trim và
   * lowercase. Nếu seed ghi "Linhth@Ahamove.com" thì hàng đó tồn tại nhưng
   * `findByEmail("linhth@ahamove.com")` không thấy — BGK gõ đúng email của mình
   * mà hệ thống báo không có trong danh sách.
   */
  const email = u.email.trim().toLowerCase();
  run(
    `insert into users (id, email, full_name, role, title, location, status, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, 'active', ?, ?)
     on conflict (email) do update set
       full_name = excluded.full_name, role = excluded.role,
       title = excluded.title, location = excluded.location, updated_at = excluded.updated_at`,
    randomUUID(),
    email,
    u.full_name,
    u.role,
    u.title,
    u.location,
    t,
    t,
  );
}

/* ── Phân công: mỗi BGK chấm toàn bộ tiết mục đã duyệt của đầu cầu mình ────
 * BGK có `location` = null chấm cả hai đầu cầu, nên vòng lặp này gán họ vào
 * tiết mục của cả SGN và HAN. Thiếu điều kiện đó thì dashboard của họ rỗng:
 * judge/[location]/dashboard giao danh sách đã duyệt với danh sách phân công.
 */

/*
 * BGK có `autoAssign: false` bị loại khỏi vòng phân công: đầu cầu của họ chưa
 * được xác nhận, và mọi dòng trong `judge_assignments` bắt buộc phải mang một
 * đầu cầu cụ thể (cột `location` là NOT NULL). Phân công họ lúc này tức là tự
 * quyết thay Ban Tổ chức.
 *
 * Họ vẫn đăng nhập được và vẫn hiện trong Admin > Ban giám khảo — chỉ là
 * dashboard trống cho tới khi có phân công.
 */
const PENDING_ASSIGNMENT = new Set(
  USERS.filter((u) => u.autoAssign === false).map((u) => u.email.trim().toLowerCase()),
);

let assignments = 0;
for (const location of ["SGN", "HAN"]) {
  const judges = all(
    "select id, email from users where role = 'judge' and status = 'active' and (location is null or location = ?)",
    location,
  ).filter((j) => !PENDING_ASSIGNMENT.has(j.email));
  const performances = all(
    "select id from performances where location = ? and review_status = 'approved'",
    location,
  );
  for (const j of judges) {
    for (const p of performances) {
      const before = get(
        "select count(*) as n from judge_assignments where judge_id = ? and performance_id = ?",
        j.id,
        p.id,
      ).n;
      if (before) continue;
      run(
        "insert into judge_assignments (id, judge_id, performance_id, location, assigned_at) values (?, ?, ?, ?, ?)",
        randomUUID(),
        j.id,
        p.id,
        location,
        now(),
      );
      assignments += 1;
    }
  }
}

/* ── Trạng thái LED mặc định ─────────────────────────────────────────────── */

for (const location of ["SGN", "HAN"]) {
  run(
    "insert into live_display_state (id, location, display_mode, updated_at) values (?, ?, 'standby', ?) " +
      "on conflict (location) do nothing",
    randomUUID(),
    location,
    now(),
  );
}

/* ── Ba trạng thái điểm mẫu trên tiết mục SGN #01 ────────────────────────── */

const WEIGHTS = {
  creativity_score: 0.25,
  performance_quality_score: 0.25,
  transformation_score: 0.2,
  stage_presence_score: 0.2,
  completion_score: 0.1,
};

const total = (v) =>
  Math.round(
    Object.entries(WEIGHTS).reduce((acc, [k, w]) => acc + v[k] * w, 0) * 100,
  ) / 100;

const firstSgn = get(
  "select id from performances where location = 'SGN' and review_status = 'approved' order by performance_order limit 1",
);

const judgeByEmail = (email) => get("select id from users where email = ?", email);

if (firstSgn) {
  const samples = [
    {
      email: "bgk1.sgn@ahamove.com",
      status: "locked",
      values: { creativity_score: 88, performance_quality_score: 85, transformation_score: 90, stage_presence_score: 86, completion_score: 84 },
      highlight: "Mở màn dứt khoát, ý tưởng chuyển cảnh rõ ràng.",
    },
    {
      email: "bgk2.sgn@ahamove.com",
      status: "submitted",
      values: { creativity_score: 82, performance_quality_score: 80, transformation_score: 84, stage_presence_score: 79, completion_score: 81 },
      highlight: "Phần giữa hơi chùng nhưng kết tốt.",
    },
    {
      // Nháp: mới có 3/5 tiêu chí — đúng thứ Admin cần nhìn thấy là "đang chấm"
      email: "bgk3.sgn@ahamove.com",
      status: "draft",
      values: { creativity_score: 79, performance_quality_score: 77, transformation_score: 80, stage_presence_score: null, completion_score: null },
      highlight: null,
    },
  ];

  for (const s of samples) {
    const judge = judgeByEmail(s.email);
    if (!judge) continue;
    if (get("select id from scores where judge_id = ? and performance_id = ?", judge.id, firstSgn.id)) {
      continue;
    }
    const complete = Object.values(s.values).every((v) => v != null);
    const t = now();
    run(
      `insert into scores
         (id, judge_id, performance_id, location,
          creativity_score, performance_quality_score, transformation_score,
          stage_presence_score, completion_score, total_score,
          highlight_comment, status, submitted_at, locked_at,
          idempotency_key, created_at, updated_at)
       values (?, ?, ?, 'SGN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      judge.id,
      firstSgn.id,
      s.values.creativity_score,
      s.values.performance_quality_score,
      s.values.transformation_score,
      s.values.stage_presence_score,
      s.values.completion_score,
      complete ? total(s.values) : null,
      s.highlight,
      s.status,
      s.status === "draft" ? null : t,
      s.status === "locked" ? t : null,
      s.status === "draft" ? null : randomUUID(),
      t,
      t,
    );
  }

  // judging_status là dẫn xuất — tính lại thay vì hardcode
  const assigned = get(
    "select count(*) as n from judge_assignments where performance_id = ?",
    firstSgn.id,
  ).n;
  const submitted = get(
    "select count(*) as n from scores where performance_id = ? and status in ('submitted','locked')",
    firstSgn.id,
  ).n;
  run(
    "update performances set judging_status = ?, updated_at = ? where id = ?",
    assigned > 0 && submitted >= assigned ? "completed" : submitted > 0 ? "in_progress" : "not_started",
    now(),
    firstSgn.id,
  );
}

/* ── Báo cáo ─────────────────────────────────────────────────────────────── */

const count = (sql) => get(sql).n;
console.log(`
DB       ${DB_PATH}
Tiết mục ${count("select count(*) as n from performances")} (mới thêm ${created}) · SGN ${count("select count(*) as n from performances where location='SGN'")} / HAN ${count("select count(*) as n from performances where location='HAN'")}
Người    ${count("select count(*) as n from users")} · admin ${count("select count(*) as n from users where role='admin'")} / BGK ${count("select count(*) as n from users where role='judge'")}
Phân công ${count("select count(*) as n from judge_assignments")} (mới thêm ${assignments})
Điểm     ${count("select count(*) as n from scores")} · draft ${count("select count(*) as n from scores where status='draft'")} / submitted ${count("select count(*) as n from scores where status='submitted'")} / locked ${count("select count(*) as n from scores where status='locked'")}

Đăng nhập thử:
  Admin  http://localhost:3000/admin/login       nhidvm@ahamove.com
  BGK    http://localhost:3000/judge/sgn         duyennt@ahamove.com
  LED    http://localhost:3000/live/sgn
`);

db.close();
