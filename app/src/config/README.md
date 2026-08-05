# Asset campaign — quy tắc sử dụng

Nguồn duy nhất của đường dẫn asset: [`assets.ts`](./assets.ts).
Không hard-code `/images/...` ở bất kỳ component nào — có test grep chặn việc này.

## Asset và vai trò

| File | Kích thước | Tỉ lệ | Dùng ở |
| --- | --- | --- | --- |
| `ahamove-logo.svg` | 520 × 89.78 | 5.79 : 1 | Sidebar, judge login, header vote, trang chấm |
| `cover-fb-internal-3.png` | 3000 × 1322 | 2.27 : 1 | Hero Admin, dải header, trang điều hướng |
| `kv-internal-3.png` | 1920 × 1072 | ≈16 : 9 | LED, preview Live Control |
| `kv-internal-3-fb.png` | 1072 × 1072 | 1 : 1 | Judge login, vote success, card sidebar |
| `anniversary-11-3d.png` | 909 × 758 | 1.2 : 1 | Badge 11 năm (đã đổi tên từ `11_3D (1).png`) |

## Ba điều đã học khi ghép asset vào giao diện

**1. Ba KV đều đã in sẵn logo Ahamove và badge 11 năm.**
Đặt thêm `CampaignLogo` hay `AnniversaryBadge` lên trên KV sẽ thành hai logo chồng
nhau. Vì vậy LED **không** có top bar riêng — logo trên màn LED là logo trong artwork.

**2. `kv-internal-3.png` đã là 16:9 nên `object-position` vô tác dụng trên khung LED.**
Cover một ảnh 1.79 vào khung 1.778 gần như không cắt gì, nên không thể "neo xuống dải
light trail" để né headline. Giải pháp là overlay `stage`: dải tối dồn xuống đáy, chữ
của hệ thống nằm gọn trong đó, phần trên giữ nguyên headline và icon A của artwork.

**3. KV vuông cover sang khung hẹp hơn 1:1 sẽ cắt mất chân icon A.**
Ở màn hình 9:16 chỉ còn thấy 56% bề ngang. Vì vậy `KVBackground variant="portrait"`
mặc định `object-contain`, và nơi nào cần `cover` thì khung phải là vuông.

## Cấm tuyệt đối

- `scaleX(-1)` · `rotateY` · `transform: matrix(-…)` · class `flip` / `mirror`
  trên bất kỳ asset nào. Icon A phải luôn đúng chiều.
- Đổi màu logo, tách icon khỏi wordmark, kéo dãn một chiều.
- Overlay đen 80–90% phủ đều — làm mất sạch cam và xanh của KV.
- Đặt QR lên nền KV. QR luôn nằm trên panel trắng đặc, nếu không máy quét đọc sai.
- Tự tạo icon A mới, hoặc dùng ảnh ngẫu nhiên từ internet khi asset lỗi.
  Fallback là gradient navy trong `FALLBACK_GRADIENT`.

## Kiểm tra nhanh

```bash
grep -rniE "scalex\(-|rotatey|-scale-x|transform: *matrix" src/   # phải rỗng
grep -rn "/images/" src/ | grep -v "config/assets.ts"             # phải rỗng
```
