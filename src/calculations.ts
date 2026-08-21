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
