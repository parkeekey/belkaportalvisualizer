import { CustomFlavorEntry, AromaFamily, TasteProfile } from './types';

const STORAGE_KEY = 'belka.customFlavors';

export function loadCustomFlavors(): CustomFlavorEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveCustomFlavors(flavors: CustomFlavorEntry[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(flavors)); } catch { /* ignore */ }
}

export function createCustomFlavor(
  label: string,
  emoji: string,
  family: AromaFamily,
  taste: TasteProfile,
  description: string,
  createdBy: 'user' | 'ai' = 'user',
  subgroup?: string,
): CustomFlavorEntry {
  const now = new Date().toISOString();
  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return { id, emoji, label, family, subgroup, taste, description, createdBy, createdAt: now, updatedAt: now };
}

export function updateCustomFlavor(
  flavors: CustomFlavorEntry[],
  id: string,
  updates: Partial<Omit<CustomFlavorEntry, 'id' | 'createdAt' | 'createdBy'>>,
): CustomFlavorEntry[] {
  return flavors.map(f =>
    f.id === id ? { ...f, ...updates, updatedAt: new Date().toISOString() } : f
  );
}

export function deleteCustomFlavor(flavors: CustomFlavorEntry[], id: string): CustomFlavorEntry[] {
  return flavors.filter(f => f.id !== id);
}
