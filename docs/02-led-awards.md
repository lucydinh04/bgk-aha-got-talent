# 02 — Màn hình LED & luồng công bố kết quả

> Tài liệu này **thay thế** §18–19 của [01-architecture.md](01-architecture.md) và phát
> biểu lại bất biến **BB-2**. Đọc file này khi làm bất cứ thứ gì chạm tới `/live/*`.

---

## 1. Bất biến BB-2, phát biểu lại

Bản cũ nói *"LED không có đường nào tới điểm"*. Bản đó không còn đúng — chế độ công bố
giải có hiển thị điểm. Nhưng đây là **thu hẹp**, không phải nới lỏng:

> **BB-2 (mới) — LED chỉ hiển thị được đúng những gì Admin đã chủ động đẩy lên màn hình.**
>
> Vai trò `anon` đọc được đúng **ba bảng**:
> - `public_progress` — trạng thái chấm, **không có cột điểm nào tồn tại trong bảng**
> - `live_display_state` — **một dòng cho mỗi đầu cầu**, chứa `stage_payload`
> - `voting_public_state` — trạng thái phiên bình chọn + số khán giả tham gia,
>   **không có cột vote count nào tồn tại trong bảng** ([03](03-audience-voting.md))
>
> `stage_payload` là **nội dung đang hiển thị trên màn hình ngay lúc này**, đã redact,
> do Admin ghi qua RPC. LED không truy vấn `scores`, không truy vấn
> `performance_results`, không truy vấn cả `publishing_snapshots`.

Hệ quả quan trọng: **kể cả người mở DevTools trên `/live/sgn` cũng không lấy được gì
nhiều hơn thứ đang chiếu trước mặt họ.** Không có bảng xếp hạng nằm sẵn trong payload
chờ được reveal. Không có điểm của tiết mục chưa công bố. Không có thứ hạng tạm.

Đánh đổi: `stage_payload` là dữ liệu trùng lặp, denormalize. Chấp nhận có ý thức — nó
là **render buffer**, và nó khiến client LED chỉ còn một việc duy nhất là vẽ payload ra
màn hình. Ngày diễn, client càng ngu càng tốt.

---

## 2. Hai chế độ, một ranh giới cứng

| | Chế độ A — Theo dõi tiến độ | Chế độ B — Công bố kết quả |
| --- | --- | --- |
| Khi nào | Từ đầu chương trình đến khi chấm xong hết | Sau khi Admin bấm **BẮT ĐẦU CÔNG BỐ KẾT QUẢ** |
| Nguồn dữ liệu | `public_progress` (trạng thái) | `publishing_snapshot` (đóng băng) |
| Có điểm không | **Không, tuyệt đối** | Có, theo từng giải Admin công bố |
| Ai kích hoạt | Admin chuyển trạng thái từng bước | Chỉ Admin, sau khi qua checklist §5 |
| Tự động chuyển | Không bao giờ | Không bao giờ |

Ranh giới giữa hai chế độ là `programme_state`. Không có đường nào nhảy từ chế độ A
sang chế độ B mà không đi qua **kiểm tra điều kiện + xác nhận hai bước của Admin**.

---

## 3. Chế độ A — theo dõi tiến độ

### 3.1 Sáu màn hình

| `display_mode` | Nội dung | Tuyệt đối không có |
| --- | --- | --- |
| `standby` | KV chương trình · SGN/HAN · ngày diễn · countdown (nếu bật) | — |
| `performance` | STT · tên tiết mục · đội/cá nhân · loại hình · phòng ban · `ĐANG BIỂU DIỄN` | mọi thông tin điểm |
| `judging_progress` | Tên tiết mục · `3/5 BGK đã hoàn tất` · thanh tiến độ | tên BGK chưa chấm · điểm tạm tính · thứ hạng tạm |
| `performance_completed` | Tên tiết mục · dấu tick · `ĐÃ HOÀN TẤT CHẤM ĐIỂM` | số điểm · thứ hạng · điểm trung bình |
| `all_performances_status` | Bảng STT · tên · **trạng thái** | điểm · xếp hạng · chênh lệch · ai dẫn đầu |
| `all_scores_completed` | `TẤT CẢ TIẾT MỤC ĐÃ HOÀN TẤT CHẤM ĐIỂM` | mọi thứ liên quan tới điểm |

Supporting line của `performance_completed`:
*"Điểm số đã được ghi nhận và sẽ được công bố vào cuối chương trình."*

Supporting line của `all_scores_completed`:
*"Ban Tổ chức đang chuẩn bị công bố kết quả."*

### 3.2 Bảng tổng trạng thái — sáu nhãn được phép

`all_performances_status` chỉ được dùng đúng sáu chuỗi này, không hơn:

```
Chưa biểu diễn · Đang biểu diễn · BGK đang chấm
Đã chấm xong  · Chờ bổ sung điểm · Điểm đã được BTC xác nhận
```

Sáu nhãn này là **enum ở tầng DB**, không phải chuỗi tự do ở tầng UI. Nhãn thứ bảy
muốn xuất hiện thì phải sửa migration — đó là rào chắn có chủ đích.

### 3.3 Điều kiện vào `performance_completed` (§13 của brief)

Chỉ khi **tất cả** BGK được phân công đã gửi điểm hợp lệ:

```
judges_submitted = judges_assigned
AND không còn bộ điểm status = 'draft'
AND không còn bộ điểm bị đánh dấu lỗi hoặc void
```

Chưa đủ → LED hiện `ĐANG CHỜ HOÀN TẤT CHẤM ĐIỂM` hoặc
`BAN TỔ CHỨC ĐANG XÁC NHẬN KẾT QUẢ`. **Không bao giờ** để lộ lý do cụ thể —
BGK nào thiếu, lỗi gì — lên màn hình. Admin thấy đủ chi tiết trong dashboard.

---

## 4. Publishing Snapshot — đóng băng kết quả

### 4.1 Vì sao cần

Nếu LED đọc trực tiếp bảng điểm sống, một bộ điểm gửi muộn lúc 21:47 có thể đổi thứ
hạng **giữa lúc MC đang đọc tên người thắng**. Snapshot loại bỏ hoàn toàn khả năng đó.

### 4.2 Vòng đời

```
Admin bấm "Tạo Publishing Snapshot"
   │
   ├─ chạy check_awards_readiness(location) → 7 điều kiện §5
   │    có blocker → dừng, hiện checklist, KHÔNG tạo snapshot
   │
   ├─ khóa toàn bộ điểm của đầu cầu (score_locks scope='location')
   │    ← đây là chốt chặn quan trọng nhất: sau bước này không ai sửa được điểm nữa,
   │      nên không tồn tại tình huống snapshot bị lệch giữa buổi trao giải
   │
   ├─ tính điểm TB từng tiêu chí, tổng điểm, thứ hạng, tie-break
   ├─ ghi publishing_snapshots + snapshot_entries (immutable)
   └─ ghi audit_log

Admin bấm "BẮT ĐẦU CÔNG BỐ KẾT QUẢ"
   └─ programme_state → awards_in_progress
      LED chuyển sang chế độ B, đọc từ snapshot qua stage_payload
```

Snapshot **immutable**. Muốn đổi thì tạo bản mới (`version` tăng), bản cũ giữ nguyên
để truy vết. Đúng một snapshot `is_active` cho mỗi đầu cầu tại một thời điểm.

### 4.3 Nếu điểm bị sửa sau khi có snapshot (§14 brief)

Vào chế độ công bố thì điểm đã bị khóa toàn đầu cầu, nên chuyện này chỉ xảy ra khi
Super Admin chủ động mở khóa giữa buổi trao giải. Khi đó:

- Snapshot **không tự thay đổi** — LED vẫn chiếu đúng thứ đã đóng băng.
- Snapshot bị đánh dấu `is_stale = true`, Admin thấy cảnh báo đỏ trên Live Control.
- Trạng thái `judging_completed` của tiết mục đó bị thu hồi về `judging_in_progress`.
- Muốn kết quả mới lên LED thì phải **tạo snapshot mới**.

**Hệ thống không chặn việc công bố tiếp bằng snapshot cũ.** Đây là quyết định có ý
thức: chặn giữa lúc MC đang trên sân khấu còn tệ hơn công bố theo dữ liệu cũ đã được
Admin nhìn thấy rõ. Modal xác nhận sẽ hiện cảnh báo *"Snapshot đã cũ so với dữ liệu
hiện tại"* và bắt Admin tick thêm một ô thừa nhận trước khi cho đi tiếp.

---

## 5. Bảy điều kiện để mở phần công bố

`check_awards_readiness(location)` trả về danh sách blocker, hiển thị dưới dạng
checklist trên Live Control:

| # | Điều kiện | Cách kiểm |
| --- | --- | --- |
| 1 | Tất cả tiết mục đã biểu diễn | không còn `show_status IN (not_started, performing)` |
| 2 | Tất cả tiết mục `judging_completed` | mọi tiết mục không bị hủy đều đã đủ BGK |
| 3 | Không còn BGK lưu nháp | không còn `scores.status = 'draft'` |
| 4 | Không còn điểm chưa đồng bộ | client báo outbox rỗng + không có bộ điểm nào `client_updated_at > updated_at` |
| 5 | Không còn điểm lỗi validation | không còn bộ điểm vi phạm CHECK hoặc bị đánh dấu lỗi |
| 6 | Không tiết mục nào thiếu BGK bắt buộc | `judges_submitted = judges_assigned` với mọi tiết mục |
| 7 | Admin đã xác nhận bảng kết quả cuối cùng | thao tác thủ công, ghi người + thời điểm |

Điều kiện 1–6 hệ thống tự kiểm. Điều kiện 7 là **con người**, không tự động hóa được
và cũng không nên.

---

## 6. Trình tự công bố giải

Cơ cấu giải **không hard-code** — đọc từ bảng `awards`, Super Admin cấu hình theo từng
đầu cầu. Cơ cấu chính thức và bảng `awards` đầy đủ: **[03-audience-voting.md §1](03-audience-voting.md)**.

```
SGN · 4 giải                                    result_source
① THE CREATIVE PULSE   — Giải Ba                judging
② THE SPOTLIGHT ACT    — Giải Nhì               judging
③ THE CROWD MAGNET     — Giải Khán giả yêu thích  audience_vote  ← không dùng điểm BGK
④ THE BREAKTHROUGH ACT — Giải Nhất              judging         ← BẮT BUỘC cuối cùng

HAN · 2 giải
① THE SPOTLIGHT ACT    — Giải Nhì               judging
② THE BREAKTHROUGH ACT — Giải Nhất              judging         ← BẮT BUỘC cuối cùng

Giải chung sau hai sự kiện
   THE AI FAVORITE ACT — Giải Tiết mục được AI yêu thích nhất   ai_result
   → award_scope = 'global', chỉ công bố khi CẢ HAI đầu cầu awards_completed
```

**HAN không mặc định có Creative Pulse và Crowd Magnet.** Chỉ xuất hiện khi Super Admin
bật `is_enabled` trước ngày diễn.

Mỗi giải đi qua đúng chu trình sáu bước:

```
[chọn giải] → [Preview 16:9] → [xác nhận 2 bước] → [ĐƯA LÊN LED]
                                                        │
                                    award_reveal ───────┤
                                                        │
                              [Hiển thị bảng điểm] → scorecard
                                                        │
                                                  [Tiếp tục] → giải sau
```

### 6.1 Ràng buộc thứ tự

`publish_award()` cưỡng chế đúng **một** luật cứng: **giải cao nhất không công bố được
khi còn giải nào chưa công bố.** Ba giải còn lại nếu công bố lệch thứ tự thì hệ thống
cảnh báo nhưng cho đi tiếp — sân khấu có thể phải đổi kịch bản phút chót, và một hệ
thống cứng nhắc lúc đó là hệ thống có hại.

### 6.2 THE CROWD MAGNET — giải khán giả bình chọn

`result_source = 'audience_vote'`. Kết quả đến từ một **Voting Result Snapshot** đã
khóa và xác minh, hoàn toàn tách khỏi điểm BGK. Toàn bộ module bình chọn — trang
`/vote`, đồng hồ server, hiệu ứng xáo trộn, chống gian lận — nằm ở
**[03-audience-voting.md](03-audience-voting.md)**.

LED hiển thị tên giải và tên tiết mục thắng. Số liệu bình chọn (tổng lượt, tỷ lệ) chỉ
hiện khi Admin bật `show_result_figures` bằng một thao tác riêng.
**Không hiển thị bảng điểm BGK cho giải này** — `show_scorecard()` từ chối mọi award có
`result_source = 'audience_vote'` ở tầng RPC, không chỉ ở tầng UI.

### 6.3 Hai chế độ reveal (§7 brief)

- **Chế độ A** — reveal xong hiện luôn bảng điểm.
- **Chế độ B** — reveal xong dừng lại, Admin bấm mới hiện bảng điểm. **Mặc định.**

Mặc định là B vì nó trả nhịp sân khấu về cho người đang đứng ở cánh gà.

---

## 7. Bảng điểm trên LED

Chỉ hiện ở `scorecard`, chỉ cho tiết mục vừa được công bố giải.

| Tiêu chí | Điểm TB | Trọng số | Quy đổi |
| --- | --: | --: | --: |
| Ý tưởng & sáng tạo | 90.00 | 25% | 22.50 |
| Chất lượng biểu diễn | 88.00 | 25% | 22.00 |
| Tinh thần Chuyển mình bứt phá | 92.00 | 20% | 18.40 |
| Sức hút & làm chủ sân khấu | 89.00 | 20% | 17.80 |
| Phối hợp & mức độ hoàn thiện | 87.00 | 10% | 8.70 |

**TỔNG ĐIỂM: 89.40 / 100**

Không có: tên BGK · điểm từng BGK · điểm cao nhất/thấp nhất · độ lệch · nhận xét ·
bất cứ dữ liệu nội bộ nào. Năm dòng, font lớn, đọc được từ cuối hội trường.

---

## 8. Thay đổi database

### 8.1 Tách `judging_status` thành hai cột

Enum cũ trộn hai mối quan tâm khác nhau. Tách ra:

```sql
-- Quy trình duyệt TRƯỚC show (BTC dùng, BGK không thấy)
create type review_status as enum (
  'synced','awaiting_info','confirmed','scheduled','ready','cancelled'
);

-- Trạng thái TRONG show — đúng 7 giá trị theo brief
create type show_status as enum (
  'not_started','performing','judging_in_progress','judging_completed',
  'score_verification','result_confirmed','award_published'
);

alter table performances
  add column review_status review_status not null default 'synced',
  add column show_status   show_status   not null default 'not_started';
```

Ngưỡng BGK nhìn thấy tiết mục vẫn là `review_status >= 'ready'`. `show_status` không
ảnh hưởng tới quyền chấm — BGK vẫn chấm được khi tiết mục đã sang `judging_completed`
nếu Admin mở lại điểm.

### 8.2 Trạng thái toàn chương trình

```sql
create type programme_state as enum (
  'waiting','show_in_progress','judging_in_progress','all_scores_completed',
  'result_verification','ready_for_awards','awards_in_progress','awards_completed'
);

create type display_mode as enum (
  -- chế độ A · theo dõi tiến độ
  'standby','performance','judging_progress','performance_completed',
  'all_performances_status','all_scores_completed',
  -- chế độ B · công bố giải
  'awards_intro','award_reveal','scorecard','audience_award',
  'grand_prize','awards_summary','full_ranking',
  -- bình chọn khán giả — xem 03-audience-voting.md
  'audience_vote_intro','audience_vote_qr','audience_vote_live',
  'audience_vote_closed','audience_vote_verification','audience_vote_ready',
  'audience_award_shuffle','audience_award_reveal',
  'audience_award_result','audience_award_celebration',
  -- luôn vào được từ mọi trạng thái
  'emergency_hide'
);
```

### 8.3 `live_display_state` — thêm render buffer

```sql
alter table live_display_state
  add column programme_state programme_state not null default 'waiting',
  add column active_snapshot_id uuid references publishing_snapshots(id),
  add column current_award_id   uuid references awards(id),
  -- Nội dung ĐANG hiển thị, đã redact. LED chỉ đọc cột này.
  add column stage_payload jsonb not null default '{}'::jsonb;

-- Chỉ chế độ công bố mới được mang điểm trong payload
alter table live_display_state add constraint payload_scores_gated check (
  display_mode in ('award_reveal','scorecard','audience_award',
                   'grand_prize','awards_summary','full_ranking')
  or not (stage_payload ? 'scores')
);
```

Constraint cuối là **rào chắn cuối cùng** của BB-2: nếu ai đó viết bug đẩy điểm vào
payload lúc đang ở `judging_progress`, Postgres từ chối ghi.

### 8.4 Bảng mới

```sql
create table publishing_snapshots (
  id uuid primary key default gen_random_uuid(),
  location location_code not null,
  version int not null,
  is_active boolean not null default false,
  is_stale  boolean not null default false,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  confirmed_by uuid references users(id),      -- điều kiện 7
  confirmed_at timestamptz,
  readiness_report jsonb not null,             -- 7 điều kiện tại thời điểm tạo
  unique (location, version)
);
create unique index one_active_snapshot_per_location
  on publishing_snapshots (location) where is_active;

create table snapshot_entries (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references publishing_snapshots(id) on delete cascade,
  performance_id uuid not null references performances(id),
  rank int,
  is_tied boolean not null default false,      -- đồng điểm → BTC quyết, không tự chọn
  valid_judge_count int not null,
  avg_creativity numeric(6,2), avg_quality numeric(6,2),
  avg_transformation numeric(6,2), avg_presence numeric(6,2),
  avg_completion numeric(6,2), avg_total numeric(6,2),
  display_name text not null, team_label text,
  unique (snapshot_id, performance_id)
);

-- awards: schema đầy đủ (award_scope, result_source, snapshot refs, ràng buộc
-- giải chung AI Favorite) nằm ở 03-audience-voting.md §9 — dùng bản đó làm chuẩn.
```

### 8.5 RLS — `anon` chỉ ba bảng

```sql
-- KHÔNG grant cho anon: publishing_snapshots, snapshot_entries, awards,
--                       voting_sessions, audience_ballots, audience_votes,
--                       voting_result_snapshots
revoke all on publishing_snapshots, snapshot_entries, awards from anon;
grant select on public_progress, live_display_state, voting_public_state to anon;
```

Snapshot và bảng giải là dữ liệu nội bộ. LED chỉ thấy chúng sau khi Admin đã resolve
thành `stage_payload` — nghĩa là sau khi đã bấm công bố.

---

## 9. RPC — mọi thao tác công bố đi qua đây

```sql
check_awards_readiness(p_location)            → jsonb   -- 7 điều kiện, admin
create_publishing_snapshot(p_location, p_confirm_text)  -- khóa điểm + đóng băng
open_awards_mode(p_location)                            -- → awards_in_progress
build_award_payload(p_award_id)               → jsonb   -- PREVIEW, không ghi gì
publish_award(p_award_id, p_confirm_text, p_ack_stale)  -- ghi stage_payload
show_scorecard(p_award_id, p_confirm_text)              -- chế độ B, bước 2
set_display_mode(p_location, p_mode, p_payload)
emergency_hide(p_location)                              -- → emergency_hide, 1 bấm
```

Bốn nguyên tắc chung của nhóm RPC này:

1. **`p_confirm_text` bắt buộc khớp tên tiết mục** (hoặc chuỗi `XÁC NHẬN CÔNG BỐ` với
   thao tác không gắn tiết mục cụ thể). Không thao tác công bố nào đi được bằng một click.
2. **Mọi RPC nhận `p_location` và kiểm chéo** với `location` của award/snapshot. Công bố
   nhầm SGN sang LED HAN bị chặn ở tầng DB, không phải tầng UI.
3. **`build_award_payload` không ghi gì** — preview và thực tế dùng chung một hàm dựng
   payload, nên không có nguy cơ "preview nói một đằng, LED chiếu một nẻo".
4. **`emergency_hide` là ngoại lệ duy nhất**: không confirm text, không modal, vào được
   từ mọi trạng thái. Khi cần nó thì không có thời gian đọc modal.

---

## 10. Máy trạng thái LED đầy đủ

```
                          CHẾ ĐỘ A — THEO DÕI TIẾN ĐỘ
  standby ──► performance ──► judging_progress ──► performance_completed
     ▲            ▲                                        │
     │            └────────────────────────────────────────┤ tiết mục kế
     │                                                     │
     │                        all_performances_status ◄────┘
     │                                    │
     │                        all_scores_completed
     │                                    │
     │        ╔═══════════════════════════╪═══════════════════════════════╗
     │        ║  7 điều kiện §5 + snapshot + Admin bấm BẮT ĐẦU CÔNG BỐ    ║
     │        ╚═══════════════════════════╪═══════════════════════════════╝
     │                                    ▼
     │                          CHẾ ĐỘ B — CÔNG BỐ KẾT QUẢ
     │        awards_intro
     │             │
     │             ├─► award_reveal ──► scorecard ─┐   ① giải nhỏ 1
     │             ├─► award_reveal ──► scorecard ─┤   ② giải nhỏ 2
     │             ├─► audience_award ─────────────┤   ③ crowd magnet (KHÔNG scorecard)
     │             └─► grand_prize ───► scorecard ─┘   ④ giải cao nhất
     │                                    │
     │                          awards_summary ──► full_ranking
     │                                                  (tùy chọn, không tự hiện)
     │
     └──── emergency_hide ◄──── vào được từ MỌI trạng thái, một cú bấm
```

`full_ranking` **không tự xuất hiện** sau khi trao giải. Là chức năng riêng, Admin bấm
mới có, và chọn được: tất cả tiết mục · chỉ Top 3 · chỉ tiết mục đạt giải.

---

## 11. SGN và HAN — tách tới tận snapshot

Mỗi đầu cầu có bộ riêng hoàn toàn: LED · tiến độ · **Publishing Snapshot** · giải
thưởng · bảng điểm · bảng xếp hạng · `programme_state`.

Ba lớp chống công bố nhầm đầu cầu:

1. **Live Control** luôn hiện đầu cầu đang điều khiển ở kích thước lớn, màu phân biệt
   (SGN cam, HAN cyan), ngay cạnh nút công bố.
2. **Modal xác nhận** bắt buộc ghi rõ bốn dòng: `SGN|HAN` · tên giải · tên tiết mục ·
   tổng điểm. Admin đọc thấy "HAN" khi đang ở SGN thì dừng được.
3. **Tầng DB**: `publish_award()` so `awards.location` với `snapshot.location` và với
   `live_display_state.location`. Lệch một cái là raise exception.

**Ngoại lệ duy nhất — THE AI FAVORITE ACT** (`award_scope = 'global'`, `location = NULL`)
xét cả hai đầu cầu. Nó được phép tồn tại vì nó không hề động tới điểm: người thắng do
Admin gán với `result_basis` bắt buộc, không có truy vấn nào gộp `snapshot_entries` của
hai đầu cầu, và chỉ công bố được khi cả hai `programme_state = 'awards_completed'`.
Lập luận đầy đủ: [03-audience-voting.md §2](03-audience-voting.md).

---

## 12. Bổ sung ma trận kiểm thử

Nối tiếp 27 case ở [01-architecture.md §13](01-architecture.md#13-ma-trận-kiểm-thử--bám-vào-năm-bất-biến):

| # | Kiểm | Cách |
| --- | --- | --- |
| 28 | Tiết mục chấm xong chỉ hiện trạng thái, payload không có key `scores` | snapshot response ở `performance_completed` |
| 29 | CHECK `payload_scores_gated` chặn ghi điểm vào payload ở chế độ A | SQL: ghi trực tiếp → expect exception |
| 30 | LED không tự công bố điểm ở bất kỳ transition nào | unit trên toàn bộ state machine |
| 31 | `all_performances_status` chỉ chứa 6 nhãn hợp lệ | unit + snapshot |
| 32 | Thiếu 1 BGK → `ĐANG CHỜ HOÀN TẤT`, không phải `ĐÃ HOÀN TẤT` | integration |
| 33 | LED không lộ lý do thiếu điểm (tên BGK, mã lỗi) | regex trên payload |
| 34 | `open_awards_mode` bị chặn khi còn blocker trong 7 điều kiện | integration từng blocker một |
| 35 | Tạo snapshot tự khóa toàn bộ điểm của đầu cầu | integration |
| 36 | Snapshot immutable — sửa điểm không đổi `snapshot_entries` | integration |
| 37 | Mở khóa sau snapshot → `is_stale`, LED giữ nguyên nội dung | integration |
| 38 | Công bố với snapshot stale cần tick thừa nhận | unit RPC |
| 39 | Giải cao nhất bị chặn khi còn giải chưa công bố | unit RPC |
| 40 | `show_scorecard` từ chối award `audience` | unit RPC |
| 41 | Chế độ B không tự hiện bảng điểm sau reveal | e2e |
| 42 | `build_award_payload` không ghi gì vào DB | integration, so hash bảng trước/sau |
| 43 | Preview và LED render cùng payload | so sánh output hai bên |
| 44 | Publish award SGN khi LED đang HAN → exception | integration |
| 45 | Modal xác nhận chứa đủ 4 dòng SGN/HAN · giải · tiết mục · điểm | e2e |
| 46 | `anon` SELECT `publishing_snapshots` / `snapshot_entries` / `awards` → từ chối | SQL anon key |
| 47 | `full_ranking` không tự hiện sau `awards_summary` | unit state machine |
| 48 | `emergency_hide` từ cả 14 display_mode | unit, lặp toàn enum |
| 49 | Đồng điểm trong snapshot giữ `is_tied`, không tự chọn người thắng | unit |
| 50 | Snapshot SGN và HAN độc lập, tạo cái này không đụng cái kia | integration |
