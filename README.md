# AHA GOT TALENT 2026 — Hệ thống chấm điểm

Sinh nhật Ahamove 11 tuổi · *Unlock Your Next Move*
Chủ đề dự thi: **Future Self — Phiên bản bứt phá**

| | SGN | HAN |
| --- | --- | --- |
| Ngày diễn | 07/08/2026 | 14/08/2026 |
| Giải thưởng | 4 (có Crowd Magnet) | 2 (Nhất, Nhì) |
| Tiết mục | 4 | 4 |
| Thành viên | 22 | 15 |
| LED | `/live/sgn` | `/live/han` |

**Dữ liệu SGN và HAN tách hoàn toàn** — hai bảng chấm, hai bảng xếp hạng, hai
link LED, hai kênh realtime. Không truy vấn nào gộp hai đầu cầu.

---

## Chức năng

- **Chấm điểm** — BGK chấm 5 tiêu chí có trọng số, autosave, lưu nháp cục bộ khi mất mạng, chống gửi trùng bằng idempotency key
- **Theo dõi tiến độ** — Admin xem ma trận BGK × tiết mục cập nhật realtime
- **Màn LED** — 18 trạng thái, motion cinematic, đọc state thật từ database
- **Bình chọn khán giả** — QR, đếm ngược theo giờ server, một thiết bị một phiếu
- **Công bố giải** — snapshot khoá kết quả, shuffle không lộ winner, cao trào tăng dần theo giải
- **Đồng bộ Google Sheet** — preview trước khi ghi, không bao giờ đụng điểm hay phân công

---

## Kiến trúc

Một tiến trình Node chạy liên tục. **Không phải serverless.**

```
Next.js 16 (App Router)
├── SQLite qua node:sqlite     ← built-in Node 24, không native dependency
├── SSE in-process             ← realtime; Admin ghi DB, LED nghe DB
├── Session ký HMAC trong cookie
└── Google Sheets qua gviz     ← chỉ gọi từ server
```

Không dùng Supabase, không dùng thư viện motion, không dùng ORM. Lý do và
đường di trú ghi ở `docs/04-phase3.md`.

**Ràng buộc triển khai:** phải chạy **một replica duy nhất**. Hai instance là
hai file SQLite và hai kênh SSE không thấy nhau.

---

## Tech stack

Next.js 16.2 · React 19.2 · TypeScript strict · Tailwind 4 · `node:sqlite` ·
CSS animation thuần · Node 24

---

## Route

| Route | Quyền | Mô tả |
| --- | --- | --- |
| `/` | công khai | Trang chủ |
| `/live/sgn` `/live/han` | công khai | Màn LED 16:9. `?debug=1` hiện chỉ báo kết nối |
| `/vote/sgn` `/vote/han` | công khai | Lá phiếu khán giả |
| `/api/health` | công khai* | Health check. `HEALTH_CHECK_TOKEN` để đóng lại |
| `/api/led/[location]/stream` | công khai | SSE cho LED — payload không có điểm |
| `/api/admin/[location]/stream` | Admin | SSE cho Admin — có điểm TB tạm tính |
| `/judge/sgn` `/judge/han` | công khai | Đăng nhập BGK |
| `/judge/[loc]/dashboard` | BGK | Danh sách tiết mục được giao |
| `/judge/[loc]/performance/[code]` | BGK | Màn chấm điểm |
| `/judge/[loc]/result/[code]` | BGK | Xem lại điểm của chính mình |
| `/admin/login` | công khai | Đăng nhập Admin |
| `/admin/dashboard` | Admin | Tổng quan hai đầu cầu |
| `/admin/[loc]` | Admin | Dashboard đầu cầu |
| `/admin/[loc]/progress` | Admin | Tiến độ chấm realtime |
| `/admin/[loc]/live-control` | Admin | Điều khiển LED, bình chọn, công bố giải |
| `/admin/[loc]/rundown` | Admin | Thứ tự biểu diễn |
| `/admin/[loc]/results` `/voting` | Admin | Giao diện Phase 2, gắn nhãn dữ liệu mẫu |
| `/admin/performances` | Admin | Duyệt tiết mục |
| `/admin/judges` | Admin | Danh sách BGK |
| `/admin/sync` | Admin | Đồng bộ Google Sheet |
| `/motion/[location]` | dev only | Harness xem hiệu ứng; production trả 404 |

---

## Bố cục

```
Dockerfile · render.yaml · railway.json   cấu hình deploy
DEPLOYMENT.md                             bàn giao deploy
DEPLOY_DATABASE.md                        migration, backup, khôi phục
SECURITY_DEPLOY_CHECKLIST.md              rà soát bảo mật
PRODUCTION_REHEARSAL.md                   tổng duyệt 52 mục
GOOGLE_SHEETS_SETUP.md                    nguồn dữ liệu đăng ký
docs/                                     thiết kế sản phẩm và kiến trúc
data/snapshot.json                        kết quả normalize Google Sheet
app/
  src/app/                                route
  src/components/campaign/                asset campaign
  src/components/led/                     state màn LED
  src/components/motion/                  hệ motion
  src/lib/db/                             schema + migration
  src/lib/server/                         nghiệp vụ, chỉ chạy server
  src/lib/sheet/                          đọc + normalize Google Sheet
  scripts/seed.mjs · backup.mjs
```

---

## Chạy local

```bash
npm --prefix app install
npm --prefix app run db:reset
npm --prefix app run dev
```

Tài khoản kiểm thử (chỉ email, không mật khẩu):

| Vai trò | Email | Vào ở |
| --- | --- | --- |
| Admin SGN | `admin.sgn@ahamove.com` | `/admin/login` |
| Admin HAN | `admin.han@ahamove.com` | `/admin/login` |
| BGK SGN (5) | `bgk1.sgn@ahamove.com` … `bgk5.sgn@ahamove.com` | `/judge/sgn` |
| BGK HAN (3) | `bgk1.han@ahamove.com` … `bgk3.han@ahamove.com` | `/judge/han` |

> `db:reset` xoá file DB nhưng app đang chạy vẫn giữ file cũ — **restart dev
> server sau khi reset.**

---

## Biến môi trường

Xem `app/.env.example`. Năm biến, không biến nào bắt buộc ở local:

`AHA_DB_PATH` · `NEXT_PUBLIC_APP_URL` · `SESSION_SECRET` · `GOOGLE_SHEET_ID` ·
`HEALTH_CHECK_TOKEN`

Ở production, `NEXT_PUBLIC_APP_URL` là bắt buộc — thiếu thì app cố ý crash lúc
khởi động thay vì in ra QR trỏ về localhost.

---

## Kiểm tra

```bash
npm --prefix app run verify     # typecheck + lint + build
npm --prefix app run db:backup  # sao lưu DB
```

Chưa có unit test tự động. Toàn bộ luồng được kiểm chứng thủ công theo
`PRODUCTION_REHEARSAL.md`.

---

## Deploy

`DEPLOYMENT.md`. Tóm tắt: Railway hoặc Render, Docker, volume mount `/data`,
một replica.

---

## Các luồng

**BGK** — đăng nhập bằng email trong allow-list → dashboard chỉ hiện tiết mục
được giao và đã duyệt → chấm 5 tiêu chí, autosave debounce 900 ms → gửi chính
thức → xem lại. Không thấy điểm BGK khác, không thấy ranking.

**Admin** — sync Google Sheet → duyệt tiết mục → theo dõi tiến độ realtime →
điều khiển LED → mở bình chọn → chốt kết quả → công bố giải.

**LED** — đọc `live_display_state` qua SSE. Mất kết nối thì giữ khung hình
cuối và tự nối lại. F5 không mất state. Không bao giờ hiện điểm, ranking, hay
tên BGK còn thiếu.

**Bình chọn** — Admin mở phiên với thời lượng đặt trước → LED hiện QR và đếm
ngược → khán giả quét, chọn tối đa N tiết mục, gửi một lần → LED chỉ hiện số
người tham gia → Admin đóng và chốt snapshot.

**Công bố giải** — Publishing Snapshot khoá toàn bộ điểm → shuffle (không lộ
winner) → công bố từng giải theo thứ tự → giải cao nhất bị chặn tới khi mọi
giải khác đã công bố → scorecard → tổng kết.

---

## Bất biến

Những điều này được cưỡng chế ở tầng dữ liệu, không phải tầng giao diện:

| Luật | Cưỡng chế ở đâu |
| --- | --- |
| LED không bao giờ thấy điểm | `LedSnapshot` không có trường điểm |
| LED không tự công bố giải | CHECK `display_mode` + allow-list trong `live.ts` |
| Winner chỉ ra LED sau khi công bố | `published_at` là điều kiện duy nhất |
| Số phiếu không lộ trước khi chốt | `tallyFor` là hàm private |
| Một BGK một bộ điểm | `unique (judge_id, performance_id)` |
| Đã gửi thì đủ 5 tiêu chí | CHECK `submitted_needs_all_criteria` |
| Một thiết bị một phiếu | `unique (voting_session_id, voter_id)` |
| SGN và HAN không gộp | mọi truy vấn nhận `location` làm tham số đầu |

---

## Xử lý sự cố

| Triệu chứng | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| LED trống, chỉ có KV | `display_mode` cần tiết mục mà Admin chưa chọn | Chọn tiết mục ở Live Control |
| LED không cập nhật | SSE đứt | F5 màn LED; kiểm tra `/api/health` |
| Điểm biến mất sau deploy | Volume chưa mount | Đặt `AHA_DB_PATH` trỏ vào volume |
| QR trỏ về localhost | `NEXT_PUBLIC_APP_URL` sai | Sửa biến rồi **redeploy** |
| BGK không thấy tiết mục | Tiết mục ở `pending_review` | `/admin/performances` → Duyệt |
| Sync báo 403 | Sheet bị đổi sang riêng tư | `GOOGLE_SHEETS_SETUP.md` |
| Admin không mở được đầu cầu kia | Đúng thiết kế | Dùng tài khoản Admin của đầu cầu đó |
| Không công bố được giải Nhất | Còn giải khác chưa công bố | Đúng thiết kế — công bố các giải trước |
| Hệ thống từ chối chọn winner | Đồng điểm hoặc đồng phiếu | Đúng thiết kế — BTC quyết |

---

## Tài liệu thiết kế

| File | Nội dung |
| --- | --- |
| `docs/00-data-audit.md` | Kiểm tra dữ liệu nguồn + cách xử lý header lệch cột |
| `docs/01-architecture.md` | Bản thiết kế gốc (viết cho Supabase) |
| `docs/02-led-awards.md` | Hai chế độ LED · trình tự công bố giải |
| `docs/03-audience-voting.md` | Cơ cấu giải · chống gian lận · chịu tải |
| `docs/04-phase3.md` | Vì sao chọn SQLite + SSE, khác biệt so với bản thiết kế |

---

## Giới hạn đã biết

- **Một replica.** Không scale ngang. Đủ cho quy mô sự kiện này.
- **Chống trùng phiếu ở mức thiết bị**, không phải mức người. Đổi trình duyệt
  là bầu lại được.
- **Không rate limit** trên endpoint bình chọn.
- **Backup thủ công** — chạy `db:backup` theo mốc.
- **Không có unit test tự động.**
- `/admin/[loc]/results` và `/voting` vẫn là giao diện Phase 2 chạy dữ liệu mẫu,
  đã gắn banner cảnh báo. Số liệu thật xem ở `/admin/[loc]/progress` và Live Control.
- **Một phiên đăng nhập cho mỗi trình duyệt** — Admin và BGK không đăng nhập
  đồng thời trên cùng máy.
