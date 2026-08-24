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
  ExternalLink,
  FlaskConical,
  GripHorizontal,
  LayoutGrid,
  NotebookPen,
  Plus,
  RotateCcw,
  Save,
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
  groupWesternBlotPlateRepeats,
  resolveWesternBlotRepeatSourceIndex,
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
type GelPercentage = '6' | '8' | '10' | '12.5' | '';
type SecondaryAntibody = '鼠抗' | '兔抗' | '';
type LysisExcessVolume = '100' | '200';

type ProteinInput = {
  id: string;
  role: ProteinRole;
  name: string;
  molecularWeight: string;
  primaryDilution: string;
  secondaryAntibody: SecondaryAntibody;
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
  gelPercentage: GelPercentage;
  sampleCount: string;
  sampleNames: string[];
  loadingVolume: string;
  denaturationVolume: string;
  firstMarkerVolume: string;
  lastMarkerVolume: string;
  addLysisExcess: boolean;
  lysisExcessVolume: LysisExcessVolume;
  voltage: string;
  transferCurrent: string;
  proteins: ProteinInput[];
  plates: PlateDesign[];
  notes: Record<string, string>;
  completed: Record<string, boolean>;
};

const STORAGE_KEY = 'labsop:western-blot-session:v3';
const LEGACY_STORAGE_KEYS = ['labsop:western-blot-session:v2', 'labsop:western-blot-session:v1'];
const DEFAULT_PROTEINS: ProteinInput[] = [
  { id: 'target-1', role: 'target', name: '', molecularWeight: '', primaryDilution: '', secondaryAntibody: '' },
  { id: 'reference-1', role: 'reference', name: '', molecularWeight: '', primaryDilution: '', secondaryAntibody: '' },
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
    loadingVolume: '10',
    denaturationVolume: '300',
    firstMarkerVolume: '5',
    lastMarkerVolume: '3',
    addLysisExcess: false,
    lysisExcessVolume: '100',
    voltage: '250',
    transferCurrent: '400',
    proteins: DEFAULT_PROTEINS.map((protein) => ({ ...protein })),
    plates: [createPlate(1, false), createPlate(2, true), createPlate(3, false), createPlate(4, true)],
    notes: {},
    completed: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<Record<string, string>>((result, [key, entry]) => {
    if (typeof entry === 'string') result[key] = entry;
    return result;
  }, {});
}

function booleanRecord(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<Record<string, boolean>>((result, [key, entry]) => {
    if (typeof entry === 'boolean') result[key] = entry;
    return result;
  }, {});
}

function loadSession(): WesternBlotSession {
  const fallback = createDefaultSession();
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
      ?? LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find((value) => value !== null);
    if (!saved) return fallback;
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) return fallback;

    const legacyPrimaryDilution = stringValue(parsed.primaryDilution, '');
    const legacySecondaryAntibody: SecondaryAntibody = parsed.secondaryAntibody === '鼠抗' || parsed.secondaryAntibody === '兔抗'
      ? parsed.secondaryAntibody
      : '';
    const proteins = Array.isArray(parsed.proteins)
      ? parsed.proteins.flatMap((value): ProteinInput[] => {
        if (!isRecord(value) || typeof value.id !== 'string') return [];
        return [{
          id: value.id,
          role: value.role === 'reference' ? 'reference' : 'target',
          name: stringValue(value.name, ''),
          molecularWeight: stringValue(value.molecularWeight, ''),
          primaryDilution: stringValue(value.primaryDilution, legacyPrimaryDilution),
          secondaryAntibody: value.secondaryAntibody === '鼠抗' || value.secondaryAntibody === '兔抗'
            ? value.secondaryAntibody
            : legacySecondaryAntibody,
        }];
      })
      : [];
    const safeProteins = [...(proteins.length >= 2 ? proteins : fallback.proteins)].sort((left, right) => {
      if (left.role === right.role) return 0;
      return left.role === 'reference' ? 1 : -1;
    });
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
    const normalizedPlates = plates.map((plate) => plate.number === 4 && plates[2].repeated
      ? { ...plate, repeated: true }
      : plate);

    return {
      plateCount: parsed.plateCount === 2 || parsed.plateCount === 4 ? parsed.plateCount : '',
      thickness: parsed.thickness === 0.75 || parsed.thickness === 1 || parsed.thickness === 1.5 ? parsed.thickness : '',
      gelPercentage: parsed.gelPercentage === '6' || parsed.gelPercentage === '8' || parsed.gelPercentage === '10' || parsed.gelPercentage === '12.5' ? parsed.gelPercentage : '',
      sampleCount: stringValue(parsed.sampleCount, ''),
      sampleNames,
      loadingVolume: stringValue(parsed.loadingVolume, '10'),
      denaturationVolume: stringValue(parsed.denaturationVolume, '300'),
      firstMarkerVolume: stringValue(parsed.firstMarkerVolume, '5'),
      lastMarkerVolume: stringValue(parsed.lastMarkerVolume, '3'),
      addLysisExcess: parsed.addLysisExcess === true,
      lysisExcessVolume: parsed.lysisExcessVolume === '200' ? '200' : '100',
      voltage: stringValue(parsed.voltage, '250'),
      transferCurrent: stringValue(parsed.transferCurrent, '400'),
      proteins: safeProteins,
      plates: normalizedPlates,
      notes: stringRecord(parsed.notes),
      completed: booleanRecord(parsed.completed),
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

function MarkerPlot({ plate, proteins, onChangeCutLine, onDeleteCutLine, readOnly = false, showRightCutLine = false }: {
  plate: ConfiguredPlateDesign;
  proteins: ProteinInput[];
  onChangeCutLine: (index: number, value: number) => void;
  onDeleteCutLine: (index: number) => void;
  readOnly?: boolean;
  showRightCutLine?: boolean;
}) {
  const marker = westernBlotMarkers.find(({ id }) => id === plate.markerId) ?? westernBlotMarkers[0];
  const maximumWeight = Math.max(...marker.bands.map(({ molecularWeight }) => molecularWeight));
  const markerWidth = 100 / plate.wellCount;
  const selectedProteins = proteins.filter(({ id }) => plate.selectedProteinIds.includes(id));
  const lastEffectiveLaneIndex = plate.laneLabels.reduce(
    (lastIndex, label, index) => label.trim() ? index : lastIndex,
    -1,
  );
  const rightCutLinePosition = lastEffectiveLaneIndex >= 0
    ? ((lastEffectiveLaneIndex + 1) / plate.wellCount) * 100
    : 100;

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
        {plate.laneLabels.map((label, index) => <span key={`lane-${index}`} title={label}>{label}</span>)}
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
          if (readOnly) {
            return <div className="wb-cut-line readonly" style={{ top: `${top}%` }} key={`cut-${index}`}><span>切膜线</span></div>;
          }
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
        {showRightCutLine && <div className="wb-right-cut-line" style={{ left: `${rightCutLinePosition}%` }}><span>切膜线</span></div>}
        <span className="wb-zero-label">0 kDa</span>
      </div>
      {!readOnly && plate.cutLines.length > 0 && (
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
        plate={{ ...plate, cutLines: [] } as ConfiguredPlateDesign}
        proteins={proteins}
        readOnly
        onChangeCutLine={() => undefined}
        onDeleteCutLine={() => undefined}
      /> : <div className="wb-designer-placeholder">选择孔数和 Marker 后显示膜图。</div>}
    </div>
  );
}

export default function WesternBlotTool() {
  const [tab, setTab] = useState<ToolTab>('setup');
  const [guidePage, setGuidePage] = useState(0);
  const [visibleCutPlateNumbers, setVisibleCutPlateNumbers] = useState<number[]>([1, 2, 3, 4]);
  const [session, setSession] = useState<WesternBlotSession>(loadSession);

  const sampleCount = cleanNumber(session.sampleCount);
  const validSampleCount = sampleCount !== null && Number.isInteger(sampleCount) && sampleCount > 0 ? sampleCount : null;
  const lysisExcessVolume = session.addLysisExcess ? Number(session.lysisExcessVolume) : 0;
  const batchPlateCount = session.plateCount === '' ? 0 : session.plateCount;
  const activePlates = session.plates.slice(0, batchPlateCount);
  const effectivePlate = (plate: PlateDesign) => {
    const sourceIndex = resolveWesternBlotRepeatSourceIndex(
      plate.number - 1,
      session.plates.map(({ repeated }) => repeated),
    );
    return sourceIndex === null ? plate : session.plates[sourceIndex];
  };
  const effectivePlates = activePlates.map(effectivePlate);
  const usedWells = validSampleCount === null ? null : calculateWesternBlotUsedWells(validSampleCount);
  const lysisRecipe = validSampleCount !== null
    ? calculateWesternBlotLysisRecipe(validSampleCount, lysisExcessVolume)
    : null;
  const denaturationVolume = cleanNumber(session.denaturationVolume);
  const denaturationRecipe = denaturationVolume === null
    ? null
    : calculateWesternBlotDenaturationRecipe(denaturationVolume);
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
    if (session.proteins.length < 2 || session.proteins.some((protein) => !protein.name.trim() || (cleanNumber(protein.molecularWeight) ?? 0) <= 0)) errors.push('请填写每个蛋白的名称和大于 0 的分子量。');
    if (session.proteins.some((protein) => !protein.primaryDilution.trim())) errors.push('请填写每个蛋白的一抗浓度或预配信息。');
    if (session.proteins.some((protein) => !protein.secondaryAntibody)) errors.push('请为每个蛋白选择二抗。');
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

  const updatePlate = (number: number, updater: (plate: PlateDesign) => PlateDesign) => {
    setSession((current) => ({ ...current, plates: current.plates.map((plate) => plate.number === number ? updater(plate) : plate) }));
  };

  const updateRepeatedPlate = (number: number, repeated: boolean) => {
    setSession((current) => ({
      ...current,
      plates: current.plates.map((plate) => {
        if (plate.number === number) return { ...plate, repeated };
        if (number === 3 && repeated && plate.number === 4) return { ...plate, repeated: true };
        return plate;
      }),
    }));
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

  const updateProtein = (id: string, field: 'name' | 'molecularWeight' | 'primaryDilution' | 'secondaryAntibody', value: string) => {
    setSession((current) => ({
      ...current,
      proteins: current.proteins.map((protein) => {
        if (protein.id !== id) return protein;
        if (field === 'secondaryAntibody') {
          const secondaryAntibody: SecondaryAntibody = value === '鼠抗' || value === '兔抗' ? value : '';
          return { ...protein, secondaryAntibody };
        }
        return { ...protein, [field]: value };
      }),
    }));
  };

  const addProtein = () => {
    setSession((current) => {
      const id = `target-${Date.now()}`;
      const target: ProteinInput = { id, role: 'target', name: '', molecularWeight: '', primaryDilution: '', secondaryAntibody: '' };
      return {
        ...current,
        proteins: [target, ...current.proteins],
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
    setVisibleCutPlateNumbers([1, 2, 3, 4]);
    setGuidePage(0);
    setTab('setup');
  };

  const renderPlateDiagrams = () => {
    const plateGroups = groupWesternBlotPlateRepeats(activePlates.map(({ repeated }) => repeated));
    return (
      <div className="wb-guide-diagrams">
        {plateGroups.map((group) => {
          const source = activePlates[group.sourceIndex];
          if (!source.wellCount || !source.markerId) return null;
          const plateNumbers = group.plateIndices.map((index) => activePlates[index].number);
          const diagram: ConfiguredPlateDesign = {
            ...source,
            number: plateNumbers[0],
            wellCount: source.wellCount,
            markerId: source.markerId,
            cutLines: [],
          };
          return (
            <article key={group.sourceIndex}>
              <div className="wb-diagram-plate-pills" aria-label={`适用胶板：${plateNumbers.join('、')}`}>
                {plateNumbers.map((number) => <span key={number}>胶板 {number}</span>)}
              </div>
              <MarkerPlot
                plate={diagram}
                proteins={session.proteins}
                readOnly
                onChangeCutLine={() => undefined}
                onDeleteCutLine={() => undefined}
              />
            </article>
          );
        })}
      </div>
    );
  };

  const renderCuttingPlan = () => {
    const visiblePlates = activePlates.filter(({ number }) => visibleCutPlateNumbers.includes(number));
    return (
      <>
        <fieldset className="wb-cut-visibility">
          <legend>显示 / 隐藏胶板</legend>
          {activePlates.map((plate) => (
            <label key={plate.number}>
              <input
                type="checkbox"
                checked={visibleCutPlateNumbers.includes(plate.number)}
                onChange={(event) => setVisibleCutPlateNumbers((current) => event.target.checked
                  ? [...current, plate.number]
                  : current.filter((number) => number !== plate.number))}
              />
              <span>胶板 {plate.number}</span>
            </label>
          ))}
        </fieldset>
        {visiblePlates.length > 0 ? (
          <div className="wb-guide-diagrams wb-cutting-plans">
            {visiblePlates.map((plate) => {
              const source = effectivePlate(plate);
              if (!source.wellCount || !source.markerId) return null;
              const marker = westernBlotMarkers.find(({ id }) => id === source.markerId);
              const maximumWeight = marker
                ? Math.max(...marker.bands.map(({ molecularWeight }) => molecularWeight))
                : 0;
              const diagram: ConfiguredPlateDesign = {
                ...source,
                number: plate.number,
                wellCount: source.wellCount,
                markerId: source.markerId,
                cutLines: plate.cutLines,
              };
              return (
                <article key={plate.number}>
                  <div className="wb-cut-plan-header">
                    <div className="wb-diagram-plate-pills">
                      <span>胶板 {plate.number}</span>
                      {plate.repeated && <span>布局重复胶板 {plate.number - 1}</span>}
                    </div>
                    <button
                      type="button"
                      className="wb-add-cut"
                      disabled={!maximumWeight}
                      onClick={() => updatePlate(plate.number, (current) => ({
                        ...current,
                        cutLines: [...current.cutLines, Math.round(maximumWeight / 2)],
                      }))}
                    >
                      <Plus size={15} />添加切膜线
                    </button>
                  </div>
                  <MarkerPlot
                    plate={diagram}
                    proteins={session.proteins}
                    showRightCutLine
                    onChangeCutLine={(index, value) => updatePlate(plate.number, (current) => ({
                      ...current,
                      cutLines: current.cutLines.map((line, lineIndex) => lineIndex === index ? value : line),
                    }))}
                    onDeleteCutLine={(index) => updatePlate(plate.number, (current) => ({
                      ...current,
                      cutLines: current.cutLines.filter((_, lineIndex) => lineIndex !== index),
                    }))}
                  />
                </article>
              );
            })}
          </div>
        ) : <div className="wb-designer-placeholder">勾选需要显示并设计切膜方案的胶板。</div>}
      </>
    );
  };

  const renderDynamicItem = (item: WesternBlotSopItem) => {
    if (item.kind === 'lysis-recipe') {
      return lysisRecipe ? (
        <div className="wb-recipe-card">
          <strong>本批次裂解液 · 总体积 {formatQuantity(lysisRecipe.totalVolume)} μl</strong>
          <div className="wb-inline-options">
            <label><input type="checkbox" checked={session.addLysisExcess} onChange={(event) => setSession((current) => ({ ...current, addLysisExcess: event.target.checked }))} /><span>添加冗余</span></label>
            {session.addLysisExcess && <label><span>冗余量</span><select value={session.lysisExcessVolume} onChange={(event) => setSession((current) => ({ ...current, lysisExcessVolume: event.target.value as LysisExcessVolume }))}><option value="100">+100 μl</option><option value="200">+200 μl</option></select></label>}
          </div>
          <p><b>{validSampleCount} 管</b> × 400 μl {session.addLysisExcess ? <>+ 冗余 <b>{formatQuantity(lysisRecipe.excessVolume)} μl</b></> : '（不添加冗余）'}</p>
          <dl><div><dt>50× 蛋白酶抑制剂</dt><dd>{formatQuantity(lysisRecipe.proteaseInhibitor)} μl</dd></div><div><dt>50× 磷酸酶抑制剂</dt><dd>{formatQuantity(lysisRecipe.phosphataseInhibitor)} μl</dd></div><div><dt>RIPA 裂解液</dt><dd>{formatQuantity(lysisRecipe.ripa)} μl</dd></div></dl>
        </div>
      ) : <div className="wb-inline-error"><CircleAlert size={16} />返回初始化填写本次测样数。</div>;
    }
    if (item.kind === 'denaturation-recipe') {
      return denaturationRecipe ? (
        <div className="wb-recipe-card">
          <div className="wb-denaturation-heading">
            <strong>每管取总体积</strong>
            <span className="wb-inline-number">
              <input
                type="number"
                min={0}
                step={100}
                value={session.denaturationVolume}
                aria-label="每管总体积"
                onChange={(event) => setSession((current) => ({ ...current, denaturationVolume: event.target.value }))}
              />
              <b>μl</b>
            </span>
            <strong>，换到 1.5 ml 离心管</strong>
          </div>
          <dl aria-label="单管变性配方">
            <div><dt>5× Loading buffer</dt><dd>{formatQuantity(denaturationRecipe.perTube.loadingBuffer)} μl</dd></div>
            <div><dt>蛋白液</dt><dd>{formatQuantity(denaturationRecipe.perTube.protein)} μl</dd></div>
          </dl>
        </div>
      ) : (
        <div className="wb-recipe-card">
          <div className="wb-denaturation-heading">
            <strong>每管取总体积</strong>
            <span className="wb-inline-number">
              <input
                type="number"
                min={0}
                step={100}
                value={session.denaturationVolume}
                aria-label="每管总体积"
                onChange={(event) => setSession((current) => ({ ...current, denaturationVolume: event.target.value }))}
              />
              <b>μl</b>
            </span>
            <strong>，换到 1.5 ml 离心管</strong>
          </div>
          <div className="wb-inline-error"><CircleAlert size={16} />每管总体积须大于 0 μl。</div>
        </div>
      );
    }
    if (item.kind === 'gel-setup') return <p>取 <b>{session.thickness ? formatQuantity(session.thickness) : '未选择'} mm</b> 大板和对应小板，共 <b>{batchPlateCount} 板</b>，组装在夹子里，注入纯水验证是否漏液，至少 5 min。</p>;
    if (item.kind === 'gel-kit') return <p>找到 <b>{session.gelPercentage || '未选择'}% 快胶盒</b>，在小塑料杯里按照说明书配胶。凝胶浓度仅决定快胶盒选择，不改变下方试剂量。</p>;
    if (item.kind === 'gel-recipe' && gelRecipe) return (
      <div className="wb-recipe-card">
        <strong>配胶 · {session.thickness ? formatQuantity(session.thickness) : '未选择'} mm · {batchPlateCount} 板总量</strong>
        <p>先配下层胶并加入促凝剂；下层胶灌注完成后，再配上层胶并加入促凝剂。</p>
        <div className="wb-gel-recipe-grid"><dl><b>下层胶</b><div><dt>下层胶溶液</dt><dd>{formatQuantity(gelRecipe.batch.resolving.solution)} ml</dd></div><div><dt>下层胶缓冲液</dt><dd>{formatQuantity(gelRecipe.batch.resolving.buffer)} ml</dd></div><div><dt>促凝剂</dt><dd>{formatQuantity(gelRecipe.batch.resolving.accelerator)} μl</dd></div></dl><dl><b>上层胶</b><div><dt>上层胶溶液</dt><dd>{formatQuantity(gelRecipe.batch.stacking.solution)} ml</dd></div><div><dt>上层胶缓冲液</dt><dd>{formatQuantity(gelRecipe.batch.stacking.buffer)} ml</dd></div><div><dt>促凝剂</dt><dd>{formatQuantity(gelRecipe.batch.stacking.accelerator)} μl</dd></div></dl></div>
      </div>
    );
    if (item.kind === 'gel-pouring' && gelRecipe) return (
      <div className="wb-recipe-card">
        <strong>灌胶 · 每板体积</strong>
        <p>下表混合液体积按两种胶液之和计算，忽略促凝剂体积。</p>
        <div className="wb-pour-table" role="table" aria-label="每板灌胶体积">
          <div role="row"><b role="columnheader">胶板</b><b role="columnheader">下层胶混合液</b><b role="columnheader">上层胶混合液</b></div>
          {activePlates.map((plate) => <div role="row" key={plate.number}><span role="cell">胶板 {plate.number}</span><strong role="cell">{formatQuantity(gelRecipe.pourPerPlate.resolving)} ml</strong><strong role="cell">{formatQuantity(gelRecipe.pourPerPlate.stacking)} ml</strong></div>)}
        </div>
      </div>
    );
    if (item.kind === 'buffer-recipe' && bufferRecipe) return (
      <div className="wb-recipe-card"><strong>{batchPlateCount} 板批次：电泳液、转膜液各 {bufferRecipe.powderPacks} 包粉末</strong><dl><div><dt>电泳液</dt><dd>{bufferRecipe.powderPacks} 包 + {formatQuantity(bufferRecipe.running.waterBeforeCalibration)} ml 纯水，搅拌后定容至 {formatQuantity(bufferRecipe.running.finalVolume)} ml</dd></div><div><dt>转膜液</dt><dd>{bufferRecipe.powderPacks} 包 + {formatQuantity(bufferRecipe.transfer.ethanol)} ml 无水乙醇 + {formatQuantity(bufferRecipe.transfer.waterBeforeCalibration)} ml 纯水，搅拌后定容至 {formatQuantity(bufferRecipe.transfer.finalVolume)} ml</dd></div></dl></div>
    );
    if (item.kind === 'electrophoresis-setup') return (
      <div className="wb-recipe-card">
        <strong>本批次上样与电泳槽设置</strong>
        <p>放入电泳槽，两板之间灌满电泳液，然后灌至 <b>{batchPlateCount} 板水位线</b>。每个样本孔上样 <b>{session.loadingVolume || '未填写'} μl</b>，首孔 Marker <b>{session.firstMarkerVolume || '未填写'} μl</b>，末孔 Marker <b>{session.lastMarkerVolume || '未填写'} μl</b>。</p>
      </div>
    );
    if (item.kind === 'electrophoresis-run') return (
      <div className="wb-recipe-card wb-step-parameter">
        <NumberField label="电泳电压" value={session.voltage} unit="V" onChange={(value) => setSession((current) => ({ ...current, voltage: value }))} />
        <p>以当前填写电压运行，跑至最大 Marker 离开上层胶且最小 Marker 到底、各小 Marker 充分分散，约 25 min。</p>
      </div>
    );
    if (item.kind === 'electrophoresis-layout') return <div><p>按照下方胶板设计图上样：</p>{renderPlateDiagrams()}</div>;
    if (item.kind === 'transfer-setup') return <p>取 <b>{batchPlateCount} 个夹板</b>放在灌转膜液的水槽里浸透水，取 <b>{batchPlateCount} 个 PVDF 膜</b>用无水乙醇激活。</p>;
    if (item.kind === 'transfer-run') return (
      <div className="wb-recipe-card wb-step-parameter">
        <NumberField label="转膜电流" value={session.transferCurrent} unit="mA" onChange={(value) => setSession((current) => ({ ...current, transferCurrent: value }))} />
        <p>把夹板放进转膜芯里，注意膜朝向红色面；放入电泳槽，另一空槽放冰盒，灌满转膜液，在盆里冰浴，以当前填写电流运行约 60 min。</p>
      </div>
    );
    if (item.kind === 'primary-antibody') return (
      <div className="wb-recipe-card"><strong>按本批次膜图切膜并孵育一抗</strong>{renderCuttingPlan()}<p>根据图纸切膜，剪左上角标记，加 3 ml 稀释后的一抗，4℃ 冰箱慢摇过夜。</p><dl className="wb-antibody-list">{session.proteins.map((protein) => <div key={protein.id}><dt>{protein.name || '未命名蛋白'}</dt><dd>一抗浓度：{protein.primaryDilution || '未填写'}</dd></div>)}</dl></div>
    );
    if (item.kind === 'secondary-antibody') return (
      <div className="wb-recipe-card"><strong>按蛋白分别选择二抗孵育</strong><dl className="wb-antibody-list">{session.proteins.map((protein) => <div key={protein.id}><dt>{protein.name || '未命名蛋白'}：</dt><dd>{protein.secondaryAntibody || '未选择'}</dd></div>)}</dl><p>各膜加入 3 ml 对应的稀释后二抗，慢摇 1 h。</p></div>
    );
    if (item.kind === 'exposure') return (
      <div className="wb-exposure-step">
        <p>{item.text}</p>
        <a href={item.href} target="_blank" rel="noopener noreferrer">
          点击预约曝光仪<ExternalLink size={15} />
        </a>
      </div>
    );
    return <p>{item.text}</p>;
  };

  const currentSection = westernBlotSopSections[guidePage];
  const completedCount = Object.values(session.completed).filter(Boolean).length;
  const totalSteps = westernBlotSopSections.reduce((total, section) => total + section.items.length, 0);
  const completedPages = westernBlotSopSections.map((section) => section.items.every((_, index) => session.completed[`${section.id}-${index}`]));
  const renderPageDots = (label: string) => (
    <div className="page-dots" aria-label={label}>
      {westernBlotSopSections.map((section, index) => {
        const isComplete = completedPages[index];
        return (
          <button
            type="button"
            key={section.id}
            className={[index === guidePage ? 'active' : '', isComplete ? 'completed' : ''].filter(Boolean).join(' ')}
            onClick={() => setGuidePage(index)}
            aria-current={index === guidePage ? 'page' : undefined}
            aria-label={`第 ${index + 1} 页：${section.title}${isComplete ? '，已完成' : ''}`}
          >
            {isComplete ? <Check size={14} aria-hidden="true" /> : index + 1}
          </button>
        );
      })}
    </div>
  );

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
              <label className="wb-select-field"><span>快胶盒浓度</span><select value={session.gelPercentage} onChange={(event) => setSession((current) => ({ ...current, gelPercentage: event.target.value as GelPercentage }))}><option value="">请选择</option><option value="6">6%</option><option value="8">8%</option><option value="10">10%</option><option value="12.5">12.5%</option></select></label>
              <NumberField label="本次测样数" value={session.sampleCount} unit="个" min={1} step="1" onChange={updateSampleCount} />
              <NumberField label="每孔上样量" value={session.loadingVolume} unit="μl" onChange={(value) => setSession((current) => ({ ...current, loadingVolume: value }))} />
              <NumberField label="首孔 Marker" value={session.firstMarkerVolume} unit="μl" onChange={(value) => setSession((current) => ({ ...current, firstMarkerVolume: value, plates: rebuildLaneLabels(current, current.sampleNames, value, current.lastMarkerVolume) }))} />
              <NumberField label="末孔 Marker" value={session.lastMarkerVolume} unit="μl" onChange={(value) => setSession((current) => ({ ...current, lastMarkerVolume: value, plates: rebuildLaneLabels(current, current.sampleNames, current.firstMarkerVolume, value) }))} />
            </div>
            {validSampleCount !== null && <p className="wb-derived-note">本次每板使用 {usedWells} 个孔（{validSampleCount} 个样本孔 + 2 个 Marker 孔）。</p>}
          </div>

          <div className="wb-setup-section">
            <div className="setup-card-title"><span>样本名称</span><small>{session.sampleNames.length} 个</small></div>
            {session.sampleNames.length ? <div className="wb-sample-grid">{session.sampleNames.map((sample, index) => <label key={`sample-${index}`}><span>{index + 1}</span><input value={sample} onChange={(event) => updateSampleName(index, event.target.value)} /></label>)}</div> : <p className="wb-empty-copy">填写本次测样数后生成样本名称。</p>}
          </div>

          <div className="wb-setup-section">
            <div className="setup-card-title"><span>目标蛋白、内参与抗体</span><small>每个蛋白分别设置浓度与二抗</small></div>
            <button type="button" className="add-row-button wb-protein-add" onClick={addProtein}><Plus size={16} />添加目标蛋白</button>
            <div className="wb-protein-inputs">{session.proteins.map((protein, index) => (
              <div className="wb-protein-input" key={protein.id}>
                <b>{protein.role === 'reference' ? '内参' : `目标 ${session.proteins.slice(0, index + 1).filter((item) => item.role === 'target').length}`}</b>
                <label><span>蛋白名称</span><input value={protein.name} onChange={(event) => updateProtein(protein.id, 'name', event.target.value)} /></label>
                <label><span>分子量</span><span className="wb-inline-number"><input type="number" min={0} step="any" value={protein.molecularWeight} onChange={(event) => updateProtein(protein.id, 'molecularWeight', event.target.value)} /><b>kDa</b></span></label>
                <label><span>一抗浓度（或预配）</span><input value={protein.primaryDilution} onChange={(event) => updateProtein(protein.id, 'primaryDilution', event.target.value)} /></label>
                <label><span>二抗</span><select value={protein.secondaryAntibody} onChange={(event) => updateProtein(protein.id, 'secondaryAntibody', event.target.value)}><option value="">请选择</option><option value="鼠抗">鼠抗</option><option value="兔抗">兔抗</option></select></label>
                {session.proteins.length > 2 && protein.role === 'target' && <button type="button" onClick={() => removeProtein(protein.id)} aria-label={`删除${protein.name || '目标蛋白'}`}><Trash2 size={15} /></button>}
              </div>
            ))}</div>
          </div>

          <div className="wb-setup-section wb-design-section">
            <div className="setup-card-title"><span>胶板设计器</span><small>膜图高度按当前 Marker 的 0 kDa 至上限线性显示</small></div>
            {activePlates.length ? activePlates.map((plate) => (
              <article className="wb-plate-card" key={plate.number}>
                <header><div><span>PLATE {plate.number}</span><h3>第 {plate.number} 板</h3></div>{plate.number > 1 && !(plate.number === 4 && session.plates[2].repeated) && <label className="wb-repeat-toggle"><input type="checkbox" checked={plate.repeated} onChange={(event) => updateRepeatedPlate(plate.number, event.target.checked)} /><span>重复板（重复第 {plate.number - 1} 板）</span></label>}</header>
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
          <div className="guide-progress"><div><span>完成进度</span><strong>{completedCount} / {totalSteps}</strong><small>勾选状态自动保存，切换标签页不会清空</small></div><div className="progress-track"><span style={{ width: `${totalSteps ? completedCount / totalSteps * 100 : 0}%` }} /></div></div>
          <div className="guide-heading"><span className="section-kicker">{currentSection.kicker}</span><h2>{currentSection.title}</h2><p>{currentSection.summary}</p></div>
          <div className="wb-guide-items">
            {currentSection.items.map((item, index) => {
              const key = `${currentSection.id}-${index}`;
              const isCompleted = session.completed[key] === true;
              return <article className={`wb-guide-item ${isCompleted ? 'completed' : ''}`} key={key}><button type="button" className="wb-step-check" onClick={() => setSession((current) => ({ ...current, completed: { ...current.completed, [key]: !current.completed[key] } }))} aria-label={isCompleted ? '标记为未完成' : '标记为已完成'}>{isCompleted ? <Check size={15} /> : <span>{index + 1}</span>}</button><div>{renderDynamicItem(item)}{item.details && <ul>{item.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}{item.warning && <div className="wb-warning"><CircleAlert size={15} />{item.warning}</div>}</div></article>;
            })}
          </div>
          <label className="notes-field">
            <span><NotebookPen size={17} />本页备注 <small><Save size={13} />自动保存于此浏览器</small></span>
            <textarea value={session.notes[currentSection.id] ?? ''} onChange={(event) => setSession((current) => ({ ...current, notes: { ...current.notes, [currentSection.id]: event.target.value } }))} placeholder="记录样本状态、异常情况或需要交接的信息…" />
          </label>
          <div className="guide-pagination"><button type="button" disabled={guidePage === 0} onClick={() => setGuidePage((page) => Math.max(0, page - 1))}><ChevronLeft size={16} />上一步</button>{renderPageDots('SOP 页码')}<button type="button" disabled={guidePage === westernBlotSopSections.length - 1} onClick={() => setGuidePage((page) => Math.min(westernBlotSopSections.length - 1, page + 1))}>下一步<ChevronRight size={16} /></button></div>
          <div className="guide-floating-pagination"><div className="progress-track"><span style={{ width: `${totalSteps ? completedCount / totalSteps * 100 : 0}%` }} /></div><button type="button" disabled={guidePage === 0} onClick={() => setGuidePage((page) => Math.max(0, page - 1))} aria-label="上一页"><ChevronLeft size={17} /></button>{renderPageDots('浮动 SOP 页码')}<button type="button" disabled={guidePage === westernBlotSopSections.length - 1} onClick={() => setGuidePage((page) => Math.min(westernBlotSopSections.length - 1, page + 1))} aria-label="下一页"><ChevronRight size={17} /></button></div>
        </section>
      )}
    </main>
  );
}
