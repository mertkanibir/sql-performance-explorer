import { parsePlan } from './plan';
export interface SavedAnalysis {
  id: string;
  name: string;
  input: string;
  source: string;
  savedAt: string;
}
const KEY = 'planscope:analyses:v1';
export function readSaved(): SavedAnalysis[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data
      .filter((item): item is SavedAnalysis => {
        if (
          !item ||
          typeof item !== 'object' ||
          ['id', 'name', 'input', 'source', 'savedAt'].some((key) => typeof item[key] !== 'string')
        )
          return false;
        try {
          parsePlan(item.input);
          return true;
        } catch {
          return false;
        }
      })
      .slice(0, 20);
  } catch {
    return [];
  }
}
export function writeSaved(items: SavedAnalysis[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 20)));
  } catch {
    throw new Error('Browser storage is unavailable or full. Export your report instead.');
  }
}
