import { describe, expect, it } from 'vitest';
import { calculateCellSeeding, calculateDilution } from './calculations';

describe('calculateDilution', () => {
  it('calculates stock and diluent volumes', () => {
    expect(calculateDilution(1000, 10, 50)).toEqual({
      stockVolume: 0.5,
      diluentVolume: 49.5,
    });
  });

  it('rejects impossible dilution', () => {
    expect(calculateDilution(10, 100, 50)).toBeNull();
  });
});

describe('calculateCellSeeding', () => {
  it('includes the configured excess', () => {
    const result = calculateCellSeeding(100000, 6, 1000000, 2, 10);
    expect(result?.totalCells).toBe(660000);
    expect(result?.suspensionVolume).toBeCloseTo(0.66);
    expect(result?.mediumVolume).toBeCloseTo(12.54);
    expect(result?.totalVolume).toBeCloseTo(13.2);
  });
});
