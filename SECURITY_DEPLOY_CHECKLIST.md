# Rà soát bảo mật trước khi deploy

Kết quả rà soát thật trên codebase, không phải danh sách chung chung.
Không tài liệu nào ở đây chứa giá trị secret.

---

## Đã kiểm, đạt

| Hạng mục | Kết quả |
| --- | --- |
| Credential hard-code trong source | **Không có.** `grep` toàn bộ `src/` cho `password`, `secret=`, `api_key`, `private_key` — 0 kết quả có giá trị thật. |
| Secret trong client bundle | **Không có.** Chỉ 4 biến môi trường được đọc, không biến nào có tiền tố `NEXT_PUBLIC_` ngoài `NEXT_PUBLIC_APP_URL` (là URL công khai). |
| `console.log` trong `src/` | **0.** |
| Log có secret | Không có chỗ nào log token, session, hash cử tri hay điểm chưa công bố. |
| File `.env` bị commit | Không. `.gitignore` chặn `.env*`, chỉ mở lại `.env.example`. |
| Credential JSON | `service-account*.json`, `credentials*.json`, `*.pem`, `*.key` đều bị ignore. |
| SQL injection | Mọi truy vấn dùng prepared statement với tham số. Không có chuỗi SQL nối từ input người dùng. |
| Cookie phiên | `httpOnly`, `sameSite=lax`, `secure` khi production, HMAC-SHA256, hạn 12 giờ. |
| Cookie cử tri | `httpOnly`, DB chỉ lưu SHA-256 của token — không lưu IP, không lưu user agent. |
| Idempotency | Có ở cả chấm điểm (`scores.idempotency_key`) và bình chọn (`audience_ballots.idempotency_key`), cưỡng chế bằng unique constraint. |
| Health endpoint | Không trả secret, đường dẫn DB, hay stack trace. Có token bảo vệ tuỳ chọn. |
| Stack trace ra client | Không. Lỗi nghiệp vụ trả thông báo tiếng Việt đọc được; lỗi hệ thống bị nuốt và chỉ vào log server. |

---

## Phân quyền — đã kiểm chứng bằng test thật

| Luật | Cưỡng chế ở đâu | Đã test |
| --- | --- | --- |
| Chỉ email trong allow-list đăng nhập được | `findByEmail` + `role` check trong `actions/auth.ts` | ✅ email lạ bị từ chối |
| BGK chỉ vào đúng đầu cầu được phân công | `judgeLogin` so `user.location` với slug URL | ✅ BGK HAN vào `/judge/sgn` bị chỉ sang HAN |
| BGK chỉ thấy tiết mục được giao | `listApproved` ∩ `assignedPerformanceIds` | ✅ dashboard chỉ hiện 4 tiết mục đã giao |
| BGK không thấy điểm BGK khác | Không có truy vấn nào trả điểm người khác cho luồng judge | ✅ |
| Route chấm điểm trả 404 nếu không được giao | `isAssigned` → `notFound()` (404 chứ không 403 — không xác nhận sự tồn tại) | ✅ |
| Admin gắn đầu cầu không quản đầu cầu kia | `requireAdmin(location)` | ✅ admin HAN mở `/admin/sgn/progress` bị đá về `/admin/han` |
| LED công khai nhưng không có điểm | `LedSnapshot` không có trường điểm nào | ✅ grep payload SSE: 0 kết quả cho `score\|total\|avg\|rank` |
| Kênh SSE Admin có kiểm tra quyền | `requireAdmin` trong `/api/admin/[location]/stream` | ✅ trả 401 khi chưa đăng nhập |
| Số phiếu không lộ trước khi chốt | `tallyFor` là hàm private, chỉ `createAudienceSnapshot` gọi | ✅ payload shuffle: `award: null`, 0 trường phiếu |
| Winner không lộ trước khi công bố | `buildLedSnapshot` chỉ trả winner khi `published_at` khác null | ✅ |
| Giải cao nhất đi sau cùng | `publishAward` chặn `breakthrough_act` khi còn giải chưa công bố | ✅ báo "Còn 2 giải chưa công bố" |
| Một thiết bị một phiếu | unique `(voting_session_id, voter_id)` | ✅ mở lại trang vote → "đã bình chọn" |
| Phiếu gửi sau hạn bị từ chối | `isAcceptingBallots` so với `closes_at` từ server | ✅ phiên hết hạn → "Bình chọn đã kết thúc" |
| Ballot bất biến | Không có API nào update `audience_ballots`/`audience_votes` | ✅ |

---

## Rủi ro đã chấp nhận có ý thức

**Chống trùng phiếu ở mức thiết bị, không phải mức người.** Cookie `httpOnly`
mỗi trình duyệt một token. Đổi trình duyệt hoặc ẩn danh là bầu lại được.

Chọn vậy vì: giải khán giả trong tiệc sinh nhật không đáng đánh đổi bằng việc
bắt khán giả đăng nhập, và cũng không đáng để hệ thống lưu vết ai bầu cho ai.
Nếu giải này có giá trị vật chất lớn thì cần đổi sang xác thực bằng email nội bộ.

**Không có rate limit trên endpoint bình chọn.** Unique constraint chặn được
phiếu trùng, nhưng không chặn được người cố tình tạo hàng loạt cookie mới.
Với quy mô một hội trường thì chấp nhận được; nếu link vote lọt ra ngoài thì
không.

**Health endpoint mặc định công khai.** Payload chỉ có trạng thái và vài con
số đếm. Đặt `HEALTH_CHECK_TOKEN` nếu muốn đóng lại.

**`/motion/[location]`** là harness xem hiệu ứng, chỉ tồn tại ở development —
production trả 404 bằng `process.env.NODE_ENV` check ngay đầu route.

---

## Việc phải làm trước ngày diễn

- [ ] Đặt `SESSION_SECRET` tường minh (không để app tự sinh)
- [ ] Thay 8 email BGK seed bằng email thật
- [ ] Xoá 3 bản ghi điểm mẫu khỏi production
- [ ] Đặt `HEALTH_CHECK_TOKEN` nếu domain công khai
- [ ] Xác nhận `NEXT_PUBLIC_APP_URL` khớp domain thật (QR phụ thuộc biến này)
- [ ] Chạy `npm run db:backup` ngay trước khi bắt đầu
- [ ] Xác nhận replica = 1 trên nền tảng

---

## Nếu lộ secret

`SESSION_SECRET` bị lộ → đổi giá trị và redeploy. Mọi phiên đang mở bị vô hiệu
ngay lập tức; Admin và BGK đăng nhập lại.

Không có API key nào khác trong hệ thống — không Supabase, không Google service
account, không dịch vụ trả phí nào.
