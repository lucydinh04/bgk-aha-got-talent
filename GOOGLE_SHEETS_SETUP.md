# Google Sheets

## Hiện trạng: không cần cấu hình gì

Spreadsheet `1D-kqGPIj6N2_xv0b0PxmYU8dOe2P8wGull7dBZX3yX4` đang share ở chế độ
**anyone with the link**, và bộ đọc dùng endpoint `gviz` công khai của Google.

Nghĩa là: **không service account, không private key, không credential nào cần
đặt để deploy.** Sync chạy được ngay sau khi lên production.

Hai sheet được đọc:

- `AhaTalent - Đăng ký`
- `AhaTalent - Thành viên`

Đổi nguồn bằng biến `GOOGLE_SHEET_ID`.

---

## Google Sheet chỉ được gọi từ server

Toàn bộ đường đi: `actions/sync.ts` (`"use server"`) → `lib/server/sync.ts`
(`import "server-only"`) → `lib/sheet/source.ts`.

Không có component client nào gọi tới `docs.google.com`, và spreadsheet ID
không đi xuống bundle. Package `server-only` làm build fail nếu ai đó lỡ import
chuỗi này vào client component.

---

## Cách sync hoạt động

Hai bước, không bao giờ một bước:

1. **Preview** — đọc sheet, so từng dòng với DB theo `registration_code`, ghi
   kết quả vào `sheet_sync_staging`. Không ghi gì vào `performances`.
2. **Commit** — áp đúng những gì đã staging, ghi `sheet_sync_logs`.

Ba thứ sync **không bao giờ** đụng tới: điểm, phân công BGK, và quyết định của
BTC (thứ tự diễn, tên hiển thị chính thức, trạng thái duyệt).

Chi tiết ràng buộc:

- Tiết mục mới vào ở trạng thái `pending_review` — **không** tự hiện với BGK
- Dòng biến mất khỏi sheet được gắn cờ `source_missing`, **không bị xoá**
- Ô để trống trong sheet **không** xoá giá trị đang có trong DB

### Header lệch cột

Sheet `Đăng ký` có header mô tả layout cũ (24 cột), nhưng từ 29/07/2026 có một
cột thời lượng thứ hai được chèn vào giữa mà header không cập nhật. Các dòng
mới lệch +1 từ index 8 trở đi.

Bộ normalize **định vị theo nội dung, không theo header**: cột email là mỏ neo
(chỉ đúng một cột khớp email regex), telegram là phương án hai. Chi tiết ở
`docs/00-data-audit.md`.

Đừng viết lại theo cách khác — đây là thứ đã hỏng một lần rồi.

---

## Khi nào cần service account

Chỉ khi BTC siết quyền share sheet (bỏ "anyone with the link"). Lúc đó:

1. Google Cloud Console → tạo project
2. **APIs & Services → Library** → bật **Google Sheets API**
3. **Credentials → Create Credentials → Service Account**
4. Vào service account vừa tạo → tab **Keys** → **Add Key → JSON** → tải về
5. Copy `client_email` trong file JSON
6. Mở Google Sheet → **Share** → dán email đó → quyền **Viewer**
7. Đặt hai biến môi trường:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
8. **Không commit file JSON.** `.gitignore` đã chặn `service-account*.json` và
   `credentials*.json`, nhưng đừng đặt nó trong repo ngay từ đầu.

### Xử lý xuống dòng của private key

Private key có ký tự xuống dòng thật. Khi dán vào biến môi trường chúng thành
`\n` hai ký tự. Code phải khôi phục:

```ts
const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
```

Đây là nguyên nhân số một của lỗi "invalid signature" khi dùng service account.

### Chỗ cần sửa

Thay thân hàm `fetchSheet` trong `app/src/lib/sheet/source.ts`. Phần còn lại
của file — normalize, dò lệch cột, đối chiếu thành viên — không cần đổi một dòng.

Bắt buộc chạy trên **Node runtime**, không phải Edge: thư viện JWT của Google
cần `node:crypto`. Các route liên quan đã có `export const runtime = "nodejs"`.

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| `Không đọc được sheet (HTTP 403)` | Sheet đã bị đổi sang riêng tư | Share lại "anyone with the link", hoặc chuyển sang service account |
| `Phản hồi từ Google không đúng định dạng` | gviz trả HTML đăng nhập thay vì JSON — cũng là do sheet riêng tư | Như trên |
| `invalid_grant` / `invalid signature` | Private key mất xuống dòng | Áp `.replace(/\\n/g, "\n")` |
| Preview báo `error` ở vài dòng | Dòng thiếu mã đăng ký, hoặc đầu cầu không phải SGN/HAN | Sửa trong sheet rồi preview lại — sync không import dòng lỗi |
| Sync xong nhưng BGK không thấy tiết mục | Tiết mục mới ở `pending_review` | Vào `/admin/performances` bấm **Duyệt** |
