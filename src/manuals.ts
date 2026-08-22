export const manualTags = ['试剂', '仪器', 'RNA 提取', 'qPCR', '移液枪', '引物'] as const;

export type ManualTag = typeof manualTags[number];

export type ManualEntry = {
  id: string;
  title: string;
  documentType: '产品说明书' | '操作手册' | '使用方法' | '合成报告';
  tags: readonly ManualTag[];
  fileName: string;
  pdfPath: string;
  relatedSopIds: readonly string[];
};

export const manuals: ManualEntry[] = [
  {
    id: 'evo-m-mlv-rt-kit-v2',
    title: 'Evo M-MLV 反转录试剂盒 Ver.2',
    documentType: '产品说明书',
    tags: ['试剂', 'RNA 提取'],
    fileName: 'Evo M-MLV 反转录预混型试剂盒（含去除 gDNA 试剂，用于 qPCR）Ver.2 – 艾科瑞生物.pdf',
    pdfPath: 'pdfs/manuals/Evo M-MLV 反转录预混型试剂盒（含去除 gDNA 试剂，用于 qPCR）Ver.2 – 艾科瑞生物.pdf',
    relatedSopIds: ['rna-qpcr'],
  },
  {
    id: 'steadypure-rna-extraction-kit',
    title: 'SteadyPure RNA 提取试剂盒',
    documentType: '产品说明书',
    tags: ['试剂', 'RNA 提取'],
    fileName: 'SteadyPure RNA提取试剂盒.pdf',
    pdfPath: 'pdfs/manuals/SteadyPure RNA提取试剂盒.pdf',
    relatedSopIds: ['rna-qpcr'],
  },
  {
    id: 'eppendorf-research-3-neo',
    title: 'Eppendorf Research 3 neo 移液枪',
    documentType: '操作手册',
    tags: ['仪器', '移液枪'],
    fileName: '操作手册 – Eppendorf Research 3 neo.pdf',
    pdfPath: 'pdfs/manuals/操作手册 – Eppendorf Research 3 neo.pdf',
    relatedSopIds: ['rna-qpcr'],
  },
  {
    id: 'suprealq-purple-universal-sybr',
    title: 'SupRealQ Purple Universal SYBR qPCR Mix',
    documentType: '产品说明书',
    tags: ['试剂', 'qPCR'],
    fileName: 'SupRealQ Purple Universal SYBR qPCR Master Mix (U+).pdf',
    pdfPath: 'pdfs/manuals/SupRealQ Purple Universal SYBR qPCR Master Mix (U+).pdf',
    relatedSopIds: ['rna-qpcr'],
  },
  {
    id: 'dna-primer-synthesis-guide',
    title: 'DNA 引物合成产品使用方法',
    documentType: '使用方法',
    tags: ['引物'],
    fileName: 'DNA引物合成产品使用方法.pdf',
    pdfPath: 'pdfs/manuals/DNA引物合成产品使用方法.pdf',
    relatedSopIds: ['rna-qpcr'],
  },
  {
    id: 'mgapdh-primer-report-260992405',
    title: 'MGAPDH 引物合成报告单 260992405',
    documentType: '合成报告',
    tags: ['引物'],
    fileName: '【MGAPDH】合成报告单260992405.pdf',
    pdfPath: 'pdfs/manuals/【MGAPDH】合成报告单260992405.pdf',
    relatedSopIds: ['rna-qpcr'],
  },
];
