# Bàn giao deploy — Aha Got Talent 2026

Tài liệu này đưa bạn từ code trên máy tới một hệ thống chạy được trong đêm diễn.

---

## 0. Đọc trước: vì sao KHÔNG phải Vercel

Hệ thống này chạy trên **một tiến trình Node liên tục**, không phải serverless.
Hai lý do, cả hai đều là kiến trúc chứ không phải cấu hình:

**Database là một file SQLite.** Vercel serverless có filesystem ephemeral và
mỗi request có thể rơi vào một instance khác. Điểm BGK vừa gửi sẽ biến mất.

**Realtime là SSE in-process.** Server action ghi điểm và kết nối SSE của màn
LED phải nằm trong cùng một tiến trình để `publish` tới được `subscribe`. Trên
serverless chúng ở hai instance khác nhau — **LED sẽ không bao giờ cập nhật**.

Muốn deploy lên Vercel thì phải đổi database sang Postgres/Supabase và đổi SSE
sang Supabase Realtime. Đó là viết lại tầng dữ liệu, không phải chỉnh cấu hình.

> **`numReplicas` phải luôn bằng 1.** Hai instance = hai file SQLite khác nhau
> và hai kênh SSE không thấy nhau. Đây là ràng buộc cứng, không phải tối ưu chi phí.

---

## STEP 1 — Chuẩn bị GitHub

```bash
cd "/Users/dvmnhi/Sinh nhật"
git status
```

Kiểm tra không có secret và không có file rác lọt vào:

```bash
git status --porcelain | grep -iE '\.env($|\.local)|service-account|credentials|\.pem$|\.key$' || echo "sạch — không có credential"
```

```bash
find . -path ./node_modules -prune -o -type f -size +2M -print | grep -v node_modules
```

Kỳ vọng: chỉ có asset KV trong `app/public/images/` (lớn nhất ~1.3 MB) và hai
file `.png` ở thư mục gốc (`Panel 1.png`, `panel 2.png` — ảnh tham khảo thiết
kế, xoá được nếu không cần).

```bash
git add .
git commit -m "Aha Got Talent 2026: judging, voting, awards, LED motion, deploy config"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

---

## STEP 2 — Tạo service

### Railway

1. New Project → Deploy from GitHub repo
2. Railway đọc `railway.json`, dùng `Dockerfile` ở thư mục gốc
3. **Variables** → thêm biến ở STEP 3
4. **Settings → Volumes** → New Volume, mount path `/data`
5. **Settings → Deploy** → Replicas = **1**

### Render

1. New → Blueprint → chọn repo (Render đọc `render.yaml`)
2. Điền các biến `sync: false` khi được hỏi
3. Disk `/data` 1 GB đã khai trong blueprint — kiểm tra lại là đã có
4. Plan phải là **Starter trở lên**; free tier không mount disk được

### Cấu hình build (nếu nền tảng hỏi)

| Mục | Giá trị |
| --- | --- |
| Root directory | thư mục gốc repo (Dockerfile nằm ở đó) |
| Build | `docker build` (tự động) |
| Start | `npm run start` (đã có trong Dockerfile) |
| Node | 24 (`.nvmrc` và `engines`) |
| Health check | `/api/health` |
| Port | nền tảng tự cấp qua `PORT` |

---

## STEP 3 — Environment variables

| Biến | Bắt buộc | Secret | Mô tả |
| --- | --- | --- | --- |
| `AHA_DB_PATH` | ✅ | — | `/data/aha.db`. Phải trỏ vào volume đã mount. |
| `NEXT_PUBLIC_APP_URL` | ✅ | — | `https://<domain>`. Dùng in QR bình chọn. Sai là QR vô dụng. |
| `SESSION_SECRET` | ⬜ | ✅ | `openssl rand -hex 32`. Không đặt thì app tự sinh và lưu trong DB. |
| `GOOGLE_SHEET_ID` | ⬜ | — | Mặc định đã là sheet Aha Talent 2026. |
| `HEALTH_CHECK_TOKEN` | ⬜ | ✅ | Đặt thì `/api/health` yêu cầu token. |
| `NODE_ENV` | ✅ | — | `production` (Dockerfile đã đặt). |

Không có biến nào chứa credential Google hay Supabase — hệ thống không dùng cả hai.

---

## STEP 4 — Database

Không có bước migration thủ công: **app tự chạy migration lúc khởi động**
(`pragma user_version`, xem `DEPLOY_DATABASE.md`).

Sau lần deploy đầu, nạp dữ liệu ban đầu:

```bash
# Railway
railway run npm run db:seed

# Render → Shell của service
npm run db:seed
```

Lệnh này idempotent — chạy lại không tạo trùng. Nó nạp 8 tiết mục từ
`data/snapshot.json`, tạo tài khoản Admin/BGK và trạng thái LED mặc định.

**Trước ngày diễn, thay 8 tài khoản BGK seed bằng email thật** — sửa mảng
`USERS` trong `app/scripts/seed.mjs` rồi chạy lại `db:seed`.

---

## STEP 5 — Google Sheet

Sheet đang share ở chế độ *anyone with the link*, và bộ đọc dùng endpoint
`gviz` công khai, nên **không cần service account, không cần credential**.

Kiểm tra sau khi deploy: vào `/admin/sync` → *Kiểm tra dữ liệu mới*. Đọc được
8 dòng là xong.

Nếu BTC siết quyền share, xem `GOOGLE_SHEETS_SETUP.md` để chuyển sang Sheets
API v4 + service account.

---

## STEP 6 — Preview / staging

Tạo một service thứ hai từ cùng repo, khác volume:

- `AHA_DB_PATH=/data/aha.db` (volume riêng của service đó)
- `NEXT_PUBLIC_APP_URL` = domain của preview
- Dữ liệu staging riêng — **không bao giờ trỏ chung volume với production**

Bình chọn ở staging không ảnh hưởng production vì hai file DB tách rời hoàn toàn.

---

## STEP 7 — Production

1. Deploy nhánh `main`
2. Kiểm tra `/api/health` trả `"status": "ok"` và `"database": "connected"`
3. Gắn domain
4. **Cập nhật `NEXT_PUBLIC_APP_URL` theo domain thật rồi redeploy** — QR bình
   chọn được render từ biến này, đổi domain mà không redeploy là QR trỏ sai
5. Chạy `PRODUCTION_REHEARSAL.md` từ đầu tới cuối

---

## STEP 8 — Smoke test sau deploy

```bash
BASE=https://<domain>
for p in / /live/sgn /live/han /vote/sgn /vote/han /api/health /judge/sgn /judge/han /admin/login; do
  printf '%-22s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")"
done
```

Tất cả phải trả `200`. Route Admin và Judge dashboard trả `307` khi chưa đăng
nhập — đúng như thiết kế.

Sau đó test thủ công:

| Việc | Kỳ vọng |
| --- | --- |
| `/admin/login` với `admin.sgn@ahamove.com` | vào `/admin/sgn` |
| `/live/sgn` trên máy chiếu | KV chuyển động, icon A đúng chiều |
| Live Control → *Đang biểu diễn* | LED đổi trong ~1s, không reload |
| BGK gửi điểm | LED tăng `n/5`, không hiện điểm |
| Mở bình chọn → quét QR bằng điện thoại | trang vote mở đúng domain |
| Emergency Hide | LED trắng KV dưới 200 ms |

---

## Vận hành trong đêm diễn

**Backup trước khi bắt đầu và giữa giờ nghỉ:**

```bash
npm run db:backup
```

**Nếu app crash:** nền tảng tự restart, SQLite phục hồi từ WAL, LED tự nối lại
SSE và giữ khung hình cuối trong lúc chờ. Không mất điểm đã gửi.

**Nếu LED đứng hình:** F5 màn LED. State đọc lại từ DB, không mất gì.

**Nếu cần giấu gấp:** nút *Ẩn toàn bộ dữ liệu trên LED* ở Live Control.

---

## Giới hạn đã biết

- **Một replica.** Không scale ngang được. Với 8 tiết mục, 8 BGK và vài trăm
  khán giả bình chọn thì một tiến trình Node thừa sức.
- **Chống trùng phiếu ở mức thiết bị** (cookie), không phải mức người. Đổi
  trình duyệt là bầu được lần nữa. Phù hợp cho giải vui trong tiệc; không phù
  hợp nếu kết quả có giá trị vật chất lớn.
- **Backup thủ công.** Không có snapshot tự động — chạy `db:backup` theo mốc.
