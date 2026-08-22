import { describe, expect, it } from 'vitest';
import {
  calculateCellSeeding,
  calculateDilution,
  calculateQpcrMix,
  calculateRnaLoading,
  calculateTubeDistribution,
  createQpcrPlateLayout,
} from './calculations';

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

describe('calculateRnaLoading', () => {
  it('calculates a 10 μl gDNA-clean system from a 1 μg RNA target', () => {
    expect(calculateRnaLoading(200, 10)).toEqual({
      rnaVolume: 5,
      gdnaCleanMixVolume: 2,
      waterVolume: 3,
      totalVolume: 10,
    });
  });

  it('rejects a sample volume that cannot fit in the selected system', () => {
    expect(calculateRnaLoading(100, 10)).toBeNull();
  });
});

describe('calculateQpcrMix', () => {
  it('scales the controlled 10 μl qPCR recipe', () => {
    expect(calculateQpcrMix(4)).toEqual({
      reactions: 4,
      sybr: 20,
      forwardPrimer: 1.6,
      reversePrimer: 1.6,
      water: 8.8,
      cdna: 8,
      total: 40,
    });
  });
});

describe('createQpcrPlateLayout', () => {
  it('creates a second plate and repeats the reference primer on every plate', () => {
    const layout = createQpcrPlateLayout(
      'GAPDH',
      ['Gene 1', 'Gene 2', 'Gene 3', 'Gene 4'],
      ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'NTC'],
      3,
    );

    expect(layout).toHaveLength(2);
    expect(layout?.[0].primers).toEqual(['GAPDH', 'Gene 1', 'Gene 2', 'Gene 3']);
    expect(layout?.[0].wells).toHaveLength(84);
    expect(layout?.[1].primers).toEqual(['GAPDH', 'Gene 4']);
    expect(layout?.[1].wells).toHaveLength(42);
    expect(layout?.every((plate) => plate.primers[0] === 'GAPDH')).toBe(true);
  });
});

describe('calculateTubeDistribution', () => {
  it('matches the three-stage example in the source PDF', () => {
    const result = calculateTubeDistribution(3, 7, 3, 1, 90);

    expect(result?.theoreticalCommonReactions).toBe(84);
    expect(result?.commonPool.sybr).toBe(450);
    expect(result?.commonPool.water).toBeCloseTo(198);
    expect(result?.perPrimerTube.commonAliquot).toBeCloseTo(201.6);
    expect(result?.perPrimerTube.forwardPrimer).toBeCloseTo(11.2);
    expect(result?.perSamplePrimerTube.total).toBe(40);
    expect(result?.perSamplePrimerTube.remaining).toBe(10);
  });
});
