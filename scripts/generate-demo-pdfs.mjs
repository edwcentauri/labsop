import { mkdir, writeFile } from 'node:fs/promises';

function escapePdfText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function createPdf({ title, version, sections }) {
  const lines = [
    'q 0.05 0.46 0.43 rg 0 720 612 72 re f Q',
    `BT /F1 24 Tf 1 1 1 rg 50 748 Td (${escapePdfText(title)}) Tj ET`,
    `BT /F1 10 Tf 0.78 0.92 0.90 rg 50 730 Td (${escapePdfText(`LAB SOP  |  ${version}  |  DEMO DOCUMENT`)}) Tj ET`,
  ];

  let y = 680;
  sections.forEach((section, index) => {
    lines.push(`BT /F1 15 Tf 0.08 0.25 0.23 rg 50 ${y} Td (${escapePdfText(`${index + 1}. ${section.heading}`)}) Tj ET`);
    y -= 26;
    section.lines.forEach((line) => {
      lines.push(`BT /F1 10 Tf 0.25 0.34 0.32 rg 58 ${y} Td (${escapePdfText(`- ${line}`)}) Tj ET`);
      y -= 19;
    });
    y -= 18;
  });
  lines.push('BT /F1 9 Tf 0.45 0.52 0.50 rg 50 42 Td (Replace this demo file with the approved laboratory PDF before release.) Tj ET');

  const stream = `${lines.join('\n')}\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n%LABSOP\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const outputDirectory = new URL('../public/pdfs/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });

await writeFile(new URL('dilution-sop-demo.pdf', outputDirectory), createPdf({
  title: 'Solution Dilution SOP',
  version: 'Version 2.1 | Effective 2026-08-01',
  sections: [
    { heading: 'Confirm inputs', lines: ['Verify stock concentration and target concentration.', 'Use the same concentration unit for C1 and C2.'] },
    { heading: 'Calculate', lines: ['Calculate V1 using C1 x V1 = C2 x V2.', 'Confirm that the target concentration does not exceed the stock.'] },
    { heading: 'Prepare and label', lines: ['Add stock to a suitable vessel, then add diluent.', 'Mix thoroughly and label with concentration, date, and operator.'] },
  ],
}));

await writeFile(new URL('centrifuge-sop-demo.pdf', outputDirectory), createPdf({
  title: 'Centrifuge Operation SOP',
  version: 'Version 1.3 | Effective 2026-07-15',
  sections: [
    { heading: 'Pre-run check', lines: ['Inspect rotor, buckets, and tube condition.', 'Confirm tube pairs are balanced by mass and position.'] },
    { heading: 'Run', lines: ['Secure the rotor lid and close the chamber.', 'Set RCF, duration, and temperature according to the protocol.'] },
    { heading: 'After use', lines: ['Wait for a complete stop before opening.', 'Wipe spills, leave the chamber dry, and record the run.'] },
  ],
}));
