import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WordCard from './WordCard.vue';
import type { WordRecord } from '@/data/types';

const w: WordRecord = {
  id: 'cet4_apple',
  word: 'apple',
  phonetic: '/ˈæp.əl/',
  translations: [{ pos: 'n.', meaning: '苹果' }],
  examples: [{ en: 'I ate an apple.', zh: '我吃了一个苹果。' }],
  collocations: [],
  wordbooks: ['cet4'],
  exchange: 's:apples',
};

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('WordCard 翻面状态', () => {
  it('revealed=false: flipper 无 .flipped 类', () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: false } });
    const flipper = wrapper.find('.flipper');
    expect(flipper.exists()).toBe(true);
    expect(flipper.classes()).not.toContain('flipped');
  });

  it('revealed=true: flipper 拿到 .flipped 类', () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: true } });
    expect(wrapper.find('.flipper').classes()).toContain('flipped');
  });

  it('两面都渲染（用 backface-visibility 切换显示，不是 v-if）', () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: false } });
    expect(wrapper.find('.face-front').exists()).toBe(true);
    expect(wrapper.find('.face-back').exists()).toBe(true);
    // 翻面前背面也应该渲染（DOM 在），只是 backface-visibility 隐藏
    expect(wrapper.find('.face-back .meaning').text()).toBe('苹果');
  });

  it('revealed 变化时 flipped 类随之变化（同一组件实例，不重挂）', async () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: false } });
    expect(wrapper.find('.flipper').classes()).not.toContain('flipped');
    await wrapper.setProps({ revealed: true });
    expect(wrapper.find('.flipper').classes()).toContain('flipped');
    await wrapper.setProps({ revealed: false });
    expect(wrapper.find('.flipper').classes()).not.toContain('flipped');
  });

  it('正面只展示词/音标/提示，不应有翻译列表', () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: false } });
    const front = wrapper.find('.face-front');
    expect(front.find('.word').text()).toBe('apple');
    expect(front.find('.phonetic').text()).toBe('/ˈæp.əl/');
    expect(front.find('.translations').exists()).toBe(false);
  });

  it('背面包含翻译/例句/变形等揭晓内容', () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: true } });
    const back = wrapper.find('.face-back');
    expect(back.find('.translations').exists()).toBe(true);
    expect(back.find('.examples').exists()).toBe(true);
    expect(back.find('.morph').exists()).toBe(true); // exchange=s:apples → 复数
  });
});

describe('WordCard 评分反馈', () => {
  it('feedback=null 不带任何 fb-* 类', () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: true, feedback: null } });
    const scene = wrapper.find('.card-scene');
    expect(scene.classes()).not.toContain('fb-wrong');
    expect(scene.classes()).not.toContain('fb-right');
    expect(scene.classes()).not.toContain('fb-soft');
  });

  it('feedback="wrong" 加 fb-wrong 类', () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: true, feedback: 'wrong' } });
    expect(wrapper.find('.card-scene').classes()).toContain('fb-wrong');
  });

  it('feedback="right" 加 fb-right 类', () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: true, feedback: 'right' } });
    expect(wrapper.find('.card-scene').classes()).toContain('fb-right');
  });

  it('feedback="soft" 加 fb-soft 类', () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: true, feedback: 'soft' } });
    expect(wrapper.find('.card-scene').classes()).toContain('fb-soft');
  });

  it('feedback 切换到 null 时类被移除', async () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: true, feedback: 'wrong' } });
    expect(wrapper.find('.card-scene').classes()).toContain('fb-wrong');
    await wrapper.setProps({ feedback: null });
    expect(wrapper.find('.card-scene').classes()).not.toContain('fb-wrong');
  });
});

describe('WordCard 滑动手势', () => {
  function pointer(type: string, x: number, y: number, id = 1): PointerEvent {
    return new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true });
  }

  it('未翻面时不响应滑动（不能跳过翻面就评分）', async () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: false } });
    const wrap = wrapper.find('.swipe-wrap').element as HTMLElement;
    wrap.dispatchEvent(pointer('pointerdown', 100, 100));
    wrap.dispatchEvent(pointer('pointermove', -50, 100));
    wrap.dispatchEvent(pointer('pointerup', -50, 100));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('swipe-grade')).toBeUndefined();
  });

  it('翻面后右滑超过阈值触发 grade=2', async () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: true } });
    const wrap = wrapper.find('.swipe-wrap').element as HTMLElement;
    wrap.dispatchEvent(pointer('pointerdown', 100, 100));
    wrap.dispatchEvent(pointer('pointermove', 200, 102));
    wrap.dispatchEvent(pointer('pointerup', 200, 102));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('swipe-grade')?.[0]).toEqual([2]);
  });

  it('翻面后左滑超过阈值触发 grade=0', async () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: true } });
    const wrap = wrapper.find('.swipe-wrap').element as HTMLElement;
    wrap.dispatchEvent(pointer('pointerdown', 200, 100));
    wrap.dispatchEvent(pointer('pointermove', 100, 100));
    wrap.dispatchEvent(pointer('pointerup', 100, 100));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('swipe-grade')?.[0]).toEqual([0]);
  });

  it('未达阈值的横向位移不触发评分', async () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: true } });
    const wrap = wrapper.find('.swipe-wrap').element as HTMLElement;
    wrap.dispatchEvent(pointer('pointerdown', 100, 100));
    wrap.dispatchEvent(pointer('pointermove', 140, 100));
    wrap.dispatchEvent(pointer('pointerup', 140, 100));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('swipe-grade')).toBeUndefined();
  });

  it('纵向主导（滚动）的拖动不触发评分', async () => {
    const wrapper = mount(WordCard, { props: { word: w, card: null, revealed: true } });
    const wrap = wrapper.find('.swipe-wrap').element as HTMLElement;
    wrap.dispatchEvent(pointer('pointerdown', 100, 100));
    // 纵向主导：dy 远大于 dx
    wrap.dispatchEvent(pointer('pointermove', 110, 200));
    wrap.dispatchEvent(pointer('pointermove', 200, 300));
    wrap.dispatchEvent(pointer('pointerup', 200, 300));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('swipe-grade')).toBeUndefined();
  });
});
