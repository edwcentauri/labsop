import { BookOpen, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ManualEntry } from './manuals';

export default function ManualCard({ manual, compact = false }: { manual: ManualEntry; compact?: boolean }) {
  return (
    <Link className={`manual-card${compact ? ' compact' : ''}`} to={`/manuals/${manual.id}`}>
      <span className="manual-icon"><BookOpen size={21} /></span>
      <span className="manual-copy">
        <span className="manual-tags">
          {manual.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </span>
        <strong>{manual.title}</strong>
        <span className="manual-meta">{manual.documentType} · PDF 预览与下载</span>
      </span>
      <ChevronRight className="chevron" size={20} />
    </Link>
  );
}
