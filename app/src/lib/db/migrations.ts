/**
 * Migration runner.
 *
 * `schema.ts` là baseline v1 cho DB mới tinh. Từ v2 trở đi, mỗi thay đổi cấu
 * trúc là một bước ở đây, đánh số và chạy đúng một lần — theo dõi bằng
 * `pragma user_version` của chính SQLite, không cần bảng riêng.
 *
 * Vì sao cần: DB sản xuất đã có điểm thật. `create table if not exists` xử lý
 * được bảng mới, nhưng KHÔNG sửa được CHECK constraint của bảng đang tồn tại —
 * mà mở thêm display_mode cho phần công bố giải thì buộc phải sửa CHECK.
 *
 * Mọi bước chạy trong transaction. Hỏng giữa chừng thì rollback, `user_version`
 * không tăng, và lần khởi động sau chạy lại từ đầu bước đó.
 */

export interface Migration {
  version: number;
  name: string;
  /** true khi bước này ghi đè cấu trúc bảng đang có dữ liệu — cần backup trước. */
  rebuildsTable?: boolean;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 2,
    name: "audience_voting_and_awards",
    // Dựng lại `live_display_state` để mở rộng CHECK display_mode.
    rebuildsTable: true,
    sql: String.raw`
-- ── voting_sessions ─────────────────────────────────────────────────────────
create table if not exists voting_sessions (
  id         text primary key,
  location   text not null check (location in ('SGN', 'HAN')),
  status     text not null default 'draft'
               check (status in ('draft', 'open', 'closed', 'verified')),
  -- Giờ đóng do SERVER quyết. Client không bao giờ được tin về việc còn hạn
  -- hay hết hạn; mọi ballot đều đối chiếu lại với cột này.
  opens_at         text,
  closes_at        text,
  duration_seconds integer not null default 180,
  max_selections   integer not null default 2 check (max_selections between 1 and 5),
  created_by text references users (id) on delete set null,
  created_at text not null,
  updated_at text not null
);
create index if not exists voting_sessions_location on voting_sessions (location, status);

-- Mỗi đầu cầu tối đa MỘT phiên đang mở
create unique index if not exists voting_sessions_open_uniq
  on voting_sessions (location) where status = 'open';

-- ── Tiết mục nằm trong phiếu ────────────────────────────────────────────────
create table if not exists voting_session_performances (
  id                text primary key,
  voting_session_id text not null references voting_sessions (id) on delete cascade,
  performance_id    text not null references performances (id) on delete cascade,
  sort_order        integer,
  unique (voting_session_id, performance_id)
);

-- ── audience_voters ─────────────────────────────────────────────────────────
-- "voter_key" là hash của một token ngẫu nhiên đặt trong cookie thiết bị.
-- KHÔNG lưu IP, không lưu user agent, không lưu gì truy ngược được về người
-- bình chọn: giải khán giả không cần biết ai bầu cho ai.
create table if not exists audience_voters (
  id                text primary key,
  voting_session_id text not null references voting_sessions (id) on delete cascade,
  voter_key         text not null,
  created_at        text not null,
  unique (voting_session_id, voter_key)
);

-- ── audience_ballots ────────────────────────────────────────────────────────
create table if not exists audience_ballots (
  id                text primary key,
  voting_session_id text not null references voting_sessions (id) on delete cascade,
  voter_id          text not null references audience_voters (id) on delete cascade,
  submitted_at      text not null,
  idempotency_key   text unique,
  -- Ballot là bất biến sau khi gửi. Không có cột nào để sửa, và không có API
  -- nào update bảng này.
  unique (voting_session_id, voter_id)
);
create index if not exists ballots_session on audience_ballots (voting_session_id);

-- ── audience_votes ──────────────────────────────────────────────────────────
create table if not exists audience_votes (
  id             text primary key,
  ballot_id      text not null references audience_ballots (id) on delete cascade,
  performance_id text not null references performances (id) on delete restrict,
  unique (ballot_id, performance_id)
);
create index if not exists votes_performance on audience_votes (performance_id);

-- ── result_snapshots — KẾT QUẢ ĐƯỢC KHÓA ────────────────────────────────────
-- Winner KHÔNG BAO GIỜ được tính lại lúc reveal. Admin chốt một snapshot,
-- snapshot ghi lại con số tại đúng thời điểm đó, và mọi màn công bố về sau đọc
-- từ đây. Nhờ vậy phiếu về muộn hay lỗi mạng không thể đổi người thắng giữa
-- lúc đang trình chiếu.
create table if not exists result_snapshots (
  id          text primary key,
  location    text not null check (location in ('SGN', 'HAN')),
  kind        text not null check (kind in ('judging', 'audience')),
  payload     text not null,          -- JSON, bất biến
  created_by  text references users (id) on delete set null,
  created_at  text not null
);
create index if not exists snapshots_location on result_snapshots (location, kind);

-- ── awards ──────────────────────────────────────────────────────────────────
create table if not exists awards (
  id          text primary key,
  location    text not null check (location in ('SGN', 'HAN')),
  code        text not null,
  name_en     text not null,
  name_vi     text not null,
  sort_order  integer not null,
  source      text not null check (source in ('judging', 'audience_vote')),
  -- Ba cột dưới trống cho tới khi Admin bấm công bố. LED đọc winner qua
  -- published_at; chưa có published_at thì không có winner để mà lộ.
  performance_id text references performances (id) on delete set null,
  snapshot_id    text references result_snapshots (id) on delete set null,
  published_at   text,
  published_by   text references users (id) on delete set null,
  created_at     text not null,
  updated_at     text not null,
  unique (location, code)
);
create index if not exists awards_location on awards (location, sort_order);

-- ── Mở rộng display_mode cho chế độ bình chọn và công bố giải ───────────────
--
-- SQLite không ALTER được CHECK constraint, nên phải dựng lại bảng. Dữ liệu
-- được copy nguyên vẹn; chạy trong transaction nên không có trạng thái nửa vời.
--
-- Danh sách vẫn là allow-list: LED chỉ vào được đúng những chế độ liệt kê ở
-- đây. Thêm chế độ mới vẫn phải là một migration có chủ ý.
create table live_display_state_v2 (
  id                     text primary key,
  location               text not null unique check (location in ('SGN', 'HAN')),
  current_performance_id text references performances (id) on delete set null,
  next_performance_id    text references performances (id) on delete set null,
  display_mode text not null default 'standby' check (display_mode in (
    -- vận hành
    'standby', 'interlude', 'performance', 'judging_progress',
    'performance_waiting', 'performance_completed',
    'all_performances_status', 'all_scores_completed', 'emergency_hide',
    -- bình chọn khán giả
    'audience_vote_intro', 'audience_vote_live', 'audience_vote_closed',
    'audience_vote_verification',
    -- công bố giải
    'awards_intro', 'audience_award_shuffle', 'award_reveal',
    'scorecard', 'awards_summary'
  )),
  public_message text,
  -- Giải đang được trình chiếu. LED chỉ đọc winner qua cột này, và chỉ khi
  -- giải đó đã published — xem lib/server/views.ts.
  current_award_id text references awards (id) on delete set null,
  updated_by     text references users (id) on delete set null,
  updated_at     text not null
);

insert into live_display_state_v2
  (id, location, current_performance_id, next_performance_id, display_mode,
   public_message, updated_by, updated_at)
select id, location, current_performance_id, next_performance_id, display_mode,
       public_message, updated_by, updated_at
from live_display_state;

drop table live_display_state;
alter table live_display_state_v2 rename to live_display_state;
`,
  },
];

export const LATEST_VERSION = MIGRATIONS.reduce(
  (max, m) => Math.max(max, m.version),
  1,
);
