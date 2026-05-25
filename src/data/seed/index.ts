import { wordbookRepo } from '../repositories/wordbookRepo';
import { loadSeedWordbook, type SeedWordbook } from './loader';
import cet4 from './cet4.json';
import kaoyan from './kaoyan.json';
import ielts from './ielts.json';

/**
 * 启动时确保内置词库已加载到 IndexedDB。
 *
 * 版本驱动：每本 seed 独立判断
 *   - 若该词书在 IndexedDB 中不存在，加载一次
 *   - 若存在但 seedVersion 落后，触发重灌（loader 用 patchEmptyFields 不会覆盖
 *     用户的懒加载结果；新增的词条会写入；已删除的词不会清理——保持向前兼容）
 *
 * 后续要扩词书：扩 BUILTIN_SEEDS 数组；改现有 seed 内容时同步递增 JSON 里的 version。
 */
const BUILTIN_SEEDS: SeedWordbook[] = [
  cet4 as SeedWordbook,
  kaoyan as SeedWordbook,
  ielts as SeedWordbook,
];

export async function ensureBuiltinSeeds(): Promise<void> {
  const existing = await wordbookRepo.listBuiltin();
  const byId = new Map(existing.map((b) => [b.id, b]));
  for (const seed of BUILTIN_SEEDS) {
    const cur = byId.get(seed.id);
    const seedVer = seed.version ?? 1;
    const curVer = cur?.seedVersion ?? 0;
    if (!cur || curVer < seedVer) {
      await loadSeedWordbook(seed);
    }
  }
}
