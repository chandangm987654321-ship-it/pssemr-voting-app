import { Award, Download, FileSpreadsheet, FileText, Printer, X } from 'lucide-react';
import {
  downloadResultsCsv,
  downloadResultsExcel,
  downloadResultsPdf,
  type ExportableResultsReport,
} from '../lib/exportResults.ts';
import type { AdminDashboardResponse, ElectionStatus } from '../types.ts';
import { CandidateAvatar } from './ui/CandidateAvatar.tsx';

interface ElectionReportModalProps {
  open: boolean;
  dashboard: AdminDashboardResponse | null;
  generatedAt: string;
  onClose: () => void;
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

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
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

export function PrintableElectionReportSheet({
  report,
  generatedAt,
}: {
  report: ExportableResultsReport;
  generatedAt: string;
}) {
  const results = report.results || [];
  const totalVotes = report.totalVotes || 0;
  const statusLabel = formatStatusLabel(report.electionStatus);

  return (
    <div className="bg-white text-slate-900 rounded-xl border border-slate-200 shadow-xl print:shadow-none print:border-0 print:rounded-none p-6 sm:p-10 space-y-6">
      {/* Official School Header */}
      <div className="border-b-2 border-slate-900 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src="/assets/aistudio/image_4b78f9d5.png"
            alt="PSSEMR School Logo"
            className="w-16 h-16 rounded-full bg-white border border-slate-200 p-0.5 object-contain shrink-0"
          />
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-blue-700 uppercase">
              {report.schoolName}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              {report.electionTitle || 'Official Election Results Report'}
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              PSSEMR Digital Voting System — Certified Election Results Report
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right text-xs text-slate-600 space-y-1">
          <p>
            <span className="font-semibold text-slate-800">Election Date:</span>{' '}
            {formatDisplayDate(report.electionDate)}
          </p>
          <p>
            <span className="font-semibold text-slate-800">Report Generated:</span>{' '}
            {formatTimestamp(generatedAt)}
          </p>
          <p>
            <span className="font-semibold text-slate-800">Election Status:</span>{' '}
            <span className="font-semibold text-slate-900">{statusLabel}</span>
          </p>
        </div>
      </div>

      {/* Summary Statistics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Candidates
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {report.totalCandidates}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Total Votes Cast
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {totalVotes}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Election Status
          </p>
          <p className="text-lg font-bold text-slate-900 mt-1.5">{statusLabel}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {report.isTie ? 'Standing (TIE)' : report.electionStatus === 'ended' ? 'Winner' : 'Leading'}
          </p>
          <p className="text-sm font-bold text-slate-900 mt-1.5 truncate">
            {totalVotes === 0
              ? 'No Votes Yet'
              : report.isTie
                ? `TIE: ${report.tiedCandidates.map((c) => c.name).join(', ')}`
                : report.leadingCandidate
                  ? report.leadingCandidate.name
                  : 'No Votes Yet'}
          </p>
        </div>
      </div>

      {/* Candidate Results Table with Photographs */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-y-2 border-slate-900 bg-slate-100 text-xs uppercase tracking-wider text-slate-700">
              <th className="py-3 px-3 font-bold">Rank</th>
              <th className="py-3 px-3 font-bold">Candidate</th>
              <th className="py-3 px-3 font-bold">Class &amp; Section</th>
              <th className="py-3 px-3 font-bold">Symbol</th>
              <th className="py-3 px-3 font-bold text-right">Total Votes</th>
              <th className="py-3 px-3 font-bold text-right">Percentage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {results.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500 text-sm">
                  No registered candidates found for this election.
                </td>
              </tr>
            ) : (
              results.map((r, idx) => {
                const topVotes = results[0]?.votes ?? 0;
                const isTop = topVotes > 0 && r.votes === topVotes;
                return (
                  <tr key={r.candidateId} className={isTop ? 'bg-blue-50/50' : ''}>
                    <td className="py-3 px-3 font-mono font-semibold text-slate-700 tabular-nums">
                      #{idx + 1}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-3">
                        <CandidateAvatar
                          name={r.name}
                          photoUrl={r.photoUrl}
                          size="sm"
                          className="border-slate-300"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{r.name}</span>
                            {isTop && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                                <Award className="w-3 h-3" />
                                {report.isTie
                                  ? 'TIE'
                                  : report.electionStatus === 'ended'
                                    ? 'WINNER'
                                    : 'LEADING'}
                              </span>
                            )}
                          </div>
                          {r.designation && (
                            <p className="text-xs font-medium text-blue-700 mt-0.5">
                              {r.designation}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {r.classSection ? `Class ${r.classSection}` : '—'}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {r.symbol || r.symbolLogoUrl ? (
                        <div className="inline-flex items-center gap-2">
                          {r.symbolLogoUrl && (
                            <img
                              src={r.symbolLogoUrl}
                              alt={r.symbol ? `${r.symbol} logo` : 'Candidate symbol logo'}
                              className="w-7 h-7 rounded border border-slate-200 bg-white p-0.5 object-contain shrink-0"
                            />
                          )}
                          <span className="font-medium text-slate-800">{r.symbol || '—'}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {r.votes}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800 tabular-nums">
                      {r.percentage.toFixed(1)}%
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900 bg-slate-100 font-bold text-slate-900">
              <td colSpan={4} className="py-3 px-3 text-xs uppercase tracking-wider">
                Total Votes Recorded
              </td>
              <td className="py-3 px-3 text-right font-mono text-base tabular-nums">
                {totalVotes}
              </td>
              <td className="py-3 px-3 text-right font-mono tabular-nums">
                {totalVotes > 0 ? '100.0%' : '0.0%'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Sign-off Lines for Printed Copy */}
      <div className="pt-8 mt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-8 text-xs text-slate-600">
        <div className="space-y-8">
          <div className="border-b border-slate-400 pb-1" />
          <p className="font-semibold text-slate-800">Election Administrator Signature &amp; Date</p>
        </div>
        <div className="space-y-8">
          <div className="border-b border-slate-400 pb-1" />
          <p className="font-semibold text-slate-800">Principal / Presiding Officer Signature &amp; Seal</p>
        </div>
      </div>
    </div>
  );
}

export function ElectionReportModal({
  open,
  dashboard,
  generatedAt,
  onClose,
}: ElectionReportModalProps) {
  if (!dashboard) return null;

  const report: ExportableResultsReport = {
    schoolName: 'PSSEMR SCHOOL',
    electionTitle: dashboard.electionTitle,
    electionDate: dashboard.electionDate,
    electionStatus: dashboard.electionStatus,
    totalCandidates: dashboard.activeCandidates,
    totalVotes: dashboard.totalVotes,
    leadingCandidate: dashboard.leadingCandidate,
    tiedCandidates: dashboard.tiedCandidates,
    isTie: dashboard.isTie,
    results: dashboard.results,
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm p-4 sm:p-6 print:static print:inset-auto print:overflow-visible print:bg-transparent print:p-0">
      <div className="max-w-4xl mx-auto space-y-4 print:max-w-none print:space-y-0">
        {/* Report Action Toolbar (hidden when printing) */}
        <div className="print:hidden rounded-xl bg-[#151F32] border border-slate-700 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xl">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="font-display text-sm font-bold text-white">
                Election Results Report Preview
              </h3>
              <p className="text-xs text-slate-400">
                Print or download PDF, Excel (.xlsx), or CSV.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadResultsPdf(report)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B1120] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={() => downloadResultsExcel(report)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B1120] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={() => downloadResultsCsv(report)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B1120] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white cursor-pointer shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
              aria-label="Close report preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <PrintableElectionReportSheet report={report} generatedAt={generatedAt} />
      </div>
    </div>
  );
}
