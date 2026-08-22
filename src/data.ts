import rnaQpcrV1ReleaseBody from './content/rna-qpcr-v1-release.md?raw';
import {
  RNA_QPCR_EFFECTIVE_DATE,
  RNA_QPCR_PDF_PATH,
  RNA_QPCR_RELEASE_DATE,
  RNA_QPCR_VERSION,
  RNA_QPCR_VERSION_HISTORY,
} from './rnaQpcrData';
import type { VersionHistoryEntry } from './versionHistory';

export type SopEntry = {
  id: string;
  title: string;
  description: string;
  category: string;
  kind: 'tool' | 'pdf';
  hasPdf: boolean;
  version?: string;
  effectiveDate?: string;
  versionHistory?: readonly VersionHistoryEntry[];
  pdfPath?: string;
  accent: 'teal' | 'violet' | 'amber';
};

export const sops: SopEntry[] = [
  {
    id: 'rna-qpcr',
    title: '组织提 RNA（柱提法）+ qPCR',
    description: '正式互动 SOP：批次初始化、逐步勾选、上样、96 孔板设计及联动总管分装',
    category: '分子实验',
    kind: 'tool',
    hasPdf: true,
    version: RNA_QPCR_VERSION,
    effectiveDate: RNA_QPCR_EFFECTIVE_DATE,
    versionHistory: RNA_QPCR_VERSION_HISTORY,
    pdfPath: RNA_QPCR_PDF_PATH,
    accent: 'teal',
  },
];

export const announcements = [
  {
    slug: 'rna-qpcr-v1-release',
    title: '组织提 RNA（柱提法）+ qPCR SOP v1.0 发布',
    summary: 'v1.0 已发布：第一个发行版本。',
    date: RNA_QPCR_RELEASE_DATE,
    displayDate: RNA_QPCR_RELEASE_DATE,
    priority: false,
    body: rnaQpcrV1ReleaseBody,
  },
];
