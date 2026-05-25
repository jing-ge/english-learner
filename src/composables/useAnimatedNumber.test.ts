import { describe, it, expect, vi, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { useAnimatedNumber } from './useAnimatedNumber';

// 用 mount 包一下 composable，确保 onBeforeUnmount 等生命周期 hook 有上下文
function host(target: ReturnType<typeof ref<number>>, opts?: { duration?: number; startFromZero?: boolean }) {
  return mount({
    setup() {
      const display = useAnimatedNumber(target as any, opts);
      return { display };
    },
    template: '<div>{{ display }}</div>',
  });
}

describe('useAnimatedNumber', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('startFromZero=true 时初始显示为 0', () => {
    const t = ref(100);
    const w = host(t, { duration: 0 });
    // duration=0 触发同步赋值，最终值就是目标
    expect(w.vm.display).toBe(100);
    w.unmount();
  });

  it('duration=0 直接同步到目标值', async () => {
    const t = ref(50);
    const w = host(t, { duration: 0 });
    expect(w.vm.display).toBe(50);
    t.value = 80;
    await nextTick();
    expect(w.vm.display).toBe(80);
    w.unmount();
  });

  it('startFromZero=false 不从 0 起步', () => {
    const t = ref(42);
    const w = host(t, { duration: 0, startFromZero: false });
    expect(w.vm.display).toBe(42);
    w.unmount();
  });

  it('rAF 模式下从初始 0 渐进到目标值', async () => {
    // 拦截 performance.now / requestAnimationFrame 模拟时间推进
    let now = 0;
    const rafs: Array<(t: number) => void> = [];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafs.push(cb);
      return rafs.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const t = ref(100);
    const w = host(t, { duration: 100 });
    // 第一帧排队中：display 还没更新
    expect(w.vm.display).toBe(0);

    // 推进到一半
    now = 50;
    rafs.shift()?.(now);
    expect(w.vm.display).toBeGreaterThan(0);
    expect(w.vm.display).toBeLessThan(100);

    // 推进到结束
    now = 200;
    while (rafs.length) rafs.shift()?.(now);
    expect(w.vm.display).toBe(100);
    w.unmount();
  });
});
