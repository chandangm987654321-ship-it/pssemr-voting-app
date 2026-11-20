import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { CandidateVoteResult, ElectionStatus } from '../types.ts';

export interface ExportableResultsReport {
  schoolName: string;
  electionTitle: string;
  electionDate: string;
  electionStatus: ElectionStatus;
  totalCandidates: number;
  totalVotes: number;
  leadingCandidate: CandidateVoteResult | null;
  tiedCandidates: CandidateVoteResult[];
  isTie: boolean;
  results: CandidateVoteResult[];
}

function formatStatusLabel(status: ElectionStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'ended':
      return 'Ended';
    default:
      return 'Not Started';
  }
}

function formatDisplayDate(rawDate: string): string {
  if (!rawDate) return new Date().toLocaleDateString(undefined, { dateStyle: 'long' });
  try {
    const parsed = rawDate.length === 10 ? new Date(`${rawDate}T00:00:00`) : new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) return rawDate;
    return parsed.toLocaleDateString(undefined, { dateStyle: 'long' });
  } catch {
    return rawDate;
  }
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getStandingSummary(report: ExportableResultsReport): string {
  if (report.totalVotes === 0) return 'No votes recorded yet';
  if (report.isTie && report.tiedCandidates.length > 0) {
    const names = report.tiedCandidates.map((c) => c.name).join(', ');
    const topVotes = report.tiedCandidates[0].votes;
    return `TIE (${names} — ${topVotes} votes each)`;
  }
  if (report.leadingCandidate) {
    const prefix = report.electionStatus === 'ended' ? 'WINNER' : 'LEADING';
    const desig = report.leadingCandidate.designation ? ` — ${report.leadingCandidate.designation}` : '';
    return `${prefix}: ${report.leadingCandidate.name}${desig} (${report.leadingCandidate.votes} votes, ${report.leadingCandidate.percentage.toFixed(1)}%)`;
  }
  return '—';
}

export function downloadResultsCsv(report: ExportableResultsReport): void {
  const header = [
    'Ranking',
    'Candidate Name',
    'Designation / Position',
    'Class/Section',
    'Symbol',
    'Total Votes',
    'Vote Percentage (%)',
  ];
  const rows = report.results.map((r, idx) => [
    idx + 1,
    r.name,
    r.designation || '-',
    r.classSection || '-',
    r.symbol || '-',
    r.votes,
    r.percentage.toFixed(1),
  ]);
  rows.push([
    '',
    'TOTAL VOTES CAST',
    '',
    '',
    '',
    report.totalVotes,
    report.totalVotes > 0 ? '100.0' : '0.0',
  ]);

  const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pssemr-election-results-${report.electionDate || new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadResultsExcel(report: ExportableResultsReport): void {
  const candidateRows: Array<Record<string, string | number>> = report.results.map((r, idx) => ({
    Ranking: idx + 1,
    'Candidate Name': r.name,
    'Designation / Position': r.designation || '-',
    'Class/Section': r.classSection || '-',
    'Candidate Symbol': r.symbol || '-',
    'Total Votes': r.votes,
    'Vote Percentage (%)': Number(r.percentage.toFixed(1)),
  }));

  candidateRows.push({
    Ranking: '',
    'Candidate Name': 'TOTAL VOTES CAST',
    'Designation / Position': '',
    'Class/Section': '',
    'Candidate Symbol': '',
    'Total Votes': report.totalVotes,
    'Vote Percentage (%)': report.totalVotes > 0 ? 100 : 0,
  });

  const resultsSheet = XLSX.utils.json_to_sheet(candidateRows);
  resultsSheet['!cols'] = [
    { wch: 10 },
    { wch: 26 },
    { wch: 24 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
  ];

  const summaryRows = [
    { Field: 'School Name', Value: report.schoolName },
    { Field: 'Election Title', Value: report.electionTitle },
    { Field: 'Election Date', Value: formatDisplayDate(report.electionDate) },
    { Field: 'Election Status', Value: formatStatusLabel(report.electionStatus) },
    { Field: 'Total Registered Candidates', Value: report.totalCandidates },
    { Field: 'Total Votes Cast', Value: report.totalVotes },
    { Field: 'Result Standing', Value: getStandingSummary(report) },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 48 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, resultsSheet, 'Election Results');
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Election Summary');
  XLSX.writeFile(
    wb,
    `pssemr-election-results-${report.electionDate || new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    return await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 128;
          canvas.height = img.naturalHeight || 128;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  } catch {
    return null;
  }
}

export async function downloadResultsPdf(report: ExportableResultsReport): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const logoDataUrl = await loadImageAsDataUrl('/assets/aistudio/image_4b78f9d5.png');

  // Header band
  doc.setFillColor(11, 17, 32);
  doc.rect(0, 0, pageWidth, 34, 'F');

  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.circle(23, 17, 10.5, 'F');
    doc.addImage(logoDataUrl, 'PNG', 13.5, 7.5, 19, 19);
  }

  const textStartX = logoDataUrl ? 39 : 14;
  doc.setTextColor(34, 211, 238);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(report.schoolName, textStartX, 12);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(report.electionTitle || 'Official Election Results Report', textStartX, 20);

  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Date: ${formatDisplayDate(report.electionDate)}   |   Status: ${formatStatusLabel(report.electionStatus)}   |   Total Votes: ${report.totalVotes}`,
    textStartX,
    27
  );

  // Winner / Tie highlight box
  let nextY = 42;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, nextY, pageWidth - 28, 18, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const bannerTitle =
    report.isTie
      ? 'RESULT STATUS: TIE'
      : report.electionStatus === 'ended'
        ? 'OFFICIAL WINNER ANNOUNCEMENT'
        : 'CURRENT LEADING CANDIDATE';
  doc.text(bannerTitle, 18, nextY + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 64, 175);
  doc.text(getStandingSummary(report), 18, nextY + 13.5);

  nextY += 24;

  const symbolLogos = await Promise.all(
    report.results.map((r) => (r.symbolLogoUrl ? loadImageAsDataUrl(r.symbolLogoUrl) : Promise.resolve(null)))
  );

  // Candidate-wise vote statistics table
  const tableRows = report.results.map((r, idx) => [
    `#${idx + 1}`,
    r.name,
    r.designation || '-',
    r.classSection ? `Class ${r.classSection}` : '-',
    symbolLogos[idx] ? `        ${r.symbol || '-'}` : r.symbol || '-',
    String(r.votes),
    `${r.percentage.toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY: nextY,
    head: [['Rank', 'Candidate Name', 'Designation', 'Class / Section', 'Symbol', 'Total Votes', 'Percentage']],
    body:
      tableRows.length > 0
        ? tableRows
        : [['-', 'No active candidates recorded', '-', '-', '-', '0', '0.0%']],
    foot: [['', 'TOTAL VOTES CAST', '', '', '', String(report.totalVotes), report.totalVotes > 0 ? '100.0%' : '0.0%']],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      textColor: [15, 23, 42],
      fontSize: 9,
      minCellHeight: 10,
      valign: 'middle',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 14 },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 24 },
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const logo = symbolLogos[data.row.index];
        if (logo) {
          const size = 6;
          const x = data.cell.x + 2;
          const y = data.cell.y + (data.cell.height - size) / 2;
          doc.addImage(logo, 'PNG', x, y, size, size);
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? nextY + 40;
  const sigY = Math.min(262, finalY + 24);

  doc.setDrawColor(100, 116, 139);
  doc.line(14, sigY, 85, sigY);
  doc.line(pageWidth - 85, sigY, pageWidth - 14, sigY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Election Administrator Signature & Date', 14, sigY + 5);
  doc.text('Principal / Presiding Officer Signature & Seal', pageWidth - 85, sigY + 5);

  doc.save(
    `pssemr-election-results-${report.electionDate || new Date().toISOString().slice(0, 10)}.pdf`
  );
}
