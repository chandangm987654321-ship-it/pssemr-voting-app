import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  EyeOff,
  FileSpreadsheet,
  Lock,
  PauseCircle,
  PieChart as PieChartIcon,
  Printer,
  RefreshCw,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../lib/api.ts';
import {
  downloadResultsCsv,
  downloadResultsExcel,
  downloadResultsPdf,
  type ExportableResultsReport,
} from '../lib/exportResults.ts';
import type { ElectionStatus, PublicResultsResponse } from '../types.ts';
import { PrintableElectionReportSheet } from './ElectionReportModal.tsx';
import { AnimatedNumber } from './ui/AnimatedNumber.tsx';
import { CandidateAvatar } from './ui/CandidateAvatar.tsx';
import { useToast } from './ui/Toast.tsx';

interface ResultPanelProps {
  onBackHome: () => void;
}

const CHART_COLORS = ['#3B82F6', '#22D3EE', '#10B981', '#818CF8', '#F59E0B', '#EC4899'];

function formatElectionStatusLabel(status: ElectionStatus): string {
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

export function ResultPanel({ onBackHome }: ResultPanelProps) {
  const { showToast } = useToast();
  const [data, setData] = useState<PublicResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const fetchResults = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await apiRequest<PublicResultsResponse>('/api/results');
      setData(res);
    } catch {
      // Keep last known state on transient hiccup
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchResults(true);

    const source = new EventSource('/api/events');
    source.addEventListener('sync', () => {
      fetchResults(true);
    });

    const interval = window.setInterval(() => fetchResults(true), 3000);
    return () => {
      source.close();
      window.clearInterval(interval);
    };
  }, [fetchResults]);

  const status = data?.electionStatus || 'not_started';
  const results = data?.results || [];
  const totalVotes = data?.totalVotes ?? 0;
  const totalCandidates = data?.totalCandidates ?? 0;
  const resultsPublished = Boolean(data?.resultsPublished);

  const exportReport: ExportableResultsReport | null = data
    ? {
        schoolName: data.schoolName || 'PSSEMR SCHOOL',
        electionTitle: data.electionTitle || 'Student Council Election',
        electionDate: data.electionDate || new Date().toISOString().slice(0, 10),
        electionStatus: data.electionStatus,
        totalCandidates: data.totalCandidates,
        totalVotes: data.totalVotes,
        leadingCandidate: data.leadingCandidate,
        tiedCandidates: data.tiedCandidates || [],
        isTie: data.isTie,
        results: data.results,
      }
    : null;

  const handleDownloadPdf = async () => {
    if (!exportReport) return;
    setDownloadingPdf(true);
    try {
      await downloadResultsPdf(exportReport);
      showToast('PDF report downloaded.', 'success');
    } catch {
      showToast('Unable to generate PDF report.', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadExcel = () => {
    if (!exportReport) return;
    try {
      downloadResultsExcel(exportReport);
      showToast('Excel (.xlsx) report downloaded.', 'success');
    } catch {
      showToast('Unable to generate Excel report.', 'error');
    }
  };

  const handleDownloadCsv = () => {
    if (!exportReport) return;
    try {
      downloadResultsCsv(exportReport);
      showToast('CSV report downloaded.', 'success');
    } catch {
      showToast('Unable to generate CSV report.', 'error');
    }
  };

  const pieData = results
    .filter((r) => r.votes > 0)
    .map((r) => ({
      name: r.name,
      value: r.votes,
      percentage: r.percentage,
    }));

  const highestResult = results[0] || null;

  return (
    <>
      <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col print:hidden">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#0B1120]/95 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <button
                type="button"
                onClick={onBackHome}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151F32] hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-slate-200 transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Home</span>
              </button>
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src="/assets/aistudio/image_4b78f9d5.png"
                  alt="PSSEMR School Logo"
                  className="w-8 h-8 rounded-full bg-white p-0.5 object-contain shrink-0"
                />
                <p className="font-display text-base sm:text-lg font-bold text-white truncate">
                  PSSEMR SCHOOL — RESULT PANEL
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-xs font-medium hidden sm:block">
                {status === 'active' ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Voting Open</span>
                  </span>
                ) : status === 'paused' ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-400">
                    <PauseCircle className="w-4 h-4" />
                    <span>Voting Paused</span>
                  </span>
                ) : status === 'ended' ? (
                  <span className="inline-flex items-center gap-1.5 text-red-400">
                    <Lock className="w-4 h-4" />
                    <span>Voting Ended</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-cyan-400">
                    <Clock className="w-4 h-4" />
                    <span>Not Started</span>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchResults(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151F32] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
          {/* A. Election Summary */}
          <section className="rounded-2xl bg-[#151F32] border border-slate-800/90 p-6 space-y-5 shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div className="flex items-center gap-4">
                <img
                  src="/assets/aistudio/image_4b78f9d5.png"
                  alt="PSSEMR School Logo"
                  className="w-14 h-14 rounded-full bg-white p-1 object-contain shrink-0 ring-2 ring-cyan-400/30"
                />
                <div>
                  <p className="text-xs font-bold tracking-[0.18em] text-cyan-400 uppercase">
                    {data?.schoolName || 'PSSEMR SCHOOL'}
                  </p>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
                    {data?.electionTitle || 'Student Council Election'}
                  </h1>
                  <p className="text-xs text-slate-400 mt-1 inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Election Date: {formatDisplayDate(data?.electionDate || '')}</span>
                  </p>
                </div>
              </div>

              {resultsPublished && exportReport && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold text-white shadow-md shadow-blue-950/40 cursor-pointer transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                    <span>PRINT RESULTS</span>
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl bg-[#0B1120] border border-slate-800 p-4">
                <p className="text-xs text-slate-400">Registered Candidates</p>
                <p className="text-2xl sm:text-3xl font-bold text-cyan-400 mt-1.5">
                  <AnimatedNumber value={totalCandidates} />
                </p>
              </div>

              <div className="rounded-xl bg-[#0B1120] border border-slate-800 p-4">
                <p className="text-xs text-slate-400">Total Votes Cast</p>
                <p className="text-2xl sm:text-3xl font-bold text-white mt-1.5">
                  {resultsPublished ? <AnimatedNumber value={totalVotes} /> : <span className="font-mono text-slate-500">Hidden</span>}
                </p>
              </div>

              <div className="rounded-xl bg-[#0B1120] border border-slate-800 p-4">
                <p className="text-xs text-slate-400">Election Status</p>
                <p
                  className={`font-display text-xl sm:text-2xl font-bold mt-2 ${
                    status === 'active'
                      ? 'text-emerald-400'
                      : status === 'paused'
                        ? 'text-amber-400'
                        : status === 'ended'
                          ? 'text-red-400'
                          : 'text-cyan-400'
                  }`}
                >
                  {formatElectionStatusLabel(status)}
                </p>
              </div>

              <div className="rounded-xl bg-[#0B1120] border border-slate-800 p-4">
                <p className="text-xs text-slate-400">Result Visibility</p>
                <p
                  className={`font-display text-lg sm:text-xl font-bold mt-2 ${
                    resultsPublished ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  {resultsPublished ? 'Published' : 'Hidden by Admin'}
                </p>
              </div>
            </div>
          </section>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-52 rounded-2xl bg-[#151F32] border border-slate-800 animate-pulse"
                />
              ))}
            </div>
          ) : !resultsPublished ? (
            /* Hidden Results State */
            <section className="rounded-2xl bg-[#151F32] border border-slate-800/90 p-10 sm:p-14 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto">
                <EyeOff className="w-8 h-8 text-amber-400" />
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                Election Results Are Currently Hidden
              </h2>
              <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
                To maintain election confidentiality, live vote counts remain hidden until the
                administrator publishes the results. Once published, all candidate tallies, charts,
                and printable reports will appear here automatically.
              </p>
            </section>
          ) : (
            <>
              {/* C. Winner / Tie / Current Standing Announcement */}
              {status === 'ended' ? (
                data?.isTie && (data.tiedCandidates?.length ?? 0) > 0 ? (
                  <section className="rounded-2xl bg-gradient-to-br from-amber-500/15 via-[#151F32] to-[#151F32] border-2 border-amber-400/50 p-6 sm:p-8 space-y-5 shadow-xl">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center">
                          <Trophy className="w-6 h-6 text-amber-300" />
                        </div>
                        <div>
                          <span className="inline-block text-xs font-bold tracking-[0.2em] text-amber-300 uppercase">
                            TIE
                          </span>
                          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                            Election Result: Tied for First Place
                          </h2>
                        </div>
                      </div>
                      <span className="font-mono text-sm font-semibold text-amber-300">
                        {data.tiedCandidates[0].votes} votes each ({data.tiedCandidates[0].percentage}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {data.tiedCandidates.map((cand) => (
                        <div
                          key={cand.candidateId}
                          className="rounded-xl bg-[#0B1120]/90 border border-amber-400/30 p-4 flex items-center gap-4"
                        >
                          <CandidateAvatar name={cand.name} photoUrl={cand.photoUrl} size="lg" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                              TIED WINNER
                            </p>
                            <p className="font-display text-xl font-bold text-white truncate">
                              {cand.name}
                            </p>
                            {cand.designation && (
                              <p className="text-xs font-semibold text-amber-200 truncate">
                                {cand.designation}
                              </p>
                            )}
                            {cand.classSection && (
                              <p className="text-xs text-slate-400">Class {cand.classSection}</p>
                            )}
                            {(cand.symbol || cand.symbolLogoUrl) && (
                              <div className="inline-flex items-center gap-1.5 mt-1">
                                {cand.symbolLogoUrl && (
                                  <img
                                    src={cand.symbolLogoUrl}
                                    alt={cand.symbol || 'Symbol logo'}
                                    className="w-5 h-5 rounded bg-white p-0.5 object-contain shrink-0"
                                  />
                                )}
                                {cand.symbol && (
                                  <span className="text-xs font-medium text-cyan-300">{cand.symbol}</span>
                                )}
                              </div>
                            )}
                            <p className="font-mono text-sm text-cyan-400 font-semibold mt-1">
                              {cand.votes} votes ({cand.percentage}%)
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : data?.leadingCandidate ? (
                  <section className="rounded-2xl bg-gradient-to-br from-emerald-500/15 via-[#151F32] to-[#151F32] border-2 border-emerald-400/50 p-6 sm:p-8 shadow-xl">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                        <div className="relative">
                          <CandidateAvatar
                            name={data.leadingCandidate.name}
                            photoUrl={data.leadingCandidate.photoUrl}
                            size="lg"
                            className="w-24 h-24 rounded-2xl border-2 border-emerald-400/60"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold tracking-[0.2em] uppercase">
                            <Trophy className="w-3.5 h-3.5" />
                            <span>WINNER</span>
                          </div>
                          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
                            {data.leadingCandidate.name}
                          </h2>
                          {data.leadingCandidate.designation && (
                            <p className="text-sm sm:text-base font-semibold text-emerald-300">
                              {data.leadingCandidate.designation}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 text-sm text-slate-300">
                            <span>
                              {data.leadingCandidate.classSection
                                ? `Class ${data.leadingCandidate.classSection}`
                                : 'Elected Candidate'}
                            </span>
                            {(data.leadingCandidate.symbol || data.leadingCandidate.symbolLogoUrl) && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0B1120] border border-slate-700 text-cyan-300 font-medium">
                                {data.leadingCandidate.symbolLogoUrl && (
                                  <img
                                    src={data.leadingCandidate.symbolLogoUrl}
                                    alt={data.leadingCandidate.symbol || 'Symbol logo'}
                                    className="w-5 h-5 rounded bg-white p-0.5 object-contain shrink-0"
                                  />
                                )}
                                {data.leadingCandidate.symbol && (
                                  <span>{data.leadingCandidate.symbol}</span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 rounded-xl bg-[#0B1120]/90 border border-emerald-500/30 px-6 py-4">
                        <div className="text-center">
                          <p className="text-xs text-slate-400 uppercase tracking-wider">Total Votes</p>
                          <p className="font-mono text-3xl font-bold text-white mt-0.5 tabular-nums">
                            {data.leadingCandidate.votes}
                          </p>
                        </div>
                        <div className="h-10 w-px bg-slate-800" />
                        <div className="text-center">
                          <p className="text-xs text-slate-400 uppercase tracking-wider">Win Share</p>
                          <p className="font-mono text-3xl font-bold text-emerald-400 mt-0.5 tabular-nums">
                            {data.leadingCandidate.percentage}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="rounded-2xl bg-[#151F32] border border-slate-800 p-6 text-center text-slate-300 text-sm">
                    Election has ended with 0 votes recorded.
                  </section>
                )
              ) : (
                <section className="rounded-xl bg-[#151F32] border border-slate-800/90 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {data?.leadingCandidate ? (
                      <CandidateAvatar
                        name={data.leadingCandidate.name}
                        photoUrl={data.leadingCandidate.photoUrl}
                        size="md"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-[#0B1120] border border-slate-800 flex items-center justify-center">
                        <Award className="w-6 h-6 text-cyan-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                        {data?.isTie ? 'TIE — Current Co-Leaders' : 'Currently Leading'}
                      </p>
                      <p className="font-display text-xl font-bold text-white mt-0.5">
                        {data?.isTie
                          ? data.tiedCandidates.map((c) => c.name).join(' & ')
                          : data?.leadingCandidate
                            ? data.leadingCandidate.name
                            : 'No Votes Recorded Yet'}
                      </p>
                      {!data?.isTie && data?.leadingCandidate?.designation && (
                        <p className="text-xs font-semibold text-cyan-300 mt-0.5">
                          {data.leadingCandidate.designation}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">
                    Official Winner is announced once the administrator ends the election.
                  </p>
                </section>
              )}

              {/* D & E. PRINT & DOWNLOAD RESULTS BAR */}
              {exportReport && (
                <section className="rounded-xl bg-[#151F32] border border-slate-800/90 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-white">
                      Official Reports &amp; Exports
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Print a formatted report (with candidate photos &amp; signatures) or download live results.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs sm:text-sm font-bold text-white cursor-pointer transition-colors shadow-sm"
                    >
                      <Printer className="w-4 h-4" />
                      <span>PRINT RESULTS</span>
                    </button>
                    <button
                      type="button"
                      disabled={downloadingPdf}
                      onClick={handleDownloadPdf}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B1120] hover:bg-slate-800 border border-slate-700 text-xs sm:text-sm font-semibold text-white cursor-pointer disabled:opacity-60"
                    >
                      <Download className="w-4 h-4 text-cyan-400" />
                      <span>{downloadingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadExcel}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B1120] hover:bg-slate-800 border border-slate-700 text-xs sm:text-sm font-semibold text-white cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                      <span>Download Excel (.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadCsv}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B1120] hover:bg-slate-800 border border-slate-700 text-xs sm:text-sm font-semibold text-white cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-blue-400" />
                      <span>Download CSV</span>
                    </button>
                  </div>
                </section>
              )}

              {/* B. Candidate-wise Results Cards (Sorted Highest to Lowest) */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-xl font-bold text-white">
                      Candidate-Wise Results
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Ranked from highest votes to lowest votes
                    </p>
                  </div>
                  <span className="font-mono text-xs text-cyan-400 tabular-nums">
                    {results.length} Candidate{results.length === 1 ? '' : 's'} · {totalVotes} Total Votes
                  </span>
                </div>

                {results.length === 0 ? (
                  <div className="rounded-2xl bg-[#151F32] border border-slate-800 p-10 text-center space-y-2">
                    <Users className="w-8 h-8 text-slate-500 mx-auto" />
                    <p className="text-sm text-slate-400">No active candidates registered yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {results.map((r, idx) => {
                      const barColor = CHART_COLORS[idx % CHART_COLORS.length];
                      const isLeader = totalVotes > 0 && r.votes === (results[0]?.votes ?? 0);
                      return (
                        <motion.div
                          key={r.candidateId}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className={`rounded-2xl bg-[#151F32] border p-5 flex flex-col justify-between gap-4 shadow-lg ${
                            isLeader ? 'border-cyan-400/50' : 'border-slate-800/90'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3.5 min-w-0">
                              <CandidateAvatar name={r.name} photoUrl={r.photoUrl} size="md" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-cyan-400">
                                    #{idx + 1}
                                  </span>
                                  {isLeader && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                      {data?.isTie
                                        ? 'TIE'
                                        : status === 'ended'
                                          ? 'WINNER'
                                          : 'LEADING'}
                                    </span>
                                  )}
                                </div>
                                <h3 className="font-display text-lg font-bold text-white truncate mt-0.5">
                                  {r.name}
                                </h3>
                                {r.designation && (
                                  <p className="text-xs font-semibold text-cyan-300 truncate mt-0.5">
                                    {r.designation}
                                  </p>
                                )}
                                <p className="text-xs text-slate-400 truncate mt-0.5">
                                  {r.classSection ? `Class ${r.classSection}` : 'Candidate'}
                                </p>
                                {(r.symbol || r.symbolLogoUrl) && (
                                  <div className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-md bg-[#0B1120] border border-slate-800 max-w-full">
                                    {r.symbolLogoUrl && (
                                      <img
                                        src={r.symbolLogoUrl}
                                        alt={r.symbol ? `${r.symbol} logo` : 'Candidate symbol logo'}
                                        className="w-5 h-5 rounded bg-white p-0.5 object-contain shrink-0"
                                      />
                                    )}
                                    {r.symbol && (
                                      <span className="text-xs font-medium text-cyan-300 truncate">
                                        {r.symbol}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2 pt-2 border-t border-slate-800/80">
                            <div className="flex items-baseline justify-between">
                              <span className="font-mono text-2xl font-bold text-white tabular-nums">
                                {r.votes}{' '}
                                <span className="text-xs font-normal text-slate-400">
                                  {r.votes === 1 ? 'vote' : 'votes'}
                                </span>
                              </span>
                              <span className="font-mono text-base font-bold text-cyan-400 tabular-nums">
                                {r.percentage.toFixed(1)}%
                              </span>
                            </div>

                            <div className="h-2.5 w-full rounded-full bg-[#0B1120] overflow-hidden border border-slate-800">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(100, r.percentage)}%`,
                                  backgroundColor: barColor,
                                }}
                              />
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* F. RESULT VISUALIZATION (Charts + Highest-Voted & Percentage Stats) */}
              <section className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-xl bg-[#151F32] border border-slate-800/90 p-5">
                    <p className="text-xs text-slate-400">Total Votes Statistics</p>
                    <p className="font-mono text-2xl font-bold text-white mt-1.5 tabular-nums">
                      {totalVotes}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Across {totalCandidates} active candidate{totalCandidates === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#151F32] border border-slate-800/90 p-5">
                    <p className="text-xs text-slate-400">Highest-Voted Candidate</p>
                    <p className="font-display text-xl font-bold text-white mt-1.5 truncate">
                      {totalVotes === 0
                        ? 'No votes yet'
                        : data?.isTie
                          ? `Tie (${data.tiedCandidates.map((c) => c.name).join(', ')})`
                          : highestResult?.name || '—'}
                    </p>
                    <p className="text-xs text-cyan-400 mt-1 font-mono tabular-nums">
                      {totalVotes > 0 && highestResult ? `${highestResult.votes} votes` : '0 votes'}
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#151F32] border border-slate-800/90 p-5">
                    <p className="text-xs text-slate-400">Top Voting Percentage</p>
                    <p className="font-mono text-2xl font-bold text-cyan-400 mt-1.5 tabular-nums">
                      {totalVotes > 0 && highestResult ? `${highestResult.percentage.toFixed(1)}%` : '0.0%'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Share of total ballots cast</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Horizontal Bar Chart */}
                  <div className="lg:col-span-7 rounded-2xl bg-[#151F32] border border-slate-800/90 p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-display text-lg font-bold text-white">
                          Candidate Vote Comparison
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Horizontal bar comparison of recorded votes
                        </p>
                      </div>
                      <BarChart3 className="w-5 h-5 text-cyan-400" />
                    </div>

                    {results.length === 0 ? (
                      <div className="flex-1 min-h-[260px] flex items-center justify-center text-sm text-slate-400">
                        No candidates available for chart visualization.
                      </div>
                    ) : (
                      <div className="w-full" style={{ height: Math.max(260, results.length * 60) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            key={results.map((r) => r.candidateId).join(',')}
                            data={results.map((r) => ({
                              name: r.name,
                              votes: r.votes,
                              percentage: r.percentage,
                            }))}
                            layout="vertical"
                            margin={{ top: 8, right: 24, left: 16, bottom: 8 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#1E2D4A" horizontal={false} />
                            <XAxis
                              type="number"
                              allowDecimals={false}
                              tick={{ fill: '#94A3B8', fontSize: 12 }}
                              axisLine={{ stroke: '#1E2D4A' }}
                              tickLine={false}
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={120}
                              tick={{ fill: '#F8FAFC', fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }}
                              contentStyle={{
                                backgroundColor: '#0F172A',
                                borderColor: '#1E2D4A',
                                borderRadius: '8px',
                                color: '#F8FAFC',
                                fontSize: '12px',
                              }}
                              formatter={(
                                value: unknown,
                                _name: unknown,
                                item: { payload?: { percentage?: number } }
                              ) => [`${value ?? 0} votes (${item?.payload?.percentage ?? 0}%)`, 'Votes']}
                            />
                            <Bar dataKey="votes" radius={[0, 6, 6, 0]} barSize={28} animationDuration={500}>
                              {results.map((_entry, index) => (
                                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Pie Chart Showing Vote Distribution */}
                  <div className="lg:col-span-5 rounded-2xl bg-[#151F32] border border-slate-800/90 p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-display text-lg font-bold text-white">
                          Vote Distribution Share
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Percentage breakdown across candidates
                        </p>
                      </div>
                      <PieChartIcon className="w-5 h-5 text-cyan-400" />
                    </div>

                    {pieData.length === 0 ? (
                      <div className="flex-1 min-h-[260px] flex items-center justify-center text-sm text-slate-400 text-center px-4">
                        Cast votes to visualize the distribution pie chart.
                      </div>
                    ) : (
                      <div className="w-full h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="46%"
                              innerRadius={52}
                              outerRadius={88}
                              paddingAngle={2}
                            >
                              {pieData.map((_entry, index) => (
                                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#0F172A',
                                borderColor: '#1E2D4A',
                                borderRadius: '8px',
                                color: '#F8FAFC',
                                fontSize: '12px',
                              }}
                              formatter={(
                                value: unknown,
                                _name: unknown,
                                item: { payload?: { percentage?: number } }
                              ) => [`${value ?? 0} votes (${item?.payload?.percentage ?? 0}%)`, 'Share']}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: '12px', color: '#CBD5E1' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      {/* Print-Only White-Paper Election Results Report */}
      {resultsPublished && exportReport && (
        <div className="hidden print:block">
          <PrintableElectionReportSheet
            report={exportReport}
            generatedAt={new Date().toISOString()}
          />
        </div>
      )}
    </>
  );
}
