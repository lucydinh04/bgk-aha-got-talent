/**
 * DDL của hệ thống chấm điểm — nguồn DUY NHẤT.
 *
 * Để nguyên trong TypeScript chứ không tách ra .sql: file .sql sẽ phải đọc bằng
 * fs lúc runtime, mà đường dẫn tương đối tới cwd thì đúng ở dev và sai ở vài
 * kiểu deploy. Chuỗi này đi cùng bundle, không bao giờ lạc.
 */
export const SCHEMA_SQL = String.raw`
-- AHA GOT TALENT 2026 — schema chấm điểm
--
-- SQLite port của docs/01-architecture.md §5. Tên cột giữ nguyên bản Postgres
-- để migration sang Supabase sau này là đổi transport chứ không phải viết lại
-- truy vấn. Ba khác biệt có chủ đích, ghi rõ ở đây để không ai phải đoán:
--
--   1. "show_status" của doc bị tách làm hai: "judging_status" (suy ra từ
--      scores, hệ thống ghi) và "live_status" (Admin điều khiển từ Live
--      Control). Hai trục này thay đổi vì hai lý do khác nhau; gộp lại thì mỗi
--      lần Admin bấm nút lại phải lo đừng ghi đè tiến độ chấm.
--   2. "review_status" thu về ba giá trị: chỉ 'approved' mới lộ ra cho BGK.
--   3. Không có enum type — SQLite dùng CHECK. Cùng tác dụng, khác cú pháp.
--
-- Bảng công bố giải (awards, publishing_snapshots) KHÔNG có ở đây: Phase 3
-- không xây phần đó, và một bảng rỗng nằm sẵn chỉ mời người ta ghi vào.

pragma journal_mode = WAL;
pragma foreign_keys = ON;

-- ── users ───────────────────────────────────────────────────────────────────
create table if not exists users (
  id            text primary key,
  email         text not null unique,          -- luôn lowercase, chuẩn hoá khi ghi
  full_name     text not null,
  role          text not null default 'judge'
                  check (role in ('judge', 'admin', 'super_admin')),
  title         text,
  department    text,
  -- NULL = cả hai đầu cầu, dùng được cho cả Admin và BGK.
  location      text check (location in ('SGN', 'HAN')),
  status        text not null default 'active'
                  check (status in ('active', 'disabled')),
  last_login_at text,
  created_at    text not null,
  updated_at    text not null
);
create index if not exists users_role_location on users (role, location);

-- ── performances ────────────────────────────────────────────────────────────
create table if not exists performances (
  id                text primary key,
  registration_code text not null unique,      -- KHÓA NGHIỆP VỤ, không dùng tên
  location          text not null check (location in ('SGN', 'HAN')),

  -- BTC sở hữu — sync KHÔNG BAO GIỜ ghi đè (docs/01-architecture.md §7.3)
  performance_order     integer,
  official_display_name text,
  team_name             text,

  -- Google Sheet sở hữu
  performance_name         text not null,
  performance_type         text,
  participation_type       text,
  duration_minutes         integer,
  representative_name      text,
  department               text,
  member_count             integer,
  concept_description      text,
  transformation_highlight text,
  costume_idea             text,
  ai_technology_usage      text,

  -- Vòng đời — ba trục độc lập
  review_status  text not null default 'pending_review'
                   check (review_status in ('pending_review', 'approved', 'rejected')),
  judging_status text not null default 'not_started'
                   check (judging_status in ('not_started', 'in_progress', 'completed')),
  live_status    text not null default 'not_started'
                   check (live_status in ('not_started', 'performing', 'performed')),

  is_current_performance integer not null default 0 check (is_current_performance in (0, 1)),
  info_incomplete        integer not null default 0 check (info_incomplete in (0, 1)),
  source_missing         integer not null default 0 check (source_missing in (0, 1)),
  last_synced_at         text,
  created_at             text not null,
  updated_at             text not null,

  -- Mã đăng ký đã nhúng đầu cầu; chặn lệch dữ liệu ngay ở tầng lưu trữ
  constraint code_matches_location
    check (location = substr(registration_code, 7, 3))
);
-- Mỗi đầu cầu tối đa MỘT tiết mục đang diễn
create unique index if not exists performances_current_uniq
  on performances (location) where is_current_performance = 1;
create unique index if not exists performances_order_uniq
  on performances (location, performance_order)
  where performance_order is not null and review_status <> 'rejected';

-- ── judge_assignments ───────────────────────────────────────────────────────
create table if not exists judge_assignments (
  id             text primary key,
  judge_id       text not null references users (id) on delete cascade,
  performance_id text not null references performances (id) on delete cascade,
  -- denormalize: mọi truy vấn tiến độ đều lọc theo đầu cầu trước tiên
  location       text not null check (location in ('SGN', 'HAN')),
  assigned_at    text not null,
  unique (judge_id, performance_id)
);
create index if not exists assignments_location on judge_assignments (location);
create index if not exists assignments_performance on judge_assignments (performance_id);

-- ── scores ──────────────────────────────────────────────────────────────────
create table if not exists scores (
  id             text primary key,
  judge_id       text not null references users (id) on delete restrict,
  performance_id text not null references performances (id) on delete restrict,
  location       text not null check (location in ('SGN', 'HAN')),

  creativity_score          real check (creativity_score          between 0 and 100),
  performance_quality_score real check (performance_quality_score between 0 and 100),
  transformation_score      real check (transformation_score      between 0 and 100),
  stage_presence_score      real check (stage_presence_score      between 0 and 100),
  completion_score          real check (completion_score          between 0 and 100),
  total_score               real,

  highlight_comment   text,
  improvement_comment text,
  private_note        text,

  status       text not null default 'draft'
                 check (status in ('draft', 'submitted', 'locked')),
  submitted_at text,
  locked_at    text,

  -- BB-4 chống gửi trùng: client sinh key một lần cho mỗi lần bấm Gửi
  idempotency_key   text unique,
  client_updated_at text,
  created_at        text not null,
  updated_at        text not null,

  unique (judge_id, performance_id),

  -- Đã gửi thì phải đủ 5 tiêu chí — bất biến ở tầng lưu trữ, không phải tầng app
  constraint submitted_needs_all_criteria check (
    status = 'draft' or (
      creativity_score is not null and performance_quality_score is not null and
      transformation_score is not null and stage_presence_score is not null and
      completion_score is not null and submitted_at is not null
    )
  )
);
create index if not exists scores_location_status on scores (location, status);
create index if not exists scores_performance on scores (performance_id);

-- ── live_display_state — một dòng mỗi đầu cầu, nguồn sự thật DUY NHẤT của LED ─
create table if not exists live_display_state (
  id                     text primary key,
  location               text not null unique check (location in ('SGN', 'HAN')),
  current_performance_id text references performances (id) on delete set null,
  next_performance_id    text references performances (id) on delete set null,

  -- Danh sách này KHÔNG chứa scorecard / award / ranking. Phase 3 không công bố
  -- giải, nên trạng thái công bố giải không tồn tại được ở tầng dữ liệu — LED
  -- không thể vào nhầm chế độ đó kể cả khi tầng app có bug.
  display_mode text not null default 'standby' check (display_mode in (
    'standby', 'interlude', 'performance', 'judging_progress',
    'performance_waiting', 'performance_completed',
    'all_performances_status', 'all_scores_completed', 'emergency_hide'
  )),
  public_message text,
  updated_by     text references users (id) on delete set null,
  updated_at     text not null
);

-- ── sheet sync ──────────────────────────────────────────────────────────────
create table if not exists sheet_sync_logs (
  id                text primary key,
  spreadsheet_id    text not null,
  initiated_by      text references users (id) on delete set null,
  sync_started_at   text not null,
  sync_completed_at text,
  total_source_rows integer,
  new_records       integer,
  updated_records   integer,
  unchanged_records integer,
  failed_records    integer,
  sync_status       text not null default 'previewed'
                      check (sync_status in ('previewed', 'committed', 'failed')),
  error_details     text,
  created_at        text not null
);

create table if not exists sheet_sync_staging (
  id                text primary key,
  sync_log_id       text not null references sheet_sync_logs (id) on delete cascade,
  registration_code text not null,
  source_row        integer,
  -- source_missing = dòng biến mất khỏi sheet. Ghi nhận, KHÔNG xoá record.
  diff_type         text not null
                      check (diff_type in ('new', 'updated', 'unchanged', 'source_missing', 'error')),
  changed_fields    text,   -- JSON
  normalized        text,   -- JSON
  issues            text    -- JSON
);
create index if not exists staging_log on sheet_sync_staging (sync_log_id);

-- ── settings — chỗ duy nhất giữ secret sinh tự động ─────────────────────────
create table if not exists settings (
  key        text primary key,
  value      text not null,
  updated_at text not null
);
`;
