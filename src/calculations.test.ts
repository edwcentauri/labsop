import { describe, expect, it } from 'vitest';
import {
  calculateRnaLoadingBatch,
  calculateTubeDistribution,
  calculateWesternBlotBufferRecipe,
  calculateWesternBlotDenaturationRecipe,
  calculateWesternBlotGelRecipe,
  calculateWesternBlotLysisRecipe,
  calculateWesternBlotUsedWells,
  createQpcrPlateLayout,
  createWesternBlotLaneLabels,
  groupWesternBlotPlateRepeats,
  resolveWesternBlotRepeatSourceIndex,
  summarizeQpcrPlateUsage,
  westernBlotMolecularWeightPosition,
  westernBlotReferencedMolecularWeightPosition,
  westernBlotReferencedPositionMolecularWeight,
} from './calculations';

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
    expect(summarizeQpcrPlateUsage(layout?.flatMap((plate) => plate.wells) ?? [])).toEqual({
      primerGroupCount: 6,
      sampleCount: 7,
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
  it('counts explicit automatic-plate groups without using primer names', () => {
    expect(summarizeQpcrPlateUsage([
      { primerGroupId: 'plate-1-primer-1', primer: '相同名称', sample: 'S1' },
      { primerGroupId: 'plate-1-primer-1', primer: '相同名称', sample: 'S2' },
      { primerGroupId: 'plate-1-primer-2', primer: '相同名称', sample: 'S1' },
      { primerGroupId: 'plate-2-primer-1', primer: '相同名称', sample: 'NTC' },
    ])).toEqual({ primerGroupCount: 3, sampleCount: 3 });
  });

  it('does not add NTC before any complete assignment exists', () => {
    expect(summarizeQpcrPlateUsage([{ primer: 'GAPDH' }])).toEqual({
      primerGroupCount: 0,
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

describe('Western blot calculations', () => {
  it('calculates the lysis recipe from sample count and explicit excess volume', () => {
    expect(calculateWesternBlotLysisRecipe(6, 200)).toEqual({
      tissueVolume: 2400,
      excessVolume: 200,
      totalVolume: 2600,
      proteaseInhibitor: 52,
      phosphataseInhibitor: 52,
      ripa: 2496,
    });
    expect(calculateWesternBlotLysisRecipe(0, 200)).toBeNull();
    expect(calculateWesternBlotLysisRecipe(2, -1)).toBeNull();
  });

  it('calculates the per-tube denaturation recipe from the selected total volume', () => {
    expect(calculateWesternBlotDenaturationRecipe(300)?.perTube).toEqual({
      protein: 240,
      loadingBuffer: 60,
      total: 300,
    });
    expect(calculateWesternBlotDenaturationRecipe(500)?.perTube).toEqual({
      protein: 400,
      loadingBuffer: 100,
      total: 500,
    });
    expect(calculateWesternBlotDenaturationRecipe(0)).toBeNull();
    expect(calculateWesternBlotDenaturationRecipe(Number.NaN)).toBeNull();
  });

  it('uses the approved recipe for the selected thickness and plate count', () => {
    expect(calculateWesternBlotGelRecipe(4, 0.75)?.batch).toEqual({
      resolving: { solution: 8, buffer: 8, accelerator: 160 },
      stacking: { solution: 2, buffer: 2, accelerator: 40 },
    });
    expect(calculateWesternBlotGelRecipe(2, 1.5)?.perPlate).toEqual({
      resolving: { solution: 4, buffer: 4, accelerator: 80 },
      stacking: { solution: 1, buffer: 1, accelerator: 20 },
    });
    expect(calculateWesternBlotGelRecipe(4, 1)?.pourPerPlate).toEqual({
      resolving: 5.4,
      stacking: 1.5,
    });
  });

  it('scales buffer powders and liquids for two or four plates', () => {
    expect(calculateWesternBlotBufferRecipe(4)).toEqual({
      powderPacks: 2,
      running: { waterBeforeCalibration: 1600, finalVolume: 2000 },
      transfer: { ethanol: 400, waterBeforeCalibration: 1200, finalVolume: 2000 },
    });
    expect(calculateWesternBlotBufferRecipe(3)).toBeNull();
  });

  it('reserves two marker wells and creates the default M5/sample/M3 order', () => {
    expect(calculateWesternBlotUsedWells(6)).toBe(8);
    expect(createWesternBlotLaneLabels(['S1', 'S2'], 10)).toEqual([
      'Marker 5 μl', 'S1', 'S2', 'Marker 3 μl', '', '', '', '', '', '',
    ]);
  });

  it('maps molecular weight linearly within the selected marker range', () => {
    expect(westernBlotMolecularWeightPosition(150, 300)).toBe(50);
    expect(westernBlotMolecularWeightPosition(0, 300)).toBe(100);
    expect(westernBlotMolecularWeightPosition(301, 300)).toBeNull();
  });

  it('maps molecular weights and cut lines against marker reference spacing', () => {
    const references = [
      { molecularWeight: 40, positionPercent: 95 },
      { molecularWeight: 50, positionPercent: 78.8 },
      { molecularWeight: 70, positionPercent: 55 },
    ];
    expect(westernBlotReferencedMolecularWeightPosition(50, references)).toBe(78.8);
    expect(westernBlotReferencedMolecularWeightPosition(60, references)).toBeCloseTo(66.9);
    expect(westernBlotReferencedPositionMolecularWeight(55, references)).toBe(70);
    expect(westernBlotReferencedPositionMolecularWeight(66.9, references)).toBeCloseTo(60);
    expect(westernBlotReferencedMolecularWeightPosition(71, references)).toBeNull();
    expect(westernBlotReferencedMolecularWeightPosition(-1, references)).toBeNull();
    expect(westernBlotReferencedPositionMolecularWeight(101, references)).toBeNull();
  });

  it('resolves every repeated plate directly to the first plate', () => {
    expect(resolveWesternBlotRepeatSourceIndex(0, [false, true, true, true])).toBe(0);
    expect(resolveWesternBlotRepeatSourceIndex(3, [false, true, true, true])).toBe(0);
    expect(resolveWesternBlotRepeatSourceIndex(3, [false, true, false, true])).toBe(0);
    expect(resolveWesternBlotRepeatSourceIndex(2, [false, true, false, true])).toBe(2);
    expect(resolveWesternBlotRepeatSourceIndex(-1, [false, true, false, true])).toBeNull();
    expect(resolveWesternBlotRepeatSourceIndex(1.5, [false, true, false, true])).toBeNull();
    expect(resolveWesternBlotRepeatSourceIndex(4, [false, true, false, true])).toBeNull();
  });

  it('groups repeat plates into one diagram while retaining every plate label', () => {
    expect(groupWesternBlotPlateRepeats([false, true])).toEqual([
      { sourceIndex: 0, plateIndices: [0, 1] },
    ]);
    expect(groupWesternBlotPlateRepeats([false, true, true, true])).toEqual([
      { sourceIndex: 0, plateIndices: [0, 1, 2, 3] },
    ]);
    expect(groupWesternBlotPlateRepeats([false, true, false, true])).toEqual([
      { sourceIndex: 0, plateIndices: [0, 1, 3] },
      { sourceIndex: 2, plateIndices: [2] },
    ]);
  });
});
