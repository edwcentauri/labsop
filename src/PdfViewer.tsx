import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minus,
  PanelTop,
  Plus,
  ScrollText,
  X,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Document, Outline, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type PdfViewerProps = {
  file: string;
  fileName: string;
};

type ViewMode = 'paged' | 'scroll';
type FitMode = 'width' | 'height';
type OutlineStatus = 'loading' | 'ready' | 'empty' | 'error';
type Point = { x: number; y: number };

const MIN_SCALE = .6;
const MAX_SCALE = 3;
const SCALE_STEP = .15;
const SWIPE_DISTANCE = 64;
const SCROLL_RENDER_RADIUS = 1;
const DEFAULT_PAGE_RATIO = Math.SQRT2;
const RENDER_PIXEL_RATIO = typeof window === 'undefined'
  ? 1
  : Math.min(window.devicePixelRatio || 1, 2);

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function pointDistance([first, second]: Point[]) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export default function PdfViewer({ file, fileName }: PdfViewerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement | null>(null);
  const goToPageRef = useRef<(targetPage: number) => void>(() => undefined);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const activePointers = useRef(new Map<number, Point>());
  const scrollFrameRequest = useRef<number | null>(null);
  const panGesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
  const pinchGesture = useRef<{
    startDistance: number;
    startScale: number;
    nextScale: number;
    midpointX: number;
    midpointY: number;
  } | null>(null);
  const pendingZoomScroll = useRef<{
    contentX: number;
    contentY: number;
    midpointX: number;
    midpointY: number;
  } | null>(null);

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [frameWidth, setFrameWidth] = useState(720);
  const [frameHeight, setFrameHeight] = useState(720);
  const [pageRatios, setPageRatios] = useState<Record<number, number>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('paged');
  const [fitMode, setFitMode] = useState<FitMode>('width');
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineStatus, setOutlineStatus] = useState<OutlineStatus>('loading');

  useEffect(() => {
    if (!frameRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setFrameWidth(Math.max(260, Math.min(820, entry.contentRect.width - 32)));
      setFrameHeight(Math.max(320, entry.contentRect.height - 32));
    });
    observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const pending = pendingZoomScroll.current;
    const frame = frameRef.current;
    if (!pending || !frame) return;

    pendingZoomScroll.current = null;
    const frameId = window.requestAnimationFrame(() => {
      frame.scrollLeft = pending.contentX * scale - pending.midpointX;
      frame.scrollTop = pending.contentY * scale - pending.midpointY;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [scale]);

  useEffect(() => () => {
    if (scrollFrameRequest.current !== null) {
      window.cancelAnimationFrame(scrollFrameRequest.current);
    }
  }, []);

  const scrollToPage = useCallback((targetPage: number, behavior: ScrollBehavior = 'smooth') => {
    const frame = frameRef.current;
    const target = pageRefs.current.get(targetPage);
    if (!frame || !target) return;
    frame.scrollTo({ behavior, top: Math.max(0, target.offsetTop - 12) });
  }, []);

  const goToPage = useCallback((targetPage: number) => {
    const safePage = Math.min(numPages || 1, Math.max(1, targetPage));
    setPageNumber(safePage);
    setOutlineOpen(false);
    if (viewMode === 'scroll') {
      window.requestAnimationFrame(() => scrollToPage(safePage));
    } else {
      frameRef.current?.scrollTo({ left: 0, top: 0 });
    }
  }, [numPages, scrollToPage, viewMode]);

  goToPageRef.current = goToPage;
  const handlePdfItemClick = useCallback(({ pageNumber: targetPage }: { pageNumber: number }) => {
    goToPageRef.current(targetPage);
  }, []);

  const previous = useCallback(() => goToPage(pageNumber - 1), [goToPage, pageNumber]);
  const next = useCallback(() => goToPage(pageNumber + 1), [goToPage, pageNumber]);

  const changeViewMode = (mode: ViewMode) => {
    if (mode === viewMode) return;
    setViewMode(mode);
    if (mode === 'scroll') {
      window.requestAnimationFrame(() => scrollToPage(pageNumber, 'auto'));
    } else {
      frameRef.current?.scrollTo({ left: 0, top: 0 });
    }
  };

  const applyFitMode = (mode: FitMode) => {
    setFitMode(mode);
    setScale(1);
    pendingZoomScroll.current = null;
    window.requestAnimationFrame(() => {
      if (viewMode === 'scroll') scrollToPage(pageNumber, 'auto');
      else frameRef.current?.scrollTo({ left: 0, top: 0 });
    });
  };

  const updateCurrentScrollPage = () => {
    if (viewMode !== 'scroll' || scrollFrameRequest.current !== null) return;

    scrollFrameRequest.current = window.requestAnimationFrame(() => {
      scrollFrameRequest.current = null;
      const frame = frameRef.current;
      if (!frame) return;
      const frameTop = frame.getBoundingClientRect().top;
      let closestPage = pageNumber;
      let closestDistance = Number.POSITIVE_INFINITY;

      pageRefs.current.forEach((element, page) => {
        const distance = Math.abs(element.getBoundingClientRect().top - frameTop - 12);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = page;
        }
      });
      setPageNumber(closestPage);
    });
  };

  const startPanWithPointer = (pointerId: number, point: Point) => {
    const frame = frameRef.current;
    if (!frame) return;
    panGesture.current = {
      pointerId,
      startX: point.x,
      startY: point.y,
      startScrollLeft: frame.scrollLeft,
      startScrollTop: frame.scrollTop,
    };
  };

  const resetPinchPreview = () => {
    const documentElement = documentRef.current;
    if (!documentElement) return;
    documentElement.style.removeProperty('transform');
    documentElement.style.removeProperty('transform-origin');
  };

  const capturePointer = (frame: HTMLDivElement, pointerId: number) => {
    try {
      if (!frame.hasPointerCapture(pointerId)) frame.setPointerCapture(pointerId);
    } catch {
      // Safari can throw when a pointer ends between the event and capture call.
    }
  };

  const clearGestureState = useCallback(() => {
    const frame = frameRef.current;
    const pointerIds = [...activePointers.current.keys()];
    activePointers.current.clear();
    panGesture.current = null;
    pinchGesture.current = null;
    const documentElement = documentRef.current;
    documentElement?.style.removeProperty('transform');
    documentElement?.style.removeProperty('transform-origin');

    if (!frame) return;
    pointerIds.forEach((pointerId) => {
      try {
        if (frame.hasPointerCapture(pointerId)) frame.releasePointerCapture(pointerId);
      } catch {
        // The browser may have already released capture for this pointer.
      }
    });
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const isInteractiveTarget = event.target instanceof Element
      && Boolean(event.target.closest('a, button'));
    if (!isInteractiveTarget) capturePointer(event.currentTarget, event.pointerId);
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.current.size > 2) {
      activePointers.current.delete(event.pointerId);
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // The ignored pointer may already have ended.
      }
      return;
    }

    if (activePointers.current.size === 1) {
      startPanWithPointer(event.pointerId, { x: event.clientX, y: event.clientY });
      return;
    }

    if (activePointers.current.size === 2) {
      const frame = frameRef.current;
      const points = [...activePointers.current.values()];
      if (!frame) return;
      activePointers.current.forEach((_, pointerId) => capturePointer(frame, pointerId));
      const frameRect = frame.getBoundingClientRect();
      const midpointX = (points[0].x + points[1].x) / 2 - frameRect.left;
      const midpointY = (points[0].y + points[1].y) / 2 - frameRect.top;
      pinchGesture.current = {
        startDistance: pointDistance(points),
        startScale: scale,
        nextScale: scale,
        midpointX,
        midpointY,
      };
      panGesture.current = null;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || !activePointers.current.has(event.pointerId)) return;
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const frame = frameRef.current;
    if (!frame) return;

    if (activePointers.current.size === 2 && pinchGesture.current) {
      const points = [...activePointers.current.values()];
      const gesture = pinchGesture.current;
      const nextScale = clampScale(
        gesture.startScale * pointDistance(points) / Math.max(gesture.startDistance, 1),
      );
      gesture.nextScale = nextScale;
      const previewRatio = nextScale / gesture.startScale;
      if (documentRef.current) {
        documentRef.current.style.transformOrigin = `${frame.scrollLeft + gesture.midpointX}px ${frame.scrollTop + gesture.midpointY}px`;
        documentRef.current.style.transform = `scale(${previewRatio})`;
      }
      return;
    }

    const pan = panGesture.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    frame.scrollLeft = pan.startScrollLeft - (event.clientX - pan.startX);
    frame.scrollTop = pan.startScrollTop - (event.clientY - pan.startY);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const frame = frameRef.current;
    const pan = panGesture.current;
    const pinch = pinchGesture.current;
    const releasedPoint = activePointers.current.get(event.pointerId);
    activePointers.current.delete(event.pointerId);

    if (pinch) {
      resetPinchPreview();
      pinchGesture.current = null;
      if (frame && pinch.nextScale !== scale) {
        pendingZoomScroll.current = {
          contentX: (frame.scrollLeft + pinch.midpointX) / pinch.startScale,
          contentY: (frame.scrollTop + pinch.midpointY) / pinch.startScale,
          midpointX: pinch.midpointX,
          midpointY: pinch.midpointY,
        };
        setScale(pinch.nextScale);
      }
      const remaining = [...activePointers.current.entries()][0];
      if (remaining) startPanWithPointer(remaining[0], remaining[1]);
      return;
    }

    if (frame && pan && releasedPoint && pan.pointerId === event.pointerId && viewMode === 'paged') {
      const deltaX = releasedPoint.x - pan.startX;
      const deltaY = releasedPoint.y - pan.startY;
      const atLeftEdge = frame.scrollLeft <= 1;
      const atRightEdge = frame.scrollLeft + frame.clientWidth >= frame.scrollWidth - 1;
      if (Math.abs(deltaX) >= SWIPE_DISTANCE && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
        if (deltaX < 0 && atRightEdge) next();
        if (deltaX > 0 && atLeftEdge) previous();
      }
    }

    panGesture.current = null;
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType === 'touch'
      && activePointers.current.has(event.pointerId)
      && !event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      clearGestureState();
    }
  };

  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' && activePointers.current.has(event.pointerId)) {
      clearGestureState();
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') clearGestureState();
    };
    window.addEventListener('blur', clearGestureState);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', clearGestureState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearGestureState]);

  const renderPage = (page: number) => {
    const pageRatio = pageRatios[page] ?? DEFAULT_PAGE_RATIO;
    const pageWidth = fitMode === 'width'
      ? frameWidth * scale
      : frameHeight * scale / pageRatio;
    const pageHeight = fitMode === 'height'
      ? frameHeight * scale
      : frameWidth * scale * pageRatio;
    const scrollPageStyle: CSSProperties | undefined = viewMode === 'scroll'
      ? { height: pageHeight, width: pageWidth }
      : undefined;
    const shouldRender = viewMode === 'paged'
      || Math.abs(page - pageNumber) <= SCROLL_RENDER_RADIUS;

    return (
      <div
        className={`pdf-page-shell ${shouldRender ? '' : 'pdf-page-placeholder'}`}
        data-page-number={page}
        key={`page-${page}`}
        ref={(element) => {
          if (element) pageRefs.current.set(page, element);
          else pageRefs.current.delete(page);
        }}
        style={scrollPageStyle}
        aria-label={shouldRender ? undefined : `第 ${page} 页占位`}
      >
        {shouldRender && (
          <Page
            pageNumber={page}
            width={fitMode === 'width' ? frameWidth : undefined}
            height={fitMode === 'height' ? frameHeight : undefined}
            scale={scale}
            devicePixelRatio={RENDER_PIXEL_RATIO}
            renderAnnotationLayer
            renderTextLayer
            onLoadSuccess={(loadedPage) => {
              const viewport = loadedPage.getViewport({ scale: 1 });
              const nextRatio = viewport.height / Math.max(viewport.width, 1);
              setPageRatios((current) => (
                Math.abs((current[page] ?? 0) - nextRatio) < .001
                  ? current
                  : { ...current, [page]: nextRatio }
              ));
            }}
            loading={<div className="pdf-state"><span className="spinner" />正在渲染第 {page} 页…</div>}
          />
        )}
      </div>
    );
  };

  return (
    <section className="pdf-viewer" aria-label="PDF 阅读器">
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-row">
          <div className="pdf-controls pdf-page-controls">
            <button onClick={previous} disabled={pageNumber <= 1} aria-label="上一页">
              <ChevronLeft size={19} />
            </button>
            <span aria-live="polite">{pageNumber} / {numPages || '—'}</span>
            <button onClick={next} disabled={pageNumber >= numPages} aria-label="下一页">
              <ChevronRight size={19} />
            </button>
          </div>
          <div className="pdf-controls pdf-zoom-controls">
            <button onClick={() => setScale((value) => clampScale(value - SCALE_STEP))} aria-label="缩小">
              <Minus size={18} />
            </button>
            <span>{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale((value) => clampScale(value + SCALE_STEP))} aria-label="放大">
              <Plus size={18} />
            </button>
            <button
              className="pdf-fit-button"
              onClick={() => applyFitMode(fitMode === 'width' ? 'height' : 'width')}
              aria-label={`当前适应${fitMode === 'width' ? '宽度' : '高度'}，切换为适应${fitMode === 'width' ? '高度' : '宽度'}`}
              title={`适应${fitMode === 'width' ? '宽度' : '高度'}`}
            >
              <Maximize2 size={17} /><span>适应{fitMode === 'width' ? '宽度' : '高度'}</span>
            </button>
            <a href={file} download={fileName} aria-label="下载 PDF">
              <Download size={18} /><span>下载</span>
            </a>
          </div>
        </div>
        <div className="pdf-toolbar-row pdf-view-options">
          <button
            className={outlineOpen ? 'active' : ''}
            onClick={() => setOutlineOpen((open) => !open)}
            aria-expanded={outlineOpen}
            aria-controls="pdf-outline-panel"
          >
            <BookOpenText size={17} />书签
          </button>
          <div className="pdf-mode-switch" aria-label="翻页方式">
            <button
              className={viewMode === 'paged' ? 'active' : ''}
              onClick={() => changeViewMode('paged')}
              aria-pressed={viewMode === 'paged'}
            >
              <PanelTop size={16} />按钮翻页
            </button>
            <button
              className={viewMode === 'scroll' ? 'active' : ''}
              onClick={() => changeViewMode('scroll')}
              aria-pressed={viewMode === 'scroll'}
            >
              <ScrollText size={16} />滚动翻页
            </button>
          </div>
        </div>
      </div>
      <div className="pdf-reader-body">
        {outlineOpen && (
          <>
            <button
              className="pdf-outline-backdrop"
              onClick={() => setOutlineOpen(false)}
              aria-label="关闭书签"
            />
            <aside className="pdf-outline-panel" id="pdf-outline-panel" aria-label="PDF 书签">
              <div className="pdf-outline-header">
                <div><span>文档导航</span><strong>书签</strong></div>
                <button onClick={() => setOutlineOpen(false)} aria-label="关闭书签">
                  <X size={18} />
                </button>
              </div>
              <div className="pdf-outline-content">
                {outlineStatus === 'loading' && <div className="pdf-outline-state">正在读取书签…</div>}
                {outlineStatus === 'empty' && <div className="pdf-outline-state">此 PDF 未包含书签。</div>}
                {outlineStatus === 'error' && <div className="pdf-outline-state error">书签读取失败。</div>}
                {outlineStatus === 'ready' && pdf && (
                  <Outline pdf={pdf} onItemClick={handlePdfItemClick} />
                )}
              </div>
            </aside>
          </>
        )}
        <div
          className={`pdf-canvas-frame ${viewMode === 'scroll' ? 'scroll-mode' : 'paged-mode'}`}
          ref={frameRef}
          onScroll={updateCurrentScrollPage}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={clearGestureState}
          onPointerLeave={handlePointerLeave}
          onLostPointerCapture={handleLostPointerCapture}
        >
          <Document
            className={`pdf-document pdf-document-${viewMode}`}
            file={file}
            inputRef={documentRef}
            externalLinkTarget="_blank"
            onItemClick={handlePdfItemClick}
            onLoadSuccess={(loadedPdf) => {
              setPdf(loadedPdf);
              setNumPages(loadedPdf.numPages);
              setPageNumber(1);
              setPageRatios({});
              setOutlineStatus('loading');
              loadedPdf.getOutline()
                .then((outline) => setOutlineStatus(outline?.length ? 'ready' : 'empty'))
                .catch(() => setOutlineStatus('error'));
            }}
            loading={<div className="pdf-state"><span className="spinner" />正在加载 PDF…</div>}
            error={<div className="pdf-state error">PDF 暂时无法加载，请使用上方下载按钮获取原文件。</div>}
          >
            {viewMode === 'paged'
              ? renderPage(pageNumber)
              : Array.from({ length: numPages }, (_, index) => renderPage(index + 1))}
          </Document>
        </div>
      </div>
      <p className="pdf-hint">
        {viewMode === 'paged'
          ? '按钮或左右滑动翻页；双指缩放，可用适应按钮恢复页面大小。'
          : '上下滑动连续阅读；双指缩放，可通过书签和 PDF 内链接跳转。'}
      </p>
    </section>
  );
}
