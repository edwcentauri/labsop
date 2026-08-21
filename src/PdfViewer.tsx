import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Minus, Plus } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
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

export default function PdfViewer({ file, fileName }: PdfViewerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [frameWidth, setFrameWidth] = useState(720);

  useEffect(() => {
    if (!frameRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setFrameWidth(Math.max(260, Math.min(820, entry.contentRect.width - 32)));
    });
    observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, []);

  const previous = () => setPageNumber((page) => Math.max(1, page - 1));
  const next = () => setPageNumber((page) => Math.min(numPages, page + 1));

  return (
    <section className="pdf-viewer" aria-label="PDF 阅读器">
      <div className="pdf-toolbar">
        <div className="pdf-controls">
          <button onClick={previous} disabled={pageNumber <= 1} aria-label="上一页">
            <ChevronLeft size={19} />
          </button>
          <span>{pageNumber} / {numPages || '—'}</span>
          <button onClick={next} disabled={pageNumber >= numPages} aria-label="下一页">
            <ChevronRight size={19} />
          </button>
        </div>
        <div className="pdf-controls">
          <button onClick={() => setScale((value) => Math.max(.7, value - .15))} aria-label="缩小">
            <Minus size={18} />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((value) => Math.min(1.8, value + .15))} aria-label="放大">
            <Plus size={18} />
          </button>
          <a href={file} download={fileName} aria-label="下载 PDF">
            <Download size={18} /><span>下载</span>
          </a>
        </div>
      </div>
      <div className="pdf-canvas-frame" ref={frameRef}>
        <Document
          file={file}
          onLoadSuccess={({ numPages: loadedPages }) => {
            setNumPages(loadedPages);
            setPageNumber(1);
          }}
          loading={<div className="pdf-state"><span className="spinner" />正在加载 PDF…</div>}
          error={<div className="pdf-state error">PDF 暂时无法加载，请使用上方下载按钮获取原文件。</div>}
        >
          <Page
            pageNumber={pageNumber}
            width={frameWidth}
            scale={scale}
            renderAnnotationLayer
            renderTextLayer
            loading={<div className="pdf-state"><span className="spinner" />正在渲染页面…</div>}
          />
        </Document>
      </div>
      <p className="pdf-hint">PDF 已嵌入当前页面，可缩放、翻页或下载原文件。</p>
    </section>
  );
}
