import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Beaker,
  Bell,
  Calculator,
  CheckCircle2,
  ChevronRight,
  FileText,
  FlaskConical,
  Info,
  Laptop,
  Moon,
  Search,
  Sun,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { calculateCellSeeding, calculateDilution, formatVolume } from './calculations';
import { announcements, sops, type SopEntry } from './data';
import RnaQpcrTool from './RnaQpcrTool';

const PdfViewer = lazy(() => import('./PdfViewer'));
const latestAnnouncementDate = announcements[0].date;
type ThemePreference = 'light' | 'dark' | 'auto';

const themeOptions = [
  { value: 'auto' as const, label: '自动', Icon: Laptop },
  { value: 'light' as const, label: '浅色', Icon: Sun },
  { value: 'dark' as const, label: '深色', Icon: Moon },
];

function ThemeSwitcher() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem('labsop:theme');
    return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolvedTheme = preference === 'auto' ? (media.matches ? 'dark' : 'light') : preference;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themePreference = preference;
      document.documentElement.style.colorScheme = resolvedTheme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#0d1716' : '#0f766e');
    };

    localStorage.setItem('labsop:theme', preference);
    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [preference]);

  const currentIndex = themeOptions.findIndex(({ value }) => value === preference);
  const currentOption = themeOptions[currentIndex] ?? themeOptions[0];
  const nextOption = themeOptions[(currentIndex + 1) % themeOptions.length];
  const CurrentIcon = currentOption.Icon;

  return (
    <button
      type="button"
      className="theme-switcher"
      aria-label={`当前为${currentOption.label}模式，点击切换至${nextOption.label}模式`}
      title={`${currentOption.label}模式 · 点击切换至${nextOption.label}模式`}
      onClick={() => setPreference(nextOption.value)}
    >
      <CurrentIcon size={16} aria-hidden="true" />
      <span>{currentOption.label}</span>
    </button>
  );
}

function AppHeader({ onOpenAnnouncements, hasUnread }: { onOpenAnnouncements: () => void; hasUnread: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to="/" aria-label="返回首页">
          <span className="brand-mark">LS</span>
          <span><strong>Lab SOP</strong><small>实验室操作中心</small></span>
        </Link>
        <div className="header-actions">
          <ThemeSwitcher />
          <button className="icon-button notification-button" onClick={onOpenAnnouncements} aria-label="查看公告">
            <Bell size={21} />
            {hasUnread && <span className="notification-dot" />}
          </button>
        </div>
      </div>
    </header>
  );
}

function AnnouncementDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside className="announcement-drawer" role="dialog" aria-modal="true" aria-label="实验室公告" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div><span className="section-kicker">NOTICE BOARD</span><h2>实验室公告</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭公告"><X size={20} /></button>
        </div>
        <div className="notice-list">
          {announcements.map((notice) => (
            <button
              className="notice-card"
              key={notice.slug}
              onClick={() => { navigate(`/announcements/${notice.slug}`); onClose(); }}
            >
              <span className="notice-topline">
                <span className={notice.priority ? 'notice-badge important' : 'notice-badge'}>
                  {notice.priority ? '重要' : '更新'}
                </span>
                <time>{notice.displayDate}</time>
              </span>
              <strong>{notice.title}</strong>
              <span>{notice.summary}</span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
        <p className="drawer-footnote">公告内容由仓库中的 Markdown 文件生成</p>
      </aside>
    </div>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const categories = ['全部', ...Array.from(new Set(sops.map((sop) => sop.category)))];

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  const filteredSops = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sops.filter((sop) => {
      const matchesCategory = category === '全部' || sop.category === category;
      const matchesQuery = !normalized || `${sop.title} ${sop.description} ${sop.category}`.toLowerCase().includes(normalized);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  const openSop = (sop: SopEntry) => {
    navigate(sop.kind === 'pdf' ? `/sop/${sop.id}/pdf` : `/sop/${sop.id}`);
  };

  return (
    <main>
      <section className="hero">
        <div className="eyebrow"><span />标准操作，随手可得</div>
        <h1>今天需要做<br /><em>什么实验？</em></h1>
        <p>查找实验流程、使用计算工具，或直接阅读最新版 SOP 文件。</p>
        <label className="search-box">
          <Search size={20} />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 SOP 或工具" aria-label="搜索 SOP 或工具" />
          {query ? <button onClick={() => setQuery('')} aria-label="清除搜索"><X size={17} /></button> : <kbd>⌘ K</kbd>}
        </label>
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div><span className="section-kicker">ONLINE TOOLS</span><h2>在线工具</h2></div>
          <span className="count">{filteredSops.length} 项可用</span>
        </div>
        <div className="filter-row" aria-label="分类筛选">
          {categories.map((item) => (
            <button key={item} className={`filter ${category === item ? 'active' : ''}`} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>
        {filteredSops.length ? (
          <div className="tool-grid">
            {filteredSops.map((sop) => {
              const Icon = sop.id === 'dilution' ? Calculator : sop.id === 'cell-seeding' ? Beaker : FileText;
              return (
                <button className="tool-card" key={sop.id} onClick={() => openSop(sop)}>
                  <span className={`tool-icon ${sop.accent}`}><Icon size={22} /></span>
                  <span className="tool-copy">
                    <span className="category">{sop.category}</span>
                    <strong>{sop.title}</strong>
                    <span className="description">{sop.description}</span>
                    <span className="tool-meta">
                      {sop.kind === 'tool' ? '交互工具' : 'PDF SOP'}
                      {sop.hasPdf && sop.kind === 'tool' ? ' · 含 PDF' : ''}
                      {sop.version ? ` · ${sop.version}` : ''}
                    </span>
                  </span>
                  <ChevronRight className="chevron" size={20} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty-state"><Search size={25} /><strong>没有找到匹配内容</strong><span>换一个关键词或分类试试。</span></div>
        )}
      </section>
    </main>
  );
}

function ToolHeader({ title, category, version, pdfLink }: { title: string; category: string; version?: string; pdfLink?: string }) {
  return (
    <div className="detail-header">
      <Link className="back-link" to="/"><ArrowLeft size={18} />返回工具列表</Link>
      <div className="detail-title-row">
        <div>
          <span className="section-kicker">{category.toUpperCase()}</span>
          <h1>{title}</h1>
          {version && <p>版本 {version} · 当前有效</p>}
        </div>
        {pdfLink && <Link className="secondary-button" to={pdfLink}><FileText size={18} />查看 PDF 版</Link>}
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, unit, hint }: { label: string; value: number; onChange: (value: number) => void; unit: string; hint?: string }) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div><input type="number" inputMode="decimal" min="0" value={value} onChange={(event) => onChange(Number(event.target.value))} /><b>{unit}</b></div>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function DilutionTool() {
  const [stock, setStock] = useState(1000);
  const [target, setTarget] = useState(10);
  const [volume, setVolume] = useState(50);
  const result = calculateDilution(stock, target, volume);

  return (
    <main className="detail-page">
      <ToolHeader title="溶液稀释计算" category="试剂配制" version="v2.1" pdfLink="/sop/dilution/pdf" />
      <div className="calculator-layout">
        <section className="calculator-card">
          <div className="card-title"><span className="tool-icon teal"><FlaskConical size={22} /></span><div><h2>输入实验参数</h2><p>浓度单位须保持一致</p></div></div>
          <div className="field-grid">
            <NumberField label="母液浓度 C₁" value={stock} onChange={setStock} unit="mM" />
            <NumberField label="目标浓度 C₂" value={target} onChange={setTarget} unit="mM" />
            <NumberField label="目标总体积 V₂" value={volume} onChange={setVolume} unit="mL" />
          </div>
          <div className="formula-line"><span>C₁ × V₁</span><b>=</b><span>C₂ × V₂</span></div>
        </section>
        <aside className={`result-card ${result ? '' : 'invalid'}`}>
          <span className="result-eyebrow">CALCULATION RESULT</span>
          {result ? (
            <>
              <CheckCircle2 size={27} />
              <h2>配制结果</h2>
              <div className="result-primary"><strong>{formatVolume(result.stockVolume)}</strong><span>母液</span></div>
              <div className="result-secondary"><span>加入稀释液</span><strong>{formatVolume(result.diluentVolume)}</strong></div>
              <p>最终体积 {formatVolume(volume)}</p>
            </>
          ) : (
            <><Info size={27} /><h2>无法计算</h2><p>目标浓度不能高于母液浓度，所有数值必须大于 0。</p></>
          )}
        </aside>
      </div>
      <div className="safety-note"><Info size={18} /><p><strong>使用提示</strong>计算结果应结合当前有效 SOP 和实际实验条件复核；本工具不替代实验审批与安全检查。</p></div>
    </main>
  );
}

function CellSeedingTool() {
  const [target, setTarget] = useState(100000);
  const [wells, setWells] = useState(6);
  const [concentration, setConcentration] = useState(1000000);
  const [wellVolume, setWellVolume] = useState(2);
  const [excess, setExcess] = useState(10);
  const result = calculateCellSeeding(target, wells, concentration, wellVolume, excess);

  return (
    <main className="detail-page">
      <ToolHeader title="细胞铺板计算" category="细胞实验" />
      <div className="calculator-layout">
        <section className="calculator-card">
          <div className="card-title"><span className="tool-icon violet"><Beaker size={22} /></span><div><h2>输入铺板参数</h2><p>系统会自动加入损耗余量</p></div></div>
          <div className="field-grid two-columns">
            <NumberField label="目标细胞数／孔" value={target} onChange={setTarget} unit="cells" />
            <NumberField label="铺板孔数" value={wells} onChange={setWells} unit="孔" />
            <NumberField label="细胞悬液浓度" value={concentration} onChange={setConcentration} unit="cells/mL" />
            <NumberField label="每孔总体积" value={wellVolume} onChange={setWellVolume} unit="mL" />
            <NumberField label="损耗余量" value={excess} onChange={setExcess} unit="%" hint="建议 10%" />
          </div>
        </section>
        <aside className={`result-card violet-result ${result ? '' : 'invalid'}`}>
          <span className="result-eyebrow">SEEDING RESULT</span>
          {result ? (
            <>
              <CheckCircle2 size={27} /><h2>混悬液配制</h2>
              <div className="result-primary"><strong>{formatVolume(result.suspensionVolume)}</strong><span>细胞悬液</span></div>
              <div className="result-secondary"><span>培养基</span><strong>{formatVolume(result.mediumVolume)}</strong></div>
              <p>共 {result.totalCells.toLocaleString()} 个细胞 · 总体积 {formatVolume(result.totalVolume)}</p>
            </>
          ) : (
            <><Info size={27} /><h2>无法计算</h2><p>请检查输入值；细胞悬液体积不能超过配制总体积。</p></>
          )}
        </aside>
      </div>
      <div className="safety-note"><Info size={18} /><p><strong>使用提示</strong>铺板前请重新计数并确认细胞活率。计算结果保留在当前设备，不会上传。</p></div>
    </main>
  );
}

function PdfPage() {
  const { id } = useParams();
  const sop = sops.find((item) => item.id === id && item.pdfPath);
  if (!sop) return <Navigate to="/" replace />;
  const file = `${import.meta.env.BASE_URL}${sop.pdfPath}`;

  return (
    <main className="detail-page pdf-page">
      <ToolHeader title={sop.title} category={sop.category} version={sop.version} />
      <div className="document-meta">
        <span><FileText size={17} />PDF 标准操作文件</span>
        {sop.effectiveDate && <span>生效日期：{sop.effectiveDate}</span>}
      </div>
      <Suspense fallback={<div className="pdf-state"><span className="spinner" />正在启动 PDF 阅读器…</div>}>
        <PdfViewer file={file} fileName={`${sop.title}-${sop.version || 'current'}.pdf`} />
      </Suspense>
    </main>
  );
}

function AnnouncementPage() {
  const { slug } = useParams();
  const notice = announcements.find((item) => item.slug === slug);
  if (!notice) return <Navigate to="/" replace />;
  return (
    <main className="detail-page announcement-page">
      <Link className="back-link" to="/"><ArrowLeft size={18} />返回工具列表</Link>
      <article className="markdown-card">
        <span className={`notice-badge ${notice.priority ? 'important' : ''}`}>{notice.priority ? '重要公告' : 'SOP 更新'}</span>
        <h1>{notice.title}</h1>
        <time>{notice.date}</time>
        <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{notice.body}</ReactMarkdown></div>
      </article>
    </main>
  );
}

function SiteFooter() {
  return <footer><span>LAB SOP</span><p>请始终核对 SOP 版本与生效日期</p></footer>;
}

export default function App() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(() => localStorage.getItem('labsop:last-read') !== latestAnnouncementDate);
  const openDrawer = () => {
    setDrawerOpen(true);
    setHasUnread(false);
    localStorage.setItem('labsop:last-read', latestAnnouncementDate);
  };

  return (
    <div className="site-shell">
      <AppHeader onOpenAnnouncements={openDrawer} hasUnread={hasUnread} />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sop/dilution" element={<DilutionTool />} />
        <Route path="/sop/cell-seeding" element={<CellSeedingTool />} />
        <Route path="/sop/rna-qpcr" element={<RnaQpcrTool />} />
        <Route path="/sop/:id/pdf" element={<PdfPage />} />
        <Route path="/announcements/:slug" element={<AnnouncementPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SiteFooter />
      <AnnouncementDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
