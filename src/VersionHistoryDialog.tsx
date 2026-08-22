import { History, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { VersionHistoryEntry } from './versionHistory';

type VersionHistoryDialogProps = {
  entries: readonly VersionHistoryEntry[];
  title: string;
  triggerClassName?: string;
  triggerLabel: string;
};

export default function VersionHistoryDialog({
  entries,
  title,
  triggerClassName = '',
  triggerLabel,
}: VersionHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sortedEntries = useMemo(
    () => [...entries].sort((left, right) => right.date.localeCompare(left.date)),
    [entries],
  );

  const closeDialog = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDialog();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closeDialog, open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`version-history-trigger ${triggerClassName}`.trim()}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>{triggerLabel}</span>
        <History size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="version-history-layer" role="presentation" onMouseDown={closeDialog}>
          <section
            className="version-history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="version-history-header">
              <div>
                <span className="section-kicker">VERSION HISTORY</span>
                <h2 id={titleId}>版本更新说明</h2>
                <p>{title}</p>
              </div>
              <button ref={closeButtonRef} type="button" className="icon-button" onClick={closeDialog} aria-label="关闭版本更新说明">
                <X size={20} />
              </button>
            </header>
            <ol className="version-history-list">
              {sortedEntries.map((entry) => (
                <li key={`${entry.version}-${entry.date}`}>
                  <div>
                    <strong>{entry.version}</strong>
                    <time dateTime={entry.date}>{entry.date}</time>
                  </div>
                  <p>{entry.summary}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </>
  );
}
