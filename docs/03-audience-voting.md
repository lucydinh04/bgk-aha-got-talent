# 03 — Bình chọn khán giả & cơ cấu giải thưởng

> Bổ sung cho [02-led-awards.md](02-led-awards.md). Module bình chọn realtime tại sự
> kiện, phục vụ giải **THE CROWD MAGNET**, cùng cơ cấu giải chính thức theo từng đầu cầu.

---

## 1. Cơ cấu giải chính thức

Giải **không** hard-code. Bảng `awards` là nguồn duy nhất, Super Admin cấu hình theo
từng đầu cầu. Dưới đây là seed ban đầu.

### SGN · 07/08/2026 — 4 giải

| # | Code | Tên EN | Tên VI | Nguồn kết quả |
| --: | --- | --- | --- | --- |
| 1 | `creative_pulse` | THE CREATIVE PULSE | Giải Ba | `judging` |
| 2 | `spotlight_act` | THE SPOTLIGHT ACT | Giải Nhì | `judging` |
| 3 | `crowd_magnet` | THE CROWD MAGNET | Giải Khán giả yêu thích | `audience_vote` |
| 4 | `breakthrough_act` | THE BREAKTHROUGH ACT | Giải Nhất | `judging` |

### HAN · 14/08/2026 — 2 giải

| # | Code | Tên EN | Tên VI | Nguồn kết quả |
| --: | --- | --- | --- | --- |
| 1 | `spotlight_act` | THE SPOTLIGHT ACT | Giải Nhì | `judging` |
| 2 | `breakthrough_act` | THE BREAKTHROUGH ACT | Giải Nhất | `judging` |

**HAN không có Creative Pulse và không có Crowd Magnet.** Hai giải này chỉ xuất hiện
khi Super Admin bật `is_enabled` trong cấu hình HAN trước ngày diễn. Seed migration
**không** tạo sẵn chúng ở trạng thái tắt — tạo sẵn là mở đường cho việc bật nhầm.

### Giải chung sau hai sự kiện

| Code | Tên EN | Tên VI | Nguồn |
| --- | --- | --- | --- |
| `ai_favorite_act` | THE AI FAVORITE ACT | Giải Tiết mục được AI yêu thích nhất | `ai_result` |

---

## 2. THE AI FAVORITE ACT và bất biến BB-1

`BB-1` nói **SGN và HAN không bao giờ trộn**. Giải này xét cả hai đầu cầu, nên phải nói
rõ ranh giới thay vì im lặng vượt qua nó:

> **BB-1 áp dụng cho dữ liệu chấm điểm và xếp hạng, không áp dụng cho một hạng mục
> giải độc lập có nguồn kết quả riêng.**

Cụ thể, giải này được phép tồn tại vì nó **không hề động tới điểm**:

- `awards.location = NULL`, `award_scope = 'global'`.
- `result_source = 'ai_result'` — người thắng do Admin nhập, **không** tính từ `scores`.
- **Không có** truy vấn nào gộp `performance_results` hay `snapshot_entries` của hai
  đầu cầu. Không tồn tại bảng xếp hạng chung.
- Chỉ công bố được khi **cả hai** `programme_state = 'awards_completed'` —
  cưỡng chế trong `publish_award()`.
- Công bố lên LED nào là lựa chọn tường minh của Admin, mặc định không lên LED nào.

Nói cách khác: hệ thống vẫn không biết cách so điểm SGN với điểm HAN, và sẽ không học
cách đó. Giải này là một nhãn do BTC gán, có audit log, không phải một phép tính.

> **Còn thiếu:** tiêu chí AI và nguồn dữ liệu cụ thể. Cho tới khi BTC chốt,
> `ai_favorite_act` để `is_enabled = false` và có ô ghi `result_basis` bắt buộc nhập
> khi công bố, để lý do gán giải được lưu lại.

---

## 3. Trang bình chọn

```
/vote            → chọn đầu cầu, hoặc redirect nếu chỉ một phiên đang mở
/vote/sgn        → phiên bình chọn SGN
/vote/han        → chỉ hoạt động nếu BTC bật Crowd Magnet cho HAN
```

QR động trên LED trỏ tới `/vote/[loc]?s=<session_token>`. Token gắn với phiên nên QR
của phiên cũ không dùng lại được.

Yêu cầu: không đăng nhập phức tạp · mobile-first · tải nhanh · mở được từ QR ·
**không cho xem kết quả hiện tại** · không sửa phiếu sau khi gửi · chịu được toàn bộ
khán giả truy cập cùng lúc.

### 3.1 Ba phương thức nhận diện

Admin chọn **trước** khi mở phiên; đổi phương thức bắt buộc reset phiên.

| | Phương án | Cách hoạt động | Khi nào dùng |
| --- | --- | --- | --- |
| **A** | Mã tham dự | BTC phát mã/QR riêng, mỗi mã một ballot | Cần kiểm soát chặt số người tham dự — **ưu tiên** |
| **B** | Email công ty | Nhập `@ahamove.com` → OTP ngắn hạn, mỗi email một ballot | Cân bằng giữa kiểm soát và tốc độ |
| **C** | Phiên thiết bị | Secure httpOnly session cookie + browser token ký server | Ưu tiên thao tác nhanh, chấp nhận kiểm soát thấp hơn |

Phương án C **không** dựa vào `localStorage` — người dùng xóa dữ liệu trình duyệt là
bình chọn lại được. Token phải là cookie `httpOnly` `SameSite=Lax` do server ký, cộng
`ip_hash` + `user_agent_hash` để phát hiện bất thường. Vẫn là mức kiểm soát thấp nhất
và Admin cần biết điều đó khi chọn.

### 3.2 Luật phiếu

- Tối đa **2 phiếu** một khán giả.
- Hai phiếu phải cho **hai tiết mục khác nhau** — `unique (ballot_id, performance_id)`.
- Dùng 1 phiếu cũng hợp lệ.
- Một người **một ballot** — `unique (voting_session_id, voter_id)`.

Cả ba luật cưỡng chế ở tầng DB, không phải tầng UI.

---

## 4. Đồng hồ: chỉ có một, và nó ở server

Countdown trên client **không bao giờ** là căn cứ. Kiến trúc:

```
Admin bấm MỞ BÌNH CHỌN
   └─ server đặt started_at = now(), ends_at = now() + duration_seconds
      ends_at là con số duy nhất có thẩm quyền

Client (/vote và LED)
   ├─ nhận { ends_at, server_now } trong payload
   ├─ tính offset = server_now − Date.now() (một lần, khi nhận)
   └─ render countdown = ends_at − (Date.now() + offset)
      → lệch đồng hồ máy khán giả không ảnh hưởng hạn nộp

Gửi ballot
   └─ server so server_received_at với ends_at
      ├─ ≤ ends_at → nhận (kể cả khi client hiện 00:00 do lệch giờ)
      └─ > ends_at → từ chối, mã lỗi voting_closed
```

Request bay trên đường lúc hết giờ được xử lý theo `server_received_at`, đúng theo §7
của brief. Không có "ân hạn" phía client.

**Thời lượng:** mặc định **3 phút**; chọn được 2 / 3 / 5 phút hoặc tùy chỉnh. Sau khi
phiên đã mở thì **không đổi được thời lượng** — muốn đổi phải dừng và reset phiên.
Gia hạn là thao tác riêng (§8.2), chỉ làm được khi phiên chưa đóng.

---

## 5. Điều LED được biết và không được biết

Đây là phần dễ rò rỉ nhất của cả hệ thống. Nguyên tắc `stage_payload` từ
[BB-2](02-led-awards.md#1-bất-biến-bb-2-phát-biểu-lại) giải quyết nó một cách cấu trúc.

| Giai đoạn | `stage_payload` chứa | **Không** chứa |
| --- | --- | --- |
| `audience_vote_qr` | QR url, link rút gọn, hướng dẫn | — |
| `audience_vote_live` | `ends_at`, `server_now`, `participant_count` | vote count từng tiết mục |
| `audience_vote_closed` | thông báo đã kết thúc | mọi kết quả |
| `audience_vote_verification` | thông báo đang xác nhận | mọi kết quả |
| `audience_award_shuffle` | **danh sách tiết mục đủ điều kiện** | **`winner_performance_id`** |
| `audience_award_reveal` | winner + tên đội | vote count |
| `audience_award_result` | Voting Result Card (nếu Admin bật) | danh tính người bình chọn |

**Điểm mấu chốt — hiệu ứng xáo trộn.** Trong suốt `audience_award_shuffle`, payload
chứa danh sách tiết mục nhưng **không chứa người thắng**. Frontend LED không có gì để
lộ, kể cả khi ai đó mở DevTools giữa lúc shuffle đang chạy. Người thắng chỉ được ghi
vào payload khi Admin gọi `reveal_audience_award()`.

Hệ quả: **shuffle là hiệu ứng thị giác thuần túy, và frontend không chọn người thắng.**
Kết quả đã khóa trong Voting Result Snapshot từ trước. Không có `Math.random()` nào ở
frontend quyết định bất cứ điều gì.

### 5.1 Participant count ≠ vote count

LED hiển thị **186 KHÁN GIẢ ĐÃ THAM GIA** — đây là số **ballot hợp lệ**, không phải
tổng phiếu. Một người chọn 2 tiết mục vẫn là 1 khán giả.

```sql
total_participants = count(*) from audience_ballots
                     where validation_status = 'valid'
total_valid_votes  = count(*) from audience_votes ...   -- KHÁC, chỉ Admin thấy
```

Hai con số được tính từ hai bảng khác nhau để không thể nhầm lẫn khi đọc code.

### 5.2 Realtime không làm ngập LED

Trigger trên `audience_ballots` cập nhật `voting_public_state`, nhưng **debounce 250ms**:
nếu bản ghi vừa được cập nhật dưới 250ms trước thì bỏ qua. 400 người gửi dồn trong 10
giây cuối cho ra tối đa 40 sự kiện thay vì 400. LED subscribe đúng một dòng.

---

## 6. Vòng đời phiên bình chọn

```
draft ──► scheduled ──► open ──► paused ──► open
                          │        │
                          └────────┴──► closed        (hết giờ, hoặc Admin đóng sớm)
                                          │
                                     verifying        (loại ballot không hợp lệ)
                                          │
                                     ready            (Admin đã xác nhận kết quả)
                                          │
                                     published        (đã reveal trên LED)

  cancelled ◄── từ draft/scheduled/open/paused, Admin + lý do
```

Tương ứng `display_mode` của LED:
`audience_vote_intro` → `audience_vote_qr` → `audience_vote_live` →
`audience_vote_closed` → `audience_vote_verification` → `audience_vote_ready` →
`audience_award_shuffle` → `audience_award_reveal` → `audience_award_result` →
`audience_award_celebration`.

**Hết giờ không tự công bố.** `closed` → `verifying` là tự động; `verifying` → `ready`
bắt buộc Admin xác nhận; `ready` → `published` bắt buộc xác nhận hai bước.

---

## 7. Xác minh kết quả

Khi phiên đóng, `verify_voting_session()` chạy tuần tự:

| Bước | Kiểm | Xử lý ballot không đạt |
| --- | --- | --- |
| 1 | Ballot trùng (cùng voter, cùng phiên) | `rejected` · `duplicate_ballot` |
| 2 | Số phiếu vượt `max_votes_per_ballot` | `rejected` · `vote_limit_exceeded` |
| 3 | Hai phiếu cùng một tiết mục | chặn từ DB, không thể tồn tại |
| 4 | Token / mã tham dự không hợp lệ hoặc đã dùng | `rejected` · `invalid_credential` |
| 5 | `server_received_at > ends_at` | `rejected` · `after_deadline` |
| 6 | Hành vi bất thường (burst cùng `ip_hash`, UA giống hệt) | `flagged` · chờ Admin quyết |
| 7 | Tính tổng ballot hợp lệ, tổng phiếu, vote từng tiết mục | — |

Ballot bị loại **không xóa** — giữ nguyên kèm `rejection_reason` để truy vết.

Admin Dashboard hiển thị: tổng khán giả tham gia · tổng phiếu đã dùng · ballot hợp lệ ·
ballot bị loại · số người dùng 1 phiếu · số người dùng đủ 2 phiếu · kết quả từng tiết
mục · cảnh báo bất thường · tiết mục dự kiến thắng. **Toàn bộ chỉ Admin thấy.**

### 7.1 Đồng phiếu

Hai tiết mục cùng số vote cao nhất → **không tự chọn người thắng**.
Banner **CÓ TIẾT MỤC ĐỒNG PHIẾU**, và bốn phương án:

1. Mở vòng vote phụ (phiên mới, chỉ gồm các tiết mục đồng hạng)
2. Cho mỗi khán giả thêm 1 phiếu giữa các tiết mục đồng hạng
3. BTC quyết định thủ công
4. Dùng **số ballot riêng biệt** làm tiêu chí phụ nếu quy chế cho phép

Không tạo được Voting Result Snapshot khi còn đồng phiếu chưa xử lý. Mọi quyết định
thủ công bắt buộc nhập lý do và vào audit log.

---

## 8. Admin Voting Control Panel

```
/admin/sgn/voting
/admin/han/voting     ← chỉ mở khi BTC bật Crowd Magnet cho HAN
```

### 8.1 Cấu hình (trước khi mở)
Đầu cầu · giải áp dụng · danh sách tiết mục đủ điều kiện · thời lượng · phương thức
xác thực · số phiếu tối đa · preview QR · nội dung hiển thị trên LED.

### 8.2 Điều khiển trực tiếp
Mở · Tạm dừng · Tiếp tục · Đóng sớm · **Gia hạn** · Emergency Close.

Gia hạn: bắt buộc xác nhận · ghi audit log · cập nhật countdown realtime cho cả
`/vote` và LED · **chỉ làm được khi phiên chưa đóng**. Gia hạn ghi đè `ends_at`, và
mọi client tính lại từ giá trị mới — không có countdown nào chạy độc lập.

### 8.3 Theo dõi realtime
Countdown · số người đang mở trang · ballot đã gửi · tổng phiếu · tỷ lệ tham gia ·
lỗi gửi ballot · trạng thái server · trạng thái LED.

> **Màn hình theo dõi chính KHÔNG hiển thị bảng xếp hạng vote.** Người vận hành thường
> chiếu màn Admin lên máy chiếu phụ hoặc share màn hình; một bảng vote realtime nằm sẵn
> ở đó là rủi ro lộ kết quả do thao tác, không phải do lỗi kỹ thuật.
> Kết quả chi tiết nằm ở tab riêng **KẾT QUẢ NỘI BỘ**, phải chủ động mở.

---

## 9. Database

```sql
create type voting_status as enum (
  'draft','scheduled','open','paused','closed',
  'verifying','ready','published','cancelled'
);
create type auth_method   as enum ('attendance_code','company_email','device_session');
create type ballot_status as enum ('pending','valid','rejected','flagged');
create type award_source  as enum ('judging','audience_vote','ai_result','manual');
create type award_scope   as enum ('location','global');

-- ── awards: nguồn duy nhất của cơ cấu giải, KHÔNG hard-code ───────────────
create table awards (
  id uuid primary key default gen_random_uuid(),
  location location_code,                    -- NULL = giải chung (AI Favorite)
  award_scope award_scope not null default 'location',
  code text not null,                        -- breakthrough_act | spotlight_act | …
  display_name_en text not null,
  display_name_vi text not null,
  description text,
  result_source award_source not null,
  announcement_order int not null,
  is_enabled boolean not null default false,

  -- kết quả
  performance_id uuid references performances(id),
  judging_snapshot_id uuid references publishing_snapshots(id),
  voting_snapshot_id  uuid references voting_result_snapshots(id),
  result_basis text,                         -- bắt buộc khi result_source='ai_result'
  reveal_mode char(1) not null default 'B' check (reveal_mode in ('A','B')),
  show_result_figures boolean not null default false,

  published_at timestamptz, published_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint award_scope_matches_location check (
    (award_scope = 'location' and location is not null) or
    (award_scope = 'global'   and location is null)
  ),
  -- giải khán giả phải gắn voting snapshot, giải BGK phải gắn judging snapshot
  constraint source_needs_matching_snapshot check (
    published_at is null
    or (result_source = 'judging'       and judging_snapshot_id is not null)
    or (result_source = 'audience_vote' and voting_snapshot_id  is not null)
    or (result_source in ('ai_result','manual') and result_basis is not null)
  )
);
create unique index awards_code_uniq
  on awards (coalesce(location::text,'GLOBAL'), code);
create unique index awards_order_uniq
  on awards (coalesce(location::text,'GLOBAL'), announcement_order) where is_enabled;

-- ── voting_sessions ───────────────────────────────────────────────────────
create table voting_sessions (
  id uuid primary key default gen_random_uuid(),
  location location_code not null,
  award_id uuid not null references awards(id),
  title text not null,
  status voting_status not null default 'draft',
  authentication_method auth_method not null,
  max_votes_per_ballot int not null default 2 check (max_votes_per_ballot between 1 and 5),
  duration_seconds int not null default 180 check (duration_seconds between 30 and 3600),
  session_token text not null unique,        -- gắn vào QR, phiên cũ không tái dùng
  scheduled_start_at timestamptz,
  started_at timestamptz,
  ends_at    timestamptz,                    -- ĐỒNG HỒ DUY NHẤT có thẩm quyền
  paused_at  timestamptz,
  paused_accumulated_seconds int not null default 0,
  ended_at   timestamptz,
  extended_count int not null default 0,
  created_by uuid not null references users(id),
  closed_by  uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- mỗi đầu cầu tối đa MỘT phiên đang chạy
create unique index one_live_session_per_location
  on voting_sessions (location) where status in ('open','paused');

create table voting_session_performances (
  id uuid primary key default gen_random_uuid(),
  voting_session_id uuid not null references voting_sessions(id) on delete cascade,
  performance_id uuid not null references performances(id),
  display_order int,
  is_eligible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (voting_session_id, performance_id)
);

-- ── audience_voters: KHÔNG lưu email/mã dạng plain text ───────────────────
create table audience_voters (
  id uuid primary key default gen_random_uuid(),
  voting_session_id uuid not null references voting_sessions(id) on delete cascade,
  voter_identifier_hash text not null,       -- sha256(email|device_token + session salt)
  attendance_code_hash  text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (voting_session_id, voter_identifier_hash)
);

create table audience_ballots (
  id uuid primary key default gen_random_uuid(),
  voting_session_id uuid not null references voting_sessions(id) on delete cascade,
  voter_id uuid not null references audience_voters(id) on delete cascade,
  ballot_token uuid not null unique,         -- idempotency key
  status ballot_status not null default 'pending',
  submitted_at timestamptz,                  -- client báo, chỉ để tham khảo
  server_received_at timestamptz not null default now(),  -- CĂN CỨ hạn nộp
  ip_hash text, user_agent_hash text,
  validation_status ballot_status not null default 'pending',
  rejection_reason text,
  created_at timestamptz not null default now(),
  unique (voting_session_id, voter_id)       -- một người một ballot
);
create index on audience_ballots (voting_session_id, validation_status);

create table audience_votes (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references audience_ballots(id) on delete cascade,
  performance_id uuid not null references performances(id),
  created_at timestamptz not null default now(),
  unique (ballot_id, performance_id)         -- 2 phiếu phải KHÁC tiết mục
);

-- Số phiếu trên một ballot không vượt max_votes_per_ballot
create or replace function enforce_vote_limit() returns trigger as $$
declare n int; lim int;
begin
  select vs.max_votes_per_ballot into lim
    from audience_ballots b join voting_sessions vs on vs.id = b.voting_session_id
   where b.id = new.ballot_id;
  select count(*) into n from audience_votes where ballot_id = new.ballot_id;
  if n > lim then
    raise exception 'Ballot % vượt giới hạn % phiếu', new.ballot_id, lim;
  end if;
  return new;
end $$ language plpgsql;
create constraint trigger trg_vote_limit after insert on audience_votes
  deferrable initially deferred for each row execute function enforce_vote_limit();

-- ── voting_result_snapshots: immutable, LED chỉ đọc từ đây ────────────────
create table voting_result_snapshots (
  id uuid primary key default gen_random_uuid(),
  voting_session_id uuid not null references voting_sessions(id),
  location location_code not null,
  total_participants  int not null,          -- = ballot hợp lệ, KHÔNG phải tổng phiếu
  total_valid_ballots int not null,
  total_valid_votes   int not null,
  rejected_ballots    int not null default 0,
  winner_performance_id uuid references performances(id),
  is_tied boolean not null default false,
  tie_resolution text,
  result_data jsonb not null,                -- vote từng tiết mục + lý do loại
  confirmed_by uuid not null references users(id),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (voting_session_id)
);

-- ── voting_public_state: bảng THỨ BA mà anon đọc được ─────────────────────
create table voting_public_state (
  location location_code primary key,
  session_id uuid references voting_sessions(id),
  status voting_status not null default 'draft',
  ends_at timestamptz,
  participant_count int not null default 0,  -- ballot hợp lệ, KHÔNG có vote count
  vote_url text,
  updated_at timestamptz not null default now()
);
```

### 9.1 RLS — `anon` giờ đọc được ba bảng

```sql
grant select on public_progress, live_display_state, voting_public_state to anon;
revoke all on voting_sessions, voting_session_performances, audience_voters,
              audience_ballots, audience_votes, voting_result_snapshots, awards
       from anon;
```

`voting_public_state` **không có cột nào chứa vote count từng tiết mục** — cùng nguyên
tắc thiết kế với `public_progress`: thứ không tồn tại trong bảng thì không lộ được.

Trang `/vote` gửi ballot qua **RPC `security definer`**, không `INSERT` trực tiếp — nên
`anon` không cần quyền ghi trên `audience_ballots` / `audience_votes`.

---

## 10. RPC

```sql
create_voting_session(p_location, p_award_id, p_config)      -- admin
open_voting_session(p_session_id, p_confirm_text)            -- đặt started_at, ends_at
pause_voting_session / resume_voting_session(p_session_id)
extend_voting_session(p_session_id, p_extra_seconds, p_reason)
close_voting_session(p_session_id, p_reason)                 -- đóng sớm
verify_voting_session(p_session_id)              → jsonb     -- 7 bước §7
resolve_vote_tie(p_session_id, p_method, p_winner_id, p_reason)
create_voting_snapshot(p_session_id, p_confirm_text)         -- đóng băng
start_audience_shuffle(p_location)               -- payload KHÔNG có winner
reveal_audience_award(p_award_id, p_confirm_text)-- winner vào payload TẠI ĐÂY
show_voting_figures(p_award_id, p_confirm_text)  -- Voting Result Card

submit_ballot(p_session_token, p_credential, p_performance_ids[], p_ballot_token)
```

### `submit_ballot` — đường duy nhất khán giả ghi dữ liệu

Chạy trong **một transaction**, thứ tự kiểm:

1. Phiên tồn tại, `status = 'open'` → không thì `voting_closed`.
2. `now() <= ends_at` theo **server time** → không thì `after_deadline`.
3. Rate limit theo `session_token` + `ip_hash` → vượt thì `rate_limited`.
4. Xác thực `p_credential` theo `authentication_method`; mã tham dự **dùng một lần**.
5. `upsert audience_voters` theo `voter_identifier_hash`.
6. `insert audience_ballots ... on conflict (ballot_token) do nothing`
   → **idempotent**: bấm nhiều lần / retry mạng vẫn ra đúng một ballot.
7. Nếu đã có ballot của voter này → trả `already_voted`, **không** ghi đè.
8. `p_performance_ids` phải: 1–`max_votes_per_ballot` phần tử · không trùng ·
   thuộc `voting_session_performances` với `is_eligible = true`.
9. Insert `audience_votes`; trigger kiểm giới hạn.
10. Trả về **duy nhất** `{ ok: true, votes_cast: n }` — **không** trả vote count,
    không trả thứ hạng, không trả bất cứ thứ gì suy ra được kết quả.

Bước 10 quan trọng: nếu API trả về bất kỳ con số tổng hợp nào, một người bình chọn có
thể poll nó và suy ra tiết mục dẫn đầu.

---

## 11. Chống gian lận và chịu tải

| Rủi ro | Biện pháp |
| --- | --- |
| Bình chọn lại sau khi xóa trình duyệt | Phương án A hoặc B; C là mức thấp nhất và Admin biết điều đó |
| Bấm nhiều lần / retry mạng | `ballot_token` idempotency + `unique (session, voter)` |
| Ballot sau deadline | `server_received_at` vs `ends_at`, không tin client |
| Spam từ một máy | Rate limit theo `ip_hash` + `session_token`, Upstash Redis |
| Dò kết quả qua API | Không endpoint nào trả vote count; `submit_ballot` trả tối thiểu |
| Lộ danh tính người bình chọn | Chỉ lưu hash, không lưu email/mã plain text |
| Sửa kết quả sau khi chốt | Voting Result Snapshot immutable + audit log |
| Tải dồn 3 phút | Xem dưới |

**Tải.** Kịch bản xấu nhất: toàn bộ khán giả gửi trong 20 giây cuối. Ba biện pháp:

1. `/vote/[loc]` là **static shell + một fetch** lấy danh sách tiết mục; danh sách này
   cache được vì nó cố định suốt phiên.
2. `submit_ballot` là một transaction ngắn, ba insert, không join nặng. Index sẵn trên
   `(voting_session_id, validation_status)`.
3. `voting_public_state` debounce 250ms nên realtime không nhân bản tải.

**Load test bắt buộc trước ngày diễn:** mô phỏng số khán giả thực tế gửi ballot trong
20 giây, đo p95 latency và tỷ lệ lỗi. Chạy trên môi trường staging cùng cấu hình
Supabase với production. Đây là điều kiện chặn go-live, không phải việc làm nếu còn thời gian.

---

## 12. Realtime events

```
voting_session_started · voting_session_paused · voting_session_resumed
voting_session_closed  · participant_count_updated · countdown_updated
ballot_submitted       · voting_verification_started
voting_result_confirmed· audience_award_shuffle_started · audience_award_revealed
```

| Kênh | LED | Admin |
| --- | :-: | :-: |
| `pg:voting_public_state` filter `location=eq.SGN` | ✅ | ✅ |
| `pg:live_display_state` filter `location=eq.SGN` | ✅ | ✅ |
| `pg:audience_ballots` filter `voting_session_id=eq.…` | ❌ | ✅ |
| `broadcast:voting_admin:SGN` (vote count, cảnh báo) | ❌ | ✅ |

`ballot_submitted` **không** đẩy tới LED. LED chỉ thấy `participant_count` đã tổng hợp.
`audience_award_revealed` là sự kiện duy nhất mang `winner_performance_id`, và nó chỉ
phát **sau khi** Admin gọi `reveal_audience_award()`.

---

## 13. Bổ sung ma trận kiểm thử

Nối tiếp 50 case ở [02-led-awards.md §12](02-led-awards.md).

| # | Kiểm | Cách |
| --- | --- | --- |
| 51 | Ballot 2 phiếu cùng một tiết mục → bị DB từ chối | SQL |
| 52 | Ballot 3 phiếu khi `max=2` → trigger từ chối | SQL |
| 53 | Một voter gửi 2 ballot → `already_voted`, không ghi đè | integration |
| 54 | Gửi 5 lần cùng `ballot_token` → đúng 1 ballot | integration |
| 55 | Ballot đến sau `ends_at` 1ms → `after_deadline` | integration, giả lập server time |
| 56 | Client đổi giờ máy sớm/muộn 10 phút → hạn nộp không đổi | e2e |
| 57 | `submit_ballot` không trả về bất kỳ số liệu tổng hợp nào | snapshot response |
| 58 | `anon` SELECT `audience_votes` / `voting_result_snapshots` → từ chối | SQL anon key |
| 59 | Payload LED lúc `audience_vote_live` không có vote count từng tiết mục | snapshot |
| 60 | **Payload LED lúc `audience_award_shuffle` không có `winner_performance_id`** | snapshot — case quan trọng nhất |
| 61 | Winner chỉ vào payload sau `reveal_audience_award()` | integration, so payload trước/sau |
| 62 | `participant_count` = số ballot, không phải tổng phiếu | integration: 3 người, 5 phiếu → count = 3 |
| 63 | Debounce 250ms: 100 ballot dồn → ≤ 10 sự kiện realtime | integration |
| 64 | Hết giờ không tự chuyển sang công bố | e2e |
| 65 | Đồng phiếu → không tạo được snapshot, hiện cảnh báo | integration |
| 66 | Gia hạn cập nhật `ends_at`, mọi client tính lại | e2e 2 client |
| 67 | Gia hạn sau khi phiên đóng → từ chối | unit RPC |
| 68 | Đổi thời lượng khi phiên đang mở → từ chối | unit RPC |
| 69 | Mã tham dự dùng lần 2 → `invalid_credential` | integration |
| 70 | HAN không có `crowd_magnet` / `creative_pulse` trừ khi Super Admin bật | SQL seed |
| 71 | Thứ tự công bố SGN: Ba → Nhì → Crowd Magnet → Nhất | unit |
| 72 | `ai_favorite_act` bị chặn khi một đầu cầu chưa `awards_completed` | unit RPC |
| 73 | Không tồn tại truy vấn nào gộp điểm SGN với HAN | grep + review `lib/scoring` |
| 74 | Crowd Magnet không hiển thị bảng điểm BGK | unit RPC |
| 75 | Voting Result Snapshot immutable sau khi confirm | integration |
| 76 | Emergency Hide từ cả 10 `display_mode` mới | unit |
| 77 | Load test: khán giả dự kiến gửi trong 20s, p95 < 1s, lỗi < 0.5% | k6 trên staging |

Case **60** là hàng rào quan trọng nhất của module này: nếu winner lọt xuống LED sớm,
toàn bộ hiệu ứng xáo trộn trở thành trò giả vờ và kết quả có thể bị đọc trước.
