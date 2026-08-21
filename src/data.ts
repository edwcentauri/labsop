import maintenanceBody from './content/maintenance.md?raw';
import sopUpdateBody from './content/sop-update.md?raw';

export type SopEntry = {
  id: string;
  title: string;
  description: string;
  category: string;
  kind: 'tool' | 'pdf';
  hasPdf: boolean;
  version?: string;
  effectiveDate?: string;
  pdfPath?: string;
  accent: 'teal' | 'violet' | 'amber';
};

export const sops: SopEntry[] = [
  {
    id: 'dilution',
    title: '溶液稀释计算',
    description: '根据 C₁V₁ = C₂V₂ 快速计算母液与稀释液用量',
    category: '试剂配制',
    kind: 'tool',
    hasPdf: true,
    version: 'v2.1',
    effectiveDate: '2026-08-01',
    pdfPath: 'pdfs/dilution-sop-demo.pdf',
    accent: 'teal',
  },
  {
    id: 'cell-seeding',
    title: '细胞铺板计算',
    description: '按目标密度、孔板规格和细胞浓度计算接种体积',
    category: '细胞实验',
    kind: 'tool',
    hasPdf: false,
    accent: 'violet',
  },
  {
    id: 'centrifuge',
    title: '离心机操作规范',
    description: '转子安装、配平、运行检查及使用后清洁流程',
    category: '仪器操作',
    kind: 'pdf',
    hasPdf: true,
    version: 'v1.3',
    effectiveDate: '2026-07-15',
    pdfPath: 'pdfs/centrifuge-sop-demo.pdf',
    accent: 'amber',
  },
];

export const announcements = [
  {
    slug: 'centrifuge-maintenance',
    title: '离心机例行维护通知',
    summary: '8 月 24 日下午暂停使用，请提前安排实验。',
    date: '2026-08-21',
    displayDate: '今天',
    priority: true,
    body: maintenanceBody,
  },
  {
    slug: 'sop-version-update',
    title: 'PBS 配制 SOP 版本更新',
    summary: '新版 SOP 已生效，请停止使用旧版文件。',
    date: '2026-08-18',
    displayDate: '3 天前',
    priority: false,
    body: sopUpdateBody,
  },
];
