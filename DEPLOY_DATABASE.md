# Database — migration, backup, khôi phục

SQLite qua `node:sqlite` (built-in Node 24, không native dependency). Một file,
chế độ WAL, nằm ở `AHA_DB_PATH`.

---

## Cách migration chạy

**Tự động lúc khởi động app.** Không có lệnh thủ công, không có công cụ ngoài.

`app/src/lib/db/index.ts` làm ba việc theo thứ tự, mỗi lần mở kết nối:

1. `exec(SCHEMA_SQL)` — baseline v1, toàn bộ là `create table if not exists`
2. Đọc `pragma user_version`; nếu là 0 thì đặt thành 1
3. Chạy từng migration trong `migrations.ts` có `version` lớn hơn số hiện tại

Mỗi bước nằm trong một transaction. Hỏng giữa chừng → rollback, `user_version`
không tăng, lần khởi động sau chạy lại từ đầu bước đó. Không có trạng thái nửa vời.

`pragma user_version` là bộ đếm SQLite dành sẵn cho việc này. Nó nằm trong
chính file DB nên không bao giờ lệch với dữ liệu.

---

## Các phiên bản

| Version | Tên | Rủi ro | Nội dung |
| --- | --- | --- | --- |
| 1 | baseline (`schema.ts`) | — | `users`, `performances`, `judge_assignments`, `scores`, `live_display_state`, `settings`, `sheet_sync_logs`, `sheet_sync_staging` |
| 2 | `audience_voting_and_awards` | ⚠ **dựng lại bảng** | Thêm `voting_sessions`, `voting_session_performances`, `audience_voters`, `audience_ballots`, `audience_votes`, `result_snapshots`, `awards`. Dựng lại `live_display_state` để mở rộng CHECK `display_mode`. |

### Vì sao v2 phải dựng lại bảng

SQLite không `ALTER` được CHECK constraint. Mở thêm chế độ công bố giải cho
`display_mode` buộc phải: tạo bảng mới → copy dữ liệu → drop bảng cũ → rename.

Migration làm đúng quy trình chuẩn của SQLite:

- `pragma foreign_keys = OFF` trước transaction (không đổi được bên trong)
- copy toàn bộ hàng sang bảng mới
- `pragma foreign_key_check` sau khi commit — còn tham chiếu gãy là ném lỗi ngay

**Đã kiểm chứng trên DB có dữ liệu thật:** 2 dòng `live_display_state` giữ
nguyên cả `display_mode`, 3 bản ghi điểm nguyên vẹn, 0 FK gãy.

---

## Backup

**Chạy trước mỗi lần deploy có đụng dữ liệu, và trước mỗi buổi diễn.**

```bash
npm run db:backup
```

Ghi ra `backups/aha-<timestamp>.db` kèm bản tóm tắt số bản ghi.

Dùng API `backup()` của node:sqlite chứ không `cp` file: DB chạy WAL, copy thô
trong lúc có người ghi sẽ ra bản sao thiếu phần nằm trong `-wal`.

Trên Railway/Render, tải file về máy:

```bash
railway run cat backups/aha-<timestamp>.db > ./aha-backup.db
```

---

## Khôi phục

```bash
# 1. Dừng app (nền tảng → Suspend / Stop)
# 2. Đè file backup lên
cp aha-backup.db /data/aha.db
# 3. Xoá WAL và shared-memory cũ — nếu để lại, SQLite sẽ replay chúng lên
#    file vừa khôi phục và bạn mất đúng thứ vừa khôi phục
rm -f /data/aha.db-wal /data/aha.db-shm
# 4. Khởi động lại
```

---

## Rollback migration

**Không có rollback tự động.** Migration chỉ đi tới.

Muốn lùi v2 → v1: khôi phục backup chụp trước khi chạy v2. Đó là lý do bước
backup không phải tuỳ chọn.

---

## Dữ liệu ban đầu cho production

```bash
npm run db:seed
```

Idempotent. Nạp:

- 8 tiết mục từ `data/snapshot.json` (SGN 4 / HAN 4), trạng thái `approved`
- 2 Admin, 8 BGK (5 SGN / 3 HAN)
- Phân công: mỗi BGK chấm toàn bộ tiết mục đầu cầu mình
- `live_display_state` mặc định `standby` cho cả hai đầu cầu
- 3 bản ghi điểm mẫu trên tiết mục SGN #01 (draft / submitted / locked)

**Trước ngày diễn phải làm hai việc:**

1. Thay 8 email BGK seed bằng email thật trong `app/scripts/seed.mjs`
2. Xoá 3 bản ghi điểm mẫu:

```sql
delete from scores;
update performances set judging_status = 'not_started';
```

`npm run db:reset` xoá sạch rồi seed lại — **chỉ dùng ở local**, không bao giờ
chạy trên production sau khi đã có điểm thật.

> Lưu ý: `db:reset` xoá file DB, nhưng app đang chạy vẫn giữ file descriptor cũ
> và tiếp tục đọc dữ liệu cũ. **Reset xong phải restart app.**

---

## Ràng buộc quan trọng

| Bảng | Ràng buộc | Bảo vệ điều gì |
| --- | --- | --- |
| `scores` | `unique (judge_id, performance_id)` | Một BGK một bộ điểm cho mỗi tiết mục |
| `scores` | `unique (idempotency_key)` | Gửi lại không tạo bản ghi thứ hai |
| `scores` | CHECK `submitted_needs_all_criteria` | Đã gửi thì phải đủ 5 tiêu chí |
| `live_display_state` | `unique (location)` | Một trạng thái LED cho mỗi đầu cầu |
| `live_display_state` | CHECK `display_mode` | LED không vào được chế độ ngoài allow-list |
| `performances` | partial unique `is_current_performance` | Mỗi đầu cầu tối đa một tiết mục đang diễn |
| `performances` | CHECK `code_matches_location` | Mã đăng ký và đầu cầu không lệch nhau |
| `audience_ballots` | `unique (voting_session_id, voter_id)` | Một thiết bị một lá phiếu |
| `audience_votes` | `unique (ballot_id, performance_id)` | Không bầu hai lần cùng một tiết mục |
| `voting_sessions` | partial unique khi `status='open'` | Mỗi đầu cầu tối đa một phiên đang mở |
| `awards` | `unique (location, code)` | Không trùng giải |

## Index

`users(role, location)` · `scores(location, status)` · `scores(performance_id)` ·
`judge_assignments(location)` · `judge_assignments(performance_id)` ·
`performances(location, performance_order)` · `voting_sessions(location, status)` ·
`audience_ballots(voting_session_id)` · `audience_votes(performance_id)` ·
`result_snapshots(location, kind)` · `awards(location, sort_order)`
