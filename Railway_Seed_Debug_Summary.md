# Railway Seed Debug Summary

## Hiện trạng

-   `users = 9`
-   `performances = 0`
-   `judge_assignments = 0`

=\> BGK đăng nhập được nhưng không có tiết mục để chấm.

## Điều đã xác minh

-   GitHub có `data/snapshot.json`.
-   Railway deploy thành công.
-   `npm run db:seed` thất bại với:

```{=html}
<!-- -->
```
    ENOENT: /data/snapshot.json

-   Trong container:

```{=html}
<!-- -->
```
    find / -name snapshot.json

không tìm thấy file.

## Nguyên nhân

`seed.mjs` chỉ đọc duy nhất:

``` js
const SNAPSHOT = resolve(APP, "..", "data", "snapshot.json");
```

Khi chạy trên Railway, volume `/data` che mất dữ liệu trong image nên
seed không tìm được snapshot.

## Cần sửa

### 1. seed.mjs

Đổi:

``` js
import { mkdirSync, readFileSync, rmSync } from "node:fs";
```

thành

``` js
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
```

Thay:

``` js
const SNAPSHOT = resolve(APP, "..", "data", "snapshot.json");
```

bằng:

``` js
const SNAPSHOT_CANDIDATES = [
  process.env.AHA_SNAPSHOT_PATH,
  "/data/snapshot.json",
  "/app/seed-data/snapshot.json",
  resolve(APP, "..", "data", "snapshot.json"),
  resolve(APP, "data", "snapshot.json"),
].filter(Boolean);

const SNAPSHOT = SNAPSHOT_CANDIDATES.find((p) => existsSync(p));

if (!SNAPSHOT) {
  throw new Error(
    `Cannot find snapshot.json. Checked: ${SNAPSHOT_CANDIDATES.join(", ")}`
  );
}
```

### 2. Dockerfile

Đảm bảo runtime image có snapshot:

``` dockerfile
RUN mkdir -p /app/seed-data
COPY --from=build /data/snapshot.json /app/seed-data/snapshot.json
```

## Kết quả mong muốn

Sau deploy:

``` bash
npm run db:seed
```

không còn lỗi ENOENT.

Kiểm tra:

``` sql
SELECT COUNT(*) FROM performances;
SELECT COUNT(*) FROM judge_assignments;
```

Cả hai đều phải \> 0.

## Lưu ý

Không reset database, không mất:

-   users
-   scores
-   votes
-   event data

Chỉ cần seed lại performances và judge_assignments.
