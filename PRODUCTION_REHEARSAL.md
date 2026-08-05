# Tổng duyệt trước đêm diễn

Chạy toàn bộ danh sách này trên **môi trường production thật**, với **máy chiếu
thật**, trước ngày diễn ít nhất một hôm.

Cần: 1 laptop Admin · 1 điện thoại đóng vai BGK · 1 điện thoại đóng vai khán
giả · màn LED hoặc máy chiếu.

**Chạy `npm run db:backup` trước khi bắt đầu, và `npm run db:reset` sau khi
xong** để production về trạng thái sạch.

---

## Chuẩn bị

- [ ] `/api/health` trả `"status": "ok"`, `"database": "connected"`
- [ ] Mở `/live/sgn` toàn màn hình trên máy chiếu — KV chuyển động, **icon A đúng chiều**
- [ ] Mở `/admin/sgn/live-control` trên laptop Admin
- [ ] Tắt chế độ ngủ màn hình của máy chiếu

---

## Phần 1 — Dữ liệu và phân công

1. [ ] Đăng nhập `/admin/login` bằng email Admin SGN → vào `/admin/sgn`
2. [ ] `/admin/sync` → *Kiểm tra dữ liệu mới* → đọc được 8 dòng, không lỗi
3. [ ] Nếu có tiết mục mới: *Xác nhận* → vào trạng thái **chờ duyệt**
4. [ ] `/admin/performances` → duyệt tiết mục → chuyển sang **Đã duyệt · BGK thấy**
5. [ ] `/admin/judges` → đủ BGK, đúng đầu cầu, email đúng người thật
6. [ ] Kiểm tra tiết mục chưa duyệt **không** xuất hiện trên LED và trong dashboard BGK

---

## Phần 2 — Chấm điểm

7. [ ] Live Control → chọn tiết mục #01
8. [ ] Bấm **Đang biểu diễn** → LED đổi trong ~1 giây, **không reload**, nền không giật
9. [ ] Bấm **BGK đang chấm** → LED hiện `0/5 BGK đã hoàn tất`
10. [ ] BGK đăng nhập `/judge/sgn` bằng email thật → vào dashboard
11. [ ] BGK mở tiết mục #01, kéo 5 slider → thấy **● Đã lưu**, tổng điểm khớp công thức
12. [ ] Rời trang rồi quay lại → **bản nháp còn nguyên**
13. [ ] LED **vẫn** `0/5` — nháp không tính
14. [ ] BGK bấm Gửi điểm → LED `1/5` trong ~1 giây
15. [ ] Bấm Gửi hai lần liên tiếp → chỉ ghi **một** bản ghi
16. [ ] `/admin/sgn/progress` cập nhật realtime, không F5
17. [ ] Các BGK còn lại gửi → LED chạy tới `5/5`
18. [ ] **Không có điểm nào xuất hiện trên LED** trong suốt quá trình
19. [ ] Live Control → **Đã chấm xong** → LED hiện *ĐÃ HOÀN TẤT CHẤM ĐIỂM*
20. [ ] Lặp cho các tiết mục còn lại (rút gọn được, nhưng ít nhất phải làm đủ 1 vòng)

---

## Phần 3 — Bình chọn khán giả

21. [ ] Live Control → **Tạo phiên bình chọn**, đặt thời lượng thật (ví dụ 180 giây)
22. [ ] **Mở bình chọn** → LED sang màn QR + đếm ngược
23. [ ] **Quét QR bằng điện thoại thật, đứng ở cuối hội trường** — quét được, mở đúng domain
24. [ ] Chọn 2 tiết mục → gửi → màn cảm ơn
25. [ ] Mở lại trang vote trên cùng điện thoại → báo **đã bình chọn**
26. [ ] Số người tham gia trên LED tăng
27. [ ] LED **không** hiện tiết mục nào đang dẫn đầu
28. [ ] Chờ đếm ngược về 00:00 → điện thoại mới quét vào thấy *Bình chọn đã kết thúc*
29. [ ] Live Control → **Đóng bình chọn** → **Xác minh và chốt kết quả**
30. [ ] Nếu báo đồng phiếu: hệ thống **không tự chọn** — BTC quyết, đây là hành vi đúng

---

## Phần 4 — Công bố giải

31. [ ] Live Control → **Tạo Publishing Snapshot** (đọc kỹ cảnh báo: khoá toàn bộ điểm)
32. [ ] Xác nhận điểm đã khoá: BGK mở lại tiết mục cũ → chỉ xem được, không sửa
33. [ ] **Mở màn công bố** → LED hiện màn intro
34. [ ] **Shuffle Crowd Magnet** → card đảo chỗ, có nhịp dừng đọc được tên
35. [ ] **Trong lúc shuffle, LED không lộ winner** (kiểm tra: chưa bấm công bố thì không có tên nào nổi bật)
36. [ ] Công bố *The Creative Pulse* → LED reveal, cường độ motion nhẹ
37. [ ] Công bố *The Spotlight Act* → spotlight sweep
38. [ ] Công bố *The Crowd Magnet* → reveal có confetti
39. [ ] Thử công bố *The Breakthrough Act* khi còn giải chưa công bố → **bị chặn**
40. [ ] Công bố nốt → *The Breakthrough Act* → cao trào lớn nhất
41. [ ] Bấm **bảng điểm** ở một giải do BGK chấm → scorecard hiện từng tiêu chí rồi tổng điểm
42. [ ] **Màn tổng kết** → liệt kê đúng các giải đã công bố

---

## Phần 5 — Sự cố

43. [ ] **Emergency Hide** → LED về KV trắng **dưới 200 ms**
44. [ ] Bấm lại một state → LED quay lại bình thường
45. [ ] **F5 màn LED giữa chương trình** → state giữ nguyên, không mất gì
46. [ ] **Rút mạng máy chiếu 10 giây rồi cắm lại** → LED giữ khung hình cuối, tự nối lại, không nhảy sai state
47. [ ] **Đóng laptop Admin, mở laptop khác, đăng nhập lại** → Live Control hiển thị đúng state đang chiếu
48. [ ] Restart service trên nền tảng → sau khi lên, `/live/sgn` vẫn đúng state, điểm còn nguyên

---

## Phần 6 — Cách ly hai đầu cầu

49. [ ] Suốt toàn bộ bài test trên, mở `/live/han` ở một tab khác
50. [ ] `/live/han` **không đổi gì** — vẫn standby
51. [ ] `/admin/han/progress` — 0 điểm, không ảnh hưởng
52. [ ] Admin SGN mở `/admin/han/live-control` → **bị chặn**

---

## Sau khi tổng duyệt

- [ ] `npm run db:backup` — giữ lại bản ghi buổi duyệt
- [ ] Xoá dữ liệu duyệt khỏi production:

```sql
delete from audience_votes;
delete from audience_ballots;
delete from audience_voters;
delete from voting_sessions;
delete from result_snapshots;
update awards set performance_id = null, snapshot_id = null,
                  published_at = null, published_by = null;
delete from scores;
update performances set judging_status = 'not_started',
                        live_status = 'not_started',
                        is_current_performance = 0;
update live_display_state set display_mode = 'standby',
                              current_performance_id = null,
                              current_award_id = null;
```

- [ ] `/api/health` xanh trở lại
- [ ] `/live/sgn` và `/live/han` về standby
- [ ] `npm run db:backup` lần nữa — đây là mốc sạch để quay về nếu đêm diễn có sự cố
