import { useEffect, useMemo, useState } from 'react';
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
  FlaskConical,
  LayoutGrid,
  LockKeyhole,
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
  calculateQpcrMix,
  calculateRnaLoading,
  calculateTubeDistribution,
  createQpcrPlateLayout,
} from './calculations';
import { rnaQpcrSections } from './rnaQpcrData';

type ToolTab = 'setup' | 'guide' | 'plate' | 'mix' | 'distribution';

type SessionState = {
  referencePrimer: string;
  targetPrimers: string[];
  samples: string[];
  replicates: number;
  extraReactions: number;
  concentrations: string[];
  completed: Record<string, boolean>;
  notes: Record<string, string>;
};

const STORAGE_KEY = 'labsop:rna-qpcr-session:v1';
const PDF_FILE_NAME = '组织提RNA（柱提法）+qPCR ver.20260822.pdf';
const PDF_PATH = `pdfs/${PDF_FILE_NAME}`;

const defaultSession: SessionState = {
  referencePrimer: '内参基因',
  targetPrimers: ['目的基因 1', '目的基因 2', '目的基因 3', '目的基因 4'],
  samples: ['样本 1', '样本 2', '样本 3', '样本 4', '样本 5', '样本 6'],
  replicates: 3,
  extraReactions: 1,
  concentrations: ['', '', '', '', '', ''],
  completed: {},
  notes: {},
};

const tabs: { id: ToolTab; label: string; Icon: typeof Settings2 }[] = [
  { id: 'setup', label: '初始化', Icon: Settings2 },
  { id: 'guide', label: '互动 SOP', Icon: ClipboardCheck },
  { id: 'plate', label: '96 孔板', Icon: LayoutGrid },
  { id: 'mix', label: '体系计算', Icon: FlaskConical },
  { id: 'distribution', label: '总管分装', Icon: TestTubes },
];

function loadSession(): SessionState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultSession;
    const parsed = JSON.parse(saved) as Partial<SessionState>;
    return {
      ...defaultSession,
      ...parsed,
      targetPrimers: Array.isArray(parsed.targetPrimers) ? parsed.targetPrimers : defaultSession.targetPrimers,
      samples: Array.isArray(parsed.samples) ? parsed.samples : defaultSession.samples,
      concentrations: Array.isArray(parsed.concentrations)
        ? parsed.concentrations.map((value) => typeof value === 'string' ? value : '')
        : defaultSession.concentrations,
      completed: parsed.completed && typeof parsed.completed === 'object' ? parsed.completed : {},
      notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {},
    };
  } catch {
    return defaultSession;
  }
}

function formatUl(value: number): string {
  return `${value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} μl`;
}

function shortLabel(value: string): string {
  return value.length > 5 ? `${value.slice(0, 4)}…` : value;
}

export default function RnaQpcrTool() {
  const [tab, setTab] = useState<ToolTab>('setup');
  const [guidePage, setGuidePage] = useState(0);
  const [session, setSession] = useState<SessionState>(loadSession);
  const [mixReactions, setMixReactions] = useState(140);

  const allSamples = useMemo(() => [...session.samples.filter((sample) => sample.trim()), 'NTC'], [session.samples]);
  const allPrimers = useMemo(
    () => [session.referencePrimer, ...session.targetPrimers.filter((primer) => primer.trim())],
    [session.referencePrimer, session.targetPrimers],
  );
  const plannedWells = allPrimers.length * allSamples.length * session.replicates;
  const prepReactions = allPrimers.length * allSamples.length * (session.replicates + session.extraReactions);
  const suggestedCommonReactions = Math.ceil((prepReactions + 1) / 10) * 10;
  const [commonPoolReactions, setCommonPoolReactions] = useState(suggestedCommonReactions);

  const plateLayout = useMemo(
    () => createQpcrPlateLayout(
      session.referencePrimer,
      session.targetPrimers,
      allSamples,
      session.replicates,
    ),
    [allSamples, session.referencePrimer, session.replicates, session.targetPrimers],
  );
  const mixResult = useMemo(() => calculateQpcrMix(mixReactions), [mixReactions]);
  const distribution = useMemo(
    () => calculateTubeDistribution(
      allPrimers.length,
      allSamples.length,
      session.replicates,
      session.extraReactions,
      commonPoolReactions,
    ),
    [allPrimers.length, allSamples.length, commonPoolReactions, session.extraReactions, session.replicates],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);

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
    setSession(defaultSession);
    setGuidePage(0);
    setMixReactions(140);
    setCommonPoolReactions(150);
  };

  const pdfFile = `${import.meta.env.BASE_URL}${PDF_PATH}`;

  return (
    <main className="detail-page qpcr-workspace">
      <div className="qpcr-hero">
        <Link className="back-link" to="/"><ArrowLeft size={18} />返回工具列表</Link>
        <div className="qpcr-hero-main">
          <div>
            <span className="section-kicker">FORMAL INTERACTIVE SOP</span>
            <h1>组织提 RNA（柱提法）+ qPCR</h1>
            <div className="version-row">
              <span>PDF 页眉版本 ver.20260821</span>
              <span>本地自动保存</span>
            </div>
          </div>
          <div className="qpcr-hero-actions">
            <Link className="secondary-button" to="/sop/rna-qpcr/pdf"><FileText size={18} />在线查看 PDF</Link>
            <a className="secondary-button" href={pdfFile} download={PDF_FILE_NAME}><Download size={18} />下载原文件</a>
          </div>
        </div>
        <div className="source-alert"><CircleAlert size={18} /><span>收到的文件名标注 20260822，但 PDF 页眉标注 ver.20260821；本站不自行改写受控版本号。</span></div>
      </div>

      <nav className="qpcr-tabs" aria-label="qPCR SOP 工具">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
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
            <label><span>每组复孔</span><input type="number" min="1" max="12" value={session.replicates} onChange={(event) => setSession((current) => ({ ...current, replicates: Math.max(1, Number(event.target.value)) }))} /><b>孔</b></label>
            <label><span>每组冗余</span><input type="number" min="0" max="12" value={session.extraReactions} onChange={(event) => setSession((current) => ({ ...current, extraReactions: Math.max(0, Number(event.target.value)) }))} /><b>反应</b></label>
          </div>

          <div className="run-summary">
            <div><small>实际上板</small><strong>{plannedWells}</strong><span>孔</span></div>
            <div><small>配液反应</small><strong>{prepReactions}</strong><span>份</span></div>
            <div><small>自动板数</small><strong>{plateLayout?.length ?? '—'}</strong><span>块</span></div>
            <button onClick={() => setTab('guide')}>开始互动流程<ArrowRight size={17} /></button>
          </div>
        </section>
      )}

      {tab === 'guide' && (
        <InteractiveGuide
          page={guidePage}
          setPage={setGuidePage}
          completed={session.completed}
          notes={session.notes}
          samples={session.samples}
          concentrations={session.concentrations}
          onToggle={(key) => setSession((current) => ({ ...current, completed: { ...current.completed, [key]: !current.completed[key] } }))}
          onNote={(key, value) => setSession((current) => ({ ...current, notes: { ...current.notes, [key]: value } }))}
          onConcentration={(index, value) => setSession((current) => ({
            ...current,
            concentrations: current.samples.map((_, itemIndex) => itemIndex === index ? value : (current.concentrations[itemIndex] ?? '')),
          }))}
        />
      )}

      {tab === 'plate' && (
        <section className="qpcr-panel plate-panel">
          <div className="panel-heading"><div><span className="section-kicker">AUTO LAYOUT</span><h2>96 孔板设计器</h2><p>每块板均自动加入完整内参组；空间不足时按目的基因整组拆到下一块板。</p></div><div className="plate-count">{plateLayout?.length ?? 0} 块板</div></div>
          {plateLayout ? plateLayout.map((plate) => <PlateView key={plate.number} plate={plate} />) : (
            <div className="invalid-layout"><CircleAlert size={24} /><strong>当前设置无法按整组排入 96 孔板</strong><span>请减少样本数或复孔数后再试。</span></div>
          )}
        </section>
      )}

      {tab === 'mix' && (
        <section className="qpcr-panel">
          <div className="panel-heading"><div><span className="section-kicker">10 μl / WELL</span><h2>qPCR 体系计算器</h2><p>按 PDF 每孔配方放大；NTC 的 2 μl cDNA 须替换为无酶无菌水。</p></div></div>
          <div className="mix-input-row">
            <label><span>配制反应数</span><input type="number" min="1" step="1" value={mixReactions} onChange={(event) => setMixReactions(Number(event.target.value))} /><b>份</b></label>
            <button className="text-button" onClick={() => setMixReactions(prepReactions)}>使用本批次：{prepReactions} 份</button>
          </div>
          {mixResult && (
            <div className="recipe-grid">
              <RecipeCard label="SYBR" perWell="5 μl / 孔" total={mixResult.sybr} accent="teal" />
              <RecipeCard label="正向引物" perWell="0.4 μl / 孔" total={mixResult.forwardPrimer} accent="violet" />
              <RecipeCard label="反向引物" perWell="0.4 μl / 孔" total={mixResult.reversePrimer} accent="violet" />
              <RecipeCard label="无酶无菌水" perWell="2.2 μl / 孔" total={mixResult.water} accent="blue" />
              <RecipeCard label="cDNA / NTC 水" perWell="2 μl / 孔" total={mixResult.cdna} accent="amber" />
              <div className="recipe-total"><small>体系总量</small><strong>{formatUl(mixResult.total)}</strong><span>{mixResult.reactions} × 10 μl</span></div>
            </div>
          )}
        </section>
      )}

      {tab === 'distribution' && (
        <section className="qpcr-panel">
          <div className="panel-heading"><div><span className="section-kicker">MASTER MIX</span><h2>总管分装计算器</h2><p>按 PDF 的 ①总管 → ②引物管 → ③样本-引物管 三阶段展示。</p></div></div>
          <div className="distribution-summary">
            <span>{allPrimers.length} 种引物</span><b>×</b><span>{allSamples.length} 份 cDNA/NTC</span><b>×</b><span>{session.replicates} 复孔 + {session.extraReactions} 冗余</span><b>=</b><strong>{prepReactions} 份</strong>
          </div>
          <div className="common-pool-control">
            <label><span>①总管实际配制份数</span><input type="number" min={prepReactions} step="1" value={commonPoolReactions} onChange={(event) => setCommonPoolReactions(Number(event.target.value))} /><b>份</b></label>
            <button className="text-button" onClick={() => setCommonPoolReactions(suggestedCommonReactions)}>向上留余：{suggestedCommonReactions} 份</button>
          </div>
          {distribution ? (
            <div className="distribution-flow">
              <DistributionStage number="①" title="SYBR + 水总管" rows={[
                ['SYBR', formatUl(distribution.commonPool.sybr)],
                ['无酶无菌水', formatUl(distribution.commonPool.water)],
                ['合计', formatUl(distribution.commonPool.total)],
                ['完成引物管分装后留余', formatUl(distribution.commonPool.remainingAfterDistribution)],
              ]} footer={`按 ${distribution.commonPoolReactions} 份配制`} />
              <ChevronRight className="flow-arrow" size={26} />
              <DistributionStage number="②" title="每支引物管" rows={[
                ['取①液', formatUl(distribution.perPrimerTube.commonAliquot)],
                ['正向引物', formatUl(distribution.perPrimerTube.forwardPrimer)],
                ['反向引物', formatUl(distribution.perPrimerTube.reversePrimer)],
                ['合计', formatUl(distribution.perPrimerTube.total)],
              ]} footer={`共分 ${allPrimers.length} 支引物管`} />
              <ChevronRight className="flow-arrow" size={26} />
              <DistributionStage number="③" title="每支样本-引物管" rows={[
                ['取②液', formatUl(distribution.perSamplePrimerTube.primerMix)],
                ['cDNA / NTC 水', formatUl(distribution.perSamplePrimerTube.cdnaOrNtcWater)],
                ['合计', formatUl(distribution.perSamplePrimerTube.total)],
                ['上板后留余', formatUl(distribution.perSamplePrimerTube.remaining)],
              ]} footer={`上板 ${session.replicates} × 10 μl`} />
            </div>
          ) : (
            <div className="formula-warning"><CircleAlert size={18} /><p>①总管实际配制份数不能少于理论值 {prepReactions} 份。</p></div>
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
}) {
  const section = rnaQpcrSections[page];
  const loadingPlans = samples.map((sample, index) => {
    const rawConcentration = concentrations[index]?.trim() ?? '';
    const concentration = Number(rawConcentration);
    return {
      sample: sample || `样本 ${index + 1}`,
      rawConcentration,
      concentration,
      result: rawConcentration && Number.isFinite(concentration) && concentration > 0
        ? calculateRnaLoading(concentration)
        : null,
    };
  });
  const hasSixteenUlPlan = loadingPlans.some((plan) => plan.result?.totalVolume === 16);
  const completedCount = rnaQpcrSections.reduce(
    (count, current) => count + current.items.filter((_, index) => completed[`${current.id}:${index}`]).length,
    0,
  );
  const totalCount = rnaQpcrSections.reduce((count, current) => count + current.items.length, 0);

  return (
    <section className="qpcr-panel guide-panel">
      <div className="guide-progress">
        <div><span>总进度</span><strong>{completedCount} / {totalCount}</strong></div>
        <div className="progress-track"><span style={{ width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }} /></div>
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
      {section.id === 'reverse-transcription' && (
        <div className="loading-plan-section">
          <div className="embedded-tool-heading">
            <div><span>AUTO LOADING PLAN</span><h3>本批次上样方案</h3></div>
            <p>RNA ≤ 8 μl 使用 10 μl 体系；超过后自动切换 16 μl，16 μl 仍放不下时才报错。</p>
          </div>
          <div className="loading-plan-grid">
            {loadingPlans.map((plan, index) => {
              const hasConcentration = plan.rawConcentration !== '';
              const validConcentration = hasConcentration && Number.isFinite(plan.concentration) && plan.concentration > 0;
              const rnaVolume = validConcentration ? 1000 / plan.concentration : null;
              return (
                <article
                  className={`loading-plan-card ${!hasConcentration ? 'waiting' : plan.result ? `system-${plan.result.totalVolume}` : 'error'}`}
                  key={`loading-plan-${index}`}
                >
                  <div className="loading-plan-title">
                    <div><span>{plan.sample}</span>{hasConcentration && <small>{plan.rawConcentration} ng/μl</small>}</div>
                    {plan.result && <b>{plan.result.totalVolume} μl 体系</b>}
                  </div>
                  {!hasConcentration ? (
                    <p className="plan-message">等待上一页录入 RNA 浓度</p>
                  ) : !validConcentration ? (
                    <p className="plan-message error"><CircleAlert size={15} />浓度必须大于 0</p>
                  ) : !plan.result ? (
                    <p className="plan-message error"><CircleAlert size={15} />RNA 需 {formatUl(rnaVolume ?? 0)}，16 μl 体系仍不足</p>
                  ) : (
                    <dl>
                      <div><dt>RNA 样品</dt><dd>{formatUl(plan.result.rnaVolume)}</dd></div>
                      <div><dt>gDNA Clean Mix</dt><dd>2 μl</dd></div>
                      <div><dt>无酶无菌水</dt><dd>{formatUl(plan.result.waterVolume)}</dd></div>
                      <div className="plan-total"><dt>总体系</dt><dd>{plan.result.totalVolume} μl</dd></div>
                    </dl>
                  )}
                </article>
              );
            })}
          </div>
          {hasSixteenUlPlan && (
            <div className="formula-warning"><CircleAlert size={18} /><p><strong>16 μl 体系校核提示：</strong>PDF 原文的列示相加为 18 μl。本方案按标称总体系 16 μl 计算水量，即 14 - RNA 上样量；执行前仍须确认受控版本。</p></div>
          )}
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
              </div>
            </div>
          );
        })}
      </div>
      <label className="notes-field">
        <span><NotebookPen size={17} />本页备注 <small><Save size={13} />自动保存于此浏览器</small></span>
        <textarea value={notes[section.id] ?? ''} onChange={(event) => onNote(section.id, event.target.value)} placeholder="记录样本状态、异常情况或需要交接的信息…" />
      </label>
      <div className="guide-pagination">
        <button disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}><ChevronLeft size={18} />上一页</button>
        <span>第 {page + 1} / {rnaQpcrSections.length} 页</span>
        <button disabled={page === rnaQpcrSections.length - 1} onClick={() => setPage(Math.min(rnaQpcrSections.length - 1, page + 1))}>下一页<ChevronRight size={18} /></button>
      </div>
    </section>
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
                <div key={wellName} className={`plate-well ${assignment ? `filled color-${assignment.colorIndex % 6}` : ''} ${assignment?.isNtc ? 'ntc' : ''}`} title={assignment ? `${assignment.well} · ${assignment.primer} · ${assignment.sample} · 复孔 ${assignment.replicate}` : wellName}>
                  {assignment && <><span>{shortLabel(assignment.sample)}</span><small>{assignment.replicate}</small></>}
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

function RecipeCard({ label, perWell, total, accent }: { label: string; perWell: string; total: number; accent: string }) {
  return <div className={`recipe-card ${accent}`}><small>{perWell}</small><strong>{formatUl(total)}</strong><span>{label}</span></div>;
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
