import { motion } from 'motion/react';
import { ArrowRight, BarChart3, ShieldCheck, Vote } from 'lucide-react';

interface HomePageProps {
  onOpenVoterPanel: () => void;
  onOpenResultPanel: () => void;
  onOpenAdminPanel: () => void;
}

export function HomePage({
  onOpenVoterPanel,
  onOpenResultPanel,
  onOpenAdminPanel,
}: HomePageProps) {
  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col">
      {/* Clean Header */}
      <header className="border-b border-slate-800/80 bg-[#0B1120]/95">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/image_4b78f9d5.png"
              alt="PSSEMR School Logo"
              className="w-9 h-9 rounded-full bg-white p-0.5 object-contain shrink-0 shadow-sm"
            />
            <span className="font-display text-lg font-bold tracking-wide text-white">
              PSSEMR SCHOOL
            </span>
          </div>
          <span className="text-xs font-medium text-cyan-400">Digital Election Portal</span>
        </div>
      </header>

      {/* Main Centered Welcome Area */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-6xl w-full space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="text-center space-y-4"
          >
            <p className="text-sm font-semibold tracking-widest uppercase text-cyan-400">
              PSSEMR SCHOOL
            </p>
            <div className="flex justify-center py-1">
              <img
                src="/assets/aistudio/image_4b78f9d5.png"
                alt="PSSEMR School Logo"
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white p-1 object-contain shadow-xl ring-2 ring-cyan-400/40"
              />
            </div>
            <h1
              className="font-display font-bold text-white tracking-tight leading-tight mx-auto max-w-3xl"
              style={{ fontSize: 'clamp(2.25rem, 5vw, 3.75rem)', textWrap: 'balance' }}
            >
              DIGITAL VOTING SYSTEM
            </h1>
            <p className="text-lg sm:text-xl text-slate-300 font-medium">
              Your Vote. Your Voice. Your Choice.
            </p>
          </motion.div>

          {/* Three Large Panel Buttons in Exact Order: VOTER PANEL, RESULT PANEL, ADMIN PANEL */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto"
          >
            {/* 1. VOTER PANEL */}
            <button
              type="button"
              onClick={onOpenVoterPanel}
              className="group text-left rounded-2xl bg-[#151F32] hover:bg-[#19263E] border border-blue-500/40 hover:border-blue-400 p-7 sm:p-8 transition-all shadow-lg flex flex-col justify-between gap-7 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
                  <Vote className="w-7 h-7 text-cyan-400" />
                </div>
                <div className="space-y-2">
                  <h2 className="font-display text-2xl font-bold text-white">
                    VOTER PANEL
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Open the student voting booth directly. Choose your preferred candidate and
                    cast your ballot with one tap.
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-5 rounded-xl bg-blue-600 group-hover:bg-blue-500 text-white font-semibold text-sm sm:text-base transition-colors">
                <span>ENTER VOTER PANEL</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>

            {/* 2. RESULT PANEL */}
            <button
              type="button"
              onClick={onOpenResultPanel}
              className="group text-left rounded-2xl bg-[#151F32] hover:bg-[#19263E] border border-cyan-500/40 hover:border-cyan-400 p-7 sm:p-8 transition-all shadow-lg flex flex-col justify-between gap-7 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center">
                  <BarChart3 className="w-7 h-7 text-cyan-300" />
                </div>
                <div className="space-y-2">
                  <h2 className="font-display text-2xl font-bold text-white">
                    RESULT PANEL
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    View official election tallies, winner announcements, visual charts, and print
                    or download verified reports.
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-5 rounded-xl bg-cyan-600 group-hover:bg-cyan-500 text-white font-semibold text-sm sm:text-base transition-colors">
                <span>OPEN RESULT PANEL</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>

            {/* 3. ADMIN PANEL */}
            <button
              type="button"
              onClick={onOpenAdminPanel}
              className="group text-left rounded-2xl bg-[#151F32] hover:bg-[#19263E] border border-slate-700/90 hover:border-blue-400/60 p-7 sm:p-8 transition-all shadow-lg flex flex-col justify-between gap-7 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <ShieldCheck className="w-7 h-7 text-blue-400" />
                </div>
                <div className="space-y-2">
                  <h2 className="font-display text-2xl font-bold text-white">
                    ADMIN PANEL
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Manage candidates, start or pause elections, publish results, and monitor live
                    candidate-wise vote counts securely.
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-5 rounded-xl bg-[#0B1120] group-hover:bg-slate-800 border border-slate-700 text-white font-semibold text-sm sm:text-base transition-colors">
                <span>ENTER ADMIN PANEL</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          </motion.div>
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 py-5 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>PSSEMR School Digital Voting System</span>
          <span>Secure Student Election Booth</span>
        </div>
      </footer>
    </div>
  );
}
