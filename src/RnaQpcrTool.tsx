import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Download,
  FileText,
  LayoutGrid,
  LockKeyhole,
  Minus,
  NotebookPen,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  TestTubes,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  calculateRnaLoadingBatch,
  calculateTubeDistribution,
  createQpcrPlateLayout,
  summarizeQpcrPlateUsage,
  type RnaLoadingBatchResult,
} from './calculations';
import {
  reverseTranscriptionBranches,
  RNA_QPCR_PDF_FILE_NAME,
  RNA_QPCR_PDF_PATH,
  RNA_QPCR_VERSION,
  rnaQpcrSections,
} from './rnaQpcrData';

type ToolTab = 'setup' | 'guide' | 'plate' | 'distribution';
type PlateMode = 'auto' | 'manual';

type ManualWell = {
  primer?: string;
  sample?: string;
};

type ManualPlate = {
  number: number;
  wells: Record<string, ManualWell>;
};

type SessionState = {
  referencePrimer: string;
  targetPrimers: string[];
  samples: string[];
  replicates: number;
  extraReactions: number;
  concentrations: string[];
  notes: Record<string, string>;
  plateMode: PlateMode;
  manualPlates: ManualPlate[];
  manualLayoutDirty: boolean;
};

const STORAGE_KEY = 'labsop:rna-qpcr-session:v1';
const NO_MANUAL_ACTION = '__none__';
const CLEAR_MANUAL_VALUE = '__clear__';

const defaultSession: SessionState = {
  referencePrimer: '内参基因',
  targetPrimers: ['目的基因 1', '目的基因 2', '目的基因 3', '目的基因 4'],
  samples: ['样本 1', '样本 2', '样本 3', '样本 4', '样本 5', '样本 6'],
  replicates: 3,
  extraReactions: 1,
  concentrations: ['', '', '', '', '', ''],
  notes: {},
  plateMode: 'auto',
  manualPlates: [{ number: 1, wells: {} }],
  manualLayoutDirty: false,
};

const tabs: { id: ToolTab; label: string; Icon: typeof Settings2 }[] = [
  { id: 'setup', label: '初始化', Icon: Settings2 },
  { id: 'guide', label: '互动 SOP', Icon: ClipboardCheck },
  { id: 'plate', label: '96 孔板', Icon: LayoutGrid },
  { id: 'distribution', label: '总管分装', Icon: TestTubes },
];

function loadSession(): SessionState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultSession;
    const parsed = JSON.parse(saved) as Partial<SessionState>;
    const samples = Array.isArray(parsed.samples) ? parsed.samples : defaultSession.samples;
    const savedConcentrations = Array.isArray(parsed.concentrations) ? parsed.concentrations : [];
    return {
      referencePrimer: typeof parsed.referencePrimer === 'string' ? parsed.referencePrimer : defaultSession.referencePrimer,
      targetPrimers: Array.isArray(parsed.targetPrimers) ? parsed.targetPrimers : defaultSession.targetPrimers,
      samples,
      replicates: typeof parsed.replicates === 'number' ? parsed.replicates : defaultSession.replicates,
      extraReactions: typeof parsed.extraReactions === 'number' ? parsed.extraReactions : defaultSession.extraReactions,
      concentrations: samples.map((_, index) => {
        const value = savedConcentrations[index];
        return typeof value === 'string' ? value : '';
      }),
      notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {},
      plateMode: parsed.plateMode === 'manual' ? 'manual' : 'auto',
      manualPlates: Array.isArray(parsed.manualPlates) && parsed.manualPlates.length > 0
        ? parsed.manualPlates
        : defaultSession.manualPlates,
      manualLayoutDirty: typeof parsed.manualLayoutDirty === 'boolean'
        ? parsed.manualLayoutDirty
        : Boolean(parsed.manualPlates?.some((plate) => Object.keys(plate.wells ?? {}).length > 0) || (parsed.manualPlates?.length ?? 0) > 1),
    };
  } catch {
    return defaultSession;
  }
}

function formatUl(value: number): string {
  return `${value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} μl`;
}

function IntegerStepper({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitValue = (nextValue: number) => {
    const clampedValue = Math.min(max, Math.max(min, nextValue));
    setDraft(String(clampedValue));
    onChange(clampedValue);
  };

  return (
    <div className="integer-stepper">
      <span>{label}</span>
      <div className="stepper-control">
        <button type="button" disabled={value <= min} onClick={() => commitValue(value - 1)} aria-label={`${label}减少`}><Minus size={15} /></button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          onChange={(event) => {
            const nextDraft = event.target.value;
            if (nextDraft === '') {
              setDraft('');
              return;
            }
            if (/^\d+$/.test(nextDraft)) commitValue(Number(nextDraft));
          }}
          onBlur={() => {
            if (draft === '') setDraft(String(value));
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            commitValue(value + (event.key === 'ArrowUp' ? 1 : -1));
          }}
          aria-label={label}
        />
        <button type="button" disabled={value >= max} onClick={() => commitValue(value + 1)} aria-label={`${label}增加`}><Plus size={15} /></button>
      </div>
      <b>{unit}</b>
    </div>
  );
}

function fittedWellFontSize(value: string, maximumSize: number): string {
  const widthUnits = Array.from(value).reduce(
    (total, character) => total + ((character.codePointAt(0) ?? 0) > 255 ? 1 : 0.55),
    0,
  );
  return `${Math.min(maximumSize, 34 / Math.max(widthUnits, 1))}px`;
}

function manualPlatesFromAutoLayout(
  layout: ReturnType<typeof createQpcrPlateLayout>,
): ManualPlate[] {
  if (!layout) return [{ number: 1, wells: {} }];
  return layout.map((plate) => {
    const wells: Record<string, ManualWell> = {};
    plate.wells.forEach((well) => {
      wells[well.well] = { primer: well.primer, sample: well.sample };
    });
    return { number: plate.number, wells };
  });
}

export default function RnaQpcrTool() {
  const [tab, setTab] = useState<ToolTab>('setup');
  const [guidePage, setGuidePage] = useState(0);
  const [session, setSession] = useState<SessionState>(loadSession);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [roundCommonPool, setRoundCommonPool] = useState(true);
  const [roundPrimerTube, setRoundPrimerTube] = useState(false);
  const [manualPrimer, setManualPrimer] = useState(NO_MANUAL_ACTION);
  const [manualSample, setManualSample] = useState(NO_MANUAL_ACTION);

  const initializedSamples = useMemo(
    () => session.samples
      .map((sample) => sample.trim())
      .filter((sample) => sample && sample.toUpperCase() !== 'NTC'),
    [session.samples],
  );
  const allSamples = useMemo(() => [...initializedSamples, 'NTC'], [initializedSamples]);
  const allPrimers = useMemo(
    () => [session.referencePrimer, ...session.targetPrimers].map((primer) => primer.trim()).filter(Boolean),
    [session.referencePrimer, session.targetPrimers],
  );
  const hasPlateInitialization = allPrimers.length > 0 || initializedSamples.length > 0;

  const plateLayout = useMemo(
    () => createQpcrPlateLayout(
      session.referencePrimer,
      session.targetPrimers,
      allSamples,
      session.replicates,
    ),
    [allSamples, session.referencePrimer, session.replicates, session.targetPrimers],
  );
  const plateUsage = useMemo(
    () => summarizeQpcrPlateUsage(plateLayout?.flatMap((plate) => plate.wells) ?? []),
    [plateLayout],
  );
  const distributionPrepReactions = plateUsage.primerGroupCount
    * plateUsage.sampleCount
    * (session.replicates + session.extraReactions);
  const distribution = useMemo(
    () => calculateTubeDistribution(
      plateUsage.primerGroupCount,
      plateUsage.sampleCount,
      session.replicates,
      session.extraReactions,
      roundCommonPool,
      roundPrimerTube,
    ),
    [plateUsage.primerGroupCount, plateUsage.sampleCount, roundCommonPool, roundPrimerTube, session.extraReactions, session.replicates],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    const allowedPrimers = new Set(allPrimers);
    const allowedSamples = new Set(allSamples);
    setManualPrimer((current) => current === NO_MANUAL_ACTION || current === CLEAR_MANUAL_VALUE || allowedPrimers.has(current)
      ? current
      : NO_MANUAL_ACTION);
    setManualSample((current) => current === NO_MANUAL_ACTION || current === CLEAR_MANUAL_VALUE || allowedSamples.has(current)
      ? current
      : NO_MANUAL_ACTION);
    setSession((current) => {
      if (!current.manualLayoutDirty) {
        return { ...current, manualPlates: manualPlatesFromAutoLayout(plateLayout) };
      }
      let changed = false;
      const manualPlates = current.manualPlates.map((plate) => {
        let plateChanged = false;
        const wells: Record<string, ManualWell> = {};
        Object.entries(plate.wells).forEach(([well, assignment]) => {
          const primer = assignment.primer && allowedPrimers.has(assignment.primer) ? assignment.primer : undefined;
          const sample = assignment.sample && allowedSamples.has(assignment.sample) ? assignment.sample : undefined;
          if (primer !== assignment.primer || sample !== assignment.sample || (!primer && !sample)) {
            changed = true;
            plateChanged = true;
          }
          if (primer || sample) wells[well] = { primer, sample };
        });
        return plateChanged ? { ...plate, wells } : plate;
      });
      return changed ? { ...current, manualPlates } : current;
    });
  }, [allPrimers, allSamples, plateLayout]);

  const updateListItem = (field: 'targetPrimers' | 'samples', index: number, value: string) => {
    setSession((current) => field === 'targetPrimers'
      ? { ...current, targetPrimers: current.targetPrimers.map((item, itemIndex) => itemIndex === index ? value : item) }
      : { ...current, samples: current.samples.map((item, itemIndex) => itemIndex === index ? value : item) });
  };

  const addListItem = (field: 'targetPrimers' | 'samples') => {
    setSession((current) => {
      if (field === 'targetPrimers') {
        return { ...current, targetPrimers: [...current.targetPrimers, `目的基因 ${current.targetPrimers.length + 1}`] };
      }
      return {
        ...current,
        samples: [...current.samples, `样本 ${current.samples.length + 1}`],
        concentrations: [...current.concentrations, ''],
      };
    });
  };

  const removeListItem = (field: 'targetPrimers' | 'samples', index: number) => {
    setSession((current) => field === 'targetPrimers'
      ? { ...current, targetPrimers: current.targetPrimers.filter((_, itemIndex) => itemIndex !== index) }
      : {
          ...current,
          samples: current.samples.filter((_, itemIndex) => itemIndex !== index),
          concentrations: current.concentrations.filter((_, itemIndex) => itemIndex !== index),
        });
  };

  const resetSession = () => {
    const defaultPlateLayout = createQpcrPlateLayout(
      defaultSession.referencePrimer,
      defaultSession.targetPrimers,
      [...defaultSession.samples, 'NTC'],
      defaultSession.replicates,
    );
    setSession({ ...defaultSession, manualPlates: manualPlatesFromAutoLayout(defaultPlateLayout) });
    setCompleted({});
    setGuidePage(0);
    setRoundCommonPool(true);
    setRoundPrimerTube(false);
    setManualPrimer(NO_MANUAL_ACTION);
    setManualSample(NO_MANUAL_ACTION);
  };

  const updateManualWell = (plateNumber: number, wellName: string) => {
    if (manualPrimer === NO_MANUAL_ACTION && manualSample === NO_MANUAL_ACTION) return;
    setSession((current) => ({
      ...current,
      manualLayoutDirty: true,
      manualPlates: current.manualPlates.map((plate) => {
        if (plate.number !== plateNumber) return plate;
        const existing = plate.wells[wellName] ?? {};
        const primer = manualPrimer === NO_MANUAL_ACTION
          ? existing.primer
          : manualPrimer === CLEAR_MANUAL_VALUE ? undefined : manualPrimer;
        const sample = manualSample === NO_MANUAL_ACTION
          ? existing.sample
          : manualSample === CLEAR_MANUAL_VALUE ? undefined : manualSample;
        const wells = { ...plate.wells };
        if (primer || sample) wells[wellName] = { primer, sample };
        else delete wells[wellName];
        return { ...plate, wells };
      }),
    }));
  };

  const addManualPlate = () => {
    setSession((current) => ({
      ...current,
      manualLayoutDirty: true,
      manualPlates: [
        ...current.manualPlates,
        { number: (current.manualPlates.at(-1)?.number ?? 0) + 1, wells: {} },
      ],
    }));
  };

  const clearAllManualWells = () => {
    setSession((current) => ({
      ...current,
      manualLayoutDirty: true,
      manualPlates: current.manualPlates.map((plate) => ({ ...plate, wells: {} })),
    }));
  };

  const restoreManualDefaults = () => {
    setSession((current) => ({
      ...current,
      manualPlates: manualPlatesFromAutoLayout(plateLayout),
      manualLayoutDirty: false,
    }));
    setManualPrimer(NO_MANUAL_ACTION);
    setManualSample(NO_MANUAL_ACTION);
  };

  const selectTab = (nextTab: ToolTab) => {
    if (tab === 'guide' && nextTab !== 'guide') setCompleted({});
    setTab(nextTab);
  };

  const openPlateDesignerFromGuide = () => {
    setTab('plate');
  };

  const openDistributionFromGuide = () => {
    setTab('distribution');
  };

  const returnToQpcrGuide = () => {
    const qpcrPage = rnaQpcrSections.findIndex((section) => section.id === 'qpcr');
    if (qpcrPage >= 0) setGuidePage(qpcrPage);
    setTab('guide');
  };

  const pdfFile = `${import.meta.env.BASE_URL}${RNA_QPCR_PDF_PATH}`;

  return (
    <main className="detail-page qpcr-workspace">
      <div className="qpcr-hero">
        <Link className="back-link" to="/"><ArrowLeft size={18} />返回工具列表</Link>
        <div className="qpcr-hero-main">
          <div>
            <span className="section-kicker">FORMAL INTERACTIVE SOP</span>
            <h1>组织提 RNA（柱提法）+ qPCR</h1>
            <div className="version-row">
              <span>SOP 版本 ver.{RNA_QPCR_VERSION}</span>
              <span>配置与备注本地保存</span>
            </div>
          </div>
          <div className="qpcr-hero-actions">
            <Link className="secondary-button" to="/sop/rna-qpcr/pdf"><FileText size={18} />在线查看 PDF</Link>
            <a className="secondary-button" href={pdfFile} download={RNA_QPCR_PDF_FILE_NAME}><Download size={18} />下载原文件</a>
          </div>
        </div>
        <div className="source-alert"><FileText size={18} /><span>当前正确操作以网页内容为准；PDF 仅用于查看与下载，SOP 版本号仅从文件名读取，不校验 PDF 页面内容。</span></div>
      </div>

      <nav className="qpcr-tabs" aria-label="qPCR SOP 工具">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => selectTab(id)}>
            <Icon size={17} /><span>{label}</span>
          </button>
        ))}
      </nav>

      {tab === 'setup' && (
        <section className="qpcr-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">RUN SETUP</span><h2>设置本次批次</h2><p>先确定引物、样本与复孔数，后续板图和计算会直接使用这些信息。</p></div>
            <button className="text-button" onClick={resetSession}><RotateCcw size={16} />恢复典型批次</button>
          </div>

          <div className="setup-grid">
            <div className="setup-card">
              <div className="setup-card-title"><span>引物设置</span><small>{allPrimers.length} 组</small></div>
              <label className="named-field"><span>内参</span><input value={session.referencePrimer} onChange={(event) => setSession((current) => ({ ...current, referencePrimer: event.target.value }))} /></label>
              {session.targetPrimers.map((primer, index) => (
                <label className="named-field" key={`primer-${index}`}>
                  <span>目的 {index + 1}</span>
                  <input value={primer} onChange={(event) => updateListItem('targetPrimers', index, event.target.value)} />
                  <button type="button" onClick={() => removeListItem('targetPrimers', index)} aria-label={`删除${primer}`}><Trash2 size={15} /></button>
                </label>
              ))}
              <button className="add-row-button" onClick={() => addListItem('targetPrimers')}><Plus size={16} />添加目的基因</button>
            </div>

            <div className="setup-card">
              <div className="setup-card-title"><span>样本设置</span><small>{allSamples.length} 份（含 NTC）</small></div>
              {session.samples.map((sample, index) => (
                <label className="named-field" key={`sample-${index}`}>
                  <span>样本 {index + 1}</span>
                  <input value={sample} onChange={(event) => updateListItem('samples', index, event.target.value)} />
                  <button type="button" onClick={() => removeListItem('samples', index)} aria-label={`删除${sample}`}><Trash2 size={15} /></button>
                </label>
              ))}
              <div className="named-field locked-field"><span>对照</span><b>NTC</b><LockKeyhole size={15} aria-label="固定添加" /></div>
              <button className="add-row-button" onClick={() => addListItem('samples')}><Plus size={16} />添加样本</button>
            </div>
          </div>

          <div className="run-options">
            <IntegerStepper label="每组复孔" value={session.replicates} min={1} max={12} unit="孔" onChange={(value) => setSession((current) => ({ ...current, replicates: value }))} />
            <IntegerStepper label="每组冗余" value={session.extraReactions} min={0} max={12} unit="反应" onChange={(value) => setSession((current) => ({ ...current, extraReactions: value }))} />
          </div>

          <div className="setup-sticky-action">
            <button onClick={() => selectTab('guide')}>开始互动流程<ArrowRight size={17} /></button>
          </div>
        </section>
      )}

      {tab === 'guide' && (
        <InteractiveGuide
          page={guidePage}
          setPage={setGuidePage}
          completed={completed}
          notes={session.notes}
          samples={session.samples}
          concentrations={session.concentrations}
          onToggle={(key) => setCompleted((current) => ({ ...current, [key]: !current[key] }))}
          onNote={(key, value) => setSession((current) => ({ ...current, notes: { ...current.notes, [key]: value } }))}
          onConcentration={(index, value) => setSession((current) => ({
            ...current,
            concentrations: current.samples.map((_, itemIndex) => itemIndex === index ? value : (current.concentrations[itemIndex] ?? '')),
          }))}
          onOpenPlateDesigner={openPlateDesignerFromGuide}
          onOpenDistribution={openDistributionFromGuide}
        />
      )}

      {tab === 'plate' && (
        <section className="qpcr-panel plate-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">PLATE DESIGNER</span><h2>96 孔板设计器</h2><p>{session.plateMode === 'auto' ? '按初始化内容自动排板，并保证每块板都有完整内参和各引物 NTC。' : '选择要应用的引物和样本，再逐个点击孔位完成手动设置。'}</p></div>
            <div className="plate-heading-actions">
              <button className="return-sop-button" onClick={returnToQpcrGuide}><ArrowLeft size={15} />返回SOP</button>
              <div className="plate-mode-switch" aria-label="排板方式">
                <button disabled={!hasPlateInitialization} className={session.plateMode === 'auto' ? 'active' : ''} onClick={() => setSession((current) => ({ ...current, plateMode: 'auto' }))}>自动生成</button>
                <button disabled={!hasPlateInitialization} className={session.plateMode === 'manual' ? 'active' : ''} onClick={() => setSession((current) => ({ ...current, plateMode: 'manual' }))}>手动设置</button>
              </div>
              <div className="plate-count">{!hasPlateInitialization ? 0 : session.plateMode === 'auto' ? (plateLayout?.length ?? 0) : session.manualPlates.length} 块板</div>
            </div>
          </div>
          {!hasPlateInitialization ? (
            <div className="invalid-layout initialization-required">
              <CircleAlert size={24} />
              <strong>请先初始化</strong>
              <span>请返回“初始化”填写本次批次的引物和样本。</span>
              <button className="text-button" onClick={() => selectTab('setup')}>前往初始化</button>
            </div>
          ) : session.plateMode === 'auto' ? (
            plateLayout ? plateLayout.map((plate) => <PlateView key={plate.number} plate={plate} />) : (
              <div className="invalid-layout"><CircleAlert size={24} /><strong>当前设置无法按规则排入 96 孔板</strong><span>可减少样本数或复孔数，或切换到手动设置。</span></div>
            )
          ) : (
            <>
              <div className="manual-plate-toolbar">
                <label>
                  <span>引物</span>
                  <select value={manualPrimer} onChange={(event) => setManualPrimer(event.target.value)}>
                    <option value={NO_MANUAL_ACTION}>无（不修改）</option>
                    <option value={CLEAR_MANUAL_VALUE}>清空引物</option>
                    {allPrimers.map((primer, index) => <option value={primer} key={`${primer}-${index}`}>{primer}</option>)}
                  </select>
                </label>
                <label>
                  <span>样本</span>
                  <select value={manualSample} onChange={(event) => setManualSample(event.target.value)}>
                    <option value={NO_MANUAL_ACTION}>无（不修改）</option>
                    <option value={CLEAR_MANUAL_VALUE}>清空样本</option>
                    {allSamples.map((sample, index) => <option value={sample} key={`${sample}-${index}`}>{sample}</option>)}
                  </select>
                </label>
                <div className="manual-toolbar-actions">
                  <button type="button" onClick={clearAllManualWells} title="清空所有手动孔位，保留现有板数"><Trash2 size={15} />清空全部</button>
                  <button type="button" onClick={restoreManualDefaults} title="恢复当前自动生成的板图"><RotateCcw size={15} />恢复默认</button>
                </div>
                <p>手动设置默认沿用自动生成的板图。点击孔位时，仅修改选择器中不是“无”的属性；“恢复默认”可重新载入当前自动方案。</p>
              </div>
              {session.manualPlates.map((plate) => (
                <ManualPlateView
                  key={plate.number}
                  plate={plate}
                  primers={allPrimers}
                  referencePrimer={session.referencePrimer.trim()}
                  onWellClick={(wellName) => updateManualWell(plate.number, wellName)}
                />
              ))}
              <button className="add-plate-button" onClick={addManualPlate}><Plus size={17} />新增96孔板</button>
            </>
          )}
        </section>
      )}

      {tab === 'distribution' && (
        <section className="qpcr-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">MASTER MIX</span><h2>总管分装计算器</h2><p>数据只读取自动生成的 96 孔板，手动设计孔板不参与联动。</p></div>
            <button className="return-sop-button" onClick={returnToQpcrGuide}><ArrowLeft size={15} />返回SOP</button>
          </div>
          <div className="distribution-summary">
            <span>{plateUsage.primerGroupCount} 组实际上板引物</span><b>×</b><span>{plateUsage.sampleCount} 份实际上板样本（含 1 NTC）</span><b>×</b><span>{session.replicates} 复孔 + {session.extraReactions} 冗余</span><b>=</b><strong>{distributionPrepReactions} 份</strong>
          </div>
          <div className="rounding-controls">
            <label>
              <input type="checkbox" checked={roundCommonPool} onChange={(event) => setRoundCommonPool(event.target.checked)} />
              <span>①液向上取整至 10x</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={roundPrimerTube}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setRoundPrimerTube(checked);
                  if (checked) setRoundCommonPool(true);
                }}
              />
              <span>②液向上取整至 10x（联动①液）</span>
            </label>
          </div>
          {distribution ? (
            <div className="distribution-flow">
              <DistributionStage number="①" title="SYBR + 水总管" rows={[
                ['SYBR', formatUl(distribution.commonPool.sybr)],
                ['无酶无菌水', formatUl(distribution.commonPool.water)],
                ['合计', formatUl(distribution.commonPool.total)],
                ['完成引物管分装后留余', formatUl(distribution.commonPool.remainingAfterDistribution)],
              ]} footer={`配制倍数：${distribution.commonPoolReactions}x`} />
              <ChevronRight className="flow-arrow" size={26} />
              <DistributionStage number="②" title="每支引物管" rows={[
                ['取①液', formatUl(distribution.perPrimerTube.commonAliquot)],
                ['正向引物', formatUl(distribution.perPrimerTube.forwardPrimer)],
                ['反向引物', formatUl(distribution.perPrimerTube.reversePrimer)],
                ['合计', formatUl(distribution.perPrimerTube.total)],
                ['完成样本-引物管分装后留余', formatUl(distribution.perPrimerTube.remainingAfterDistribution)],
              ]} footer={`配制倍数：${distribution.reactionsPerPrimerTube}x`} />
              <ChevronRight className="flow-arrow" size={26} />
              <DistributionStage number="③" title="每支样本-引物管" rows={[
                ['取②液', formatUl(distribution.perSamplePrimerTube.primerMix)],
                ['cDNA / NTC 水', formatUl(distribution.perSamplePrimerTube.cdnaOrNtcWater)],
                ['合计', formatUl(distribution.perSamplePrimerTube.total)],
                ['上板后留余', formatUl(distribution.perSamplePrimerTube.remaining)],
              ]} footer={`共分 ${plateUsage.primerGroupCount * plateUsage.sampleCount} 支`} />
              <ChevronRight className="flow-arrow" size={26} />
              <article className="distribution-stage plating-stage">
                <div className="stage-heading"><span>④</span><h3>上板 {session.replicates} × 10 μl</h3></div>
              </article>
            </div>
          ) : (
            <div className="formula-warning"><CircleAlert size={18} /><p>当前 96 孔板没有可用于计算的完整引物—样本孔位。</p></div>
          )}
        </section>
      )}
    </main>
  );
}

function InteractiveGuide({
  page,
  setPage,
  completed,
  notes,
  samples,
  concentrations,
  onToggle,
  onNote,
  onConcentration,
  onOpenPlateDesigner,
  onOpenDistribution,
}: {
  page: number;
  setPage: (page: number) => void;
  completed: Record<string, boolean>;
  notes: Record<string, string>;
  samples: string[];
  concentrations: string[];
  onToggle: (key: string) => void;
  onNote: (key: string, value: string) => void;
  onConcentration: (index: number, value: string) => void;
  onOpenPlateDesigner: () => void;
  onOpenDistribution: () => void;
}) {
  const section = rnaQpcrSections[page];
  const concentrationEntries = samples.map((sample, index) => {
    const rawConcentration = concentrations[index]?.trim() ?? '';
    const concentration = Number(rawConcentration);
    return {
      sample: sample || `样本 ${index + 1}`,
      rawConcentration,
      concentration,
      isValid: rawConcentration !== '' && Number.isFinite(concentration) && concentration > 0,
    };
  });
  const allConcentrationsReady = concentrationEntries.length > 0 && concentrationEntries.every((entry) => entry.isValid);
  const batchPlan = allConcentrationsReady
    ? calculateRnaLoadingBatch(concentrationEntries.map((entry) => entry.concentration))
    : null;
  const completedCount = rnaQpcrSections.reduce(
    (count, current) => count + current.items.filter((_, index) => completed[`${current.id}:${index}`]).length,
    0,
  );
  const totalCount = rnaQpcrSections.reduce((count, current) => count + current.items.length, 0);
  const progressRef = useRef<HTMLDivElement>(null);
  const endPaginationRef = useRef<HTMLDivElement>(null);
  const [hasPassedProgress, setHasPassedProgress] = useState(false);
  const [isEndPaginationVisible, setIsEndPaginationVisible] = useState(false);

  useEffect(() => {
    const progress = progressRef.current;
    const endPagination = endPaginationRef.current;
    if (!progress || !endPagination) return;

    const progressObserver = new IntersectionObserver(([entry]) => {
      setHasPassedProgress(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
    });
    const endPaginationObserver = new IntersectionObserver(([entry]) => {
      setIsEndPaginationVisible(entry.isIntersecting);
    }, { threshold: 0.25 });

    progressObserver.observe(progress);
    endPaginationObserver.observe(endPagination);
    return () => {
      progressObserver.disconnect();
      endPaginationObserver.disconnect();
    };
  }, []);

  const progressPercent = totalCount ? (completedCount / totalCount) * 100 : 0;

  return (
    <section className="qpcr-panel guide-panel">
      <div className="guide-progress" ref={progressRef}>
        <div><span>总进度</span><strong>{completedCount} / {totalCount}</strong><small>退出后清空</small></div>
        <div className="progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
        <div className="page-dots" aria-label="SOP 页码">
          {rnaQpcrSections.map((item, index) => <button key={item.id} className={index === page ? 'active' : ''} onClick={() => setPage(index)} aria-label={`第 ${index + 1} 页：${item.title}`}>{index + 1}</button>)}
        </div>
      </div>
      <div className="guide-heading"><span className="section-kicker">{section.kicker}</span><h2>{section.title}</h2><p>{section.summary}</p></div>
      {section.id === 'rna-concentration' && (
        <div className="concentration-entry">
          <div className="embedded-tool-heading">
            <div><span>RNA CONCENTRATION</span><h3>记录本批次浓度</h3></div>
            <p>只需录入测量值；上样方案将在下一页“逆转录”中自动生成。</p>
          </div>
          <div className="concentration-entry-grid">
            {samples.map((sample, index) => (
              <label className="concentration-field" key={`concentration-${index}`}>
                <span>{sample || `样本 ${index + 1}`}</span>
                <div>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={concentrations[index] ?? ''}
                    onChange={(event) => onConcentration(index, event.target.value)}
                    placeholder="输入浓度"
                    aria-label={`${sample || `样本 ${index + 1}`} RNA 浓度`}
                  />
                  <b>ng/μl</b>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="checklist">
        {section.items.map((item, index) => {
          const key = `${section.id}:${index}`;
          const isDone = Boolean(completed[key]);
          return (
            <div className={`checklist-item ${isDone ? 'done' : ''}`} key={key}>
              <button className="check-button" onClick={() => onToggle(key)} aria-pressed={isDone} aria-label={`${isDone ? '取消完成' : '标记完成'}：${item.text}`}>
                {isDone ? <Check size={17} /> : <span>{index + 1}</span>}
              </button>
              <div>
                <p>{item.text}</p>
                {item.details && <ul>{item.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
                {item.warning && <div className="inline-warning"><CircleAlert size={16} /><span>{item.warning}</span></div>}
                {section.id === 'qpcr' && index === 0 && (
                  <button className="sop-tool-jump" onClick={onOpenPlateDesigner}><LayoutGrid size={16} />去设计图纸<ArrowRight size={15} /></button>
                )}
                {section.id === 'qpcr' && index === 1 && (
                  <button className="sop-tool-jump" onClick={onOpenDistribution}><TestTubes size={16} />可选：使用总管分装的方式配制体系<ArrowRight size={15} /></button>
                )}
                {section.id === 'reverse-transcription' && index === 2 && (
                  <ReverseTranscriptionPlan entries={concentrationEntries} batchPlan={batchPlan} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <label className="notes-field">
        <span><NotebookPen size={17} />本页备注 <small><Save size={13} />自动保存于此浏览器</small></span>
        <textarea value={notes[section.id] ?? ''} onChange={(event) => onNote(section.id, event.target.value)} placeholder="记录样本状态、异常情况或需要交接的信息…" />
      </label>
      <div className="guide-pagination" ref={endPaginationRef}>
        <button disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}><ChevronLeft size={18} />上一页</button>
        <span>第 {page + 1} / {rnaQpcrSections.length} 页</span>
        <button disabled={page === rnaQpcrSections.length - 1} onClick={() => setPage(Math.min(rnaQpcrSections.length - 1, page + 1))}>下一页<ChevronRight size={18} /></button>
      </div>
      {hasPassedProgress && !isEndPaginationVisible && (
        <nav className="guide-floating-pagination" aria-label="浮动 SOP 翻页">
          <div className="progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
          <button type="button" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}><ChevronLeft size={15} />上一页</button>
          <div className="page-dots" aria-label="浮动 SOP 页码">
            {rnaQpcrSections.map((item, index) => <button type="button" key={item.id} className={index === page ? 'active' : ''} onClick={() => setPage(index)} aria-label={`第 ${index + 1} 页：${item.title}`}>{index + 1}</button>)}
          </div>
          <button type="button" disabled={page === rnaQpcrSections.length - 1} onClick={() => setPage(Math.min(rnaQpcrSections.length - 1, page + 1))}>下一页<ChevronRight size={15} /></button>
        </nav>
      )}
    </section>
  );
}

type ConcentrationPlanEntry = {
  sample: string;
  rawConcentration: string;
  concentration: number;
  isValid: boolean;
};

function ReverseTranscriptionPlan({
  entries,
  batchPlan,
}: {
  entries: ConcentrationPlanEntry[];
  batchPlan: RnaLoadingBatchResult | null;
}) {
  if (!batchPlan) {
    const invalidEntries = entries.filter((entry) => entry.rawConcentration !== '' && !entry.isValid);
    return (
      <div className="loading-plan-section embedded-plan">
        <div className="embedded-tool-heading">
          <div><span>UNIFIED LOADING PLAN</span><h3>等待确定全批次体系</h3></div>
          <p>必须先在上一页为全部样本录入有效浓度，系统才会生成统一上样方案。</p>
        </div>
        <div className={`batch-plan-state ${invalidEntries.length ? 'error' : ''}`}>
          <CircleAlert size={18} />
          <span>{invalidEntries.length ? `${invalidEntries.map((entry) => entry.sample).join('、')} 的浓度必须大于 0` : '请返回“测 RNA 浓度”页补齐所有样本浓度。'}</span>
        </div>
      </div>
    );
  }

  const branch = reverseTranscriptionBranches[batchPlan.systemVolume];
  return (
    <div className="loading-plan-section embedded-plan">
      <div className="batch-system-banner">
        <div><span>本批次统一体系</span><strong>{batchPlan.systemVolume} μl</strong></div>
        <p>{batchPlan.systemVolume === 16 ? '至少一个样本在 10 μl 体系中容积不足，所有样本已统一按 16 μl 重新计算。' : '所有样本均可使用 10 μl 体系。'}</p>
      </div>
      <div className="loading-plan-grid">
        {entries.map((entry, index) => {
          const result = batchPlan.samples[index];
          const rnaVolume = 1000 / entry.concentration;
          return (
            <article className={`loading-plan-card ${result ? `system-${batchPlan.systemVolume}` : 'error'}`} key={`loading-plan-${index}`}>
              <div className="loading-plan-title">
                <div><span>{entry.sample}</span><small>{entry.rawConcentration} ng/μl</small></div>
                <div className="system-volume-pills" aria-label={`本批次统一使用 ${batchPlan.systemVolume} μl 体系`}>
                  <span className={batchPlan.systemVolume === 10 ? 'system-10 active' : 'system-10'}>10 μl</span>
                  <span className={batchPlan.systemVolume === 16 ? 'system-16 active' : 'system-16'}>16 μl</span>
                </div>
              </div>
              {result ? (
                <dl>
                  <div><dt>gDNA Clean Mix</dt><dd>2 μl</dd></div>
                  <div><dt>RNA 样品</dt><dd>{formatUl(result.rnaVolume)}</dd></div>
                  <div><dt>无酶无菌水</dt><dd>{formatUl(result.waterVolume)}</dd></div>
                  <div className="plan-total"><dt>总体系</dt><dd>{result.totalVolume} μl</dd></div>
                </dl>
              ) : (
                <p className="plan-message error"><CircleAlert size={15} />RNA 需 {formatUl(rnaVolume)}，16 μl 体系仍不足</p>
              )}
            </article>
          );
        })}
      </div>
      {batchPlan.hasOverflow ? (
        <div className="batch-overflow"><CircleAlert size={18} /><p><strong>本批次无法继续：</strong>至少一个样本在统一 16 μl 体系中仍体积不足，请先调整样本条件。</p></div>
      ) : (
        <div className={`rt-branch system-${batchPlan.systemVolume}`}>
          <div className="rt-branch-heading"><span>SELECTED WORKFLOW</span><h3>{branch.title}</h3></div>
          <div className="rt-branch-steps">
            {branch.steps.map((step) => <div key={step.title}><strong>{step.title}</strong><p>{step.text}</p></div>)}
          </div>
        </div>
      )}
    </div>
  );
}

function PlateView({ plate }: { plate: NonNullable<ReturnType<typeof createQpcrPlateLayout>>[number] }) {
  const assignments = new Map(plate.wells.map((well) => [well.well, well]));
  const rows = 'ABCDEFGH'.split('');
  return (
    <article className="plate-card">
      <div className="plate-card-heading">
        <div><span>PLATE {plate.number.toString().padStart(2, '0')}</span><h3>96 孔板 {plate.number}</h3></div>
        <strong>{plate.wells.length} / 96 孔</strong>
      </div>
      <div className="plate-legend">
        {plate.primers.map((primer, index) => <span key={`${primer}-${index}`}><i className={`well-color color-${index % 6}`} />{primer}{index === 0 ? '（内参）' : ''}</span>)}
      </div>
      <div className="plate-scroll">
        <div className="plate-grid">
          <span />
          {Array.from({ length: 12 }, (_, index) => <b key={index}>{index + 1}</b>)}
          {rows.flatMap((row) => [
            <b key={`${row}-label`}>{row}</b>,
            ...Array.from({ length: 12 }, (_, column) => {
              const wellName = `${row}${column + 1}`;
              const assignment = assignments.get(wellName);
              return (
                <div key={wellName} className={`plate-well ${assignment ? `filled color-${assignment.colorIndex % 6}` : ''} ${assignment?.isNtc ? 'ntc' : ''}`} title={assignment ? `${assignment.well} · 引物：${assignment.primer} · 样本：${assignment.sample}` : wellName}>
                  {assignment && <><span><i>样</i><b style={{ fontSize: fittedWellFontSize(assignment.sample, 8) }}>{assignment.sample}</b></span><small><i>引</i><b style={{ fontSize: fittedWellFontSize(assignment.primer, 7) }}>{assignment.primer}</b></small></>}
                </div>
              );
            }),
          ])}
        </div>
      </div>
      <div className="plate-foot"><span><i className="ntc-mark" />虚线 = NTC</span><span>本板引物：{plate.primers.length} 组</span></div>
    </article>
  );
}

function ManualPlateView({
  plate,
  primers,
  referencePrimer,
  onWellClick,
}: {
  plate: ManualPlate;
  primers: string[];
  referencePrimer: string;
  onWellClick: (wellName: string) => void;
}) {
  const rows = 'ABCDEFGH'.split('');
  const filledWellCount = Object.keys(plate.wells).length;
  return (
    <article className="plate-card manual-plate-card">
      <div className="plate-card-heading">
        <div><span>MANUAL PLATE {plate.number.toString().padStart(2, '0')}</span><h3>96 孔板 {plate.number}</h3></div>
        <strong>{filledWellCount} / 96 孔已设置</strong>
      </div>
      <div className="plate-legend">
        {primers.map((primer, index) => <span key={`${primer}-${index}`}><i className={`well-color color-${index % 6}`} />{primer}{primer === referencePrimer ? '（内参）' : ''}</span>)}
      </div>
      <div className="plate-scroll">
        <div className="plate-grid">
          <span />
          {Array.from({ length: 12 }, (_, index) => <b key={index}>{index + 1}</b>)}
          {rows.flatMap((row) => [
            <b key={`${row}-label`}>{row}</b>,
            ...Array.from({ length: 12 }, (_, column) => {
              const wellName = `${row}${column + 1}`;
              const assignment = plate.wells[wellName];
              const colorIndex = assignment?.primer ? primers.indexOf(assignment.primer) : -1;
              const titleParts = [wellName, assignment?.primer, assignment?.sample].filter(Boolean);
              return (
                <button
                  type="button"
                  key={wellName}
                  className={`plate-well manual-well ${assignment ? 'filled' : ''} ${colorIndex >= 0 ? `color-${colorIndex % 6}` : 'manual-unprimed'} ${assignment?.sample?.toUpperCase() === 'NTC' ? 'ntc' : ''}`}
                  title={titleParts.join(' · ')}
                  aria-label={`${wellName}${assignment ? `，引物 ${assignment.primer ?? '未设置'}，样本 ${assignment.sample ?? '未设置'}` : '，未设置'}`}
                  onClick={() => onWellClick(wellName)}
                >
                  {assignment && <><span><i>样</i><b style={{ fontSize: fittedWellFontSize(assignment.sample ?? '未设置', 8) }}>{assignment.sample ?? '未设置'}</b></span><small><i>引</i><b style={{ fontSize: fittedWellFontSize(assignment.primer ?? '未设置', 7) }}>{assignment.primer ?? '未设置'}</b></small></>}
                </button>
              );
            }),
          ])}
        </div>
      </div>
      <div className="plate-foot"><span><i className="ntc-mark" />虚线 = NTC</span><span>点击孔位应用当前选择</span></div>
    </article>
  );
}

function DistributionStage({ number, title, rows, footer }: { number: string; title: string; rows: [string, string][]; footer: string }) {
  return (
    <article className="distribution-stage">
      <div className="stage-heading"><span>{number}</span><h3>{title}</h3></div>
      <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p>{footer}</p>
    </article>
  );
}
