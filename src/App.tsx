import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  ChevronRight,
  FileText,
  Laptop,
  Moon,
  Search,
  Sun,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { announcements, sops, type SopEntry } from './data';
import ManualCard from './ManualCard';
import { manuals, manualTags } from './manuals';
import RnaQpcrTool from './RnaQpcrTool';
import WesternBlotTool from './WesternBlotTool';
import type { VersionHistoryEntry } from './versionHistory';
import VersionHistoryDialog from './VersionHistoryDialog';

const PdfViewer = lazy(() => import('./PdfViewer'));
const latestAnnouncementDate = announcements[0].date;
type ThemePreference = 'light' | 'dark' | 'auto';
type HomeTab = 'tools' | 'manuals';

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
  const [manualTag, setManualTag] = useState('全部');
  const [activeTab, setActiveTab] = useState<HomeTab>('tools');
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

  const filteredManuals = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return manuals.filter((manual) => {
      const matchesTag = manualTag === '全部' || manual.tags.includes(manualTag as (typeof manualTags)[number]);
      const searchableText = `${manual.title} ${manual.documentType} ${manual.tags.join(' ')} ${manual.fileName}`.toLowerCase();
      return matchesTag && (!normalized || searchableText.includes(normalized));
    });
  }, [manualTag, query]);

  const openSop = (sop: SopEntry) => {
    navigate(sop.kind === 'pdf' ? `/sop/${sop.id}/pdf` : `/sop/${sop.id}`);
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    event.preventDefault();
    let nextTab: HomeTab;
    if (event.key === 'Home') nextTab = 'tools';
    else if (event.key === 'End') nextTab = 'manuals';
    else if (event.key === 'ArrowLeft') nextTab = activeTab === 'tools' ? 'manuals' : 'tools';
    else nextTab = activeTab === 'manuals' ? 'tools' : 'manuals';
    setActiveTab(nextTab);
    document.getElementById(`home-${nextTab}-tab`)?.focus();
  };

  return (
    <main>
      <section className="hero">
        <div className="eyebrow"><span />标准操作，随手可得</div>
        <h1>今天需要做<br /><em>什么实验？</em></h1>
        <p>查找实验流程、使用计算工具，或直接阅读最新版 SOP 文件。</p>
        <label className="search-box">
          <Search size={20} />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 SOP、工具或说明书" aria-label="搜索 SOP、工具或说明书" />
          {query ? <button onClick={() => setQuery('')} aria-label="清除搜索"><X size={17} /></button> : <kbd>⌘ K</kbd>}
        </label>
      </section>

      <section className="content-section home-library" aria-label="实验室资源">
        <div className="home-tabs" role="tablist" aria-label="资源类型">
          <button
            type="button"
            id="home-tools-tab"
            className={`home-tab ${activeTab === 'tools' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'tools'}
            aria-controls="home-tools-panel"
            tabIndex={activeTab === 'tools' ? 0 : -1}
            onClick={() => setActiveTab('tools')}
            onKeyDown={handleTabKeyDown}
          >
            <FileText size={19} aria-hidden="true" />
            <span><small>ONLINE TOOLS</small><strong>在线工具</strong></span>
            <span className="home-tab-count">{filteredSops.length}</span>
          </button>
          <button
            type="button"
            id="home-manuals-tab"
            className={`home-tab ${activeTab === 'manuals' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'manuals'}
            aria-controls="home-manuals-panel"
            tabIndex={activeTab === 'manuals' ? 0 : -1}
            onClick={() => setActiveTab('manuals')}
            onKeyDown={handleTabKeyDown}
          >
            <BookOpen size={19} aria-hidden="true" />
            <span><small>MANUAL LIBRARY</small><strong>说明书</strong></span>
            <span className="home-tab-count">{filteredManuals.length}</span>
          </button>
        </div>

        {activeTab === 'tools' ? (
          <div id="home-tools-panel" className="home-tab-panel" role="tabpanel" aria-labelledby="home-tools-tab">
            <div className="panel-summary"><span>在线工具与 SOP</span><span className="count">{filteredSops.length} 项可用</span></div>
            <div className="filter-row" aria-label="分类筛选">
              {categories.map((item) => (
                <button key={item} className={`filter ${category === item ? 'active' : ''}`} onClick={() => setCategory(item)}>{item}</button>
              ))}
            </div>
            {filteredSops.length ? (
              <div className="tool-grid">
                {filteredSops.map((sop) => {
                  return (
                    <button className="tool-card" key={sop.id} onClick={() => openSop(sop)}>
                      <span className={`tool-icon ${sop.accent}`}><FileText size={22} /></span>
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
          </div>
        ) : (
          <div id="home-manuals-panel" className="home-tab-panel" role="tabpanel" aria-labelledby="home-manuals-tab">
            <div className="panel-summary"><span>设备与试剂说明书</span><span className="count">{filteredManuals.length} 份文件</span></div>
            <div className="filter-row" aria-label="说明书分类筛选">
              {['全部', ...manualTags].map((tag) => (
                <button
                  type="button"
                  key={tag}
                  className={`filter ${manualTag === tag ? 'active' : ''}`}
                  onClick={() => setManualTag(tag)}
                  aria-pressed={manualTag === tag}
                >
                  {tag}
                </button>
              ))}
            </div>
            {filteredManuals.length ? (
              <div className="manual-grid">
                {filteredManuals.map((manual) => <ManualCard key={manual.id} manual={manual} />)}
              </div>
            ) : (
              <div className="empty-state"><Search size={25} /><strong>没有找到匹配说明书</strong><span>换一个关键词或分类试试。</span></div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function ToolHeader({
  title,
  category,
  version,
  versionHistory,
  pdfLink,
}: {
  title: string;
  category: string;
  version?: string;
  versionHistory?: readonly VersionHistoryEntry[];
  pdfLink?: string;
}) {
  return (
    <div className="detail-header">
      <Link className="back-link" to="/"><ArrowLeft size={18} />返回工具列表</Link>
      <div className="detail-title-row">
        <div>
          <span className="section-kicker">{category.toUpperCase()}</span>
          <h1>{title}</h1>
          {version && (
            versionHistory?.length ? (
              <VersionHistoryDialog
                entries={versionHistory}
                title={title}
                triggerClassName="detail-version-trigger"
                triggerLabel={`版本 ${version} · 当前有效`}
              />
            ) : <p>版本 {version} · 当前有效</p>
          )}
        </div>
        {pdfLink && <Link className="secondary-button" to={pdfLink}><FileText size={18} />查看 PDF 版</Link>}
      </div>
    </div>
  );
}

function PdfPage() {
  const { id } = useParams();
  const sop = sops.find((item) => item.id === id);
  if (!sop?.pdfPath) return <Navigate to="/" replace />;
  const { pdfPath } = sop;
  const file = `${import.meta.env.BASE_URL}${pdfPath}`;
  const fileName = pdfPath.split('/').pop() ?? `${sop.title}-${sop.version || 'current'}.pdf`;

  return (
    <main className="detail-page pdf-page">
      <ToolHeader title={sop.title} category={sop.category} version={sop.version} versionHistory={sop.versionHistory} />
      <div className="document-meta">
        <span><FileText size={17} />PDF 标准操作文件</span>
        {sop.effectiveDate && <span>生效日期：{sop.effectiveDate}</span>}
      </div>
      <Suspense fallback={<div className="pdf-state"><span className="spinner" />正在启动 PDF 阅读器…</div>}>
        <PdfViewer file={file} fileName={fileName} />
      </Suspense>
    </main>
  );
}

function ManualPage() {
  const { id } = useParams();
  const manual = manuals.find((item) => item.id === id);
  if (!manual) return <Navigate to="/" replace />;
  const file = `${import.meta.env.BASE_URL}${manual.pdfPath}`;

  return (
    <main className="detail-page pdf-page">
      <div className="detail-header">
        <Link className="back-link" to="/"><ArrowLeft size={18} />返回说明书列表</Link>
        <div className="detail-title-row manual-detail-title">
          <div>
            <span className="section-kicker">MANUAL LIBRARY</span>
            <h1>{manual.title}</h1>
            <div className="manual-tags detail-manual-tags">
              {manual.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </div>
        </div>
      </div>
      <div className="document-meta">
        <span><BookOpen size={17} />{manual.documentType}</span>
        <span>原文件：{manual.fileName}</span>
      </div>
      <Suspense fallback={<div className="pdf-state"><span className="spinner" />正在启动 PDF 阅读器…</div>}>
        <PdfViewer file={file} fileName={manual.fileName} />
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
        <Route path="/sop/rna-qpcr" element={<RnaQpcrTool />} />
        <Route path="/sop/western-blot" element={<WesternBlotTool />} />
        <Route path="/sop/:id/pdf" element={<PdfPage />} />
        <Route path="/manuals/:id" element={<ManualPage />} />
        <Route path="/announcements/:slug" element={<AnnouncementPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SiteFooter />
      <AnnouncementDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
