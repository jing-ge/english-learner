import { getDb } from '../../data/db';
import { settingsRepo } from '../../data/repositories/settingsRepo';
import type {
  CardRecord,
  ReviewLogRecord,
  SettingsRecord,
  WordbookRecord,
} from '../../data/types';

export const BACKUP_VERSION = 2;

export interface BackupPayload {
  version: number;
  exportedAt: number;
  settings: SettingsRecord;
  cards: CardRecord[];
  reviewLogs: ReviewLogRecord[];
  /** 仅导出 user 来源的词书；builtin 由 app 包内置，不需要备份 */
  userWordbooks: WordbookRecord[];
}

export async function exportBackup(now: number = Date.now()): Promise<BackupPayload> {
  const db = getDb();
  const [settings, cards, reviewLogs, userWordbooks] = await Promise.all([
    settingsRepo.get(),
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.wordbooks.where('source').equals('user').toArray(),
  ]);
  return {
    version: BACKUP_VERSION,
    exportedAt: now,
    settings,
    cards,
    reviewLogs,
    userWordbooks,
  };
}

export async function exportBackupJson(now?: number): Promise<string> {
  const payload = await exportBackup(now);
  return JSON.stringify(payload);
}

export interface ImportResult {
  cards: number;
  reviewLogs: number;
  userWordbooks: number;
}

/**
 * 导入备份：覆盖现有 cards/reviewLogs/settings/userWordbooks。
 * 不动 builtin words/wordbooks（这些由 app 自带）。
 *
 * 注意：本实现是"全量替换"语义。未来若要做"合并"模式应单开 API。
 */
export async function importBackup(payload: BackupPayload): Promise<ImportResult> {
  if (payload.version !== BACKUP_VERSION) {
    throw new Error(`不支持的备份版本：${payload.version}（当前 ${BACKUP_VERSION}）`);
  }
  const db = getDb();
  await db.transaction('rw', db.cards, db.reviewLogs, db.settings, db.wordbooks, async () => {
    await db.cards.clear();
    await db.reviewLogs.clear();
    await db.wordbooks.where('source').equals('user').delete();
    if (payload.cards.length) await db.cards.bulkPut(payload.cards);
    if (payload.reviewLogs.length) {
      // 导入时不复用旧自增 id，让 IndexedDB 重新分配
      const stripped = payload.reviewLogs.map((l) => ({ ...l, id: undefined as number | undefined }));
      await db.reviewLogs.bulkAdd(stripped as ReviewLogRecord[]);
    }
    if (payload.userWordbooks.length) await db.wordbooks.bulkPut(payload.userWordbooks);
    await db.settings.put(payload.settings);
    settingsRepo._clearCache();
  });
  return {
    cards: payload.cards.length,
    reviewLogs: payload.reviewLogs.length,
    userWordbooks: payload.userWordbooks.length,
  };
}

export async function importBackupJson(json: string): Promise<ImportResult> {
  const payload = JSON.parse(json) as BackupPayload;
  return importBackup(payload);
}
