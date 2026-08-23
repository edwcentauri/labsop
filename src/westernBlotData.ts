export type WesternBlotMarkerId = 'yseasy-10-250' | 'thermo-40-300';

export type WesternBlotMarkerBand = {
  molecularWeight: number;
  color: 'blue' | 'green' | 'red' | 'orange';
};

export type WesternBlotMarker = {
  id: WesternBlotMarkerId;
  name: string;
  rangeLabel: string;
  bands: WesternBlotMarkerBand[];
};

export const westernBlotMarkers: WesternBlotMarker[] = [
  {
    id: 'yseasy-10-250',
    name: '雅酶',
    rangeLabel: '10–250 kDa',
    bands: [10, 15, 20, 25, 35, 40, 50, 70, 100, 150, 250].map((molecularWeight): WesternBlotMarkerBand => ({
      molecularWeight,
      color: molecularWeight === 25 ? 'green' : molecularWeight === 70 ? 'red' : 'blue',
    })),
  },
  {
    id: 'thermo-40-300',
    name: '赛默飞',
    rangeLabel: '40–300 kDa',
    bands: [40, 50, 70, 100, 130, 180, 250, 300].map((molecularWeight): WesternBlotMarkerBand => ({
      molecularWeight,
      color: molecularWeight === 50 ? 'green' : molecularWeight === 70 || molecularWeight === 300 ? 'orange' : 'blue',
    })),
  },
];

export type WesternBlotSopItemKind =
  | 'text'
  | 'lysis-recipe'
  | 'denaturation-recipe'
  | 'gel-setup'
  | 'gel-recipe'
  | 'buffer-recipe'
  | 'electrophoresis-setup'
  | 'electrophoresis-run'
  | 'transfer-setup'
  | 'transfer-run'
  | 'primary-antibody'
  | 'secondary-antibody';

export type WesternBlotSopItem = {
  kind: WesternBlotSopItemKind;
  text?: string;
  details?: string[];
  warning?: string;
};

export type WesternBlotSopSection = {
  id: string;
  kicker: string;
  title: string;
  summary: string;
  items: WesternBlotSopItem[];
};

export const westernBlotSopSections: WesternBlotSopSection[] = [
  {
    id: 'extraction',
    kicker: '01 · EXTRACTION',
    title: '提取',
    summary: '按本批次样本数直接配制裂解液并完成组织处理。',
    items: [
      { kind: 'text', text: '从 -80℃ 冰箱取出所需样本，预冷研磨机（“肌肉”程序）。' },
      { kind: 'text', text: '取对应数量 2 ml 研磨管，做好标记，每个组织取绿豆大小。' },
      { kind: 'lysis-recipe' },
      { kind: 'text', text: '研磨机研磨，在 117 冰箱摇床摇 1 h，离心 12000 rpm × 30 min。' },
      { kind: 'text', text: '蛋白液可暂存在 -80℃ 冰箱。' },
    ],
  },
  {
    id: 'denaturation',
    kicker: '02 · DENATURATION',
    title: '变性',
    summary: '按每管 300 μl 体系完成全批次变性。',
    items: [
      { kind: 'denaturation-recipe' },
      { kind: 'text', text: '干浴锅 100℃ 5–7 min。', warning: '防炸锅：开盖煮至 70℃ 时关盖。' },
      { kind: 'text', text: '变性后的蛋白液可暂存在 -20℃ 冰箱。' },
    ],
  },
  {
    id: 'gel',
    kicker: '03 · GEL CASTING',
    title: '制胶（先完成 WB 检查单）',
    summary: '仅显示本批次板厚度对应的配胶操作与总量。',
    items: [
      { kind: 'gel-setup' },
      { kind: 'text', text: '找到所需浓度的配胶试剂盒，在小塑料杯里按照说明书配胶；下方配方已按本批次板数计算。' },
      { kind: 'gel-recipe' },
      { kind: 'text', text: '凝固时间约 30 min，建议在此期间配电泳液。' },
    ],
  },
  {
    id: 'buffers',
    kicker: '04 · BUFFERS',
    title: '配液',
    summary: '粉末包数与液体体积随 2 板或 4 板批次联动。',
    items: [
      { kind: 'buffer-recipe' },
      { kind: 'text', text: '电泳液需要现配，转膜液可以回收。' },
    ],
  },
  {
    id: 'electrophoresis',
    kicker: '05 · ELECTROPHORESIS',
    title: '电泳',
    summary: '按胶板设计图上样，并使用初始化中的板数与电压。',
    items: [
      { kind: 'text', text: '把凝固的胶板放在电泳仪里，向上卡紧以卡住小板。' },
      { kind: 'electrophoresis-setup' },
      { kind: 'text', text: '按照胶板设计图上样。' },
      { kind: 'electrophoresis-run' },
      { kind: 'text', text: '转膜液放 -4℃ 冰箱预冷。' },
    ],
  },
  {
    id: 'transfer',
    kicker: '06 · TRANSFER',
    title: '转膜',
    summary: '夹板、PVDF 膜与电流按本批次参数明确显示。',
    items: [
      { kind: 'transfer-setup' },
      { kind: 'text', text: '小心取下凝胶，切掉上层胶，放在夹子里，顺序为下板－海绵－滤纸－胶－膜－滤纸－海绵－上板。' },
      { kind: 'text', text: '合上夹板，注意不要太紧。' },
      { kind: 'transfer-run' },
      { kind: 'text', text: '转膜完成后以左上角剪角为正。' },
    ],
  },
  {
    id: 'blocking',
    kicker: '07 · BLOCKING',
    title: '封闭',
    summary: '完成快速封闭液封闭。',
    items: [{ kind: 'text', text: '快速封闭液封闭，慢摇 50 min。' }],
  },
  {
    id: 'primary',
    kicker: '08 · PRIMARY ANTIBODY',
    title: '切膜与一抗孵育',
    summary: '按胶板设计器中的蛋白与切膜线执行。',
    items: [{ kind: 'primary-antibody' }],
  },
  {
    id: 'secondary',
    kicker: '09 · SECONDARY ANTIBODY',
    title: '二抗孵育',
    summary: '回收一抗，完成漂洗、二抗孵育与再次漂洗。',
    items: [{ kind: 'secondary-antibody' }],
  },
  {
    id: 'exposure',
    kicker: '10 · EXPOSURE',
    title: '曝光',
    summary: '完成曝光。',
    items: [{ kind: 'text', text: '曝光。' }],
  },
];
