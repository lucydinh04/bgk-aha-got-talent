# 04 — Phase 3: Functional Integration

Biến giao diện Phase 2 thành flow chạy thật: BGK chấm → Admin theo dõi → LED cập nhật.
Chưa có Audience Voting và Award Reveal.

---

## 1. Quyết định nền: SQLite + SSE, không phải Supabase

`docs/01-architecture.md` thiết kế cho Supabase. Khi bắt đầu Phase 3, project chưa có
Supabase project, chưa có credential, chưa có dependency nào. Sự kiện SGN diễn ra
07/08/2026 — năm ngày sau.

Chọn **SQLite qua `node:sqlite`** (built-in Node 24, không native module) và **SSE**
thay cho Supabase Realtime, vì:

- chạy được ngay, không phụ thuộc việc ai đó tạo tài khoản và dán key;
- không có native dependency nào phải build;
- toàn bộ hệ thống nằm trong một tiến trình → tính tuần tự của ghi điểm là thứ SQLite
  bảo đảm sẵn, không cần lo race giữa nhiều instance.

**Đánh đổi phải biết:** phải deploy trên một server Node chạy liên tục (VPS, Railway,
Render, Fly). **Không chạy được trên Vercel serverless** — mỗi request một instance thì
file SQLite và bus SSE in-process đều vô nghĩa.

**Đường di trú sang Supabase**, nếu sau này cần: tên bảng và tên cột giữ nguyên bản
Postgres của `01-architecture.md §5`, nên phần lớn truy vấn dùng lại được. Ba chỗ phải
sửa: `src/lib/db/index.ts` (transport), `src/lib/server/events.ts` (`publish` đổi thành
Supabase channel hoặc LISTEN/NOTIFY), `src/lib/server/session.ts` (đổi sang Supabase
Auth). Phần còn lại của app không biết gì về nơi dữ liệu nằm.

---

## 2. Khác biệt schema so với bản thiết kế

| `01-architecture.md §5` | Phase 3 | Vì sao |
| --- | --- | --- |
| `review_status` (6 giá trị) | `review_status` (3: `pending_review`, `approved`, `rejected`) | Sáu bậc duyệt là quy trình chưa ai chạy. Ba bậc đủ để trả lời câu hỏi duy nhất quan trọng: BGK có thấy tiết mục này không. |
| `show_status` (7 giá trị) | tách đôi: `judging_status` + `live_status` | Hai trục đổi vì hai lý do khác nhau. Gộp lại thì mỗi lần Admin bấm nút Live Control lại phải cẩn thận đừng ghi đè tiến độ chấm. |
| `display_mode` 14 giá trị | 9 giá trị | Năm giá trị còn lại đều thuộc nhóm công bố giải. Không có trong CHECK constraint nghĩa là LED không thể vào nhầm chế độ đó, kể cả khi tầng app có bug. |
| `public_progress`, `performance_results` (bảng dẫn xuất + trigger) | tính trực tiếp trong truy vấn | 8 tiết mục × 5 BGK. Bảng dẫn xuất ở quy mô này chỉ thêm một chỗ để lệch dữ liệu. |
| `score_history`, `score_locks`, `audit_log` | chưa có | Không nằm trong yêu cầu Phase 3. |

Ba trục vòng đời của một tiết mục, độc lập nhau:

```
review_status   pending_review → approved → (rejected)     ai ghi: Admin
judging_status  not_started → in_progress → completed      ai ghi: hệ thống (dẫn xuất từ scores)
live_status     not_started → performing → performed       ai ghi: Admin qua Live Control
```

---

## 3. Bất biến và chỗ chúng được giữ

| Bất biến | Giữ ở đâu |
| --- | --- |
| LED không bao giờ thấy điểm | `LedSnapshot` trong `src/lib/server/views.ts` không có trường điểm nào. Một hàm, một file. |
| LED không tự công bố giải | `display_mode` CHECK trong `schema.ts` + `DISPLAY_MODES` trong `live.ts`. Hai lớp. |
| Một BGK một bộ điểm | `unique (judge_id, performance_id)` |
| Không gửi trùng | `idempotency_key` unique + `submitScore` trả về bản ghi cũ khi gặp lại key |
| Đã gửi thì đủ 5 tiêu chí | CHECK `submitted_needs_all_criteria` — ở tầng lưu trữ, không phải tầng app |
| Mỗi đầu cầu một tiết mục đang diễn | unique index `performances_current_uniq` |
| BGK chỉ thấy tiết mục được giao và đã duyệt | `listApproved()` ∩ `assignedPerformanceIds()` trong `judge/[location]/dashboard/page.tsx`; route chấm điểm trả 404 nếu không thoả |
| SGN và HAN không gộp | mọi truy vấn nhận `location` làm tham số đầu; kênh SSE tách theo `location` |
| Sync không đụng điểm / phân công | `SHEET_OWNED` trong `sync.ts` liệt kê đúng 11 cột được ghi |
| Tổng điểm tính một nơi | `computeTotal()` trong `lib/scoring.ts`, dùng chung client và server; server không tin số client gửi |

---

## 4. Realtime

Bus in-process (`src/lib/server/events.ts`) → hai endpoint SSE:

- `GET /api/led/[location]/stream` — công khai, payload không có điểm
- `GET /api/admin/[location]/stream` — có kiểm tra quyền, payload có điểm TB tạm tính

Sáu event: `score_draft_saved`, `score_submitted`, `score_locked`,
`judging_progress_updated`, `performance_judging_completed`, `live_display_state_changed`.

Mỗi event đẩy **toàn bộ snapshot**, không đẩy delta. Payload vài KB, đổi lại không tồn
tại khái niệm "client bị lệch state" — chỉ có state mới nhất hoặc state cũ, không có
state lai.

Mất kết nối: `useSnapshot` không xoá dữ liệu cũ. LED giữ nguyên khung hình cuối; Admin
hiện banner cảnh báo; `EventSource` tự nối lại (`retry: 2000`).

---

## 5. Đã kiểm chứng end-to-end

Chạy thật trên dev server, hai tab LED/Admin + một tab BGK:

1. Admin chọn tiết mục SGN #01 → LED đổi sang "Đang biểu diễn", tab khác, không reload
2. Admin chuyển "BGK đang chấm" → LED hiện `2 / 5 BGK` (từ seed)
3. BGK 03 mở tiết mục → bản nháp 3/5 tiêu chí khôi phục đúng từ DB
4. Điền nốt 2 tiêu chí → autosave "● Đã lưu", tổng `79.20` = công thức trọng số
5. Nháp **không** làm LED tăng số — vẫn `2 / 5`
6. Gửi điểm → LED `3 / 5`
7. BGK 04 gửi, bấm nút xác nhận **3 lần liên tiếp** → đúng **1** dòng trong `scores`
8. BGK 05: điền 4/5 tiêu chí → nút Gửi bị khoá, tổng hiện `—`; điền đủ → gửi được
9. LED `5 / 5`, `judging_status = completed`
10. Admin bấm "Đã chấm xong" → LED "ĐÃ HOÀN TẤT CHẤM ĐIỂM"
11. Payload SSE của LED: `grep` không tìm thấy field nào chứa `score|total|avg|rank`
12. F5 màn LED → giữ nguyên state (server render từ DB)
13. HAN suốt quá trình: `standby`, 0 điểm, không đổi
14. Emergency Hide → màn về KV trắng
15. Sync: đọc sheet thật 8 dòng → xoá 1 record → preview báo "1 mới" → commit →
    record vào `pending_review`, **không** hiện trên LED HAN → Admin HAN duyệt → hiện ra
16. Đăng nhập sai đầu cầu → báo đúng đường; email ngoài allow-list → từ chối

---

## 6. Một bug thật đã bắt được khi test

`/judge/[location]/performance/[code]` dùng chung một route cho mọi tiết mục. Khi BGK
bấm "chấm tiết mục tiếp theo", React **giữ nguyên component** và chỉ đổi props — điểm
của tiết mục trước còn nguyên trong state, và autosave ghi chúng sang tiết mục sau. Test
tạo ra một bản nháp ma trên tiết mục #02 mà BGK chưa từng mở.

Sửa bằng hai lớp:

- `key={performance.registrationCode}` trên `<ScoringForm>` — buộc mount lại sạch
- ref `touched` trong form — autosave từ chối ghi khi BGK chưa thực sự chạm vào gì

---

## 7. Biến môi trường

Không bắt buộc cái nào — hệ thống chạy được với zero config.

| Biến | Mặc định | Dùng khi |
| --- | --- | --- |
| `AHA_DB_PATH` | `<app>/.data/aha.db` | muốn để DB ở volume riêng khi deploy |
| `SESSION_SECRET` | tự sinh, lưu bảng `settings` | nhiều instance, hoặc muốn đá toàn bộ phiên bằng cách đổi secret |
| `GOOGLE_SHEET_ID` | ID sheet Aha Talent 2026 | đổi nguồn dữ liệu |

Lưu ý vận hành: `npm run db:reset` xoá file DB, nhưng dev server đang chạy vẫn giữ file
descriptor tới file cũ đã bị xoá — nó tiếp tục đọc/ghi dữ liệu cũ cho tới khi restart.
**Reset xong thì restart dev server**, nếu không sẽ nhìn thấy state cũ và tưởng là bug.

---

## 8. Chưa làm (đúng phạm vi Phase 3)

Audience Voting · QR Vote · Countdown · Crowd Magnet · Award Reveal ·
Publishing Snapshot · Full Ranking trên LED · The AI Favorite Act.

`/admin/[location]/results` và `/admin/[location]/voting` vẫn là giao diện Phase 2 chạy
trên dữ liệu mẫu — đã gắn banner "Dữ liệu minh hoạ" để không ai đọc nhầm là số thật.

Ba việc vận hành nên làm trước ngày diễn:

1. Thay 8 tài khoản BGK seed bằng email thật (`scripts/seed.mjs`, hoặc thêm màn quản lý BGK).
2. Chốt `performance_order` cho từng đầu cầu ở `/admin/[location]/rundown`.
3. Quyết định nơi deploy — nhắc lại: **không phải Vercel serverless**.
