import { defineStore } from 'pinia';
import { ref } from 'vue';
import { settingsRepo } from '../data/repositories/settingsRepo';
import { DEFAULT_SETTINGS, type SettingsRecord } from '../data/types';

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<SettingsRecord>({ ...DEFAULT_SETTINGS });
  const loaded = ref(false);

  async function load(): Promise<void> {
    settings.value = await settingsRepo.get();
    loaded.value = true;
  }

  async function update(patch: Partial<Omit<SettingsRecord, 'id'>>): Promise<void> {
    settings.value = await settingsRepo.update(patch);
  }

  return { settings, loaded, load, update };
});
