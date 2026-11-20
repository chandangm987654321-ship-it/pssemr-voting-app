import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Lock,
  PauseCircle,
  Vote,
} from 'lucide-react';
import { apiRequest, createFreshVoterSessionToken } from '../lib/api.ts';
import { playVoteBeep, unlockAudioContext } from '../lib/sound.ts';
import type { Candidate, VoterStateResponse } from '../types.ts';
import { CandidateAvatar } from './ui/CandidateAvatar.tsx';
import { useToast } from './ui/Toast.tsx';

interface VoterPanelProps {
  onBackHome: () => void;
}

export function VoterPanel({ onBackHome }: VoterPanelProps) {
  const { showToast } = useToast();
  const [sessionToken, setSessionToken] = useState(() => createFreshVoterSessionToken());
  const sessionTokenRef = useRef(sessionToken);
  sessionTokenRef.current = sessionToken;

  const [state, setState] = useState<VoterStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [confirmedCandidateName, setConfirmedCandidateName] = useState<string | null>(null);
  const voteLockRef = useRef(false);
  const confirmTimerRef = useRef<number | null>(null);

  const fetchVoterState = useCallback(async (overrideToken?: string) => {
    const tokenToUse = overrideToken || sessionTokenRef.current;
    try {
      const data = await apiRequest<VoterStateResponse>(
        `/api/voter/state?sessionToken=${encodeURIComponent(tokenToUse)}`
      );
      setState(data);
    } catch {
      // Keep last known state on transient network hiccup
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVoterState();

    // Real-time synchronization via SSE + polling fallback
    const source = new EventSource('/api/events');
    source.addEventListener('sync', () => {
      fetchVoterState();
    });

    const interval = window.setInterval(() => fetchVoterState(), 2500);
    return () => {
      source.close();
      window.clearInterval(interval);
      if (confirmTimerRef.current) {
        window.clearTimeout(confirmTimerRef.current);
      }
    };
  }, [fetchVoterState]);

  const handleVote = async (candidate: Candidate) => {
    if (
      voteLockRef.current ||
      submittingId ||
      confirmedCandidateName ||
      state?.electionStatus !== 'active'
    ) {
      return;
    }

    // Immediate synchronous lock to prevent double-click / double-tap duplicate votes
    voteLockRef.current = true;
    unlockAudioContext();
    setSubmittingId(candidate.id);

    try {
      const res = await apiRequest<{ ok: true; candidateName: string }>('/api/voter/vote', {
        method: 'POST',
        body: JSON.stringify({
          candidateId: candidate.id,
          sessionToken: sessionTokenRef.current,
        }),
      });

      // Play electronic beep and show 2-second confirmation screen
      playVoteBeep();
      setConfirmedCandidateName(res.candidateName || candidate.name);

      if (confirmTimerRef.current) {
        window.clearTimeout(confirmTimerRef.current);
      }
      confirmTimerRef.current = window.setTimeout(() => {
        const nextSessionToken = createFreshVoterSessionToken();
        sessionTokenRef.current = nextSessionToken;
        setSessionToken(nextSessionToken);
        setConfirmedCandidateName(null);
        voteLockRef.current = false;
        fetchVoterState(nextSessionToken);
      }, 2000);
    } catch (err) {
      voteLockRef.current = false;
      showToast(err instanceof Error ? err.message : 'Unable to record vote.', 'error');
      fetchVoterState();
    } finally {
      setSubmittingId(null);
    }
  };

  const electionStatus = state?.electionStatus || 'not_started';
  const candidates = state?.candidates || [];
  const canVote = electionStatus === 'active' && !submittingId && !confirmedCandidateName;

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col">
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
                PSSEMR SCHOOL — VOTER PANEL
              </p>
            </div>
          </div>

          <div className="text-xs font-medium shrink-0">
            {electionStatus === 'active' ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Voting Open</span>
              </span>
            ) : electionStatus === 'paused' ? (
              <span className="inline-flex items-center gap-1.5 text-amber-400">
                <PauseCircle className="w-4 h-4" />
                <span>Voting Paused</span>
              </span>
            ) : electionStatus === 'ended' ? (
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
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Status Banners */}
        {electionStatus === 'ended' && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/40 px-6 py-6 text-center space-y-1.5">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-red-300 tracking-wide">
              VOTING HAS ENDED
            </h1>
            <p className="text-sm text-slate-300">
              The election administrator has closed the polls. All VOTE buttons are disabled.
            </p>
          </div>
        )}

        {electionStatus === 'paused' && (
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/40 px-6 py-5 text-center space-y-1">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-amber-300">
              VOTING IS CURRENTLY PAUSED
            </h1>
            <p className="text-sm text-slate-300">
              Please wait while the election administrator resumes voting.
            </p>
          </div>
        )}

        {electionStatus === 'not_started' && (
          <div className="rounded-2xl bg-blue-500/10 border border-blue-500/30 px-6 py-5 text-center space-y-1">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-cyan-300">
              VOTING HAS NOT STARTED YET
            </h1>
            <p className="text-sm text-slate-300">
              Candidates are preparing for the ballot. Voting will begin as soon as the administrator starts the election.
            </p>
          </div>
        )}

        {electionStatus === 'active' && (
          <div className="rounded-xl bg-[#151F32] border border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
                Choose Your Candidate
              </h1>
              <p className="text-sm text-slate-400">
                Tap the large <strong className="text-cyan-400">VOTE</strong> button under your favourite candidate.
              </p>
            </div>
            <span className="text-xs text-slate-400 tabular-nums">
              {candidates.length} candidate{candidates.length === 1 ? '' : 's'} on ballot
            </span>
          </div>
        )}

        {/* Candidate Cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-96 rounded-2xl bg-[#151F32] border border-slate-800 animate-pulse"
              />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <div className="rounded-2xl bg-[#151F32] border border-slate-800 p-12 text-center space-y-2">
            <Vote className="w-10 h-10 text-cyan-400 mx-auto" />
            <h2 className="font-display text-xl font-semibold text-white">
              No Candidates Registered Yet
            </h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Candidates added by the election administrator in the Admin Panel will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {candidates.map((cand) => {
              const isThisSubmitting = submittingId === cand.id;
              return (
                <motion.div
                  key={cand.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-2xl bg-[#151F32] border border-slate-800/90 hover:border-blue-500/40 p-6 flex flex-col justify-between gap-5 shadow-lg transition-colors"
                >
                  <div className="space-y-4">
                    <div className="relative">
                      <CandidateAvatar name={cand.name} photoUrl={cand.photoUrl} size="xl" />
                    </div>

                    <div className="space-y-2.5 text-center">
                      <div>
                        <h2 className="font-display text-2xl font-bold text-white leading-tight">
                          {cand.name}
                        </h2>
                        {cand.designation && (
                          <p className="text-xs sm:text-sm font-semibold tracking-wide text-cyan-300 uppercase mt-1">
                            {cand.designation}
                          </p>
                        )}
                      </div>
                      {cand.classSection && (
                        <p className="text-sm font-medium text-slate-300">
                          Class {cand.classSection}
                        </p>
                      )}
                      {(cand.symbol || cand.symbolLogoUrl) && (
                        <div className="inline-flex items-center justify-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#0B1120] border border-slate-800 mx-auto">
                          {cand.symbolLogoUrl && (
                            <img
                              src={cand.symbolLogoUrl}
                              alt={cand.symbol ? `${cand.symbol} logo` : 'Candidate symbol logo'}
                              className="w-9 h-9 rounded-lg bg-white p-1 object-contain shrink-0"
                            />
                          )}
                          {cand.symbol && (
                            <span className="text-sm font-semibold text-cyan-300">
                              {cand.symbol}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!canVote}
                    onClick={() => handleVote(cand)}
                    className={`w-full py-4 px-6 rounded-xl font-display text-lg font-bold tracking-wide transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:cursor-not-allowed ${
                      canVote
                        ? 'bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white shadow-md shadow-blue-950/40'
                        : 'bg-slate-800 text-slate-500 border border-slate-700/60'
                    }`}
                  >
                    <Vote className="w-5 h-5" />
                    <span>
                      {isThisSubmitting
                        ? 'RECORDING...'
                        : electionStatus === 'ended'
                          ? 'VOTING ENDED'
                          : 'VOTE'}
                    </span>
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      {/* Center Confirmation Overlay During Beep */}
      <AnimatePresence>
        {confirmedCandidateName && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-[#0B1120]/95 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.86, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="max-w-xl w-full rounded-3xl bg-[#151F32] border-2 border-emerald-500/60 p-8 sm:p-12 text-center space-y-6 shadow-2xl"
            >
              <motion.div
                initial={{ scale: 0.5 }}
                animate={{ scale: [0.5, 1.12, 1] }}
                transition={{ duration: 0.45 }}
                className="w-24 h-24 rounded-full bg-emerald-500/15 border-2 border-emerald-400 flex items-center justify-center mx-auto"
              >
                <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              </motion.div>

              <div className="space-y-3">
                <p className="font-display text-3xl sm:text-5xl font-bold text-white leading-tight break-words">
                  {confirmedCandidateName}
                </p>
                <p className="font-display text-lg sm:text-xl font-bold tracking-wider text-emerald-400 uppercase">
                  YOUR VOTE HAS BEEN SUCCESSFULLY RECORDED
                </p>
              </div>

              <p className="text-sm text-slate-400">
                Preparing booth for the next voter...
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
