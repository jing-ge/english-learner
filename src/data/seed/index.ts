import { wordbookRepo } from '../repositories/wordbookRepo';
import { loadSeedWordbook, type SeedWordbook } from './loader';
import cet4 from './cet4.json';
import kaoyan from './kaoyan.json';
import ielts from './ielts.json';

/**
 * 启动时确保内置词库已加载到 IndexedDB。
 * 只在 wordbooks 表为空时执行，避免覆盖用户后续自定义。
 *
 * 后续要加新词书：扩这个数组 + 准备对应 JSON。
 */
const BUILTIN_SEEDS: SeedWordbook[] = [
  cet4 as SeedWordbook,
  kaoyan as SeedWordbook,
  ielts as SeedWordbook,
];

export async function ensureBuiltinSeeds(): Promise<void> {
  const existing = await wordbookRepo.listBuiltin();
  if (existing.length > 0) return;
  for (const seed of BUILTIN_SEEDS) {
    await loadSeedWordbook(seed);
  }
}
