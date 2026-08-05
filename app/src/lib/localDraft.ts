"use client";

import type { CriterionKey } from "./data";

/**
 * Bản nháp lưu trên máy BGK.
 *
 * Lý do tồn tại: sóng trong hội trường không đáng tin. Điểm phải nằm ở đâu đó
 * ngoài RAM ngay khi BGK vừa kéo slider, trước cả khi server biết chuyện gì
 * đang xảy ra — nếu không, một lần mất mạng cộng một lần khoá màn hình là mất
 * trắng phần chấm.
 *
 * IndexedDB là chính, localStorage là dự phòng. Không dùng thư viện: chỉ cần
 * một object store với key là mã tiết mục, và một dependency ít đi là một thứ
 * ít hỏng hơn vào đêm diễn.
 */

const DB_NAME = "aha-talent";
const STORE = "drafts";
const VERSION = 1;

export interface LocalDraft {
  code: string;
  values: Partial<Record<CriterionKey, number>>;
  highlight: string;
  improvement: string;
  privateNote: string;
  /** Đã đẩy lên server thành công chưa. false = còn nợ đồng bộ. */
  synced: boolean;
  /** Sinh một lần cho mỗi lần bấm Gửi, giữ lại để replay không tạo bản ghi thứ hai. */
  idempotencyKey?: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "code" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      // Chế độ riêng tư của một số trình duyệt chặn IndexedDB — rơi về localStorage.
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

const lsKey = (code: string) => `aha-draft:${code}`;

export async function saveLocalDraft(draft: LocalDraft): Promise<void> {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(draft);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    return;
  }
  try {
    localStorage.setItem(lsKey(draft.code), JSON.stringify(draft));
  } catch {
    // Hết quota hoặc bị chặn: đành chịu, server vẫn là nguồn chính.
  }
}

export async function readLocalDraft(code: string): Promise<LocalDraft | null> {
  const db = await openDb();
  if (db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(code);
        req.onsuccess = () => resolve((req.result as LocalDraft) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  try {
    const raw = localStorage.getItem(lsKey(code));
    return raw ? (JSON.parse(raw) as LocalDraft) : null;
  } catch {
    return null;
  }
}

export async function clearLocalDraft(code: string): Promise<void> {
  const db = await openDb();
  if (db) {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(code);
    } catch {
      /* không sao — bản nháp thừa vô hại */
    }
    return;
  }
  try {
    localStorage.removeItem(lsKey(code));
  } catch {
    /* như trên */
  }
}

/** Khoá chống gửi trùng. `randomUUID` không có trên http:// nên có đường lui. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
