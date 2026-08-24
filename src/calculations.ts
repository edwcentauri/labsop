export type ReverseTranscriptionSystem = 10 | 16;

export type RnaLoadingResult = {
  rnaVolume: number;
  gdnaCleanMixVolume: 2;
  waterVolume: number;
  totalVolume: ReverseTranscriptionSystem;
};

export type RnaLoadingBatchResult = {
  systemVolume: ReverseTranscriptionSystem;
  samples: Array<RnaLoadingResult | null>;
  hasOverflow: boolean;
};

export function calculateRnaLoadingBatch(
  concentrationsNgPerUl: number[],
): RnaLoadingBatchResult | null {
  if (
    concentrationsNgPerUl.length === 0 ||
    concentrationsNgPerUl.some((concentration) => !Number.isFinite(concentration) || concentration <= 0)
  ) {
    return null;
  }

  const rnaVolumes = concentrationsNgPerUl.map((concentration) => 1000 / concentration);
  const systemVolume: ReverseTranscriptionSystem = rnaVolumes.some((volume) => volume > 8) ? 16 : 10;
  const samples = rnaVolumes.map((rnaVolume): RnaLoadingResult | null => {
    const waterVolume = systemVolume - 2 - rnaVolume;
    if (waterVolume < 0) return null;
    return {
      rnaVolume,
      gdnaCleanMixVolume: 2,
      waterVolume,
      totalVolume: systemVolume,
    };
  });

  return {
    systemVolume,
    samples,
    hasOverflow: samples.some((sample) => sample === null),
  };
}

export type PlateWell = {
  well: string;
  primerGroupId: string;
  primer: string;
  sample: string;
  replicate: number;
  isReference: boolean;
  isNtc: boolean;
  colorIndex: number;
};

export type QpcrPlate = {
  number: number;
  primers: string[];
  wells: PlateWell[];
};

export type QpcrPlateAssignment = {
  primerGroupId?: string;
  primer?: string;
  sample?: string;
};

export type QpcrPlateUsage = {
  primerGroupCount: number;
  sampleCount: number;
};

export function summarizeQpcrPlateUsage(
  assignments: QpcrPlateAssignment[],
): QpcrPlateUsage {
  const primerGroups = new Set<string>();
  const samples = new Set<string>();

  assignments.forEach((assignment) => {
    const primerGroupId = assignment.primerGroupId?.trim();
    const primer = assignment.primer?.trim();
    const sample = assignment.sample?.trim();
    if (!primerGroupId || !primer || !sample) return;
    primerGroups.add(primerGroupId);
    if (sample.toUpperCase() !== 'NTC') samples.add(sample);
  });

  return {
    primerGroupCount: primerGroups.size,
    sampleCount: primerGroups.size > 0 ? samples.size + 1 : 0,
  };
}

const PLATE_ROWS = 'ABCDEFGH';
const PLATE_COLUMNS = 12;

function wellName(row: number, column: number): string {
  return `${PLATE_ROWS[row]}${column + 1}`;
}

function rowsNeededForPrimers(
  primerCount: number,
  sampleRowsPerPrimer: number,
  ntcFitsSampleRow: boolean,
  ntcGroupsPerRow: number,
): number {
  const ntcRows = ntcFitsSampleRow ? 0 : Math.ceil(primerCount / ntcGroupsPerRow);
  return primerCount * sampleRowsPerPrimer + ntcRows;
}

export function createQpcrPlateLayout(
  referencePrimer: string,
  targetPrimers: string[],
  samples: string[],
  replicates: number,
): QpcrPlate[] | null {
  const cleanReference = referencePrimer.trim();
  const cleanTargets = targetPrimers.map((primer) => primer.trim()).filter(Boolean);
  const cleanSamples = samples
    .map((sample) => sample.trim())
    .filter((sample) => sample && sample.toUpperCase() !== 'NTC');
  if (
    !cleanReference
    || cleanSamples.length === 0
    || !Number.isInteger(replicates)
    || replicates <= 0
    || replicates > PLATE_COLUMNS
  ) {
    return null;
  }

  const sampleGroupsPerRow = Math.floor(PLATE_COLUMNS / replicates);
  const sampleRowsPerPrimer = Math.ceil(cleanSamples.length / sampleGroupsPerRow);
  const ntcFitsSampleRow = sampleRowsPerPrimer * sampleGroupsPerRow > cleanSamples.length;
  const ntcGroupsPerRow = sampleGroupsPerRow;

  let primersPerPlate = 0;
  for (let primerCount = 1; primerCount <= PLATE_ROWS.length; primerCount += 1) {
    if (rowsNeededForPrimers(primerCount, sampleRowsPerPrimer, ntcFitsSampleRow, ntcGroupsPerRow) > PLATE_ROWS.length) {
      break;
    }
    primersPerPlate = primerCount;
  }

  if (primersPerPlate === 0) return null;

  const targetPrimersPerPlate = primersPerPlate - 1;
  if (cleanTargets.length > 0 && targetPrimersPerPlate === 0) return null;

  const plateCount = cleanTargets.length === 0 ? 1 : Math.ceil(cleanTargets.length / targetPrimersPerPlate);
  const targetBaseCount = Math.floor(cleanTargets.length / plateCount);
  const platesWithExtraTarget = cleanTargets.length % plateCount;
  let targetCursor = 0;
  const targetGroups = Array.from({ length: plateCount }, (_, plateIndex) => {
    const targetCount = targetBaseCount + (plateIndex < platesWithExtraTarget ? 1 : 0);
    const group = cleanTargets.slice(targetCursor, targetCursor + targetCount);
    targetCursor += targetCount;
    return group;
  });

  return targetGroups.map((targets, plateIndex) => {
    const primers = [cleanReference, ...targets];
    const wells: PlateWell[] = [];
    const overflowNtc: Array<{ primer: string; primerIndex: number }> = [];
    let nextRow = 0;

    primers.forEach((primer, primerIndex) => {
      const primerGroupId = `plate-${plateIndex + 1}-primer-${primerIndex + 1}`;
      const samplesPerRow = Math.floor(cleanSamples.length / sampleRowsPerPrimer);
      const rowsWithExtraSample = cleanSamples.length % sampleRowsPerPrimer;
      let sampleCursor = 0;

      for (let primerRow = 0; primerRow < sampleRowsPerPrimer; primerRow += 1) {
        const sampleCount = samplesPerRow
          + (rowsWithExtraSample > 0 && primerRow >= sampleRowsPerPrimer - rowsWithExtraSample ? 1 : 0);
        let column = 0;

        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
          const sample = cleanSamples[sampleCursor];
          sampleCursor += 1;
          for (let replicate = 1; replicate <= replicates; replicate += 1) {
            wells.push({
              well: wellName(nextRow + primerRow, column),
              primerGroupId,
              primer,
              sample,
              replicate,
              isReference: primerIndex === 0,
              isNtc: false,
              colorIndex: primerIndex,
            });
            column += 1;
          }
        }

        if (primerRow === 0 && ntcFitsSampleRow) {
          for (let replicate = 1; replicate <= replicates; replicate += 1) {
            wells.push({
              well: wellName(nextRow, PLATE_COLUMNS - replicates + replicate - 1),
              primerGroupId,
              primer,
              sample: 'NTC',
              replicate,
              isReference: primerIndex === 0,
              isNtc: true,
              colorIndex: primerIndex,
            });
          }
        }
      }

      if (!ntcFitsSampleRow) overflowNtc.push({ primer, primerIndex });
      nextRow += sampleRowsPerPrimer;
    });

    let ntcRow = nextRow;
    let ntcColumn = 0;
    overflowNtc.forEach(({ primer, primerIndex }) => {
      if (ntcColumn + replicates > PLATE_COLUMNS) {
        ntcRow += 1;
        ntcColumn = 0;
      }
      for (let replicate = 1; replicate <= replicates; replicate += 1) {
        wells.push({
          well: wellName(ntcRow, ntcColumn),
          primerGroupId: `plate-${plateIndex + 1}-primer-${primerIndex + 1}`,
          primer,
          sample: 'NTC',
          replicate,
          isReference: primerIndex === 0,
          isNtc: true,
          colorIndex: primerIndex,
        });
        ntcColumn += 1;
      }
    });

    return { number: plateIndex + 1, primers, wells };
  });
}

export type TubeDistributionResult = {
  reactionsPerGroup: number;
  reactionsPerPrimerTube: number;
  theoreticalCommonReactions: number;
  commonPoolReactions: number;
  commonPool: {
    sybr: number;
    water: number;
    total: number;
    remainingAfterDistribution: number;
  };
  perPrimerTube: {
    commonAliquot: number;
    forwardPrimer: number;
    reversePrimer: number;
    total: number;
    remainingAfterDistribution: number;
  };
  perSamplePrimerTube: {
    primerMix: number;
    cdnaOrNtcWater: number;
    total: number;
    plateLoading: number;
    remaining: number;
  };
};

export function calculateTubeDistribution(
  primerGroupCount: number,
  sampleCount: number,
  replicates: number,
  excessReactionsPerGroup: number,
  roundCommonPool: boolean,
  roundPrimerTube: boolean,
): TubeDistributionResult | null {
  const values = [primerGroupCount, sampleCount, replicates, excessReactionsPerGroup];
  if (values.some((value) => !Number.isInteger(value) || value < 0) || primerGroupCount === 0 || sampleCount === 0 || replicates === 0) {
    return null;
  }

  const reactionsPerGroup = replicates + excessReactionsPerGroup;
  const theoreticalCommonReactions = primerGroupCount * sampleCount * reactionsPerGroup;
  const theoreticalPrimerTubeReactions = sampleCount * reactionsPerGroup;
  const reactionsPerPrimerTube = roundPrimerTube
    ? Math.ceil(theoreticalPrimerTubeReactions / 10) * 10
    : theoreticalPrimerTubeReactions;
  const requiredCommonReactions = primerGroupCount * reactionsPerPrimerTube;
  const commonPoolReactions = roundCommonPool
    ? Math.ceil(requiredCommonReactions / 10) * 10
    : requiredCommonReactions;

  const commonAliquot = 7.2 * reactionsPerPrimerTube;
  const commonPoolTotal = 7.2 * commonPoolReactions;
  const primerMix = 8 * reactionsPerGroup;
  const cdnaOrNtcWater = 2 * reactionsPerGroup;

  return {
    reactionsPerGroup,
    reactionsPerPrimerTube,
    theoreticalCommonReactions,
    commonPoolReactions,
    commonPool: {
      sybr: 5 * commonPoolReactions,
      water: 2.2 * commonPoolReactions,
      total: commonPoolTotal,
      remainingAfterDistribution: commonPoolTotal - commonAliquot * primerGroupCount,
    },
    perPrimerTube: {
      commonAliquot,
      forwardPrimer: 0.4 * reactionsPerPrimerTube,
      reversePrimer: 0.4 * reactionsPerPrimerTube,
      total: 8 * reactionsPerPrimerTube,
      remainingAfterDistribution: 8 * (reactionsPerPrimerTube - theoreticalPrimerTubeReactions),
    },
    perSamplePrimerTube: {
      primerMix,
      cdnaOrNtcWater,
      total: 10 * reactionsPerGroup,
      plateLoading: 10 * replicates,
      remaining: 10 * excessReactionsPerGroup,
    },
  };
}

export type WesternBlotGelThickness = 0.75 | 1 | 1.5;

export type WesternBlotLysisRecipe = {
  perTubeVolume: number;
  excessTubeCount: number;
  tissueVolume: number;
  excessVolume: number;
  totalVolume: number;
  proteaseInhibitor: number;
  phosphataseInhibitor: number;
  ripa: number;
};

export function calculateWesternBlotLysisRecipe(
  sampleCount: number,
  perTubeVolume: number,
  excessTubeCount: number,
): WesternBlotLysisRecipe | null {
  if (
    !Number.isInteger(sampleCount)
    || sampleCount <= 0
    || !Number.isFinite(perTubeVolume)
    || perTubeVolume <= 0
    || !Number.isFinite(excessTubeCount)
    || excessTubeCount < 0
    || !Number.isInteger(excessTubeCount * 2)
  ) {
    return null;
  }

  const tissueVolume = sampleCount * perTubeVolume;
  const excessVolume = excessTubeCount * perTubeVolume;
  const totalVolume = tissueVolume + excessVolume;
  const proteaseInhibitor = totalVolume / 50;
  const phosphataseInhibitor = totalVolume / 50;

  return {
    perTubeVolume,
    excessTubeCount,
    tissueVolume,
    excessVolume,
    totalVolume,
    proteaseInhibitor,
    phosphataseInhibitor,
    ripa: totalVolume - proteaseInhibitor - phosphataseInhibitor,
  };
}

export type WesternBlotDenaturationRecipe = {
  perTube: {
    protein: number;
    loadingBuffer: number;
    total: number;
  };
};

export function calculateWesternBlotDenaturationRecipe(
  totalVolume: number,
): WesternBlotDenaturationRecipe | null {
  if (!Number.isFinite(totalVolume) || totalVolume <= 0) return null;

  const loadingBuffer = totalVolume / 5;

  return {
    perTube: {
      protein: totalVolume - loadingBuffer,
      loadingBuffer,
      total: totalVolume,
    },
  };
}

type WesternBlotGelMixture = {
  solution: number;
  buffer: number;
  accelerator: number;
};

export type WesternBlotGelRecipe = {
  plateCount: number;
  thickness: WesternBlotGelThickness;
  perPlate: {
    resolving: WesternBlotGelMixture;
    stacking: WesternBlotGelMixture;
  };
  batch: {
    resolving: WesternBlotGelMixture;
    stacking: WesternBlotGelMixture;
  };
  pourPerPlate: {
    resolving: number;
    stacking: number;
  };
};

const WESTERN_BLOT_GEL_RECIPES: Record<WesternBlotGelThickness, WesternBlotGelRecipe['perPlate']> = {
  0.75: {
    resolving: { solution: 2, buffer: 2, accelerator: 40 },
    stacking: { solution: 0.5, buffer: 0.5, accelerator: 10 },
  },
  1: {
    resolving: { solution: 2.7, buffer: 2.7, accelerator: 60 },
    stacking: { solution: 0.75, buffer: 0.75, accelerator: 15 },
  },
  1.5: {
    resolving: { solution: 4, buffer: 4, accelerator: 80 },
    stacking: { solution: 1, buffer: 1, accelerator: 20 },
  },
};

export function calculateWesternBlotGelRecipe(
  plateCount: number,
  thickness: WesternBlotGelThickness,
): WesternBlotGelRecipe | null {
  if (!Number.isInteger(plateCount) || plateCount <= 0 || !WESTERN_BLOT_GEL_RECIPES[thickness]) return null;
  const perPlate = WESTERN_BLOT_GEL_RECIPES[thickness];
  const multiplyMixture = (mixture: WesternBlotGelMixture): WesternBlotGelMixture => ({
    solution: mixture.solution * plateCount,
    buffer: mixture.buffer * plateCount,
    accelerator: mixture.accelerator * plateCount,
  });

  return {
    plateCount,
    thickness,
    perPlate,
    batch: {
      resolving: multiplyMixture(perPlate.resolving),
      stacking: multiplyMixture(perPlate.stacking),
    },
    pourPerPlate: {
      resolving: perPlate.resolving.solution + perPlate.resolving.buffer,
      stacking: perPlate.stacking.solution + perPlate.stacking.buffer,
    },
  };
}

export type WesternBlotBufferRecipe = {
  powderPacks: number;
  running: {
    waterBeforeCalibration: number;
    finalVolume: number;
  };
  transfer: {
    ethanol: number;
    waterBeforeCalibration: number;
    finalVolume: number;
  };
};

export function calculateWesternBlotBufferRecipe(
  plateCount: number,
): WesternBlotBufferRecipe | null {
  if (plateCount !== 2 && plateCount !== 4) return null;
  const powderPacks = plateCount / 2;
  return {
    powderPacks,
    running: {
      waterBeforeCalibration: powderPacks * 800,
      finalVolume: powderPacks * 1000,
    },
    transfer: {
      ethanol: powderPacks * 200,
      waterBeforeCalibration: powderPacks * 600,
      finalVolume: powderPacks * 1000,
    },
  };
}

export function calculateWesternBlotUsedWells(sampleCount: number): number | null {
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) return null;
  return sampleCount + 2;
}

export function createWesternBlotLaneLabels(
  sampleNames: string[],
  wellCount: 10 | 15 | 30,
): string[] {
  const labels = Array.from({ length: wellCount }, () => '');
  labels[0] = 'Marker 5 μl';
  sampleNames.slice(0, Math.max(0, wellCount - 2)).forEach((sample, index) => {
    labels[index + 1] = sample.trim();
  });
  const lastUsedLane = Math.min(sampleNames.length + 1, wellCount - 1);
  labels[lastUsedLane] = 'Marker 3 μl';
  return labels;
}

export function westernBlotMolecularWeightPosition(
  molecularWeight: number,
  maximumMarkerWeight: number,
): number | null {
  if (
    !Number.isFinite(molecularWeight)
    || !Number.isFinite(maximumMarkerWeight)
    || molecularWeight < 0
    || maximumMarkerWeight <= 0
    || molecularWeight > maximumMarkerWeight
  ) {
    return null;
  }
  return 100 - (molecularWeight / maximumMarkerWeight) * 100;
}

type WesternBlotMarkerPositionReference = {
  molecularWeight: number;
  positionPercent: number;
};

function validWesternBlotMarkerPositions(
  references: WesternBlotMarkerPositionReference[],
): WesternBlotMarkerPositionReference[] | null {
  if (references.length === 0) return null;
  const sorted = [...references].sort((left, right) => left.molecularWeight - right.molecularWeight);
  const isValid = sorted.every((reference, index) => (
    Number.isFinite(reference.molecularWeight)
    && Number.isFinite(reference.positionPercent)
    && reference.molecularWeight > 0
    && reference.positionPercent >= 0
    && reference.positionPercent <= 100
    && (index === 0 || reference.molecularWeight > sorted[index - 1].molecularWeight)
    && (index === 0 || reference.positionPercent < sorted[index - 1].positionPercent)
  ));
  return isValid ? sorted : null;
}

export function westernBlotReferencedMolecularWeightPosition(
  molecularWeight: number,
  references: WesternBlotMarkerPositionReference[],
): number | null {
  const sorted = validWesternBlotMarkerPositions(references);
  if (!Number.isFinite(molecularWeight) || molecularWeight < 0 || !sorted) return null;
  const anchors = [{ molecularWeight: 0, positionPercent: 100 }, ...sorted];
  if (molecularWeight > anchors[anchors.length - 1].molecularWeight) return null;
  const upperIndex = anchors.findIndex((anchor) => anchor.molecularWeight >= molecularWeight);
  const upper = anchors[upperIndex];
  if (upper.molecularWeight === molecularWeight) return upper.positionPercent;
  const lower = anchors[upperIndex - 1];
  const ratio = (molecularWeight - lower.molecularWeight) / (upper.molecularWeight - lower.molecularWeight);
  return lower.positionPercent + ratio * (upper.positionPercent - lower.positionPercent);
}

export function westernBlotReferencedPositionMolecularWeight(
  positionPercent: number,
  references: WesternBlotMarkerPositionReference[],
): number | null {
  const sorted = validWesternBlotMarkerPositions(references);
  if (!Number.isFinite(positionPercent) || positionPercent < 0 || positionPercent > 100 || !sorted) return null;
  const anchors = [{ molecularWeight: 0, positionPercent: 100 }, ...sorted];
  const maximum = anchors[anchors.length - 1];
  if (positionPercent <= maximum.positionPercent) return maximum.molecularWeight;
  const upperIndex = anchors.findIndex((anchor) => anchor.positionPercent <= positionPercent);
  const upper = anchors[upperIndex];
  if (upper.positionPercent === positionPercent) return upper.molecularWeight;
  const lower = anchors[upperIndex - 1];
  const ratio = (positionPercent - lower.positionPercent) / (upper.positionPercent - lower.positionPercent);
  return lower.molecularWeight + ratio * (upper.molecularWeight - lower.molecularWeight);
}

export function resolveWesternBlotRepeatSourceIndex(
  plateIndex: number,
  repeatedPlates: boolean[],
): number | null {
  if (!Number.isInteger(plateIndex) || plateIndex < 0 || plateIndex >= repeatedPlates.length) return null;
  let sourceIndex = plateIndex;
  let remainingDepth = repeatedPlates.length;
  while (sourceIndex > 0 && repeatedPlates[sourceIndex] && remainingDepth > 0) {
    sourceIndex -= 1;
    remainingDepth -= 1;
  }
  return sourceIndex;
}

export type WesternBlotPlateRepeatGroup = {
  sourceIndex: number;
  plateIndices: number[];
};

export function groupWesternBlotPlateRepeats(
  repeatedPlates: boolean[],
): WesternBlotPlateRepeatGroup[] {
  return repeatedPlates.reduce<WesternBlotPlateRepeatGroup[]>((groups, _, plateIndex) => {
    const sourceIndex = resolveWesternBlotRepeatSourceIndex(plateIndex, repeatedPlates);
    if (sourceIndex === null) return groups;
    const existingGroup = groups.find((group) => group.sourceIndex === sourceIndex);
    if (existingGroup) {
      existingGroup.plateIndices.push(plateIndex);
    } else {
      groups.push({ sourceIndex, plateIndices: [plateIndex] });
    }
    return groups;
  }, []);
}
