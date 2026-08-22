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

export function calculateRnaLoading(
  concentrationNgPerUl: number,
  systemVolume: ReverseTranscriptionSystem,
): RnaLoadingResult | null {
  if (concentrationNgPerUl <= 0) return null;

  const rnaVolume = 1000 / concentrationNgPerUl;
  const waterVolume = systemVolume - 2 - rnaVolume;
  if (waterVolume < 0) return null;

  return {
    rnaVolume,
    gdnaCleanMixVolume: 2,
    waterVolume,
    totalVolume: systemVolume,
  };
}

export type QpcrMixResult = {
  reactions: number;
  sybr: number;
  forwardPrimer: number;
  reversePrimer: number;
  water: number;
  cdna: number;
  total: number;
};

export function calculateQpcrMix(reactions: number): QpcrMixResult | null {
  if (!Number.isInteger(reactions) || reactions <= 0) return null;

  return {
    reactions,
    sybr: 5 * reactions,
    forwardPrimer: 0.4 * reactions,
    reversePrimer: 0.4 * reactions,
    water: 2.2 * reactions,
    cdna: 2 * reactions,
    total: 10 * reactions,
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

const PLATE_ROWS = 'ABCDEFGH';

function wellName(index: number): string {
  return `${PLATE_ROWS[Math.floor(index / 12)]}${(index % 12) + 1}`;
}

export function createQpcrPlateLayout(
  referencePrimer: string,
  targetPrimers: string[],
  samples: string[],
  replicates: number,
): QpcrPlate[] | null {
  const cleanReference = referencePrimer.trim();
  const cleanTargets = targetPrimers.map((primer) => primer.trim()).filter(Boolean);
  const cleanSamples = samples.map((sample) => sample.trim()).filter(Boolean);
  if (!cleanReference || cleanSamples.length === 0 || !Number.isInteger(replicates) || replicates <= 0) {
    return null;
  }

  const wellsPerPrimer = cleanSamples.length * replicates;
  if (wellsPerPrimer > 96) return null;

  const targetPrimersPerPlate = Math.floor((96 - wellsPerPrimer) / wellsPerPrimer);
  if (cleanTargets.length > 0 && targetPrimersPerPlate < 1) return null;

  const targetGroups = cleanTargets.length === 0
    ? [[]]
    : Array.from(
        { length: Math.ceil(cleanTargets.length / targetPrimersPerPlate) },
        (_, index) => cleanTargets.slice(index * targetPrimersPerPlate, (index + 1) * targetPrimersPerPlate),
      );

  return targetGroups.map((targets, plateIndex) => {
    const primers = [cleanReference, ...targets];
    const wells: PlateWell[] = [];
    primers.forEach((primer, primerIndex) => {
      cleanSamples.forEach((sample) => {
        for (let replicate = 1; replicate <= replicates; replicate += 1) {
          wells.push({
            well: wellName(wells.length),
            primer,
            sample,
            replicate,
            isReference: primerIndex === 0,
            isNtc: sample.toUpperCase() === 'NTC',
            colorIndex: primerIndex,
          });
        }
      });
    });

    return { number: plateIndex + 1, primers, wells };
  });
}

export type TubeDistributionResult = {
  reactionsPerGroup: number;
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
  commonPoolReactions: number,
): TubeDistributionResult | null {
  const values = [primerCount, sampleCount, replicates, excessReactionsPerGroup, commonPoolReactions];
  if (values.some((value) => !Number.isInteger(value) || value < 0) || primerCount === 0 || sampleCount === 0 || replicates === 0) {
    return null;
  }

  const reactionsPerGroup = replicates + excessReactionsPerGroup;
  const theoreticalCommonReactions = primerCount * sampleCount * reactionsPerGroup;
  if (commonPoolReactions < theoreticalCommonReactions) return null;

  const commonAliquot = 7.2 * sampleCount * reactionsPerGroup;
  const commonPoolTotal = 7.2 * commonPoolReactions;
  const primerMix = 8 * reactionsPerGroup;
  const cdnaOrNtcWater = 2 * reactionsPerGroup;

  return {
    reactionsPerGroup,
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
      forwardPrimer: 0.4 * sampleCount * reactionsPerGroup,
      reversePrimer: 0.4 * sampleCount * reactionsPerGroup,
      total: 8 * sampleCount * reactionsPerGroup,
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
