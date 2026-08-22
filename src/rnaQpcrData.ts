import type { VersionHistoryEntry } from './versionHistory';

export type InteractiveSopItem = {
  text: string;
  details?: string[];
  warning?: string;
};

export type InteractiveSopSection = {
  id: string;
  kicker: string;
  title: string;
  summary: string;
  items: InteractiveSopItem[];
};

export const RNA_QPCR_PDF_FILE_NAME = '组织提RNA（柱提法）+qPCR v1.0.pdf';
export const RNA_QPCR_PDF_PATH = `pdfs/${RNA_QPCR_PDF_FILE_NAME}`;
export const RNA_QPCR_VERSION = 'v1.0';
export const RNA_QPCR_RELEASE_DATE = '2026-08-22';
export const RNA_QPCR_EFFECTIVE_DATE = RNA_QPCR_RELEASE_DATE;
export const RNA_QPCR_VERSION_HISTORY = [
  {
    version: RNA_QPCR_VERSION,
    date: RNA_QPCR_RELEASE_DATE,
    summary: '第一个发行版本',
  },
] as const satisfies readonly VersionHistoryEntry[];

export const reverseTranscriptionBranches = {
  10: {
    title: '10 μl 统一体系流程',
    steps: [
      { title: '4A · 去除 gDNA', text: '运行 SZH/CDNA 1 程序，体系容积 10 μl，约 4 分钟。' },
      { title: '5A · 逆转录', text: '每孔加入 4 μl RT Reaction Mix 和 6 μl 无酶无菌水，配制成 20 μl 体系。混匀、离心后运行 SZH/CDNA 2 程序，体系容积 20 μl，约 16 分钟，得到逆转录后的 cDNA。' },
    ],
  },
  16: {
    title: '16 μl 统一体系流程',
    steps: [
      { title: '4B · 去除 gDNA', text: '运行 SZH/CDNA 1 程序，体系容积 16 μl，约 4 分钟。' },
      { title: '5B · 逆转录', text: '每孔加入 4 μl RT Reaction Mix，不再补水，配制成 20 μl 体系。混匀、离心后运行 SZH/CDNA 2 程序，体系容积 20 μl，约 16 分钟，得到逆转录后的 cDNA。' },
    ],
  },
} as const;

export const rnaQpcrSections: InteractiveSopSection[] = [
  {
    id: 'rna-extraction',
    kicker: '01 · RNA EXTRACTION',
    title: '使用 AG RNA 试剂盒提取',
    summary: '按网页当前受控顺序完成样本处理、柱纯化、洗涤与洗脱。',
    items: [
      { text: '从 -80℃ 冰箱取出所需样本，预冷研磨机（“肌肉”程序），预冷离心机（4℃）。' },
      { text: '取对应数量 2 ml 研磨管，做好标记，每个组织取小米大小。' },
      { text: '每管加入 600 μl RNAex，研磨机研磨。室温静置 5 分钟，4℃离心机 12000G × 5 min。' },
      { text: '小心吸取上清液，移入新的离心管中，做好标记。' },
      { text: '加入 600 μl 70% 无酶无菌酒精，吹打均匀（谨防溢出）。若有明显黏稠物或沉淀，则吹打打散。' },
      {
        text: '从试剂盒取对应数量柱子，做好标记，将上述 1200 μl 混合物分两次加入柱子，离心机 12000 rpm × 1 min，弃滤液。',
        warning: '柱子最大容积为 750 μl，切勿多加以防溢出。如柱头被淹没或柱内仍有液体，则弃滤液后继续离心 30 s。',
      },
      { text: '向柱子里加 600 μl RW1，离心机 12000 rpm × 1 min，弃滤液。' },
      { text: '向柱子里加 650 μl RW2，离心机 12000 rpm × 1 min，弃滤液。', warning: '注意检查 RW2 是否已加无水乙醇。' },
      { text: '向柱子里加第二遍 650 μl RW2，离心机 12000 rpm × 1 min，弃滤液。' },
      { text: '将柱子装在新的收集管上，注意垂直取出，不要让柱子头碰到老收集管壁。离心机 12000 rpm × 2 min。' },
      { text: '将柱子装在新的 1.5 ml 无酶无菌离心管上，做好标记，在膜中央加 50 μl 无酶无菌水，室温静置 5 分钟，离心机 12000 rpm × 2 min。' },
      { text: '可保存于 -80℃ 冰箱。' },
    ],
  },
  {
    id: 'rna-concentration',
    kicker: '02 · QC',
    title: '测 RNA 浓度',
    summary: '完成浓度测定并在本页录入；上样方案将在下一页自动生成。',
    items: [
      { text: '测 RNA 浓度，做好记录，单位 ng/μl。' },
    ],
  },
  {
    id: 'reverse-transcription',
    kicker: '03 · REVERSE TRANSCRIPTION',
    title: '逆转录',
    summary: '按全批次浓度选择统一体系，并在第 3 步执行对应的完整独立流程。',
    items: [
      { text: '使用艾本德移液枪进行后续步骤。' },
      { text: '准备八连排，按 1 μg RNA 计算，上样量为 1000 ÷ 样品浓度，精确到 0.01（10 μl 枪精度）。' },
      { text: '根据本批次统一体系，按下方上样方案配制去 gDNA 体系，并完整执行对应的 10 μl 或 16 μl 独立流程。' },
      { text: '可保存于 -20℃ 冰箱。如要稀释，可取 1.5 ml 离心管，最多稀释 100 倍。' },
    ],
  },
  {
    id: 'qpcr',
    kicker: '04 · qPCR',
    title: 'qPCR',
    summary: '先完成 96 孔板设计，再配制 10 μl 体系并上机。',
    items: [
      { text: '设计 96 孔板图纸，每孔重复 3 次。每种引物需保留 3 个孔作为 NTC。' },
      {
        text: '配制 10 μl qPCR 体系，每孔：',
        details: ['SYBR 5 μl', '正向引物 0.4 μl', '反向引物 0.4 μl', '无酶无菌水 2.2 μl', 'cDNA 2 μl'],
        warning: 'NTC 孔的 cDNA 替换为无酶无菌水。',
      },
      { text: '上机（SZH qPCR 程序，体系容积 10 μl，约 67 分钟）。' },
    ],
  },
];
