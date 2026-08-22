import { describe, expect, it } from 'vitest';
import {
  calculateCellSeeding,
  calculateDilution,
  calculateRnaLoadingBatch,
  calculateTubeDistribution,
  createQpcrPlateLayout,
  summarizeQpcrPlateUsage,
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

describe('calculateRnaLoadingBatch', () => {
  it('uses the 10 μl system when every sample fits', () => {
    expect(calculateRnaLoadingBatch([200, 160])).toEqual({
      systemVolume: 10,
      samples: [
        { rnaVolume: 5, gdnaCleanMixVolume: 2, waterVolume: 3, totalVolume: 10 },
        { rnaVolume: 6.25, gdnaCleanMixVolume: 2, waterVolume: 1.75, totalVolume: 10 },
      ],
      hasOverflow: false,
    });
  });

  it('switches every sample to 16 μl when any sample needs the larger system', () => {
    expect(calculateRnaLoadingBatch([200, 100])).toEqual({
      systemVolume: 16,
      samples: [
        { rnaVolume: 5, gdnaCleanMixVolume: 2, waterVolume: 9, totalVolume: 16 },
        { rnaVolume: 10, gdnaCleanMixVolume: 2, waterVolume: 4, totalVolume: 16 },
      ],
      hasOverflow: false,
    });
  });

  it('marks overflow only after the unified 16 μl system is insufficient', () => {
    expect(calculateRnaLoadingBatch([200, 50])).toEqual({
      systemVolume: 16,
      samples: [
        { rnaVolume: 5, gdnaCleanMixVolume: 2, waterVolume: 9, totalVolume: 16 },
        null,
      ],
      hasOverflow: true,
    });
  });
});

describe('createQpcrPlateLayout', () => {
  it('balances target primers across plates and repeats the reference primer', () => {
    const layout = createQpcrPlateLayout(
      'GAPDH',
      ['Gene 1', 'Gene 2', 'Gene 3', 'Gene 4'],
      ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'NTC'],
      3,
    );

    expect(layout).toHaveLength(2);
    expect(layout?.[0].primers).toEqual(['GAPDH', 'Gene 1', 'Gene 2']);
    expect(layout?.[1].primers).toEqual(['GAPDH', 'Gene 3', 'Gene 4']);
    expect(layout?.every((plate) => plate.wells.length === 63)).toBe(true);
    expect(layout?.every((plate) => plate.primers[0] === 'GAPDH')).toBe(true);
    layout?.forEach((plate) => {
      plate.primers.forEach((primer) => {
        expect(plate.wells.filter((well) => well.primer === primer && well.isNtc)).toHaveLength(3);
      });
    });
  });

  it('keeps one primer per row and balances samples across its rows', () => {
    const layout = createQpcrPlateLayout(
      'GAPDH',
      ['Gene 1'],
      ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'NTC'],
      3,
    );
    const firstPlate = layout?.[0];

    expect(firstPlate?.wells.filter((well) => well.well.startsWith('A')).every((well) => well.primer === 'GAPDH')).toBe(true);
    expect(firstPlate?.wells.filter((well) => well.well.startsWith('B')).every((well) => well.primer === 'GAPDH')).toBe(true);
    expect(firstPlate?.wells.filter((well) => well.well.startsWith('A') && !well.isNtc)).toHaveLength(9);
    expect(firstPlate?.wells.filter((well) => well.well.startsWith('B'))).toHaveLength(9);
    expect(firstPlate?.wells.filter((well) => well.isNtc && well.primer === 'GAPDH').map((well) => well.well)).toEqual(['A10', 'A11', 'A12']);
  });

  it('places NTC groups left-to-right in a shared overflow row when sample rows are full', () => {
    const layout = createQpcrPlateLayout(
      'GAPDH',
      ['Gene 1'],
      ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'NTC'],
      3,
    );
    const ntcWells = layout?.[0].wells.filter((well) => well.isNtc);

    expect(ntcWells?.map((well) => well.well)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5', 'E6']);
    expect(ntcWells?.map((well) => well.primer)).toEqual(['GAPDH', 'GAPDH', 'GAPDH', 'Gene 1', 'Gene 1', 'Gene 1']);
  });
});

describe('summarizeQpcrPlateUsage', () => {
  it('counts unique complete plate assignments and always includes one NTC', () => {
    expect(summarizeQpcrPlateUsage([
      { primer: 'GAPDH', sample: 'S1' },
      { primer: 'GAPDH', sample: 'S1' },
      { primer: 'Gene 1', sample: 'S2' },
      { primer: 'Gene 1', sample: 'NTC' },
      { primer: 'Gene 2' },
    ])).toEqual({ primerCount: 2, sampleCount: 3 });
  });

  it('does not add NTC before any complete assignment exists', () => {
    expect(summarizeQpcrPlateUsage([{ primer: 'GAPDH' }])).toEqual({
      primerCount: 0,
      sampleCount: 0,
    });
  });
});

describe('calculateTubeDistribution', () => {
  it('matches the three-stage example in the source PDF', () => {
    const result = calculateTubeDistribution(3, 7, 3, 1, true, false);

    expect(result?.theoreticalCommonReactions).toBe(84);
    expect(result?.commonPoolReactions).toBe(90);
    expect(result?.reactionsPerPrimerTube).toBe(28);
    expect(result?.commonPool.sybr).toBe(450);
    expect(result?.commonPool.water).toBeCloseTo(198);
    expect(result?.perPrimerTube.commonAliquot).toBeCloseTo(201.6);
    expect(result?.perPrimerTube.forwardPrimer).toBeCloseTo(11.2);
    expect(result?.perSamplePrimerTube.total).toBe(40);
    expect(result?.perSamplePrimerTube.remaining).toBe(10);
  });

  it('links rounded primer tubes back to the common pool', () => {
    const result = calculateTubeDistribution(3, 7, 3, 1, true, true);

    expect(result?.reactionsPerPrimerTube).toBe(30);
    expect(result?.commonPoolReactions).toBe(90);
    expect(result?.perPrimerTube.commonAliquot).toBe(216);
    expect(result?.perPrimerTube.forwardPrimer).toBe(12);
    expect(result?.perPrimerTube.reversePrimer).toBe(12);
    expect(result?.perPrimerTube.total).toBe(240);
    expect(result?.perPrimerTube.remainingAfterDistribution).toBe(16);
  });
});
