import { ref, watch, onBeforeUnmount, type Ref } from 'vue';

/**
 * 数字滚动动画 composable
 * 把目标值用 rAF 缓动到当前显示值，目标变化时打断重启。
 *
 * @param target 目标值响应式源
 * @param opts.duration 动画时长 ms
 * @param opts.startFromZero 首次显示时是否从 0 开始（默认 true）
 */
export function useAnimatedNumber(
  target: Ref<number>,
  opts: { duration?: number; startFromZero?: boolean } = {},
) {
  const duration = opts.duration ?? 700;
  const startFromZero = opts.startFromZero ?? true;
  const display = ref(startFromZero ? 0 : target.value);
  let raf: number | null = null;

  // prefers-reduced-motion: 直接同步赋值，不动画
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function animateTo(to: number) {
    if (raf !== null) cancelAnimationFrame(raf);
    if (reduce || duration <= 0) {
      display.value = to;
      return;
    }
    const from = display.value;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      display.value = from + (to - from) * eased;
      if (t < 1) raf = requestAnimationFrame(tick);
      else raf = null;
    };
    raf = requestAnimationFrame(tick);
  }

  watch(
    target,
    (v) => {
      animateTo(v);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    if (raf !== null) cancelAnimationFrame(raf);
  });

  return display;
}
