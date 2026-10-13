import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readSaved, writeSaved } from './storage';
import { baselineSample } from '../data/samples';
let contents: string | null = null;
beforeEach(() => {
  contents = null;
  vi.stubGlobal('localStorage', {
    getItem: () => contents,
    setItem: (_key: string, value: string) => {
      contents = value;
    },
  });
});
describe('versioned local library', () => {
  it('roundtrips valid plans', () => {
    const item = {
      id: 'one',
      input: baselineSample,
      name: 'Orders',
      source: 'Captured',
      savedAt: '2026-10-12',
    };
    writeSaved([item]);
    expect(readSaved()).toEqual([item]);
  });
  it('recovers from malformed storage and rejects malformed plans', () => {
    contents = '{bad';
    expect(readSaved()).toEqual([]);
    contents = JSON.stringify([
      { id: 'one', input: '{}', name: 'Bad', source: 'unknown', savedAt: '2026-10-12' },
      { id: 1 },
    ]);
    expect(readSaved()).toEqual([]);
  });
  it('reports quota or denied storage errors', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('Quota');
      },
    });
    expect(() => writeSaved([])).toThrow('unavailable or full');
  });
});
