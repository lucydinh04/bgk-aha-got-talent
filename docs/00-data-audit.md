# 00 — Data Audit: Google Sheet nguồn

> Kiểm tra thực tế ngày **31/07/2026** trên
> `Aha Talent 2026 — Registration Tracking`
> (`1D-kqGPIj6N2_xv0b0PxmYU8dOe2P8wGull7dBZX3yX4`).
>
> Đọc tài liệu này trước khi viết bất kỳ dòng code sync nào.

---

## 1. Kết quả kết nối

| Sheet | Trạng thái | Dòng dữ liệu |
| --- | --- | --- |
| `AhaTalent - Đăng ký` | Đọc được | 8 |
| `AhaTalent - Thành viên` | Đọc được | 37 |
| `AhaTalent - Dashboard` | Đọc được (chỉ số tổng hợp, **không** dùng làm nguồn) | — |

Spreadsheet đang ở chế độ *anyone with the link*. Hệ thống **không** dựa vào điều
này ở production — xem [§7 architecture](01-architecture.md#7-google-sheet-sync-architecture).

Sau normalize: **8 tiết mục — SGN 4, HAN 4**. Không có dòng nào bị từ chối.

---

## 2. Phát hiện quan trọng: header sheet `Đăng ký` lệch 1 cột

Đây là vấn đề nghiêm trọng nhất và là lý do bộ sync không được parse theo vị trí cột cứng.

### Hiện tượng

Hàng header mô tả **24 cột**, nhưng vùng dữ liệu có **25 cột**. Một cột "thời lượng"
thứ hai đã được chèn vào vị trí **I** ở thời điểm nào đó giữa 28/07 và 29/07/2026,
nhưng **hàng header không được cập nhật theo**.

Bằng chứng — kiểu dữ liệu Google tự suy ra cho từng cột đã "tố" sự lệch này:

```
index 8  label "Người đại diện"      type number   ← phải là string
index 13 label "Tổng số thành viên"  type number   ← thực tế chứa số điện thoại
index 14 label "Danh sách thành viên" type number  ← thực tế chứa số thành viên
index 24 label ""                    type datetime ← "Ngày cập nhật" thật nằm ở đây
```

### Hai layout cùng tồn tại trong một sheet

| | Dòng cũ (gửi ≤ 28/07) | Dòng mới (gửi ≥ 29/07) |
| --- | --- | --- |
| Số dòng | 2 | 6 |
| Cột H `Thời lượng (phút)` | chứa số, ví dụ `4` | chứa `Không áp dụng` |
| Cột I | trống | chứa số phút thật |
| Từ cột I trở đi | khớp header | **lệch +1 so với header** |
| `Người đại diện` | **trống** | có dữ liệu |
| `Ngày cập nhật` | cột X | cột Y |

Cụ thể, cùng một trường nằm ở hai chỗ khác nhau:

```
Bí mật chỉ chờ ngày bật mí!  (23/07, layout cũ)
  H="4"  I=""  J="@Lahale05"      ← J là telegram
REBORN QUEENS — NEW ERA      (29/07, layout mới)
  H="Không áp dụng"  I="4"  J="Trần Thiện Mỹ"   ← J là tên người
```

### Cách xử lý đã triển khai

`scripts/fetch-sheet.mjs` **định vị cột theo nội dung, không theo vị trí**:

1. Tìm cột khớp regex email trong `{11, 12}` → suy ra `offset ∈ {0, 1}`.
2. Không có email thì thử cột telegram (`^@\w{3,}`) trong `{9, 10}`.
3. Vẫn không xác định được → đọc theo layout mới, gắn cảnh báo
   `shape_undetermined` để BTC xem lại. Không bao giờ import ngầm.
4. `duration_minutes` = giá trị số đầu tiên tìm được trong `[H, I]`.

Email là mỏ neo tốt nhất vì trong một dòng chỉ đúng một cột khớp được email regex.

> **Rủi ro còn lại:** nếu BTC chèn/xóa thêm cột nữa, `offset` có thể vượt ngoài
> `{0,1}`. Bộ sync sẽ báo `shape_undetermined` thay vì import sai — nhưng cần
> cập nhật `detectRowShape()`. Đây là đánh đổi có ý thức: **thà chặn còn hơn
> ghi sai dữ liệu chấm điểm.**

### Đề xuất cho BTC

Nên sửa ở gốc, trước ngày 07/08:

- Đặt lại tên cho cột **I** (ví dụ `Thời lượng khác (phút)`), hoặc gộp H và I về một cột duy nhất.
- Bổ sung `Người đại diện` cho 2 dòng cũ (`AHA26-SGN-260723101722-YV2A`, `AHA26-HAN-260728161931-45MW`).
- Từ nay **không chèn/xóa cột giữa bảng**; chỉ thêm cột vào cuối.

Kể cả khi BTC không sửa, hệ thống vẫn chạy đúng — normalizer đã xử lý được cả hai layout.

---

## 3. Sheet `Thành viên` là nguồn sạch hơn — dùng để vá dữ liệu

Sheet này có cấu trúc ổn định 7 cột, một dòng một người, và **có đủ người đại diện
cho cả 8 tiết mục**:

```
Mã đăng ký | Đầu cầu | Tên tiết mục | Vai trò | Họ và tên | Username Telegram | Phòng ban
```

`Vai trò ∈ {Đại diện, Thành viên}` → map thẳng sang `performance_members.is_representative`.

Vì vậy pipeline **backfill** `representative_name`, `representative_telegram`,
`department` từ sheet này khi sheet `Đăng ký` để trống. Nhờ đó 2 dòng thiếu tên đại
diện đã được vá tự động, và mọi field được vá đều ghi lại trong `_meta.backfilled`
để BTC truy vết.

**Đối chiếu số thành viên:** `member_count` khai báo khớp 100% với số dòng thật
trong sheet Thành viên ở cả 8 tiết mục (4, 2, 11, 3, 9, 6, 1, 1). Không có sai lệch.

---

## 4. Dữ liệu thật sau normalize

| Đầu cầu | Tiết mục | Hình thức | Loại hình | Phút | Đại diện | Phòng ban | TV |
| --- | --- | --- | --- | --: | --- | --- | --: |
| SGN | Bí mật chỉ chờ ngày bật mí! | Nhóm | Kịch / Hài / Nhạc kịch | 4 | Lê Thị Hà † | Central Operations | 4 |
| SGN | REBORN QUEENS — NEW ERA | Nhóm | Nhảy / Múa | 4 | Trần Thiện Mỹ | Business Development | 11 |
| SGN | ĐẢO BÔNG HẬU | Nhóm | Kịch / Hài / Nhạc kịch | 5 | Trần Mỹ Vân | Supply Operations | 6 |
| SGN | Chuyển nhịp | Cá nhân | Nhảy / Múa | 3 | Nguyễn Phi Yến | Platform | 1 |
| HAN | From A to AI | Cặp đôi | Ca hát | 4 | Trần Thị Tuyết † | Central Operations | 2 |
| HAN | Nộp sau nhé | Nhóm | Ca hát | 5 | Lê Hoàng Nhất Thống | Business Development | 3 |
| HAN | Mười Một Năm — Một Chặng Đường | Nhóm | Nhảy / Múa | 5 | Cao Nhân Quyền | Central Operations | 9 |
| HAN | Xe đạp | Cá nhân | Ca hát | 4 | Chu Minh Khánh | Business Development | 1 |

† tên được backfill từ sheet `Thành viên`.

### Lệch so với brief

Brief ghi 4 tiết mục "không có thời lượng". Dữ liệu thật **có đủ thời lượng cho cả 8**
— giá trị nằm ở cột I nên bị bỏ sót khi đọc theo header:

| Tiết mục | Brief | Thực tế |
| --- | --- | --: |
| REBORN QUEENS — NEW ERA | — | 4 phút |
| ĐẢO BÔNG HẬU | — | 5 phút |
| Nộp sau nhé | — | 5 phút |
| Mười Một Năm — Một Chặng Đường | — | 5 phút |

Tổng thời lượng: **SGN 16 phút · HAN 18 phút** — số này dùng cho rundown ở `/admin/[loc]/rundown`.

---

## 5. Dữ liệu chưa hoàn thiện — không phải lỗi

Đúng theo §23 của brief, các giá trị sau được coi là *"chưa có thông tin"*, không phải lỗi hệ thống:

```
Không áp dụng · Nộp sau nhé · Bí mật · Chưa có · N/A · -
```

Normalizer chuyển chúng thành `null` và tiết mục được gắn badge
**Thông tin chưa hoàn thiện**. Hiện có:

- `Bí mật chỉ chờ ngày bật mí!` — mô tả ý tưởng và điểm nhấn đều là tên tiết mục; chưa có trang phục, chưa có AI/công nghệ.
- `Nộp sau nhé` — mô tả ý tưởng = `Bí mật`; ý tưởng trang phục = `Bí mật`.
- 3 tiết mục chưa có `Điểm nhấn chuyển mình` hoặc `Ý tưởng trang phục`.

**Ảnh hưởng tới BGK:** trang chấm điểm phải xử lý tốt trường rỗng — hiển thị
*"Chưa có thông tin"* thay vì khoảng trắng, và **không** chặn việc chấm.
Tiết mục thiếu thông tin vẫn được chấm bình thường; đây là dữ liệu tham khảo, không phải tiêu chí.

---

## 6. Điều tuyệt đối không được làm

- ❌ Không dùng số dòng Google Sheet làm `performance_order` (§25 brief).
- ❌ Không dùng `Tên tiết mục` làm khóa — dùng `registration_code`. Riêng `Nộp sau nhé` là ví dụ sống cho việc tên có thể đổi.
- ❌ Không ghi điểm chấm về Google Sheet. Sheet là nguồn *đăng ký*, không phải database chấm điểm.
- ❌ Không gọi Google Sheets API từ frontend.
- ❌ Không để `Email`, `Số điện thoại`, `Telegram`, `Ghi chú BTC`, `Mô tả nhu cầu hỗ trợ` đi xuống payload của Judge hoặc LED (§35 brief).
