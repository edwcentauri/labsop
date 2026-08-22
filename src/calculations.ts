export type DilutionResult = {
  stockVolume: number;
  diluentVolume: number;
};

export function calculateDilution(
  stockConcentration: number,
  targetConcentration: number,
  finalVolume: number,
): DilutionResult | null {
  if (
    stockConcentration <= 0 ||
    targetConcentration <= 0 ||
    finalVolume <= 0 ||
    targetConcentration > stockConcentration
  ) {
    return null;
  }

  const stockVolume = (targetConcentration * finalVolume) / stockConcentration;
  return {
    stockVolume,
    diluentVolume: finalVolume - stockVolume,
  };
}

export type CellSeedingResult = {
  totalCells: number;
  suspensionVolume: number;
  mediumVolume: number;
  totalVolume: number;
};

export function calculateCellSeeding(
  targetCellsPerWell: number,
  wells: number,
  concentration: number,
  volumePerWell: number,
  excessPercent: number,
): CellSeedingResult | null {
  if (
    targetCellsPerWell <= 0 ||
    wells <= 0 ||
    concentration <= 0 ||
    volumePerWell <= 0 ||
    excessPercent < 0
  ) {
    return null;
  }

  const multiplier = 1 + excessPercent / 100;
  const totalCells = targetCellsPerWell * wells * multiplier;
  const suspensionVolume = totalCells / concentration;
  const totalVolume = volumePerWell * wells * multiplier;
  const mediumVolume = totalVolume - suspensionVolume;

  if (mediumVolume < 0) return null;

  return { totalCells, suspensionVolume, mediumVolume, totalVolume };
}

export function formatVolume(value: number): string {
  if (value < 1) return `${(value * 1000).toFixed(value < 0.01 ? 1 : 0)} μL`;
  return `${value.toFixed(value < 10 ? 2 : 1).replace(/\.0+$|(?<=\.[0-9])0$/, '')} mL`;
}

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
  primer?: string;
  sample?: string;
};

export type QpcrPlateUsage = {
  primerCount: number;
  sampleCount: number;
};

export function summarizeQpcrPlateUsage(
  assignments: QpcrPlateAssignment[],
): QpcrPlateUsage {
  const primers = new Set<string>();
  const samples = new Set<string>();

  assignments.forEach((assignment) => {
    const primer = assignment.primer?.trim();
    const sample = assignment.sample?.trim();
    if (!primer || !sample) return;
    primers.add(primer);
    if (sample.toUpperCase() !== 'NTC') samples.add(sample);
  });

  return {
    primerCount: primers.size,
    sampleCount: primers.size > 0 ? samples.size + 1 : 0,
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
  primerCount: number,
  sampleCount: number,
  replicates: number,
  excessReactionsPerGroup: number,
  roundCommonPool: boolean,
  roundPrimerTube: boolean,
): TubeDistributionResult | null {
  const values = [primerCount, sampleCount, replicates, excessReactionsPerGroup];
  if (values.some((value) => !Number.isInteger(value) || value < 0) || primerCount === 0 || sampleCount === 0 || replicates === 0) {
    return null;
  }

  const reactionsPerGroup = replicates + excessReactionsPerGroup;
  const theoreticalCommonReactions = primerCount * sampleCount * reactionsPerGroup;
  const theoreticalPrimerTubeReactions = sampleCount * reactionsPerGroup;
  const reactionsPerPrimerTube = roundPrimerTube
    ? Math.ceil(theoreticalPrimerTubeReactions / 10) * 10
    : theoreticalPrimerTubeReactions;
  const requiredCommonReactions = primerCount * reactionsPerPrimerTube;
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
      remainingAfterDistribution: commonPoolTotal - commonAliquot * primerCount,
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
