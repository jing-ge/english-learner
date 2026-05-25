/**
 * 平台 TTS：三级兜底链
 *   1. Free Dictionary 提供的 audioUrl（最准，但覆盖率约 40%）→ playAudio(url)
 *   2. 有道真人发音 youdaoTtsUrl(word, accent)（覆盖率几乎 100%）→ playAudio(url)
 *   3. 浏览器 SpeechSynthesis（合成音，离线可用，最差兜底）→ speak(word)
 *
 * 调用方一般用 audioCache.playAudio(url, { text, accent })，里面会自动回落到 speak()。
 * 这里只导出原子能力。
 */

/**
 * 有道词典 TTS 端点（公开未鉴权，dict.youdao.com 多年稳定）。
 *   - type=1 英式发音, type=2 美式发音
 *   - 多词短语用空格连接即可（有道会做合成）
 */
export function youdaoTtsUrl(word: string, accent: 'us' | 'uk' = 'us'): string {
  const type = accent === 'uk' ? 1 : 2;
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
}

/** 浏览器 SpeechSynthesis 兜底（合成音）。 */
export function speak(text: string, accent: 'us' | 'uk' = 'us'): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = accent === 'uk' ? 'en-GB' : 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // 静默失败：发音是辅助功能，不应阻塞学习
  }
}
