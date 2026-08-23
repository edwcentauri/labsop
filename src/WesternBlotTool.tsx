import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  FlaskConical,
  GripHorizontal,
  LayoutGrid,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  calculateWesternBlotBufferRecipe,
  calculateWesternBlotDenaturationRecipe,
  calculateWesternBlotGelRecipe,
  calculateWesternBlotLysisRecipe,
  calculateWesternBlotUsedWells,
  createWesternBlotLaneLabels,
  westernBlotMolecularWeightPosition,
  type WesternBlotGelThickness,
} from './calculations';
import {
  westernBlotMarkers,
  westernBlotSopSections,
  type WesternBlotMarkerId,
  type WesternBlotSopItem,
} from './westernBlotData';

type ToolTab = 'setup' | 'guide';
type ProteinRole = 'target' | 'reference';
type WellCount = 10 | 15 | 30;

type ProteinInput = {
  id: string;
  role: ProteinRole;
  name: string;
  molecularWeight: string;
};

type PlateDesign = {
  number: number;
  repeated: boolean;
  wellCount: WellCount | '';
  markerId: WesternBlotMarkerId | '';
  selectedProteinIds: string[];
  laneLabels: string[];
  cutLines: number[];
};

type WesternBlotSession = {
  plateCount: 2 | 4 | '';
  thickness: WesternBlotGelThickness | '';
  gelPercentage: string;
  sampleCount: string;
  sampleNames: string[];
  loadingVolume: string;
  firstMarkerVolume: string;
  lastMarkerVolume: string;
  lysisExcessVolume: string;
  primaryDilution: string;
  secondaryAntibody: string;
  voltage: string;
  transferCurrent: string;
  proteins: ProteinInput[];
  plates: PlateDesign[];
};

const STORAGE_KEY = 'labsop:western-blot-session:v1';
const DEFAULT_PROTEINS: ProteinInput[] = [
  { id: 'target-1', role: 'target', name: '', molecularWeight: '' },
  { id: 'reference-1', role: 'reference', name: '', molecularWeight: '' },
];

function initialLaneLabels(wellCount: WellCount, sampleNames: string[], firstVolume = '5', lastVolume = '3') {
  const labels = createWesternBlotLaneLabels(sampleNames, wellCount);
  labels[0] = `Marker ${firstVolume || '5'} μl`;
  const lastMarkerIndex = labels.findIndex((label, index) => index > 0 && label.startsWith('Marker'));
  if (lastMarkerIndex >= 0) labels[lastMarkerIndex] = `Marker ${lastVolume || '3'} μl`;
  return labels;
}

function createDefaultSession(): WesternBlotSession {
  const sampleNames: string[] = [];
  const selectedProteinIds = DEFAULT_PROTEINS.map(({ id }) => id);
  const createPlate = (number: number, repeated: boolean): PlateDesign => ({
    number,
    repeated,
    wellCount: '',
    markerId: '',
    selectedProteinIds: [...selectedProteinIds],
    laneLabels: [],
    cutLines: [],
  });
  return {
    plateCount: '',
    thickness: '',
    gelPercentage: '',
    sampleCount: '',
    sampleNames,
    loadingVolume: '',
    firstMarkerVolume: '5',
    lastMarkerVolume: '3',
    lysisExcessVolume: '',
    primaryDilution: '',
    secondaryAntibody: '',
    voltage: '250',
    transferCurrent: '400',
    proteins: DEFAULT_PROTEINS.map((protein) => ({ ...protein })),
    plates: [createPlate(1, false), createPlate(2, true), createPlate(3, false), createPlate(4, true)],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function loadSession(): WesternBlotSession {
  const fallback = createDefaultSession();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return fallback;
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) return fallback;

    const proteins = Array.isArray(parsed.proteins)
      ? parsed.proteins.flatMap((value): ProteinInput[] => {
        if (!isRecord(value) || typeof value.id !== 'string') return [];
        return [{
          id: value.id,
          role: value.role === 'reference' ? 'reference' : 'target',
          name: stringValue(value.name, ''),
          molecularWeight: stringValue(value.molecularWeight, ''),
        }];
      })
      : [];
    const safeProteins = proteins.length >= 2 ? proteins : fallback.proteins;
    const allowedProteinIds = new Set(safeProteins.map(({ id }) => id));
    const sampleNames = Array.isArray(parsed.sampleNames)
      ? parsed.sampleNames.filter((value): value is string => typeof value === 'string').slice(0, 28)
      : fallback.sampleNames;
    const savedPlates = Array.isArray(parsed.plates) ? parsed.plates : [];
    const plates = fallback.plates.map((defaultPlate, index): PlateDesign => {
      const value = savedPlates[index];
      if (!isRecord(value)) return { ...defaultPlate };
      const wellCount: WellCount | '' = value.wellCount === 10 || value.wellCount === 15 || value.wellCount === 30 ? value.wellCount : '';
      const markerId: WesternBlotMarkerId | '' = value.markerId === 'thermo-40-300' || value.markerId === 'yseasy-10-250' ? value.markerId : '';
      const selectedProteinIds = Array.isArray(value.selectedProteinIds)
        ? value.selectedProteinIds.filter((id): id is string => typeof id === 'string' && allowedProteinIds.has(id))
        : safeProteins.map(({ id }) => id);
      const savedLabels = Array.isArray(value.laneLabels)
        ? value.laneLabels.filter((label): label is string => typeof label === 'string').slice(0, wellCount || 0)
        : [];
      const laneLabels = Array.from({ length: wellCount || 0 }, (_, laneIndex) => savedLabels[laneIndex] ?? '');
      const maximumMarkerWeight = markerId === 'thermo-40-300' ? 300 : markerId === 'yseasy-10-250' ? 250 : 0;
      const cutLines = Array.isArray(value.cutLines)
        ? value.cutLines
          .filter((line): line is number => typeof line === 'number' && Number.isFinite(line) && line >= 0)
          .map((line) => maximumMarkerWeight ? Math.min(line, maximumMarkerWeight) : line)
        : [];
      return {
        number: index + 1,
        repeated: index === 0 ? false : typeof value.repeated === 'boolean' ? value.repeated : defaultPlate.repeated,
        wellCount,
        markerId,
        selectedProteinIds,
        laneLabels,
        cutLines,
      };
    });

    return {
      plateCount: parsed.plateCount === 2 || parsed.plateCount === 4 ? parsed.plateCount : '',
      thickness: parsed.thickness === 0.75 || parsed.thickness === 1 || parsed.thickness === 1.5 ? parsed.thickness : '',
      gelPercentage: stringValue(parsed.gelPercentage, ''),
      sampleCount: stringValue(parsed.sampleCount, ''),
      sampleNames,
      loadingVolume: stringValue(parsed.loadingVolume, ''),
      firstMarkerVolume: stringValue(parsed.firstMarkerVolume, '5'),
      lastMarkerVolume: stringValue(parsed.lastMarkerVolume, '3'),
      lysisExcessVolume: stringValue(parsed.lysisExcessVolume, ''),
      primaryDilution: stringValue(parsed.primaryDilution, ''),
      secondaryAntibody: stringValue(parsed.secondaryAntibody, ''),
      voltage: stringValue(parsed.voltage, '250'),
      transferCurrent: stringValue(parsed.transferCurrent, '400'),
      proteins: safeProteins,
      plates,
    };
  } catch {
    return fallback;
  }
}

function cleanNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatQuantity(value: number): string {
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function NumberField({ label, value, unit, min = 0, step = 'any', onChange }: {
  label: string;
  value: string;
  unit: string;
  min?: number;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="wb-number-field">
      <span>{label}</span>
      <span className="wb-number-control">
        <input type="number" min={min} step={step} value={value} onChange={(event) => onChange(event.target.value)} />
        <b>{unit}</b>
      </span>
    </label>
  );
}

type ConfiguredPlateDesign = PlateDesign & { wellCount: WellCount; markerId: WesternBlotMarkerId };

function MarkerPlot({ plate, proteins, onChangeCutLine, onDeleteCutLine }: {
  plate: ConfiguredPlateDesign;
  proteins: ProteinInput[];
  onChangeCutLine: (index: number, value: number) => void;
  onDeleteCutLine: (index: number) => void;
}) {
  const marker = westernBlotMarkers.find(({ id }) => id === plate.markerId) ?? westernBlotMarkers[0];
  const maximumWeight = Math.max(...marker.bands.map(({ molecularWeight }) => molecularWeight));
  const markerWidth = 100 / plate.wellCount;
  const selectedProteins = proteins.filter(({ id }) => plate.selectedProteinIds.includes(id));

  const updateFromPointer = (index: number, event: ReactPointerEvent<HTMLDivElement>) => {
    const plot = event.currentTarget.parentElement;
    if (!plot) return;
    const bounds = plot.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    onChangeCutLine(index, Math.round((1 - ratio) * maximumWeight));
  };

  return (
    <div className="wb-design-table">
      <div className="wb-lane-labels" style={{ gridTemplateColumns: `repeat(${plate.wellCount}, minmax(74px, 1fr))` }}>
        {plate.laneLabels.map((label, index) => <span key={`lane-${index}`} title={label}>{label || `孔 ${index + 1}`}</span>)}
      </div>
      <div
        className="wb-membrane-plot"
        style={{ minWidth: `${plate.wellCount * 74}px` }}
        aria-label={`第 ${plate.number} 板膜图，Marker 上限 ${maximumWeight} kDa`}
      >
        <div className="wb-marker-zone" style={{ width: `${markerWidth}%` }} aria-label={`${marker.name} ${marker.rangeLabel}`}>
          <span className="wb-marker-zone-title">Marker</span>
          {marker.bands.map((band) => {
            const top = westernBlotMolecularWeightPosition(band.molecularWeight, maximumWeight) ?? 0;
            return (
              <span className={`wb-marker-band ${band.color}`} style={{ top: `${top}%` }} key={band.molecularWeight}>
                <i />
                <small>{band.molecularWeight}</small>
              </span>
            );
          })}
        </div>
        <div className="wb-protein-zone" style={{ left: `${markerWidth}%` }}>
          {selectedProteins.map((protein) => {
            const molecularWeight = cleanNumber(protein.molecularWeight);
            if (molecularWeight === null) return null;
            const top = westernBlotMolecularWeightPosition(molecularWeight, maximumWeight);
            if (top === null) return null;
            return (
              <span className="wb-protein-band" style={{ top: `${top}%` }} key={protein.id}>
                <i />
                <small>{protein.name || '未命名蛋白'} · {formatQuantity(molecularWeight)} kDa</small>
              </span>
            );
          })}
        </div>
        {plate.cutLines.map((line, index) => {
          const safeLine = Math.min(maximumWeight, Math.max(0, line));
          const top = westernBlotMolecularWeightPosition(safeLine, maximumWeight) ?? 50;
          return (
            <div
              className="wb-cut-line"
              style={{ top: `${top}%` }}
              key={`cut-${index}`}
              role="slider"
              tabIndex={0}
              aria-label={`第 ${index + 1} 条切膜线`}
              aria-valuemin={0}
              aria-valuemax={maximumWeight}
              aria-valuenow={safeLine}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                updateFromPointer(index, event);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(index, event);
              }}
              onKeyDown={(event) => {
                const amount = event.shiftKey ? 5 : 1;
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  onChangeCutLine(index, Math.min(maximumWeight, safeLine + amount));
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  onChangeCutLine(index, Math.max(0, safeLine - amount));
                }
              }}
            >
              <span><GripHorizontal size={12} />切膜线</span>
            </div>
          );
        })}
        <span className="wb-zero-label">0 kDa</span>
      </div>
      {plate.cutLines.length > 0 && (
        <div className="wb-cut-line-list" aria-label="切膜线位置">
          {plate.cutLines.map((line, index) => (
            <label key={`cut-control-${index}`}>
              <span>切膜线 {index + 1}</span>
              <input
                type="number"
                min={0}
                max={maximumWeight}
                step={1}
                value={Math.min(maximumWeight, Math.max(0, line))}
                onChange={(event) => onChangeCutLine(index, Number(event.target.value))}
              />
              <b>kDa</b>
              <button type="button" onClick={() => onDeleteCutLine(index)} aria-label={`删除切膜线 ${index + 1}`}><Trash2 size={14} /></button>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function PlateDesigner({ plate, sourcePlateNumber, proteins, sampleNames, firstMarkerVolume, lastMarkerVolume, onChange }: {
  plate: PlateDesign;
  sourcePlateNumber?: number;
  proteins: ProteinInput[];
  sampleNames: string[];
  firstMarkerVolume: string;
  lastMarkerVolume: string;
  onChange: (updater: (plate: PlateDesign) => PlateDesign) => void;
}) {
  const marker = westernBlotMarkers.find(({ id }) => id === plate.markerId);
  const maximumWeight = marker ? Math.max(...marker.bands.map(({ molecularWeight }) => molecularWeight)) : 0;

  if (plate.repeated && sourcePlateNumber) {
    return <div className="wb-repeat-summary"><LayoutGrid size={18} /><span>第 {plate.number} 板重复第 {sourcePlateNumber} 板，设计器已隐藏。</span></div>;
  }

  return (
    <div className="wb-plate-designer">
      <div className="wb-plate-controls">
        <label><span>孔数</span><select value={plate.wellCount} onChange={(event) => {
          const wellCount = event.target.value === '' ? '' : Number(event.target.value) as WellCount;
          onChange((current) => ({
            ...current,
            wellCount,
            laneLabels: wellCount === '' ? [] : initialLaneLabels(
              wellCount,
              sampleNames,
              firstMarkerVolume,
              lastMarkerVolume,
            ),
          }));
        }}><option value="">请选择</option><option value={10}>10 孔</option><option value={15}>15 孔</option><option value={30}>30 孔</option></select></label>
        <label><span>Marker</span><select value={plate.markerId} onChange={(event) => onChange((current) => {
          const markerId = event.target.value as WesternBlotMarkerId | '';
          const maximum = markerId === 'thermo-40-300' ? 300 : markerId === 'yseasy-10-250' ? 250 : 0;
          return { ...current, markerId, cutLines: maximum ? current.cutLines.map((line) => Math.min(line, maximum)) : [] };
        })}>
          <option value="">请选择</option>
          {westernBlotMarkers.map((item) => <option value={item.id} key={item.id}>{item.name} {item.rangeLabel}</option>)}
        </select></label>
        <fieldset>
          <legend>本板蛋白</legend>
          <div className="wb-protein-checks">
            {proteins.map((protein) => (
              <label key={protein.id}>
                <input
                  type="checkbox"
                  checked={plate.selectedProteinIds.includes(protein.id)}
                  onChange={(event) => onChange((current) => ({
                    ...current,
                    selectedProteinIds: event.target.checked
                      ? [...current.selectedProteinIds, protein.id]
                      : current.selectedProteinIds.filter((id) => id !== protein.id),
                  }))}
                />
                <span>{protein.name || (protein.role === 'reference' ? '未填写内参' : '未填写目标蛋白')} {protein.molecularWeight ? `· ${protein.molecularWeight} kDa` : ''}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="button" className="wb-add-cut" disabled={!maximumWeight} onClick={() => onChange((current) => ({ ...current, cutLines: [...current.cutLines, Math.round(maximumWeight / 2)] }))}><Plus size={15} />添加切膜线</button>
      </div>
      {maximumWeight > 0 && proteins.some((protein) => plate.selectedProteinIds.includes(protein.id) && (cleanNumber(protein.molecularWeight) ?? 0) > maximumWeight) && (
        <div className="wb-inline-error"><CircleAlert size={15} />所选蛋白中有分子量超出当前 Marker 上限的项目，请更换 Marker 或修改蛋白选择。</div>
      )}
      {plate.wellCount ? <div className="wb-lane-editor" style={{ gridTemplateColumns: `repeat(${plate.wellCount}, minmax(92px, 1fr))` }}>
        {plate.laneLabels.map((label, index) => (
          <label key={`lane-input-${index}`}><span>孔 {index + 1}</span><input value={label} onChange={(event) => onChange((current) => ({ ...current, laneLabels: current.laneLabels.map((item, laneIndex) => laneIndex === index ? event.target.value : item) }))} /></label>
        ))}
      </div> : <div className="wb-designer-placeholder">选择孔数后生成孔名行。</div>}
      {plate.wellCount && plate.markerId ? <MarkerPlot
        plate={plate as ConfiguredPlateDesign}
        proteins={proteins}
        onChangeCutLine={(index, value) => onChange((current) => ({ ...current, cutLines: current.cutLines.map((line, lineIndex) => lineIndex === index ? value : line) }))}
        onDeleteCutLine={(index) => onChange((current) => ({ ...current, cutLines: current.cutLines.filter((_, lineIndex) => lineIndex !== index) }))}
      /> : <div className="wb-designer-placeholder">选择孔数和 Marker 后显示膜图。</div>}
    </div>
  );
}

export default function WesternBlotTool() {
  const [tab, setTab] = useState<ToolTab>('setup');
  const [guidePage, setGuidePage] = useState(0);
  const [session, setSession] = useState<WesternBlotSession>(loadSession);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  const sampleCount = cleanNumber(session.sampleCount);
  const validSampleCount = sampleCount !== null && Number.isInteger(sampleCount) && sampleCount > 0 ? sampleCount : null;
  const lysisExcessVolume = cleanNumber(session.lysisExcessVolume);
  const batchPlateCount = session.plateCount === '' ? 0 : session.plateCount;
  const activePlates = session.plates.slice(0, batchPlateCount);
  const effectivePlate = (plate: PlateDesign) => plate.repeated && plate.number % 2 === 0
    ? session.plates[plate.number - 2]
    : plate;
  const effectivePlates = activePlates.map(effectivePlate);
  const usedWells = validSampleCount === null ? null : calculateWesternBlotUsedWells(validSampleCount);
  const lysisRecipe = validSampleCount !== null && lysisExcessVolume !== null
    ? calculateWesternBlotLysisRecipe(validSampleCount, lysisExcessVolume)
    : null;
  const denaturationRecipe = validSampleCount !== null ? calculateWesternBlotDenaturationRecipe(validSampleCount) : null;
  const gelRecipe = session.plateCount && session.thickness
    ? calculateWesternBlotGelRecipe(session.plateCount, session.thickness)
    : null;
  const bufferRecipe = session.plateCount ? calculateWesternBlotBufferRecipe(session.plateCount) : null;

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!session.plateCount) errors.push('请选择本次板数。');
    if (!session.thickness) errors.push('请选择全局板厚度。');
    if (validSampleCount === null || validSampleCount > 28) errors.push('本次测样数须填写 1–28 的整数。');
    if (validSampleCount !== null && (session.sampleNames.length !== validSampleCount || session.sampleNames.some((sample) => !sample.trim()))) errors.push('请填写全部样本名称。');
    if (cleanNumber(session.gelPercentage) === null || (cleanNumber(session.gelPercentage) ?? 0) <= 0) errors.push('请填写凝胶浓度。');
    if (cleanNumber(session.loadingVolume) === null || (cleanNumber(session.loadingVolume) ?? 0) <= 0) errors.push('请填写每孔上样量。');
    if (cleanNumber(session.firstMarkerVolume) === null || (cleanNumber(session.firstMarkerVolume) ?? 0) <= 0 || cleanNumber(session.lastMarkerVolume) === null || (cleanNumber(session.lastMarkerVolume) ?? 0) <= 0) errors.push('首孔和末孔 Marker 上样量须大于 0。');
    if (lysisExcessVolume === null || lysisExcessVolume < 0) errors.push('请填写裂解液冗余体积；如不加冗余请明确填写 0。');
    if (session.proteins.length < 2 || session.proteins.some((protein) => !protein.name.trim() || (cleanNumber(protein.molecularWeight) ?? 0) <= 0)) errors.push('请填写每个蛋白的名称和大于 0 的分子量。');
    if (!session.primaryDilution.trim()) errors.push('请填写一抗稀释液浓度或预配信息。');
    if (!session.secondaryAntibody.trim()) errors.push('请填写一抗所需二抗。');
    if ((cleanNumber(session.voltage) ?? 0) <= 0 || (cleanNumber(session.transferCurrent) ?? 0) <= 0) errors.push('电泳电压和转膜电流须大于 0。');
    effectivePlates.forEach((plate, index) => {
      if (!plate.wellCount) errors.push(`请选择第 ${index + 1} 板孔数。`);
      if (!plate.markerId) errors.push(`请选择第 ${index + 1} 板 Marker。`);
      if (usedWells !== null && plate.wellCount && usedWells > plate.wellCount) errors.push(`第 ${index + 1} 板需要 ${usedWells} 个孔，超过 ${plate.wellCount} 孔梳子容量。`);
      if (usedWells !== null && plate.wellCount && usedWells <= plate.wellCount && plate.laneLabels.slice(0, usedWells).some((label) => !label.trim())) errors.push(`请填写第 ${index + 1} 板全部使用孔的孔名。`);
      if (plate.selectedProteinIds.length === 0) errors.push(`第 ${index + 1} 板尚未选择蛋白。`);
      const marker = westernBlotMarkers.find(({ id }) => id === plate.markerId);
      if (marker) {
        const maximumWeight = Math.max(...marker.bands.map(({ molecularWeight }) => molecularWeight));
        const hasOutOfRangeProtein = session.proteins.some((protein) => plate.selectedProteinIds.includes(protein.id) && (cleanNumber(protein.molecularWeight) ?? 0) > maximumWeight);
        if (hasOutOfRangeProtein) errors.push(`第 ${index + 1} 板有蛋白超出 ${marker.rangeLabel} Marker 的上限。`);
      }
    });
    return Array.from(new Set(errors));
  }, [effectivePlates, lysisExcessVolume, session, usedWells, validSampleCount]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    setCompleted({});
  }, [session]);

  const updatePlate = (number: number, updater: (plate: PlateDesign) => PlateDesign) => {
    setSession((current) => ({ ...current, plates: current.plates.map((plate) => plate.number === number ? updater(plate) : plate) }));
  };

  const rebuildLaneLabels = (current: WesternBlotSession, sampleNames: string[], firstVolume = current.firstMarkerVolume, lastVolume = current.lastMarkerVolume) => current.plates.map((plate) => ({
    ...plate,
    laneLabels: plate.wellCount ? initialLaneLabels(plate.wellCount, sampleNames, firstVolume, lastVolume) : [],
  }));

  const updateSampleCount = (value: string) => {
    setSession((current) => {
      const count = Number(value);
      const sampleNames = Number.isInteger(count) && count > 0 && count <= 28
        ? Array.from({ length: count }, (_, index) => current.sampleNames[index] ?? `样本 ${index + 1}`)
        : [];
      return { ...current, sampleCount: value, sampleNames, plates: rebuildLaneLabels(current, sampleNames) };
    });
  };

  const updateSampleName = (index: number, value: string) => {
    setSession((current) => {
      const oldValue = current.sampleNames[index];
      const sampleNames = current.sampleNames.map((sample, sampleIndex) => sampleIndex === index ? value : sample);
      return {
        ...current,
        sampleNames,
        plates: current.plates.map((plate) => ({ ...plate, laneLabels: plate.laneLabels.map((label) => label === oldValue ? value : label) })),
      };
    });
  };

  const updateProtein = (id: string, field: 'name' | 'molecularWeight', value: string) => {
    setSession((current) => ({ ...current, proteins: current.proteins.map((protein) => protein.id === id ? { ...protein, [field]: value } : protein) }));
  };

  const addProtein = () => {
    setSession((current) => {
      const id = `target-${Date.now()}`;
      return {
        ...current,
        proteins: [...current.proteins, { id, role: 'target', name: '', molecularWeight: '' }],
        plates: current.plates.map((plate) => ({ ...plate, selectedProteinIds: [...plate.selectedProteinIds, id] })),
      };
    });
  };

  const removeProtein = (id: string) => {
    setSession((current) => ({
      ...current,
      proteins: current.proteins.filter((protein) => protein.id !== id),
      plates: current.plates.map((plate) => ({ ...plate, selectedProteinIds: plate.selectedProteinIds.filter((proteinId) => proteinId !== id) })),
    }));
  };

  const resetSession = () => {
    setSession(createDefaultSession());
    setCompleted({});
    setGuidePage(0);
    setTab('setup');
  };

  const selectedProteinsForPlate = (plate: PlateDesign) => session.proteins.filter(({ id }) => plate.selectedProteinIds.includes(id));

  const renderDynamicItem = (item: WesternBlotSopItem) => {
    if (item.kind === 'lysis-recipe') {
      return lysisRecipe ? (
        <div className="wb-recipe-card">
          <strong>本批次裂解液 · 总体积 {formatQuantity(lysisRecipe.totalVolume)} μl</strong>
          <p>{validSampleCount} 管 × 400 μl + 冗余 {formatQuantity(lysisRecipe.excessVolume)} μl</p>
          <dl><div><dt>50× 蛋白酶抑制剂</dt><dd>{formatQuantity(lysisRecipe.proteaseInhibitor)} μl</dd></div><div><dt>50× 磷酸酶抑制剂</dt><dd>{formatQuantity(lysisRecipe.phosphataseInhibitor)} μl</dd></div><div><dt>RIPA 裂解液</dt><dd>{formatQuantity(lysisRecipe.ripa)} μl</dd></div></dl>
        </div>
      ) : <div className="wb-inline-error"><CircleAlert size={16} />返回初始化填写样本数与裂解液冗余体积。</div>;
    }
    if (item.kind === 'denaturation-recipe') {
      return denaturationRecipe ? (
        <div className="wb-recipe-card"><strong>每管取总体积 300 μl，换到 1.5 ml 离心管</strong><p>5× Loading buffer 60 μl（总体积 ÷ 5）+ 蛋白液 240 μl。</p><dl><div><dt>{validSampleCount} 管 Loading buffer 合计</dt><dd>{formatQuantity(denaturationRecipe.batch.loadingBuffer)} μl</dd></div><div><dt>{validSampleCount} 管蛋白液合计</dt><dd>{formatQuantity(denaturationRecipe.batch.protein)} μl</dd></div></dl></div>
      ) : <div className="wb-inline-error"><CircleAlert size={16} />返回初始化填写本次测样数。</div>;
    }
    if (item.kind === 'gel-setup') return <p>取 {session.thickness ? formatQuantity(session.thickness) : '未选择'} mm 大板和对应小板，共 {batchPlateCount} 板，组装在夹子里，注入纯水验证是否漏液，至少 5 min。</p>;
    if (item.kind === 'gel-recipe' && gelRecipe) return (
      <div className="wb-recipe-card">
        <strong>{session.gelPercentage || '未填写'}% 凝胶 · {session.thickness ? formatQuantity(session.thickness) : '未选择'} mm · {batchPlateCount} 板总量</strong>
        <p>按照顺序：配下层胶 → 加促凝剂 → 灌下层胶 → 配上层胶 → 加促凝剂 → 灌上层胶。</p>
        <div className="wb-gel-recipe-grid"><dl><b>下层胶</b><div><dt>下层胶溶液</dt><dd>{formatQuantity(gelRecipe.batch.resolving.solution)} ml</dd></div><div><dt>下层胶缓冲液</dt><dd>{formatQuantity(gelRecipe.batch.resolving.buffer)} ml</dd></div><div><dt>促凝剂</dt><dd>{formatQuantity(gelRecipe.batch.resolving.accelerator)} μl</dd></div></dl><dl><b>上层胶</b><div><dt>上层胶溶液</dt><dd>{formatQuantity(gelRecipe.batch.stacking.solution)} ml</dd></div><div><dt>上层胶缓冲液</dt><dd>{formatQuantity(gelRecipe.batch.stacking.buffer)} ml</dd></div><div><dt>促凝剂</dt><dd>{formatQuantity(gelRecipe.batch.stacking.accelerator)} μl</dd></div></dl></div>
      </div>
    );
    if (item.kind === 'buffer-recipe' && bufferRecipe) return (
      <div className="wb-recipe-card"><strong>{batchPlateCount} 板批次：电泳液、转膜液各 {bufferRecipe.powderPacks} 包粉末</strong><dl><div><dt>电泳液</dt><dd>{bufferRecipe.powderPacks} 包 + {formatQuantity(bufferRecipe.running.waterBeforeCalibration)} ml 纯水，搅拌后定容至 {formatQuantity(bufferRecipe.running.finalVolume)} ml</dd></div><div><dt>转膜液</dt><dd>{bufferRecipe.powderPacks} 包 + {formatQuantity(bufferRecipe.transfer.ethanol)} ml 无水乙醇 + {formatQuantity(bufferRecipe.transfer.waterBeforeCalibration)} ml 纯水，搅拌后定容至 {formatQuantity(bufferRecipe.transfer.finalVolume)} ml</dd></div></dl></div>
    );
    if (item.kind === 'electrophoresis-setup') return (
      <div className="wb-recipe-card">
        <strong>本批次上样与电泳槽设置</strong>
        <p>放入电泳槽，两板之间灌满电泳液，然后灌至 <b>{batchPlateCount} 板水位线</b>。每个样本孔上样 <b>{session.loadingVolume || '未填写'} μl</b>，首孔 Marker <b>{session.firstMarkerVolume || '未填写'} μl</b>，末孔 Marker <b>{session.lastMarkerVolume || '未填写'} μl</b>。</p>
        <div className="wb-guide-plate-list">{activePlates.map((plate) => {
          const source = effectivePlate(plate);
          const marker = westernBlotMarkers.find(({ id }) => id === source.markerId);
          return <p key={plate.number}><b>第 {plate.number} 板{plate.repeated ? `（重复第 ${plate.number - 1} 板）` : ''}</b>：{source.wellCount || '未选'} 孔；{marker ? `${marker.name} ${marker.rangeLabel}` : '未选 Marker'}；{selectedProteinsForPlate(source).map(({ name }) => name || '未命名蛋白').join('、')}</p>;
        })}</div>
      </div>
    );
    if (item.kind === 'electrophoresis-run') return <p>电压设置为 <b>{session.voltage || '未填写'} V</b>，跑至最大 Marker 离开上层胶且最小 Marker 到底、各小 Marker 充分分散，约 25 min。</p>;
    if (item.kind === 'transfer-setup') return <p>取 <b>{batchPlateCount} 个夹板</b>放在灌转膜液的水槽里浸透水，取 <b>{batchPlateCount} 个 PVDF 膜</b>用无水乙醇激活。</p>;
    if (item.kind === 'transfer-run') return <p>把夹板放进转膜芯里，注意膜朝向红色面；放入电泳槽，另一空槽放冰盒，灌满转膜液，在盆里冰浴，电流 <b>{session.transferCurrent || '未填写'} mA</b>，约 60 min。</p>;
    if (item.kind === 'primary-antibody') return (
      <div className="wb-recipe-card"><strong>按本批次膜图切膜并孵育一抗</strong><div className="wb-guide-plate-list">{activePlates.map((plate) => {
        const source = effectivePlate(plate);
        const names = selectedProteinsForPlate(source).map((protein) => `${protein.name || '未命名'} ${protein.molecularWeight || '?'} kDa`).join('、');
        const cuts = source.cutLines.length ? source.cutLines.map((line) => `${formatQuantity(line)} kDa`).join('、') : '未添加切膜线';
        return <p key={plate.number}><b>第 {plate.number} 板{plate.repeated ? `（重复第 ${plate.number - 1} 板）` : ''}</b>：{names || '未选择蛋白'}；{cuts}</p>;
      })}</div><p>根据图纸切膜，剪左上角标记，加 3 ml 稀释后的一抗，4℃ 冰箱慢摇过夜。</p><p>一抗稀释液浓度（或预配）：<b>{session.primaryDilution || '未填写'}</b></p></div>
    );
    if (item.kind === 'secondary-antibody') return <div className="wb-recipe-card"><strong>二抗：{session.secondaryAntibody || '未填写'}</strong><p>回收一抗，TBST 快摇漂洗 10 min × 3 次；加 3 ml 稀释后的二抗，慢摇 1 h；回收二抗，TBST 快摇漂洗 10 min × 3 次。</p></div>;
    return <p>{item.text}</p>;
  };

  const currentSection = westernBlotSopSections[guidePage];
  const completedCount = Object.values(completed).filter(Boolean).length;
  const totalSteps = westernBlotSopSections.reduce((total, section) => total + section.items.length, 0);

  return (
    <main className="detail-page qpcr-workspace wb-workspace">
      <div className="qpcr-hero wb-hero">
        <Link className="back-link" to="/"><ArrowLeft size={18} />返回工具列表</Link>
        <div className="qpcr-hero-main"><div><span className="section-kicker">INTERACTIVE SOP TOOL</span><h1>组织提蛋白 + Western blotting</h1><div className="version-row"><span>仅交互工具</span><span>配置与设计本地保存</span><span>内容来源：用户提供的优化文档</span></div></div></div>
        <div className="source-alert"><FlaskConical size={18} /><span>本工具不附加 PDF 或版本信息；实验步骤与参数仅依据本次提供的 wb.md，括号中未给默认值的字段需在初始化中填写。</span></div>
      </div>

      <nav className="qpcr-tabs wb-tabs" aria-label="Western blot SOP 工具">
        <button type="button" className={tab === 'setup' ? 'active' : ''} onClick={() => setTab('setup')}><Settings2 size={17} /><span>初始化与胶板设计</span></button>
        <button type="button" className={tab === 'guide' ? 'active' : ''} onClick={() => validationErrors.length === 0 && setTab('guide')} aria-disabled={validationErrors.length > 0}><ClipboardCheck size={17} /><span>互动 SOP</span></button>
      </nav>

      {tab === 'setup' && (
        <section className="qpcr-panel wb-setup-panel">
          <div className="panel-heading"><div><span className="section-kicker">RUN SETUP</span><h2>设置本次批次</h2><p>括号内有数字的字段已采用原文默认值；其他受控参数等待本次填写。</p></div><button type="button" className="text-button" onClick={resetSession}><RotateCcw size={16} />清空并恢复默认值</button></div>

          <div className="wb-setup-section">
            <div className="setup-card-title"><span>批次与上样</span><small>全局设置</small></div>
            <div className="wb-field-grid">
              <label className="wb-select-field"><span>板数</span><select value={session.plateCount} onChange={(event) => setSession((current) => ({ ...current, plateCount: event.target.value === '' ? '' : Number(event.target.value) as 2 | 4 }))}><option value="">请选择</option><option value={2}>2 板</option><option value={4}>4 板</option></select></label>
              <label className="wb-select-field"><span>板厚度（全局）</span><select value={session.thickness} onChange={(event) => setSession((current) => ({ ...current, thickness: event.target.value === '' ? '' : Number(event.target.value) as WesternBlotGelThickness }))}><option value="">请选择</option><option value={0.75}>0.75 mm</option><option value={1}>1.0 mm</option><option value={1.5}>1.5 mm</option></select></label>
              <NumberField label="凝胶浓度" value={session.gelPercentage} unit="%" onChange={(value) => setSession((current) => ({ ...current, gelPercentage: value }))} />
              <NumberField label="本次测样数" value={session.sampleCount} unit="个" min={1} step="1" onChange={updateSampleCount} />
              <NumberField label="每孔上样量" value={session.loadingVolume} unit="μl" onChange={(value) => setSession((current) => ({ ...current, loadingVolume: value }))} />
              <NumberField label="首孔 Marker" value={session.firstMarkerVolume} unit="μl" onChange={(value) => setSession((current) => ({ ...current, firstMarkerVolume: value, plates: rebuildLaneLabels(current, current.sampleNames, value, current.lastMarkerVolume) }))} />
              <NumberField label="末孔 Marker" value={session.lastMarkerVolume} unit="μl" onChange={(value) => setSession((current) => ({ ...current, lastMarkerVolume: value, plates: rebuildLaneLabels(current, current.sampleNames, current.firstMarkerVolume, value) }))} />
              <NumberField label="裂解液冗余体积" value={session.lysisExcessVolume} unit="μl" onChange={(value) => setSession((current) => ({ ...current, lysisExcessVolume: value }))} />
              <NumberField label="电泳电压" value={session.voltage} unit="V" onChange={(value) => setSession((current) => ({ ...current, voltage: value }))} />
              <NumberField label="转膜电流" value={session.transferCurrent} unit="mA" onChange={(value) => setSession((current) => ({ ...current, transferCurrent: value }))} />
            </div>
            {validSampleCount !== null && <p className="wb-derived-note">本次每板使用 {usedWells} 个孔（{validSampleCount} 个样本孔 + 2 个 Marker 孔）。</p>}
          </div>

          <div className="wb-setup-section">
            <div className="setup-card-title"><span>样本名称</span><small>{session.sampleNames.length} 个</small></div>
            {session.sampleNames.length ? <div className="wb-sample-grid">{session.sampleNames.map((sample, index) => <label key={`sample-${index}`}><span>{index + 1}</span><input value={sample} onChange={(event) => updateSampleName(index, event.target.value)} /></label>)}</div> : <p className="wb-empty-copy">填写本次测样数后生成样本名称。</p>}
          </div>

          <div className="wb-setup-section">
            <div className="setup-card-title"><span>目标蛋白与内参</span><small>用于每板勾选与膜图定位</small></div>
            <div className="wb-protein-inputs">{session.proteins.map((protein, index) => <div className="wb-protein-input" key={protein.id}><b>{protein.role === 'reference' ? '内参' : `目标 ${session.proteins.slice(0, index + 1).filter((item) => item.role === 'target').length}`}</b><label><span>蛋白名称</span><input value={protein.name} onChange={(event) => updateProtein(protein.id, 'name', event.target.value)} /></label><label><span>分子量</span><span className="wb-inline-number"><input type="number" min={0} step="any" value={protein.molecularWeight} onChange={(event) => updateProtein(protein.id, 'molecularWeight', event.target.value)} /><b>kDa</b></span></label>{session.proteins.length > 2 && protein.role === 'target' && <button type="button" onClick={() => removeProtein(protein.id)} aria-label={`删除${protein.name || '目标蛋白'}`}><Trash2 size={15} /></button>}</div>)}</div>
            <button type="button" className="add-row-button" onClick={addProtein}><Plus size={16} />添加目标蛋白</button>
          </div>

          <div className="wb-setup-section">
            <div className="setup-card-title"><span>抗体</span><small>原文括号字段</small></div>
            <div className="wb-text-field-grid"><label><span>一抗稀释液浓度（或预配）</span><input value={session.primaryDilution} onChange={(event) => setSession((current) => ({ ...current, primaryDilution: event.target.value }))} /></label><label><span>一抗所需二抗</span><input value={session.secondaryAntibody} onChange={(event) => setSession((current) => ({ ...current, secondaryAntibody: event.target.value }))} /></label></div>
          </div>

          <div className="wb-setup-section wb-design-section">
            <div className="setup-card-title"><span>胶板设计器</span><small>膜图高度按当前 Marker 的 0 kDa 至上限线性显示</small></div>
            {activePlates.length ? activePlates.map((plate) => (
              <article className="wb-plate-card" key={plate.number}>
                <header><div><span>PLATE {plate.number}</span><h3>第 {plate.number} 板</h3></div>{plate.number > 1 && <label className="wb-repeat-toggle"><input type="checkbox" checked={plate.repeated} onChange={(event) => updatePlate(plate.number, (current) => ({ ...current, repeated: event.target.checked }))} /><span>重复板（重复第 {plate.number - 1} 板）</span></label>}</header>
                <PlateDesigner
                  plate={plate}
                  sourcePlateNumber={plate.number > 1 ? plate.number - 1 : undefined}
                  proteins={session.proteins}
                  sampleNames={session.sampleNames}
                  firstMarkerVolume={session.firstMarkerVolume}
                  lastMarkerVolume={session.lastMarkerVolume}
                  onChange={(updater) => updatePlate(plate.number, updater)}
                />
              </article>
            )) : <div className="wb-designer-placeholder wb-designer-empty">选择板数后生成对应胶板。</div>}
          </div>

          {validationErrors.length > 0 && <div className="wb-validation-summary" role="alert"><CircleAlert size={18} /><div><strong>完成以下项目后可进入互动 SOP</strong><ul>{validationErrors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
          <div className="setup-sticky-action"><button type="button" disabled={validationErrors.length > 0} onClick={() => { setGuidePage(0); setTab('guide'); }}><span>进入互动 SOP</span><ArrowRight size={17} /></button></div>
        </section>
      )}

      {tab === 'guide' && (
        <section className="qpcr-panel wb-guide-panel">
          <div className="guide-progress"><div><span>完成进度</span><strong>{completedCount} / {totalSteps}</strong><small>修改初始化参数会清空勾选状态</small></div><div className="progress-track"><span style={{ width: `${totalSteps ? completedCount / totalSteps * 100 : 0}%` }} /></div></div>
          <div className="guide-heading"><span className="section-kicker">{currentSection.kicker}</span><h2>{currentSection.title}</h2><p>{currentSection.summary}</p></div>
          <div className="wb-guide-items">
            {currentSection.items.map((item, index) => {
              const key = `${currentSection.id}-${index}`;
              return <article className={`wb-guide-item ${completed[key] ? 'completed' : ''}`} key={key}><button type="button" className="wb-step-check" onClick={() => setCompleted((current) => ({ ...current, [key]: !current[key] }))} aria-label={completed[key] ? '标记为未完成' : '标记为已完成'}>{completed[key] ? <Check size={15} /> : <span>{index + 1}</span>}</button><div>{renderDynamicItem(item)}{item.details && <ul>{item.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}{item.warning && <div className="wb-warning"><CircleAlert size={15} />{item.warning}</div>}</div></article>;
            })}
          </div>
          <div className="guide-pagination"><button type="button" disabled={guidePage === 0} onClick={() => setGuidePage((page) => Math.max(0, page - 1))}><ChevronLeft size={16} />上一步</button><span>{guidePage + 1} / {westernBlotSopSections.length}</span><button type="button" disabled={guidePage === westernBlotSopSections.length - 1} onClick={() => setGuidePage((page) => Math.min(westernBlotSopSections.length - 1, page + 1))}>下一步<ChevronRight size={16} /></button></div>
          <div className="guide-floating-pagination"><div className="progress-track"><span style={{ width: `${(guidePage + 1) / westernBlotSopSections.length * 100}%` }} /></div><button type="button" disabled={guidePage === 0} onClick={() => setGuidePage((page) => Math.max(0, page - 1))} aria-label="上一页"><ChevronLeft size={17} /></button><div className="page-dots">{westernBlotSopSections.map((section, index) => <button type="button" key={section.id} className={index === guidePage ? 'active' : ''} onClick={() => setGuidePage(index)} aria-label={`打开${section.title}`} />)}</div><button type="button" disabled={guidePage === westernBlotSopSections.length - 1} onClick={() => setGuidePage((page) => Math.min(westernBlotSopSections.length - 1, page + 1))} aria-label="下一页"><ChevronRight size={17} /></button></div>
        </section>
      )}
    </main>
  );
}
