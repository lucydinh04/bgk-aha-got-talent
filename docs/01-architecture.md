# 01 — Product & System Architecture

**AHA GOT TALENT 2026 · Hệ thống chấm điểm trực tuyến**
Sinh nhật Ahamove 11 tuổi — *Unlock Your Next Move*

| | SGN | HAN |
| --- | --- | --- |
| Ngày diễn | **07/08/2026** | **14/08/2026** |
| Tiết mục (31/07) | 4 | 4 |
| LED | `/live/sgn` | `/live/han` |

---

## 1. Năm bất biến của hệ thống

Mọi quyết định kỹ thuật phía sau đều phục vụ năm điều này. Nếu một thay đổi trong
tương lai phá vỡ một trong năm, thay đổi đó sai.

**BB-1 — SGN và HAN không bao giờ trộn.**
`location` là cột bắt buộc trên mọi bảng nghiệp vụ, có mặt trong URL, và được chặn ở
tầng RLS của Postgres — không chỉ ở tầng UI. Bảng xếp hạng, tiến độ, LED state đều
tách đôi. Không tồn tại một truy vấn nào trả về cả hai đầu cầu cạnh nhau ngoài
`/admin/dashboard`, và ở đó chúng là hai khối riêng biệt.

> **Phạm vi:** BB-1 áp dụng cho **dữ liệu chấm điểm và xếp hạng**. Giải chung
> THE AI FAVORITE ACT (`award_scope = 'global'`) là hạng mục độc lập có nguồn kết quả
> riêng, không tính từ `scores` — lập luận đầy đủ ở
> [03-audience-voting.md §2](03-audience-voting.md).

**BB-2 — LED chỉ hiển thị được đúng những gì Admin đã chủ động đẩy lên màn hình.**
Đây là quyết định *cấu trúc*, không phải quyết định UI. Vai trò `anon` chỉ được
`SELECT` trên đúng hai bảng: `public_progress` (không tồn tại cột điểm nào) và
`live_display_state` (một dòng mỗi đầu cầu, chứa `stage_payload` — nội dung đang
hiển thị ngay lúc này, đã redact). Bảng `scores`, `performance_results`,
`publishing_snapshots` đều ngoài tầm với của LED, kể cả khi ai đó mở DevTools.

> Chi tiết đầy đủ về hai chế độ LED, Publishing Snapshot và luồng công bố giải:
> **[02-led-awards.md](02-led-awards.md)** — file đó thay thế §18–19 dưới đây.

**BB-3 — Judge chỉ thấy dữ liệu của chính mình.**
RLS trên `scores` là `judge_id = auth.uid()`. Không có endpoint nào trả về điểm BGK
khác, điểm trung bình, hay thứ hạng cho session của Judge. Bảng `performance_results`
từ chối vai trò Judge.

**BB-4 — Không mất điểm khi mất mạng.**
Điểm sống ở IndexedDB trước, Postgres sau. Mỗi lần gửi mang một `idempotency_key`
duy nhất, và unique constraint `(judge_id, performance_id)` bảo đảm một BGK chỉ có
một bộ điểm cho một tiết mục — gửi lại bao nhiêu lần cũng không sinh bản ghi thứ hai.

**BB-5 — Google Sheet là nguồn đăng ký, không phải database chấm điểm.**
Sync một chiều: Sheet → Postgres. Không bao giờ ngược lại. Sync không bao giờ ghi
đè các field do BTC sở hữu, và không bao giờ chạm vào `scores`.

---

## 2. Sitemap

Ký hiệu: 🔓 public · 🎫 magic-link (Judge) · 🔐 password + MFA (Admin) · 📺 LED

```
/                                        🔓  Trang điều hướng — 3 lối vào
│
├── judge/                               🎫  BAN GIÁM KHẢO
│   ├── /                                    Đăng nhập chung → tự nhận đầu cầu từ email
│   ├── sgn/                                 Đăng nhập SGN
│   │   ├── dashboard                        Danh sách tiết mục được phân công
│   │   ├── performance/[registration_code]  Trang chấm điểm
│   │   └── result/[registration_code]       Xem lại điểm của mình
│   └── han/  … (cấu trúc y hệt SGN)
│
├── admin/                               🔐  BAN TỔ CHỨC
│   ├── login
│   ├── dashboard                            Tổng quan 2 đầu cầu — 2 card, không gộp
│   ├── sgn/
│   │   ├── /                                Dashboard SGN
│   │   ├── progress                         Tiến độ BGK × tiết mục
│   │   ├── progress/judge/[id]              Chi tiết tiến độ một BGK
│   │   ├── progress/performance/[code]      Chi tiết tiến độ một tiết mục
│   │   ├── results                          Bảng xếp hạng SGN
│   │   ├── rundown                          Thứ tự biểu diễn (kéo thả)
│   │   ├── live-control                     Live Control Panel
│   │   └── live-preview                     Preview LED 16:9
│   ├── han/  … (cấu trúc y hệt SGN)
│   ├── judges                               Quản lý BGK + phân công
│   ├── judges/[id]
│   ├── performances                         Duyệt tiết mục
│   ├── performances/[registration_code]
│   ├── sync                                 Đồng bộ Google Sheet
│   ├── settings                             Cấu hình (Super Admin: trọng số, công thức)
│   └── audit                             🔐  Audit log (Super Admin)
│
├── live/                                📺  MÀN HÌNH LED
│   ├── sgn                                  Fullscreen 1920×1080, realtime
│   └── han
│
└── auth/
    ├── callback                             Nhận magic link, xác thực đầu cầu
    └── error                                Link hết hạn / đã dùng / sai đầu cầu
```

### Vì sao `[location]` nằm trong URL chứ không trong session

BGK được phân công cả hai đầu cầu (trường hợp Admin cho phép) cần chấm SGN ngày 07/08
rồi HAN ngày 14/08 mà không phải đăng xuất. `location` trong URL biến đầu cầu thành
tham số điều hướng, và mọi truy vấn phải mang nó — nên không có đường "quên" filter.
Middleware validate `location ∈ {sgn, han}`, sai thì `404`, và đối chiếu với phân công
của BGK, không thuộc thì `403` với thông báo tiếng Việt.

---

## 3. Vai trò và phân quyền

| Hành động | Judge | Admin | Super Admin | Live (anon) |
| --- | :-: | :-: | :-: | :-: |
| Xem tiết mục được phân công | ✅ | ✅ | ✅ | — |
| Xem toàn bộ tiết mục một đầu cầu | — | ✅ | ✅ | — |
| Chấm / lưu nháp / gửi điểm | ✅ | — | — | — |
| Xem điểm **của chính mình** | ✅ | ✅ | ✅ | — |
| Xem điểm **của BGK khác** | ❌ | ✅ | ✅ | ❌ |
| Xem điểm trung bình / xếp hạng | ❌ | ✅ | ✅ | ❌ |
| Xem email · SĐT · Telegram thí sinh | ❌ | ✅ | ✅ | ❌ |
| Xem `Ghi chú BTC` · nhu cầu hỗ trợ | ❌ | ✅ | ✅ | ❌ |
| Xem `private_note` của BGK khác | ❌ | ✅ | ✅ | ❌ |
| Phân công BGK · sắp rundown | — | ✅ | ✅ | — |
| Đồng bộ Google Sheet | — | ✅ | ✅ | — |
| Khóa điểm | — | ✅ | ✅ | — |
| **Mở khóa** điểm đã khóa | — | ❌ | ✅ | — |
| Điều khiển LED · công bố điểm | — | ✅ | ✅ | — |
| Sửa trọng số · công thức tính điểm | — | ❌ | ✅ | — |
| Quản lý tài khoản Admin | — | ❌ | ✅ | — |
| Xem audit log | — | ❌ | ✅ | — |
| Xem tiết mục hiện tại + tiến độ tổng hợp | — | ✅ | ✅ | ✅ |

Hai ranh giới đáng chú ý:

- **Admin khóa được nhưng không mở khóa được.** Mở khóa là hành động rủi ro nhất trong
  hệ thống — nó cho phép sửa điểm sau khi đã chốt. Đẩy lên Super Admin + bắt buộc nhập
  lý do + ghi audit log.
- **Judge không thấy `private_note` của BGK khác**, dù đó là ghi chú "dành cho BTC".
  Ghi chú riêng phải thật sự riêng.

---

## 4. User flows

### 4.1 Flow BGK: đăng nhập → chấm điểm → gửi điểm

```
 ┌─ Nhận link qua email/Telegram: /judge/sgn
 │
 ▼
[1] Trang đăng nhập
    "BAN GIÁM KHẢO / AHA GOT TALENT 2026"
    Nhập email công ty  →  [TIẾP TỤC]
 │
 │  Server action: rate-limit (5 lần/email/giờ, 20/IP/giờ)
 │  → signInWithOtp({ shouldCreateUser: false })
 │  ⚠ KHÔNG kiểm tra email có trong danh sách BGK ở bước này
 │     (sẽ tiết lộ ai là BGK cho người ngoài — §6.2)
 ▼
[2] "Kiểm tra email của bạn"
    Phản hồi GIỐNG NHAU cho mọi email → không lộ danh sách
 │
 ▼
[3] Mở email → nhấn magic link → /auth/callback
 │
 │  Server kiểm tra tuần tự:
 │    a. Token còn hạn (10 phút)?        ✗ → /auth/error?e=expired
 │    b. Token chưa dùng?                ✗ → /auth/error?e=used
 │    c. users.role = 'judge', active?   ✗ → /auth/error?e=not_judge
 │    d. Có phân công đầu cầu 'sgn'?     ✗ → /auth/error?e=wrong_location
 ▼
[4] /judge/sgn/dashboard
    "Xin chào, [Tên BGK]"
    Đầu cầu SGN · 07/08/2026 · progress bar
    Chỉ tiết mục có review_status = 'ready'
    Lọc: Tất cả · Chưa chấm · Đang chấm · Đã gửi · Đã khóa
 │
 ▼ chọn tiết mục
[5] /judge/sgn/performance/AHA26-SGN-…
    Header sticky: STT · tên tiết mục · trạng thái lưu · nút quay lại
    Thông tin tiết mục (KHÔNG có email/SĐT/Telegram/ghi chú BTC)
    5 tiêu chí — mở lần đầu: TẤT CẢ chưa chấm, không có giá trị mặc định
 │
 ├──► mỗi thay đổi ──► IndexedDB (đồng bộ, ~1ms)
 │                     └─► debounce 800ms ─► PATCH /api/scores/draft
 │                                            ├ 200 → "Đã lưu lúc 20:14"
 │                                            ├ offline → "Đang ngoại tuyến"
 │                                            └ lỗi → "Chưa đồng bộ" + retry backoff
 │
 ▼ đủ 5 tiêu chí
[6] TỔNG ĐIỂM: 84.75 / 100   (chỉ điểm của chính BGK này)
    [GỬI ĐIỂM CHÍNH THỨC]  ← sticky bottom
 │
 ▼
[7] Modal "Xác nhận gửi điểm?"
    "Điểm sẽ được ghi nhận chính thức. Bạn có thể chỉnh sửa
     nếu Ban Tổ chức chưa khóa kết quả."
 │
 ▼  RPC submit_score(…, idempotency_key)
 │  Server validate lại: 5 tiêu chí · 0–100 · chưa bị khóa · đúng phân công
 ▼
[8] "ĐÃ GHI NHẬN ĐIỂM"
    → Chấm tiết mục tiếp theo · Về danh sách · Xem lại điểm
 │
 └─► trigger DB: public_progress.judges_submitted += 1
      └─► Realtime ─┬─► Admin dashboard (số + tên BGK)
                    └─► LED (CHỈ đếm: "3/5 BGK đã hoàn tất")
```

**Điều kiện chặn gửi điểm** — kiểm ở cả client (UX) và server (thật):
đủ 5 tiêu chí · mỗi tiêu chí `0 ≤ x ≤ 100` · không bị khóa · BGK có phân công ·
`review_status = 'ready'` · nhận xét đạt cấu hình bắt buộc (nếu Admin đã bật).

---

### 4.2 Flow Admin: theo dõi tiến độ → khóa điểm → tổng hợp kết quả

```
[1] /admin/login  →  email + password (+ MFA nếu Super Admin)
 ▼
[2] /admin/dashboard — hai card, KHÔNG gộp
    ┌─ SGN · 07/08 ──────────┐  ┌─ HAN · 14/08 ──────────┐
    │ 4 tiết mục · 5 BGK     │  │ 4 tiết mục · 5 BGK     │
    │ Cần 20 lượt · Xong 13  │  │ Cần 20 · Xong 0        │
    │ Thiếu 7 · 65%          │  │ Chưa bắt đầu           │
    └────────────────────────┘  └────────────────────────┘
 ▼
[3] /admin/sgn/progress — ma trận BGK × tiết mục
    Ô: ⬜ chưa bắt đầu · 🟨 đang chấm · 🟩 đã gửi · 🟥 lỗi/thiếu · 🟪 đã khóa
    Realtime, không reload. Hàng đầu: "2 BGK chưa hoàn thành" (ưu tiên cao nhất)
 │
 ├─► click ô → chi tiết một bộ điểm: 5 tiêu chí, nhận xét, lịch sử sửa
 ├─► click hàng → /admin/sgn/progress/judge/[id]   → [NHẮC BGK] (gửi lại email)
 └─► click cột → /admin/sgn/progress/performance/[code]
                  → điểm từng BGK · điểm TB · ĐỘ LỆCH giữa các BGK
                  → [LOẠI BỘ ĐIỂM] (bắt buộc lý do) · [MỞ LẠI ĐIỂM]
 ▼ khi tiến độ = 100%
[4] Khóa điểm — chọn phạm vi:
    một bộ điểm · một tiết mục · một BGK · toàn SGN · toàn chương trình
    → ghi locked_at, locked_by, reason → Judge chuyển sang chế độ chỉ xem
    → mở khóa: CHỈ Super Admin, bắt buộc lý do, vào audit log
 ▼
[5] /admin/sgn/results — bảng xếp hạng SGN (chỉ tiết mục SGN)
    Điểm TB = Σ điểm hợp lệ / số BGK đã chấm hợp lệ
    Chỉ xếp hạng khi: đủ BGK đã chấm · không bộ điểm nào bị lỗi · tiết mục không bị hủy
    Chưa đủ → hiển thị "Chưa đủ điều kiện xếp hạng", KHÔNG xếp hạng tạm
 │
 ├─► đồng điểm → banner "CÓ TIẾT MỤC ĐỒNG ĐIỂM CẦN XỬ LÝ"
 │              tie-break: Ý tưởng → Chất lượng → Chuyển mình → Sức hút → BTC quyết
 │              vẫn bằng → KHÔNG tự chọn người thắng, chờ BTC
 │
 └─► [XUẤT CSV/XLSX] · [CÔNG BỐ LÊN LED] → xác nhận 2 bước (§4.3)
```

---

### 4.3 Flow LED: tiết mục biểu diễn → BGK chấm → LED cập nhật realtime

```
SÂN KHẤU              ADMIN /admin/sgn/live-control        LED /live/sgn
─────────────────────────────────────────────────────────────────────────
trước giờ G     ──►   (mặc định)                    ──►   ① CHỜ CHƯƠNG TRÌNH
                                                          AHA GOT TALENT 2026
                                                          Unlock Your Next Move
                                                          SGN · 07/08/2026 · countdown

MC giới thiệu   ──►   chọn tiết mục #2               ──►   ⑦ GIỮA CÁC TIẾT MỤC
                      [Tiết mục tiếp theo]                 Tiếp theo: #2 REBORN QUEENS

đang diễn       ──►   [ĐANG BIỂU DIỄN]               ──►   ② #2 REBORN QUEENS — NEW ERA
                                                          Nhảy / Múa · Business Development
                                                          (KHÔNG có điểm)

diễn xong       ──►   [BGK ĐANG CHẤM]                ──►   ③ BAN GIÁM KHẢO ĐANG CHẤM ĐIỂM
                                                          ◐ 3/5 BGK đã hoàn tất
                        ▲                                  (KHÔNG tên BGK, KHÔNG điểm)
                        │ Realtime tự tăng khi BGK gửi
                        │ trigger DB → public_progress
                      [ĐANG TỔNG HỢP]                ──►   ④ ĐANG TỔNG HỢP KẾT QUẢ
                                                          "Vui lòng chờ trong giây lát."

                      [ĐÃ GHI NHẬN]                  ──►   ⑤ KẾT QUẢ ĐÃ ĐƯỢC GHI NHẬN
                                                          "Cảm ơn Ban Giám khảo."
                                                          (KHÔNG tự hiện điểm)

BTC quyết định  ──►   [CÔNG BỐ ĐIỂM]                       ⑥ chỉ khi Admin chủ động bật
                       ├ Bước 1: chọn tiết mục,
                       │   xem preview 16:9
                       └ Bước 2: gõ tên tiết mục
                           để xác nhận  ────────────►     ⑥ REBORN QUEENS — NEW ERA
                                                          8 7 . 4 0   (reveal)
                                                          (KHÔNG điểm từng BGK)

sự cố           ──►   [ẨN TOÀN BỘ DỮ LIỆU TRÊN LED] ──►   ⑧ BLACKOUT → KV mặc định
```

**Mất kết nối realtime:** LED **giữ nguyên** trạng thái gần nhất — không bao giờ
tự nhảy trạng thái hay tự về standby. Hiện một chấm mờ ở góc safe-margin
(khán giả không đọc được), Admin thấy cảnh báo đỏ rõ ràng. Reconnect với
exponential backoff 1s → 30s, và khi nối lại thì fetch full state một lần để bắt kịp.

---

## 5. Database schema

PostgreSQL 15 / Supabase. DDL đầy đủ ở `supabase/migrations/`; dưới đây là bản rút gọn
có chú thích các quyết định.

```sql
-- ── Enums: bọc state machine vào tầng type, không phải tầng app ────────────
create type location_code   as enum ('SGN','HAN');
create type user_role       as enum ('judge','admin','super_admin');
create type user_status     as enum ('active','disabled','locked');
-- ⚠ ĐÃ THAY ĐỔI ở 02-led-awards.md §8.1: enum này trộn hai mối quan tâm
-- (duyệt trước show / trạng thái trong show) nên được tách thành
-- review_status + show_status. Giữ lại đây để đối chiếu lịch sử.
create type review_status as enum (
  'synced',        -- Mới đồng bộ, BGK chưa thấy
  'awaiting_info', -- Chờ bổ sung thông tin
  'confirmed',     -- Đã xác nhận
  'scheduled',     -- Đã xếp lịch
  'ready',         -- Sẵn sàng chấm  ← NGƯỠNG hiển thị cho BGK
  'cancelled'
);
create type show_status as enum (
  'not_started','performing','judging_in_progress','judging_completed',
  'score_verification','result_confirmed','award_published'
);
create type score_status as enum ('draft','submitted','locked','voided');
-- display_mode đầy đủ 14 giá trị: xem 02-led-awards.md §8.2
create type lock_scope      as enum ('score','performance','judge','location','global');

-- ── users ─────────────────────────────────────────────────────────────────
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         citext not null unique,
  full_name     text not null,
  role          user_role not null default 'judge',
  title         text,
  department    text,
  -- NULL = cả hai đầu cầu (Admin/Super Admin, hoặc BGK được phân công kép)
  location      location_code,
  status        user_status not null default 'active',
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on users (role, location) where status = 'active';

-- ── performances ──────────────────────────────────────────────────────────
create table performances (
  id                 uuid primary key default gen_random_uuid(),
  registration_code  text not null unique,          -- KHÓA NGHIỆP VỤ, không dùng tên
  location           location_code not null,
  programme_context  text,

  -- BTC sở hữu — sync KHÔNG BAO GIỜ ghi đè (xem §7.3)
  performance_order     int,
  performance_slot      text,
  performance_start_time timestamptz,
  performance_end_time   timestamptz,
  official_display_name text,
  team_name             text,
  thumbnail_url         text,
  mc_note               text,
  technical_note        text,
  is_eligible           boolean not null default true,

  -- Google Sheet sở hữu
  performance_name         text not null,
  performance_type         text,
  participation_type       text,
  duration_minutes         int check (duration_minutes between 1 and 30),
  representative_name      text,
  representative_telegram  text,
  representative_email     citext,   -- KHÔNG BAO GIỜ xuống payload Judge/LED
  representative_phone     text,     -- KHÔNG BAO GIỜ xuống payload Judge/LED
  department               text,
  member_count             int,
  member_list_raw          text,
  concept_description      text,
  transformation_highlight text,
  costume_idea             text,
  ai_technology_usage      text,
  support_required         boolean,
  support_description      text,     -- nội bộ BTC
  registration_status      text,
  organiser_note           text,     -- nội bộ BTC
  source_submitted_at      timestamptz,
  source_updated_at        timestamptz,

  -- Vòng đời
  review_status          review_status not null default 'synced',   -- duyệt trước show
  show_status            show_status   not null default 'not_started', -- trong show
  is_current_performance boolean not null default false,
  last_synced_at         timestamptz,
  source_missing         boolean not null default false,
  info_incomplete        boolean not null default false,  -- badge "Thông tin chưa hoàn thiện"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Mã đăng ký đã nhúng đầu cầu; chặn lệch dữ liệu ngay ở tầng DB
  constraint code_matches_location
    check (split_part(registration_code,'-',2) = location::text)
);
create unique index performances_order_uniq
  on performances (location, performance_order)
  where performance_order is not null and review_status <> 'cancelled';
-- Mỗi đầu cầu tối đa MỘT tiết mục đang diễn
create unique index performances_current_uniq
  on performances (location) where is_current_performance;

-- ── performance_members ───────────────────────────────────────────────────
create table performance_members (
  id             uuid primary key default gen_random_uuid(),
  performance_id uuid not null references performances(id) on delete cascade,
  full_name      text not null,
  telegram       text,
  department     text,
  member_order   int,
  is_representative boolean not null default false,
  source_updated_at timestamptz
);

-- ── judge_assignments ─────────────────────────────────────────────────────
create table judge_assignments (
  id             uuid primary key default gen_random_uuid(),
  judge_id       uuid not null references users(id) on delete cascade,
  performance_id uuid not null references performances(id) on delete cascade,
  location       location_code not null,   -- denormalize: RLS/Realtime filter không join được
  assigned_at    timestamptz not null default now(),
  assigned_by    uuid references users(id),
  unique (judge_id, performance_id)
);

-- ── scoring_criteria: trọng số cấu hình được (Super Admin) ────────────────
create table scoring_criteria (
  key         text primary key,
  label       text not null,
  description text not null,
  weight      numeric(5,4) not null check (weight > 0 and weight <= 1),
  sort_order  int not null,
  score_column text not null            -- cột tương ứng trong scores
);
insert into scoring_criteria values
 ('creativity','Ý tưởng & sáng tạo','Ý tưởng mới mẻ, cách kể chuyện khác biệt và khả năng làm mới chất liệu biểu diễn.',0.25,1,'creativity_score'),
 ('quality','Chất lượng biểu diễn','Kỹ năng, cảm xúc, độ chắc chắn và khả năng truyền tải nội dung của tiết mục.',0.25,2,'performance_quality_score'),
 ('transformation','Tinh thần Chuyển mình bứt phá','Mức độ thể hiện chủ đề, sự chuyển đổi rõ ràng và thông điệp tích cực.',0.20,3,'transformation_score'),
 ('presence','Sức hút & làm chủ sân khấu','Thần thái, khả năng kết nối khán giả, sử dụng không gian và duy trì năng lượng.',0.20,4,'stage_presence_score'),
 ('completion','Phối hợp & mức độ hoàn thiện','Sự ăn ý, bố cục, đạo cụ, kỹ thuật và mức độ chuẩn bị chỉn chu.',0.10,5,'completion_score');
-- Tổng trọng số phải = 1.0000; kiểm bằng trigger, không bằng CHECK (cross-row)

-- ── scores ────────────────────────────────────────────────────────────────
create table scores (
  id             uuid primary key default gen_random_uuid(),
  judge_id       uuid not null references users(id) on delete restrict,
  performance_id uuid not null references performances(id) on delete restrict,
  location       location_code not null,   -- denormalize cho RLS + Realtime filter

  creativity_score          numeric(5,2) check (creativity_score          between 0 and 100),
  performance_quality_score numeric(5,2) check (performance_quality_score between 0 and 100),
  transformation_score      numeric(5,2) check (transformation_score      between 0 and 100),
  stage_presence_score      numeric(5,2) check (stage_presence_score      between 0 and 100),
  completion_score          numeric(5,2) check (completion_score          between 0 and 100),
  total_score               numeric(5,2),          -- trigger tính từ scoring_criteria

  highlight_comment   text,
  improvement_comment text,
  private_note        text,          -- chỉ BGK sở hữu + BTC thấy

  status       score_status not null default 'draft',
  submitted_at timestamptz,
  locked_at    timestamptz,
  locked_by    uuid references users(id),
  void_reason  text,

  idempotency_key uuid not null unique,   -- BB-4: chống gửi trùng
  client_updated_at timestamptz,          -- resolve xung đột đa thiết bị
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (judge_id, performance_id),      -- BB-4: một BGK một bộ điểm

  -- Đã gửi thì phải đủ 5 tiêu chí — bất biến ở tầng DB, không phải tầng app
  constraint submitted_needs_all_criteria check (
    status = 'draft' or (
      creativity_score is not null and performance_quality_score is not null and
      transformation_score is not null and stage_presence_score is not null and
      completion_score is not null and submitted_at is not null
    )
  )
);
create index on scores (location, status);
create index on scores (performance_id) where status in ('submitted','locked');

-- ── score_history: audit mọi thay đổi điểm ────────────────────────────────
create table score_history (
  id         uuid primary key default gen_random_uuid(),
  score_id   uuid not null references scores(id) on delete cascade,
  changed_by uuid references users(id),
  action     text not null,   -- draft_saved|submitted|reopened|locked|unlocked|voided|edited
  previous_data jsonb,
  new_data      jsonb,
  reason     text,
  created_at timestamptz not null default now()
);

-- ── score_locks: khóa theo phạm vi, truy vết được ─────────────────────────
create table score_locks (
  id         uuid primary key default gen_random_uuid(),
  scope      lock_scope not null,
  location   location_code,
  judge_id   uuid references users(id),
  performance_id uuid references performances(id),
  score_id   uuid references scores(id),
  reason     text not null,
  locked_by  uuid not null references users(id),
  locked_at  timestamptz not null default now(),
  released_at   timestamptz,
  released_by   uuid references users(id),
  release_reason text
);

-- ═══ HAI BẢNG DUY NHẤT LED ĐỌC ĐƯỢC ══════════════════════════════════════

-- public_progress: bảng thật (không phải view) để Realtime subscribe được.
-- Trigger trên scores duy trì. TUYỆT ĐỐI không có cột điểm nào ở đây.
create table public_progress (
  performance_id    uuid primary key references performances(id) on delete cascade,
  location          location_code not null,
  performance_order int,
  display_name      text not null,     -- official_display_name ?? performance_name
  team_label        text,              -- team_name ?? representative_name
  performance_type  text,
  department         text,
  judges_assigned   int not null default 0,
  judges_submitted  int not null default 0,
  show_status       show_status not null default 'not_started',
  updated_at        timestamptz not null default now()
);

create table live_display_state (
  id                     uuid primary key default gen_random_uuid(),
  location               location_code not null unique,   -- một dòng một đầu cầu
  current_performance_id uuid references performances(id),
  next_performance_id    uuid references performances(id),
  display_mode           display_mode not null default 'standby',
  programme_state        programme_state not null default 'waiting',
  public_message         text,
  countdown_end_at       timestamptz,
  auto_update            boolean not null default true,

  -- Render buffer: nội dung ĐANG hiển thị, đã redact. LED chỉ đọc cột này.
  -- Điểm chỉ được phép có mặt ở các display_mode thuộc chế độ công bố —
  -- cưỡng chế bằng CHECK payload_scores_gated, xem 02-led-awards.md §8.3
  stage_payload          jsonb not null default '{}'::jsonb,
  active_snapshot_id     uuid references publishing_snapshots(id),
  current_award_id       uuid references awards(id),

  updated_by             uuid references users(id),
  updated_at             timestamptz not null default now()
);
-- publishing_snapshots · snapshot_entries · awards: xem 02-led-awards.md §8.4

-- ── performance_results: tổng hợp cho ADMIN (Judge/anon bị RLS từ chối) ───
create table performance_results (
  performance_id uuid primary key references performances(id) on delete cascade,
  location       location_code not null,
  valid_judge_count int not null default 0,
  avg_total          numeric(6,3),
  avg_creativity     numeric(6,3),
  avg_quality        numeric(6,3),
  avg_transformation numeric(6,3),
  avg_presence      numeric(6,3),
  avg_completion    numeric(6,3),
  stddev_total      numeric(6,3),   -- độ lệch giữa các BGK → cờ cần review
  is_rankable       boolean not null default false,
  computed_at       timestamptz not null default now()
);

-- ── sheet_sync_logs · sheet_sync_staging · settings · audit_log ───────────
create table sheet_sync_logs (
  id uuid primary key default gen_random_uuid(),
  spreadsheet_id text not null, sheet_name text not null,
  initiated_by uuid references users(id),
  sync_started_at timestamptz not null default now(), sync_completed_at timestamptz,
  total_source_rows int, new_records int, updated_records int,
  unchanged_records int, failed_records int,
  sync_status text not null default 'running',  -- running|previewed|committed|failed|cancelled
  error_details jsonb, created_at timestamptz not null default now()
);
create table sheet_sync_staging (
  id uuid primary key default gen_random_uuid(),
  sync_log_id uuid not null references sheet_sync_logs(id) on delete cascade,
  registration_code text not null, source_row int,
  diff_type text not null,        -- new|updated|unchanged|source_missing|error
  changed_fields jsonb, normalized jsonb, issues jsonb
);
create table settings (
  id uuid primary key default gen_random_uuid(),
  location location_code,          -- NULL = toàn hệ thống
  key text not null, value jsonb not null,
  updated_by uuid references users(id), updated_at timestamptz not null default now(),
  unique nulls not distinct (location, key)
);
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id), actor_email citext,
  action text not null, entity text, entity_id text,
  location location_code, payload jsonb,
  ip inet, user_agent text, created_at timestamptz not null default now()
);
```

### Trigger giữ bất biến

| Trigger | Trên | Việc |
| --- | --- | --- |
| `trg_score_total` | `scores` BEFORE ins/upd | Tính `total_score` từ `scoring_criteria` — công thức ở DB, không ở client |
| `trg_score_location` | `scores`, `judge_assignments` BEFORE ins | Copy `location` từ `performances` — không tin client |
| `trg_progress_sync` | `scores` AFTER ins/upd/del | Cập nhật `public_progress.judges_submitted` |
| `trg_assigned_count` | `judge_assignments` AFTER ins/del | Cập nhật `public_progress.judges_assigned` |
| `trg_results_recompute` | `scores` AFTER ins/upd/del | Tính lại `performance_results` + `is_rankable` |
| `trg_score_history` | `scores` AFTER upd | Ghi `score_history` |
| `trg_criteria_weights` | `scoring_criteria` AFTER * | Chặn nếu Σ weight ≠ 1.0000 |
| `trg_progress_upsert` | `performances` AFTER ins/upd | Đồng bộ hàng `public_progress` (chỉ field public) |

Đặt việc tính điểm trong trigger, không trong app, là quyết định có ý thức: điểm
được tính đúng một lần ở một nơi duy nhất, kể cả khi ghi đến từ bulk offline sync.

---

## 6. Bảo mật

### 6.1 RLS — trích các policy quan trọng

```sql
alter table scores enable row level security;

-- Judge: chỉ điểm của chính mình, chỉ tiết mục được phân công
create policy judge_reads_own_scores on scores for select
using (judge_id = auth.uid());

create policy judge_writes_own_unlocked on scores for update
using (
  judge_id = auth.uid()
  and status in ('draft','submitted')
  and locked_at is null
  and not is_locked_for(auth.uid(), performance_id)   -- kiểm score_locks theo phạm vi
);

create policy judge_inserts_assigned_only on scores for insert
with check (
  judge_id = auth.uid()
  and exists (
    select 1 from judge_assignments a
    join performances p on p.id = a.performance_id
    where a.judge_id = auth.uid()
      and a.performance_id = scores.performance_id
      and p.review_status = 'ready'
      and p.show_status <> 'award_published'
  )
);

create policy admin_reads_all_scores on scores for select
using (current_role_in('admin','super_admin'));

-- performance_results: Judge KHÔNG có policy nào → RLS mặc định từ chối (BB-3)
alter table performance_results enable row level security;
create policy admin_only_results on performance_results for select
using (current_role_in('admin','super_admin'));

-- ═══ Bề mặt public: đúng hai bảng, chỉ SELECT (BB-2) ══════════════════════
revoke all on all tables in schema public from anon;
grant select on public_progress, live_display_state to anon;

alter table public_progress enable row level security;
create policy anon_reads_progress on public_progress for select
using (true);        -- không có cột điểm nào trong bảng này để mà lộ

alter table live_display_state enable row level security;
create policy anon_reads_live on live_display_state for select
using (true);        -- stage_payload chỉ chứa thứ Admin đã chủ động đẩy lên màn hình
```

Vai trò `anon` **không** được `grant` trên `scores`, `performance_results`, `users`,
`performances`, `judge_assignments`. LED không thể lộ điểm vì nó không có đường tới điểm.

### 6.2 Đánh đổi có ý thức: chống dò danh sách BGK

Brief liệt kê lỗi *"Email không thuộc danh sách BGK"* (§6) đồng thời yêu cầu
*"Không tiết lộ email có tồn tại trong hệ thống hay không cho người ngoài"* (§6).
Hai điều này xung đột ở bước nhập email.

**Cách giải:** ở bước nhập email, mọi email nhận **cùng một phản hồi**
*"Kiểm tra email của bạn"*. Việc kiểm tra danh sách BGK và phân công đầu cầu diễn ra
**sau khi** nhấn magic link, ở `/auth/callback`. Lúc đó người dùng đã chứng minh
kiểm soát hòm mail, nên hiện thông báo cụ thể *"BGK không được phân công đầu cầu này"*
là an toàn. Email không thuộc danh sách thì không nhận được mail nào cả.

### 6.3 Magic link

Dùng một lần · hết hạn 10 phút · `shouldCreateUser: false` (email lạ không tạo account) ·
token hash trong DB, không plain text · rate limit 5 lần/email/giờ + 20/IP/giờ (Upstash
Redis, fail-closed) · link mang `?loc=sgn` để callback biết đầu cầu cần kiểm tra ·
session 12 giờ, refresh trượt trong ngày diễn.

### 6.4 Payload Judge — allow-list, không deny-list

Judge query đi qua đúng một hàm server trả về type `JudgePerformanceView`, được xây
bằng **allow-list**: chỉ những field có tên trong danh sách được serialize.
`representative_email`, `representative_phone`, `representative_telegram`,
`organiser_note`, `support_description`, `member_list_raw` không có trong danh sách
nên không thể lọt ra do nhỡ tay. Có test giữ điều này (§13).

---

## 7. Google Sheet sync architecture

### 7.1 Bảy bước — không bao giờ ghi thẳng vào DB

```
[1] Admin bấm "Kiểm tra dữ liệu mới"  →  KHÔNG ghi gì vào performances
     ▼
[2] Server đọc 2 sheet (Sheets API v4 + service account, server-only)
     ▼
[3] Normalize — detectRowShape() theo NỘI DUNG, không theo vị trí cột
     └ backfill người đại diện từ sheet Thành viên   (chi tiết: 00-data-audit.md)
     ▼
[4] Diff theo registration_code → ghi vào sheet_sync_staging
     ▼
[5] Preview cho Admin:  N mới · N thay đổi (kèm from → to từng field)
                        N không đổi · N lỗi · N mất khỏi sheet
     ▼
[6] Admin xác nhận  →  transaction: upsert performances + performance_members
     ▼
[7] Ghi sheet_sync_logs + audit_log
```

### 7.2 Vì sao production dùng service account chứ không phải gviz

Endpoint `gviz/tq` hoạt động (đã kiểm chứng) vì spreadsheet đang share công khai bằng
link. Không dựa vào đó ở production: nếu BTC siết quyền vào 06/08, sync sẽ chết đúng
hôm trước sự kiện. Production dùng service account với quyền **Viewer**, credential
trong biến môi trường server (`GOOGLE_SERVICE_ACCOUNT_KEY`), không bao giờ ở
`NEXT_PUBLIC_*`. `scripts/fetch-sheet.mjs` giữ đường gviz làm fallback khẩn cấp và làm
công cụ kiểm tra dữ liệu tại chỗ.

### 7.3 Ai sở hữu field nào

| BTC sở hữu — sync không chạm | Sheet sở hữu — sync cập nhật |
| --- | --- |
| `performance_order`, `performance_slot` | `performance_name`, `performance_type` |
| `performance_start_time` / `_end_time` | `participation_type`, `duration_minutes` |
| `official_display_name`, `team_name` | `representative_*`, `department`, `member_count` |
| `thumbnail_url`, `mc_note`, `technical_note` | `concept_description`, `transformation_highlight` |
| `review_status`, `show_status`, `is_current_performance` | `costume_idea`, `ai_technology_usage` |
| `is_eligible` | `support_required`, `support_description` |
| **`scores` và mọi bảng liên quan** | `registration_status`, `organiser_note`, `source_*` |

BTC sửa tay `official_display_name` thành "REBORN QUEENS" rồi Sheet đổi tên tiết mục —
sync cập nhật `performance_name` nhưng giữ nguyên tên hiển thị chính thức, và hiện
cảnh báo *"Tên nguồn đã thay đổi, kiểm tra lại tên hiển thị"*.

### 7.4 Ba tình huống biên

**Tiết mục mới** → `review_status = 'synced'`, **không** xuất hiện với BGK cho đến khi
Admin duyệt tới `ready`.
**Tiết mục mất khỏi Sheet** → **không xóa**, đặt `source_missing = true`, giữ nguyên
điểm đã chấm, hiện cảnh báo cho Admin.
**Thông tin chưa hoàn thiện** (`Nộp sau nhé`, `Bí mật`, `Không áp dụng`) → **không phải
lỗi**, đặt `info_incomplete = true` → badge *"Thông tin chưa hoàn thiện"*, vẫn chấm được.

---

## 8. Realtime architecture

Supabase Realtime (Postgres logical replication → WebSocket). Một socket cho mỗi
client, nhiều channel trên đó. **Không polling.**

| Client | Channel | Nội dung | KHÔNG có |
| --- | --- | --- | --- |
| 📺 LED `/live/sgn` | `pg:public_progress` filter `location=eq.SGN` | số BGK đã gửi, `show_status` | mọi điểm, mọi tên BGK |
| 📺 LED `/live/sgn` | `pg:live_display_state` filter `location=eq.SGN` | `display_mode`, `stage_payload`, countdown | mọi thứ ngoài payload đang chiếu |
| 🔐 Admin | 2 channel trên + `pg:scores` filter `location=eq.SGN` | điểm chi tiết realtime | — |
| 🔐 Admin | `presence:SGN` | BGK online/offline, hoạt động gần nhất | — |
| 🎫 Judge | `pg:scores` filter `judge_id=eq.<uid>` | điểm của chính mình (đồng bộ đa thiết bị) | điểm người khác (RLS chặn) |
| 🎫 Judge | `broadcast:locks:SGN` | tín hiệu khóa → chuyển sang chỉ xem ngay | — |

Cột `location` được denormalize trên `scores` chính là để filter realtime này chạy
được — filter của Supabase là so sánh một cột, không join được.

**Ba tầng phòng thủ cho ngày diễn:**

1. **Reconnect** exponential backoff 1s → 30s, jitter, không giới hạn số lần.
2. **Refetch on reconnect** — nối lại thì fetch full state một lần; sự kiện bị mất
   trong lúc đứt kết nối không làm UI lệch vĩnh viễn.
3. **Heartbeat 30s** cho LED: quá 60s không có tin → hiện chấm mờ ở góc, **giữ nguyên
   trạng thái**, Admin thấy cảnh báo. LED không bao giờ tự nhảy trạng thái.

---

## 9. State machines

### 9.1 `performances` — hai trục độc lập

**Trục 1 · `review_status`** — quy trình duyệt trước show, BTC dùng:

```
synced ──► awaiting_info ──┐
   └───────────────────────┴──► confirmed ──► scheduled ──► ready
                                                             │
        └──► cancelled  (từ bất kỳ trạng thái nào, Admin + lý do)
                        ├ ẩn khỏi Judge Dashboard
                        ├ loại khỏi bảng xếp hạng
                        └ GIỮ điểm đã chấm (không xóa)
```

**Trục 2 · `show_status`** — trạng thái trong đêm diễn, điều khiển LED:

```
not_started ──► performing ──► judging_in_progress ──► judging_completed
                                       ▲                      │
                    mở lại điểm ───────┘                      ▼
                                              score_verification
                                                       │
                                              result_confirmed
                                                       │
                                              award_published
```

Hai trục **độc lập**. Ngưỡng BGK nhìn thấy tiết mục là `review_status = 'ready'`, và
`show_status` không ảnh hưởng tới quyền chấm — Admin mở lại điểm khi tiết mục đã
`judging_completed` thì BGK vẫn sửa được, và `show_status` bị thu hồi về
`judging_in_progress` (xem [02-led-awards.md §4.3](02-led-awards.md)).

> Brief §24 viết *"chỉ tiết mục Sẵn sàng chấm mới xuất hiện trong Judge Dashboard"*.
> Nếu hiểu theo nghĩa hẹp — chỉ đúng trạng thái `ready` — thì tiết mục sẽ biến mất
> khỏi tay BGK ngay khi Admin bấm "Đang biểu diễn", tức là đúng lúc cần chấm nhất.
> Nên `ready` được triển khai là **ngưỡng**, không phải trạng thái duy nhất.

### 9.2 `scores.status`

```
        ┌── (chưa có bản ghi)
        ▼
      draft ──────► submitted ──────► locked
        ▲               │  ▲             │
        │  autosave     │  │ Admin       │ Super Admin + lý do
        └───────────────┘  │ mở lại      │ (mở khóa)
                           └─────────────┘
                     │
                     └──► voided   (Admin loại bộ điểm + lý do)
                                    → loại khỏi tính điểm TB
                                    → GIỮ bản ghi + audit
```

Trạng thái phía client (chỉ trong IndexedDB, không có trong DB):
`local_dirty` → `syncing` → `synced` | `sync_failed`.

### 9.3 `live_display_state.display_mode` — 14 trạng thái, hai chế độ

Máy trạng thái đầy đủ nằm ở **[02-led-awards.md §10](02-led-awards.md)**. Tóm tắt:

```
CHẾ ĐỘ A · theo dõi tiến độ — KHÔNG BAO GIỜ có điểm
  standby → performance → judging_progress → performance_completed
          → all_performances_status → all_scores_completed
                          │
      ╔═══════════════════╪══════════════════════════════════════╗
      ║ 7 điều kiện + Publishing Snapshot + Admin bấm công bố    ║
      ╚═══════════════════╪══════════════════════════════════════╝
                          ▼
CHẾ ĐỘ B · công bố kết quả — điểm đọc từ snapshot đã đóng băng
  awards_intro → award_reveal → scorecard → audience_award
               → grand_prize → awards_summary → full_ranking

  emergency_hide ← vào được từ cả 14 trạng thái, một cú bấm
```

Không có auto-transition nào dẫn từ chế độ A sang chế độ B. `programme_state` là công
tắc giữa hai chế độ, và nó chỉ bật bằng tay.

---

## 10. Điểm và xếp hạng

### 10.1 Tổng điểm một BGK

```
total = creativity×0.25 + quality×0.25 + transformation×0.20
      + presence×0.20   + completion×0.10
```

Làm tròn 2 chữ số thập phân, tính bằng `numeric` của Postgres (không phải float — tránh
lệch nhị phân). Hiển thị **TỔNG ĐIỂM: 84.75 / 100**. Đây là điểm của **riêng** BGK đang
đăng nhập. Trọng số đọc từ `scoring_criteria` nên Super Admin sửa được mà không cần deploy.

### 10.2 Điểm tiết mục và điều kiện xếp hạng

```
avg_total = Σ total_score (status ∈ {submitted, locked}) / số BGK hợp lệ
```

Bộ điểm `voided` bị loại khỏi cả tử số và mẫu số. `is_rankable = true` chỉ khi:
**tất cả** BGK được phân công đã gửi · không bộ điểm nào bị lỗi/void · tiết mục không
`cancelled` · không `source_missing`. Chưa đủ → hiển thị *"Chưa đủ điều kiện xếp hạng"*
kèm danh sách BGK còn thiếu. **Không xếp hạng tạm** — một bảng xếp hạng nửa vời trên
màn hình BTC là mầm của quyết định sai.

Hai bảng xếp hạng độc lập hoàn toàn: `/admin/sgn/results` và `/admin/han/results`.
Không tồn tại route nào xếp hạng chung.

### 10.3 Đồng điểm

So sánh `avg_total` làm tròn 2 chữ số. Bằng nhau thì lần lượt:
`avg_creativity` → `avg_quality` → `avg_transformation` → `avg_presence`.

Vẫn bằng → **hệ thống dừng lại**: banner
**CÓ TIẾT MỤC ĐỒNG ĐIỂM CẦN XỬ LÝ**, hai tiết mục cùng giữ một thứ hạng, ô quyết định
để BTC ghi lý do. Không tự chọn người thắng — kể cả bằng random hay theo thời gian gửi.

Giải khán giả bình chọn là hạng mục riêng, có cột riêng, **không** trộn vào Nhất–Nhì–Ba.

---

## 11. Chế độ offline

Ngày diễn, hội trường đông, wifi yếu — giả định mặc định là **mạng sẽ chập chờn**.

```
Người dùng kéo slider
   │
   ├─► React state                     tức thì
   ├─► IndexedDB (idb)                 ~1ms, đồng bộ, sống qua refresh
   │     store: drafts { key: judgeId:performanceId, payload, clientUpdatedAt, dirty }
   │     store: outbox { idempotencyKey, endpoint, payload, attempts, nextRetryAt }
   │
   └─► debounce 800ms ─► PATCH /api/scores/draft
                          ├ 2xx      → dirty = false → "Đã lưu lúc 20:14"
                          ├ offline  → giữ trong outbox → banner "BẠN ĐANG NGOẠI TUYẾN"
                          └ 5xx      → backoff 1s·2s·4s…60s, tối đa 20 lần → "Chưa đồng bộ"

window 'online'  ─► flush outbox tuần tự theo nextRetryAt
window 'beforeunload' khi còn dirty ─► cảnh báo trước khi đóng tab
```

**Banner:** **BẠN ĐANG NGOẠI TUYẾN** — *"Điểm đang được lưu trên thiết bị và sẽ tự động
đồng bộ khi có kết nối."*

**Chống gửi trùng — ba tầng:** `idempotency_key` sinh một lần cho mỗi lần bấm gửi và
lưu trong outbox (retry dùng lại đúng key) · `unique (idempotency_key)` ·
`unique (judge_id, performance_id)` + `ON CONFLICT DO UPDATE`. Ba lần retry cùng một
lần gửi cho ra đúng một bộ điểm.

**Xung đột đa thiết bị:** so `client_updated_at`. Bản ghi trên server mới hơn → hiện
*"Điểm đã được cập nhật ở thiết bị khác"* và cho BGK chọn, không âm thầm ghi đè.

**BB-2 nhắc lại ở đây:** LED không bao giờ đổi trạng thái dựa trên dữ liệu chưa đồng bộ.
`public_progress.judges_submitted` chỉ tăng khi Postgres đã commit.

---

## 12. Công nghệ và bố cục repo

Next.js 15 (App Router) · TypeScript strict · Tailwind CSS · Supabase (Postgres +
Auth + Realtime) · React Hook Form + Zod · TanStack Query · Framer Motion ·
`idb` · Resend (email) · Upstash Redis (rate limit) · Vercel.

Không Recharts trên trang Judge và LED — biểu đồ không giúp BGK chấm nhanh hơn. Chỉ
dùng ở Admin và chỉ khi nó thay đổi được quyết định (phân bố điểm, độ lệch giữa BGK).

```
app/
  judge/[location]/{page,dashboard,performance/[code],result/[code]}
  admin/{login,dashboard,[location]/{progress,results,rundown,live-control,live-preview},
         judges,performances,sync,settings,audit}
  live/[location]/page.tsx        ← runtime edge, không JS nặng, không auth
  auth/{callback/route.ts,error}
  api/scores/{draft,submit}/route.ts
lib/
  data/judge.ts                   ← allow-list payload cho Judge (§6.4)
  data/admin.ts  data/live.ts
  offline/{db.ts,outbox.ts}
  sheet/{fetch.ts,normalize.ts,diff.ts}    ← chia sẻ logic với scripts/fetch-sheet.mjs
  realtime/{channels.ts,useLiveState.ts}
  scoring/{formula.ts,ranking.ts,tiebreak.ts}
supabase/migrations/*.sql
scripts/fetch-sheet.mjs           ← đã chạy được trên dữ liệu thật
docs/{00-data-audit,01-architecture}.md
```

---

## 13. Ma trận kiểm thử — bám vào năm bất biến

| # | Kiểm | Bất biến | Cách |
| --- | --- | :-: | --- |
| 1 | Judge SGN không thấy tiết mục HAN | BB-1 | integration + RLS test bằng JWT thật |
| 2 | `/judge/han/*` với BGK chỉ có SGN → 403 | BB-1 | e2e |
| 3 | Bảng xếp hạng SGN không chứa tiết mục HAN | BB-1 | unit trên `ranking.ts` |
| 4 | `anon` SELECT `scores` → bị từ chối | BB-2 | SQL test với anon key |
| 5 | Payload `/live/sgn` không chứa key `scores` khi đang ở chế độ A | BB-2 | snapshot response |
| 6 | Payload LED không chứa email/tên BGK | BB-2 | snapshot + regex |
| 7 | Công bố điểm cần đúng tên tiết mục ở bước 2 | BB-2 | unit RPC |
| 8 | Judge A không đọc được điểm Judge B | BB-3 | RLS test |
| 9 | Judge SELECT `performance_results` → từ chối | BB-3 | RLS test |
| 10 | Payload Judge không có email/SĐT/Telegram/ghi chú BTC | BB-3 | test allow-list trên type |
| 11 | Gửi 3 lần cùng `idempotency_key` → 1 bản ghi | BB-4 | integration |
| 12 | Offline → refresh → điểm còn nguyên | BB-4 | e2e (Playwright offline mode) |
| 13 | Điểm 101 / −1 / "abc" → bị từ chối ở client **và** DB | BB-4 | unit + SQL |
| 14 | Gửi thiếu 1 tiêu chí → chặn ở CHECK constraint | BB-4 | SQL |
| 15 | Sync 2 lần liên tiếp → lần 2 báo 0 thay đổi | BB-5 | integration trên snapshot thật |
| 16 | Sync không ghi đè `performance_order`, `official_display_name` | BB-5 | integration |
| 17 | Tiết mục mất khỏi Sheet → `source_missing`, điểm còn nguyên | BB-5 | integration |
| 18 | Sheet mất quyền → lỗi tiếng Việt rõ ràng, không stack trace | BB-5 | mock 403 |
| 19 | Header sheet lệch cột → normalize vẫn đúng | BB-5 | unit trên 2 layout thật |
| 20 | Magic link hết hạn / dùng lần 2 → trang lỗi đúng | — | e2e |
| 21 | Email lạ và email BGK cho phản hồi giống nhau | §6.2 | e2e so sánh response |
| 22 | Khóa → Judge chuyển chỉ xem không cần reload | — | e2e 2 tab |
| 23 | Mở khóa bằng Admin thường → 403 | — | RLS test |
| 24 | Đồng điểm không tự chọn người thắng | — | unit `tiebreak.ts` |
| 25 | Mất realtime → LED giữ trạng thái, không nhảy standby | — | e2e cắt WebSocket |
| 26 | Emergency Hide từ cả 14 `display_mode` → `emergency_hide` | — | unit state machine |
| 27 | Σ trọng số ≠ 1 → trigger chặn | — | SQL |

Kiểm 4, 5, 6, 8, 9, 10 là **hàng rào bảo vệ danh dự cuộc thi** — chạy trong CI, fail
là chặn deploy.

---

## Tiếp theo

- **Giai đoạn 2** (đang có) — wireframe 18 màn hình, ưu tiên 3 luồng chính: `wireframes/`
- **Giai đoạn 3** — design tokens + component library
- **Giai đoạn 4** — UI hoàn chỉnh responsive
- **Giai đoạn 5** — code: migrations → auth → sync → scoring → realtime → LED
- **Giai đoạn 6** — 27 test ở §13, chốt trước 05/08/2026 (2 ngày đệm trước SGN)
