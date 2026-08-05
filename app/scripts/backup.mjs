#!/usr/bin/env node
/**
 * Sao lưu database.
 *
 *   npm run db:backup                 # ghi ra ./backups/aha-<timestamp>.db
 *   AHA_DB_PATH=/data/aha.db npm run db:backup
 *
 * Dùng API `backup()` của node:sqlite chứ không copy file bằng tay: DB đang
 * chạy ở chế độ WAL, nên copy file .db thô trong lúc có người ghi sẽ ra một
 * bản sao thiếu phần nằm trong -wal. `backup()` chụp một ảnh nhất quán ngay cả
 * khi chương trình đang diễn.
 *
 * CHẠY TRƯỚC MỖI MIGRATION và trước mỗi lần deploy có đụng dữ liệu.
 */

import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const DB_PATH = process.env.AHA_DB_PATH ?? join(APP, ".data", "aha.db");
const OUT_DIR = process.env.AHA_BACKUP_DIR ?? join(APP, "backups");

if (!existsSync(DB_PATH)) {
  console.error(`✖ Không tìm thấy database: ${DB_PATH}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

// Timestamp an toàn cho tên file trên mọi hệ điều hành.
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const target = join(OUT_DIR, `aha-${stamp}.db`);

const source = new DatabaseSync(DB_PATH, { readOnly: true });

try {
  await backup(source, target);
  const size = (statSync(target).size / 1024).toFixed(0);
  const version = source.prepare("pragma user_version").get().user_version;

  const count = (t) => {
    try {
      return source.prepare(`select count(*) as n from ${t}`).get().n;
    } catch {
      return "—";
    }
  };

  console.log(`
Đã sao lưu
  nguồn        ${DB_PATH}
  đích         ${target}
  kích thước   ${size} KB
  schema       v${version}

Nội dung
  tiết mục     ${count("performances")}
  người dùng   ${count("users")}
  điểm         ${count("scores")}
  phiếu bầu    ${count("audience_ballots")}
  giải đã công bố ${
    (() => {
      try {
        return source
          .prepare("select count(*) as n from awards where published_at is not null")
          .get().n;
      } catch {
        return "—";
      }
    })()
  }

Khôi phục: dừng app, chép file đích đè lên ${DB_PATH}, xoá -wal và -shm cạnh nó, khởi động lại.
`);
} catch (err) {
  console.error(`✖ Sao lưu thất bại: ${err.message}`);
  process.exitCode = 1;
} finally {
  source.close();
}
