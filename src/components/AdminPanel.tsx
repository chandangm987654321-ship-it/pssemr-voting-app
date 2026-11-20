import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Award,
  BarChart3,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Pause,
  Play,
  Plus,
  Printer,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest, setAdminToken } from '../lib/api.ts';
import type { AdminDashboardResponse, Candidate, ElectionStatus } from '../types.ts';
import { AnimatedNumber } from './ui/AnimatedNumber.tsx';
import { CandidateAvatar } from './ui/CandidateAvatar.tsx';
import { useToast } from './ui/Toast.tsx';
import { ElectionReportModal } from './ElectionReportModal.tsx';

type AdminTab = 'dashboard' | 'add' | 'remove';

const BAR_COLORS = ['#3B82F6', '#22D3EE', '#10B981', '#818CF8', '#F59E0B', '#EC4899'];

interface AdminPanelProps {
  onBackHome: () => void;
}

function getValidatedOutputMime(file: File): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const nameLower = file.name.toLowerCase();
  const typeLower = file.type.toLowerCase();

  if (typeLower === 'image/png' || (!typeLower && nameLower.endsWith('.png'))) {
    return 'image/png';
  }
  if (typeLower === 'image/webp' || (!typeLower && nameLower.endsWith('.webp'))) {
    return 'image/webp';
  }
  if (
    typeLower === 'image/jpeg' ||
    typeLower === 'image/jpg' ||
    (!typeLower && (nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg')))
  ) {
    return 'image/jpeg';
  }
  return null;
}

async function prepareImageDataUrl(file: File): Promise<string> {
  const outputMime = getValidatedOutputMime(file);
  if (!outputMime) {
    throw new Error('Unsupported format. Please upload a JPG, JPEG, PNG, or WEBP image.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const maxDim = 600;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL(outputMime, 0.9));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function uploadPreviewIfNeeded(urlOrDataUrl: string, kind: 'photo' | 'symbol'): Promise<string> {
  const trimmed = urlOrDataUrl.trim();
  if (!trimmed.startsWith('data:')) {
    return trimmed;
  }
  const uploaded = await apiRequest<{ url: string }>('/api/admin/upload', {
    method: 'POST',
    body: JSON.stringify({ dataUrl: trimmed, kind }),
  });
  return uploaded.url;
}

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

export function AdminPanel({ onBackHome }: AdminPanelProps) {
  const { showToast } = useToast();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  // Login screen state
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Admin workspace state
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null);
  const [loadingDash, setLoadingDash] = useState(false);

  // Add Candidate form state (6 required fields)
  const [newName, setNewName] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [newClassSection, setNewClassSection] = useState('');
  const [newDesignation, setNewDesignation] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [newSymbolLogoUrl, setNewSymbolLogoUrl] = useState('');
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [symbolLogoInputKey, setSymbolLogoInputKey] = useState(0);
  const [registering, setRegistering] = useState(false);

  // Edit Candidate modal state
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [editName, setEditName] = useState('');
  const [editClassSection, setEditClassSection] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editPhotoUrl, setEditPhotoUrl] = useState('');
  const [editSymbol, setEditSymbol] = useState('');
  const [editSymbolLogoUrl, setEditSymbolLogoUrl] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Confirmation modals & report preview
  const [removingCandidate, setRemovingCandidate] = useState<Candidate | null>(null);
  const [removingLoading, setRemovingLoading] = useState(false);
  const [endElectionModalOpen, setEndElectionModalOpen] = useState(false);
  const [publishOnEnd, setPublishOnEnd] = useState(true);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportGeneratedAt, setReportGeneratedAt] = useState(() => new Date().toISOString());

  // Election metadata settings
  const [electionTitleInput, setElectionTitleInput] = useState('Student Council Election');
  const [electionDateInput, setElectionDateInput] = useState('');
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    apiRequest<{ authenticated: boolean }>('/api/admin/me')
      .then((res) => setAuthenticated(res.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckingAuth(false));
  }, []);

  const fetchDashboard = useCallback(async (silent = false) => {
    if (!authenticated) return;
    if (!silent) setLoadingDash(true);
    try {
      const data = await apiRequest<AdminDashboardResponse>('/api/admin/dashboard');
      setDashboard(data);
      setSettingsDirty((dirty) => {
        if (!dirty) {
          setElectionTitleInput(data.electionTitle || 'Student Council Election');
          setElectionDateInput(data.electionDate || '');
        }
        return dirty;
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('authentication')) {
        setAuthenticated(false);
      }
    } finally {
      if (!silent) setLoadingDash(false);
    }
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    fetchDashboard();

    const source = new EventSource('/api/events');
    source.addEventListener('sync', () => {
      fetchDashboard(true);
    });
    const timer = window.setInterval(() => fetchDashboard(true), 3000);

    return () => {
      source.close();
      window.clearInterval(timer);
    };
  }, [authenticated, fetchDashboard]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await apiRequest<{ authenticated: boolean; token: string }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: passwordInput }),
      });
      setAdminToken(res.token);
      setAuthenticated(true);
      setPasswordInput('');
      showToast('Signed in to PSSEMR Admin Panel.', 'success');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Invalid password.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/api/admin/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    setAdminToken(null);
    setAuthenticated(false);
    setDashboard(null);
    showToast('Logged out of Admin Panel.', 'info');
  };

  const resetAddCandidateForm = () => {
    setNewName('');
    setNewPhotoUrl('');
    setNewClassSection('');
    setNewDesignation('');
    setNewSymbol('');
    setNewSymbolLogoUrl('');
    setPhotoInputKey((k) => k + 1);
    setSymbolLogoInputKey((k) => k + 1);
  };

  const handleRegisterCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      showToast('Candidate Name is required.', 'error');
      return;
    }
    if (!newPhotoUrl) {
      showToast('Candidate Photo is required (JPG, JPEG, PNG, or WEBP).', 'error');
      return;
    }
    if (!newClassSection.trim()) {
      showToast('Class and Section is required.', 'error');
      return;
    }
    if (!newDesignation.trim()) {
      showToast('Designation / Position Contesting For is required.', 'error');
      return;
    }
    if (!newSymbol.trim()) {
      showToast('Candidate Symbol Name is required.', 'error');
      return;
    }
    if (!newSymbolLogoUrl) {
      showToast('Candidate Symbol Logo is required (JPG, JPEG, PNG, or WEBP).', 'error');
      return;
    }

    setRegistering(true);
    try {
      const [persistentPhotoUrl, persistentSymbolLogoUrl] = await Promise.all([
        uploadPreviewIfNeeded(newPhotoUrl, 'photo'),
        uploadPreviewIfNeeded(newSymbolLogoUrl, 'symbol'),
      ]);

      await apiRequest('/api/admin/candidates', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          photoUrl: persistentPhotoUrl,
          classSection: newClassSection.trim(),
          designation: newDesignation.trim(),
          symbol: newSymbol.trim(),
          symbolLogoUrl: persistentSymbolLogoUrl,
        }),
      });
      resetAddCandidateForm();
      showToast('Candidate registered and synchronized to Voter Panel & Result Panel.', 'success');
      await fetchDashboard();
      setActiveTab('dashboard');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to register candidate.', 'error');
    } finally {
      setRegistering(false);
    }
  };

  const openEditModal = (c: Candidate) => {
    setEditingCandidate(c);
    setEditName(c.name);
    setEditClassSection(c.classSection);
    setEditDesignation(c.designation || '');
    setEditPhotoUrl(c.photoUrl);
    setEditSymbol(c.symbol);
    setEditSymbolLogoUrl(c.symbolLogoUrl || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCandidate) return;
    if (
      !editName.trim() ||
      !editClassSection.trim() ||
      !editDesignation.trim() ||
      !editSymbol.trim()
    ) {
      showToast(
        'Candidate Name, Class and Section, Designation / Position, and Candidate Symbol are required.',
        'error'
      );
      return;
    }
    setSavingEdit(true);
    try {
      const [persistentPhotoUrl, persistentSymbolLogoUrl] = await Promise.all([
        uploadPreviewIfNeeded(editPhotoUrl, 'photo'),
        uploadPreviewIfNeeded(editSymbolLogoUrl, 'symbol'),
      ]);

      await apiRequest(`/api/admin/candidates/${editingCandidate.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          classSection: editClassSection.trim(),
          designation: editDesignation.trim(),
          photoUrl: persistentPhotoUrl,
          symbol: editSymbol.trim(),
          symbolLogoUrl: persistentSymbolLogoUrl,
        }),
      });
      setEditingCandidate(null);
      showToast('Candidate updated.', 'success');
      await fetchDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update candidate.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmRemoveCandidate = async () => {
    if (!removingCandidate) return;
    setRemovingLoading(true);
    try {
      await apiRequest<{ ok: true; deletedVotes: number }>(
        `/api/admin/candidates/${removingCandidate.id}?confirm=true`,
        { method: 'DELETE' }
      );
      showToast(`Removed ${removingCandidate.name} and all their voting records.`, 'success');
      setRemovingCandidate(null);
      await fetchDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cannot remove candidate.', 'error');
    } finally {
      setRemovingLoading(false);
    }
  };

  const handleElectionStatus = async (status: ElectionStatus, publishResults?: boolean) => {
    try {
      await apiRequest('/api/admin/election/status', {
        method: 'POST',
        body: JSON.stringify({ status, publishResults }),
      });
      setEndElectionModalOpen(false);
      showToast(`Election status updated to ${formatElectionStatusLabel(status)}.`, 'success');
      await fetchDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update election status.', 'error');
    }
  };

  const handleToggleResultsPublished = async () => {
    const nextPublished = !dashboard?.resultsPublished;
    try {
      await apiRequest('/api/admin/election/settings', {
        method: 'POST',
        body: JSON.stringify({ resultsPublished: nextPublished }),
      });
      showToast(
        nextPublished
          ? 'Results are now published on the Result Panel.'
          : 'Results are now hidden on the Result Panel.',
        'success'
      );
      await fetchDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update result visibility.', 'error');
    }
  };

  const handleSaveElectionSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await apiRequest('/api/admin/election/settings', {
        method: 'POST',
        body: JSON.stringify({
          electionTitle: electionTitleInput,
          electionDate: electionDateInput,
        }),
      });
      setSettingsDirty(false);
      showToast('Election title and date saved.', 'success');
      await fetchDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save election details.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleOpenReport = async () => {
    await fetchDashboard();
    setReportGeneratedAt(new Date().toISOString());
    setReportModalOpen(true);
  };

  // ---- Auth Checking Screen ----
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center text-slate-400 text-sm">
        Verifying administrator session...
      </div>
    );
  }

  // ---- Password Protection Screen ----
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col">
        <header className="border-b border-slate-800/80 px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151F32] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </button>
          <div className="flex items-center gap-2.5">
            <img
              src="/assets/aistudio/image_4b78f9d5.png"
              alt="PSSEMR School Logo"
              className="w-8 h-8 rounded-full bg-white p-0.5 object-contain shrink-0"
            />
            <span className="font-display text-sm font-bold text-white">PSSEMR SCHOOL</span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl bg-[#151F32] border border-slate-800 p-8 space-y-6 shadow-2xl">
            <div className="space-y-2 text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6 text-cyan-400" />
              </div>
              <h1 className="font-display text-2xl font-bold text-white">ADMIN PANEL</h1>
              <p className="text-xs text-slate-400">
                Enter the school election administrator password to continue.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-password-field"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Administrator Password
                </label>
                <div className="relative">
                  <input
                    id="admin-password-field"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter admin password"
                    className="w-full rounded-lg bg-[#0B1120] border border-slate-700 pl-4 pr-11 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {loginError}
                </p>
              )}

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm font-semibold text-white transition-colors cursor-pointer"
              >
                {loggingIn ? 'Verifying...' : 'UNLOCK ADMIN DASHBOARD'}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  const status = dashboard?.electionStatus || 'not_started';
  const results = dashboard?.results || [];
  const activeCandidates = dashboard?.candidates || [];

  const SidebarBody = (
    <div className="flex flex-col h-full bg-[#0E1629] border-r border-slate-800/80">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/assets/aistudio/image_4b78f9d5.png"
            alt="PSSEMR School Logo"
            className="w-8 h-8 rounded-full bg-white p-0.5 object-contain shrink-0"
          />
          <div className="min-w-0">
            <p className="font-display text-base font-bold text-white truncate">PSSEMR ADMIN</p>
            <p className="text-[11px] text-cyan-400">Election Control</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden text-slate-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1.5">
        {(
          [
            ['dashboard', 'Vote Counting & Controls', LayoutDashboard],
            ['add', 'Add New Candidate', UserPlus],
            ['remove', 'Remove Candidate', Trash2],
          ] as Array<[AdminTab, string, React.ComponentType<{ className?: string }>]>
        ).map(([id, label, Icon]) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveTab(id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                  : 'text-slate-300 hover:bg-[#151F32] hover:text-white border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/80 space-y-2 shrink-0">
        <button
          type="button"
          onClick={onBackHome}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#151F32] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex print:hidden">
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">{SidebarBody}</aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{SidebarBody}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-[#0B1120]/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-800"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display text-base sm:text-lg font-bold text-white truncate">
              PSSEMR DIGITAL VOTING — ADMIN DASHBOARD
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleOpenReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151F32] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Generate Report</span>
            </button>
            <button
              type="button"
              onClick={() => fetchDashboard()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151F32] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loadingDash ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh Results</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('add')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ADD NEW CANDIDATE</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* TAB 1: DASHBOARD, ELECTION CONTROLS & LIVE VOTE COUNTING */}
          {activeTab === 'dashboard' && (
            <>
              {/* 4 Required Statistics Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl bg-[#151F32] border border-slate-800/90 p-5">
                  <p className="text-xs text-slate-400">Total Candidates</p>
                  <p className="text-3xl font-bold text-white mt-2">
                    <AnimatedNumber value={dashboard?.totalCandidates ?? 0} />
                  </p>
                  <p className="text-xs text-slate-400 mt-1">All registered records</p>
                </div>

                <div className="rounded-xl bg-[#151F32] border border-slate-800/90 p-5">
                  <p className="text-xs text-slate-400">Registered Candidates</p>
                  <p className="text-3xl font-bold text-cyan-400 mt-2">
                    <AnimatedNumber value={dashboard?.activeCandidates ?? 0} />
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Currently on ballot</p>
                </div>

                <div className="rounded-xl bg-[#151F32] border border-slate-800/90 p-5">
                  <p className="text-xs text-slate-400">Total Votes</p>
                  <p className="text-3xl font-bold text-white mt-2">
                    <AnimatedNumber value={dashboard?.totalVotes ?? 0} />
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Live recorded ballots</p>
                </div>

                <div className="rounded-xl bg-[#151F32] border border-slate-800/90 p-5">
                  <p className="text-xs text-slate-400">Election Status</p>
                  <p
                    className={`font-display text-2xl font-bold mt-2 ${
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
                  <p className="text-xs text-slate-400 mt-1">Synced to Voter Panel</p>
                </div>
              </div>

              {/* Election Controls Bar */}
              <div className="rounded-xl bg-[#151F32] border border-slate-800/90 p-6 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-white">Election Controls</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Start, pause, resume, end voting, or publish results to the Result Panel.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {status === 'not_started' && (
                      <button
                        type="button"
                        onClick={() => handleElectionStatus('active')}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
                      >
                        <Play className="w-4 h-4" />
                        <span>START ELECTION</span>
                      </button>
                    )}

                    {status === 'active' && (
                      <button
                        type="button"
                        onClick={() => handleElectionStatus('paused')}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white cursor-pointer"
                      >
                        <Pause className="w-4 h-4" />
                        <span>PAUSE ELECTION</span>
                      </button>
                    )}

                    {status === 'paused' && (
                      <button
                        type="button"
                        onClick={() => handleElectionStatus('active')}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
                      >
                        <Play className="w-4 h-4" />
                        <span>RESUME ELECTION</span>
                      </button>
                    )}

                    {status !== 'ended' && (
                      <button
                        type="button"
                        onClick={() => setEndElectionModalOpen(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white cursor-pointer"
                      >
                        <Square className="w-4 h-4" />
                        <span>END ELECTION</span>
                      </button>
                    )}

                    {status === 'ended' && (
                      <button
                        type="button"
                        onClick={() => handleElectionStatus('active')}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white cursor-pointer"
                      >
                        <Play className="w-4 h-4" />
                        <span>REOPEN ELECTION</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleToggleResultsPublished}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                        dashboard?.resultsPublished
                          ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-300'
                          : 'bg-[#0B1120] hover:bg-slate-800 border-cyan-500/40 text-cyan-300'
                      }`}
                    >
                      {dashboard?.resultsPublished ? (
                        <>
                          <EyeOff className="w-4 h-4" />
                          <span>HIDE RESULTS</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          <span>PUBLISH RESULTS</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Election Title, Date & Result Visibility Status */}
                <form
                  onSubmit={handleSaveElectionSettings}
                  className="pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
                >
                  <div className="md:col-span-6">
                    <label
                      htmlFor="election-title-input"
                      className="block text-[11px] font-medium text-slate-400 mb-1"
                    >
                      Election Title (Shown in Result Panel &amp; Reports)
                    </label>
                    <input
                      id="election-title-input"
                      type="text"
                      value={electionTitleInput}
                      onChange={(e) => {
                        setElectionTitleInput(e.target.value);
                        setSettingsDirty(true);
                      }}
                      placeholder="Student Council Election"
                      className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-3.5 py-2 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label
                      htmlFor="election-date-input"
                      className="block text-[11px] font-medium text-slate-400 mb-1"
                    >
                      Election Date
                    </label>
                    <input
                      id="election-date-input"
                      type="date"
                      value={electionDateInput}
                      onChange={(e) => {
                        setElectionDateInput(e.target.value);
                        setSettingsDirty(true);
                      }}
                      className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-3.5 py-2 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-3 flex items-center justify-between md:justify-end gap-2">
                    <span className="text-[11px] text-slate-400">
                      Result Panel:{' '}
                      <strong
                        className={
                          dashboard?.resultsPublished ? 'text-emerald-400' : 'text-amber-300'
                        }
                      >
                        {dashboard?.resultsPublished ? 'Published' : 'Hidden'}
                      </strong>
                    </span>
                    <button
                      type="submit"
                      disabled={savingSettings || !settingsDirty}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                    >
                      {savingSettings ? 'Saving...' : 'Save Info'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Leading Candidate Banner */}
              <div className="rounded-xl bg-[#151F32] border border-slate-800/90 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {dashboard?.leadingCandidate ? (
                    <CandidateAvatar
                      name={dashboard.leadingCandidate.name}
                      photoUrl={dashboard.leadingCandidate.photoUrl}
                      size="lg"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-[#0B1120] border border-slate-800 flex items-center justify-center">
                      <Award className="w-7 h-7 text-cyan-400" />
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">
                      Leading Candidate
                    </p>
                    <h2 className="font-display text-2xl font-bold text-white mt-0.5">
                      {dashboard?.isTie
                        ? 'Current Tie Between Top Candidates'
                        : dashboard?.leadingCandidate
                          ? dashboard.leadingCandidate.name
                          : 'No Votes Recorded Yet'}
                    </h2>
                    {dashboard?.leadingCandidate && !dashboard.isTie && (
                      <>
                        {dashboard.leadingCandidate.designation && (
                          <p className="text-xs font-semibold text-cyan-300 mt-0.5">
                            {dashboard.leadingCandidate.designation}
                          </p>
                        )}
                        <p className="text-sm text-slate-300 mt-0.5">
                          {dashboard.leadingCandidate.classSection
                            ? `Class ${dashboard.leadingCandidate.classSection} · `
                            : ''}
                          <span className="font-mono text-cyan-400 font-semibold">
                            {dashboard.leadingCandidate.votes} votes ({dashboard.leadingCandidate.percentage}%)
                          </span>
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fetchDashboard()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0B1120] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 self-start sm:self-center cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Refresh Results</span>
                </button>
              </div>

              {/* CANDIDATE VOTE RESULTS & HORIZONTAL BAR CHART */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Separate Candidate Vote List */}
                <div className="lg:col-span-6 rounded-xl bg-[#151F32] border border-slate-800/90 p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div>
                      <h2 className="font-display text-lg font-bold text-white">
                        CANDIDATE VOTE RESULTS
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Individual vote count and percentage share per candidate
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-cyan-400 tabular-nums">
                        Total: {dashboard?.totalVotes ?? 0}
                      </span>
                      <button
                        type="button"
                        onClick={handleOpenReport}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1120] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Print Report</span>
                      </button>
                    </div>
                  </div>

                  {results.length === 0 ? (
                    <div className="py-10 text-center space-y-2">
                      <Users className="w-8 h-8 text-slate-500 mx-auto" />
                      <p className="text-sm text-slate-400">
                        Register candidates to start counting votes.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {results.map((r, index) => (
                        <div
                          key={r.candidateId}
                          className="rounded-xl bg-[#0B1120] border border-slate-800 p-4 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <CandidateAvatar name={r.name} photoUrl={r.photoUrl} size="sm" />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white truncate">
                                  Candidate {index + 1}: {r.name}
                                  {!r.isActive && (
                                    <span className="text-xs font-normal text-slate-400"> (Removed)</span>
                                  )}
                                </p>
                                {r.designation && (
                                  <p className="text-xs font-semibold text-cyan-300 truncate mt-0.5">
                                    {r.designation}
                                  </p>
                                )}
                                <div className="text-xs text-slate-400 flex items-center gap-1.5 truncate mt-0.5">
                                  <span>
                                    {r.classSection ? `Class ${r.classSection}` : 'Registered Candidate'}
                                  </span>
                                  {r.symbol && (
                                    <span className="inline-flex items-center gap-1.5 text-cyan-400">
                                      <span>·</span>
                                      {r.symbolLogoUrl && (
                                        <img
                                          src={r.symbolLogoUrl}
                                          alt={`${r.symbol} logo`}
                                          className="w-4 h-4 rounded object-contain bg-white p-0.5 shrink-0"
                                        />
                                      )}
                                      <span className="truncate">{r.symbol}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-mono text-base font-bold text-white tabular-nums">
                                {r.votes} {r.votes === 1 ? 'vote' : 'votes'}
                              </p>
                              <p className="font-mono text-xs text-cyan-400 tabular-nums">
                                {r.percentage}%
                              </p>
                            </div>
                          </div>

                          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(100, r.percentage)}%`,
                                backgroundColor: BAR_COLORS[index % BAR_COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Horizontal Bar Chart */}
                <div className="lg:col-span-6 rounded-xl bg-[#151F32] border border-slate-800/90 p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-display text-lg font-bold text-white">
                        Live Vote Distribution
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Horizontal comparison of candidate vote totals
                      </p>
                    </div>
                    <BarChart3 className="w-5 h-5 text-cyan-400" />
                  </div>

                  {results.length === 0 ? (
                    <div className="flex-1 min-h-[260px] flex items-center justify-center text-sm text-slate-400">
                      No candidates available for chart visualization.
                    </div>
                  ) : (
                    <div className="w-full" style={{ height: Math.max(260, results.length * 64) }}>
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
                            formatter={(value: unknown, _name: unknown, item: { payload?: { percentage?: number } }) => [
                              `${value ?? 0} votes (${item?.payload?.percentage ?? 0}%)`,
                              'Votes',
                            ]}
                          />
                          <Bar dataKey="votes" radius={[0, 6, 6, 0]} barSize={28} animationDuration={500}>
                            {results.map((_entry, index) => (
                              <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>

              {/* Registered Candidate Management Cards */}
              <div className="rounded-xl bg-[#151F32] border border-slate-800/90 p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold text-white">
                      Active Candidates ({activeCandidates.length})
                    </h2>
                    <p className="text-xs text-slate-400">
                      Edit candidate details or register new candidates — changes sync live to the Voter Panel.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('add')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white cursor-pointer self-start"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ADD NEW CANDIDATE</span>
                  </button>
                </div>

                {activeCandidates.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">
                    No active candidates yet. Click ADD NEW CANDIDATE to register the first candidate.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {activeCandidates.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-xl bg-[#0B1120] border border-slate-800 p-4 flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <CandidateAvatar name={c.name} photoUrl={c.photoUrl} size="md" />
                          <div className="min-w-0">
                            <p className="font-display font-semibold text-white truncate">{c.name}</p>
                            {c.designation && (
                              <p className="text-xs font-semibold text-cyan-300 truncate">
                                {c.designation}
                              </p>
                            )}
                            <p className="text-xs text-slate-400 truncate">
                              {c.classSection ? `Class ${c.classSection}` : 'No class set'}
                            </p>
                            {c.symbol && (
                              <div className="flex items-center gap-1.5 text-xs text-cyan-400 truncate mt-1">
                                {c.symbolLogoUrl && (
                                  <img
                                    src={c.symbolLogoUrl}
                                    alt={`${c.symbol} logo`}
                                    className="w-4 h-4 rounded object-contain bg-white p-0.5 shrink-0"
                                  />
                                )}
                                <span className="truncate">{c.symbol}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            className="flex-1 py-1.5 px-3 rounded-lg bg-[#151F32] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemovingCandidate(c)}
                            className="py-1.5 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium text-red-400 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: ADD NEW CANDIDATE */}
          {activeTab === 'add' && (
            <div className="max-w-2xl mx-auto rounded-2xl bg-[#151F32] border border-slate-800 p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">ADD NEW CANDIDATE</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Complete all six required fields below. Registered candidates appear immediately in the Voter Panel and Result Panel.
                </p>
              </div>

              <form onSubmit={handleRegisterCandidate} noValidate className="space-y-5">
                {/* 1. Candidate Name */}
                <div>
                  <label
                    htmlFor="cand-name-input"
                    className="block text-xs font-semibold text-slate-200 mb-1.5"
                  >
                    1. Candidate Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="cand-name-input"
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Enter candidate's full name"
                    className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 2. Candidate Photo */}
                <div className="rounded-xl bg-[#0B1120] border border-slate-800 p-4 space-y-3">
                  <label
                    htmlFor="cand-photo-input"
                    className="block text-xs font-semibold text-slate-200"
                  >
                    2. Candidate Photo <span className="text-red-400">*</span>
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-24 h-24 rounded-xl bg-[#151F32] border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                      {newPhotoUrl ? (
                        <img
                          src={newPhotoUrl}
                          alt={newName ? `${newName} preview` : 'Candidate photo preview'}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="text-center px-2">
                          <Upload className="w-5 h-5 text-slate-500 mx-auto" />
                          <span className="text-[10px] text-slate-500 block mt-1">Preview</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <input
                        key={`photo-${photoInputKey}`}
                        id="cand-photo-input"
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const dataUrl = await prepareImageDataUrl(file);
                            setNewPhotoUrl(dataUrl);
                          } catch (err) {
                            e.target.value = '';
                            showToast(err instanceof Error ? err.message : 'Photo upload failed.', 'error');
                          }
                        }}
                        className="block w-full text-xs text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#151F32] file:text-cyan-400 file:font-medium hover:file:bg-slate-800 cursor-pointer"
                      />
                      <p className="text-[11px] text-slate-400">
                        Supported formats: JPG, JPEG, PNG, WEBP
                      </p>
                      {newPhotoUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewPhotoUrl('');
                            setPhotoInputKey((k) => k + 1);
                          }}
                          className="text-xs text-slate-400 hover:text-red-400 cursor-pointer"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Class and Section */}
                <div>
                  <label
                    htmlFor="cand-class-input"
                    className="block text-xs font-semibold text-slate-200 mb-1.5"
                  >
                    3. Class and Section <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="cand-class-input"
                    type="text"
                    required
                    value={newClassSection}
                    onChange={(e) => setNewClassSection(e.target.value)}
                    placeholder="e.g. 9th A, 10th B"
                    className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 4. Designation / Position Contesting For */}
                <div>
                  <label
                    htmlFor="cand-designation-input"
                    className="block text-xs font-semibold text-slate-200 mb-1.5"
                  >
                    4. Designation / Position Contesting For <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="cand-designation-input"
                    type="text"
                    required
                    value={newDesignation}
                    onChange={(e) => setNewDesignation(e.target.value)}
                    placeholder="e.g. Head Boy, Head Girl, School Captain, Sports Captain"
                    className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 5. Candidate Symbol Name */}
                <div>
                  <label
                    htmlFor="cand-symbol-input"
                    className="block text-xs font-semibold text-slate-200 mb-1.5"
                  >
                    5. Candidate Symbol Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="cand-symbol-input"
                    type="text"
                    required
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    placeholder="e.g. Eagle, Sun, Tree, Flower"
                    className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 6. Candidate Symbol Logo */}
                <div className="rounded-xl bg-[#0B1120] border border-slate-800 p-4 space-y-3">
                  <label
                    htmlFor="cand-symbol-logo-input"
                    className="block text-xs font-semibold text-slate-200"
                  >
                    6. Candidate Symbol Logo <span className="text-red-400">*</span>
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-24 h-24 rounded-xl bg-white/95 border border-slate-700 overflow-hidden flex items-center justify-center p-2 shrink-0">
                      {newSymbolLogoUrl ? (
                        <img
                          src={newSymbolLogoUrl}
                          alt={newSymbol ? `${newSymbol} logo preview` : 'Symbol logo preview'}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center px-1">
                          <Upload className="w-5 h-5 text-slate-500 mx-auto" />
                          <span className="text-[10px] text-slate-600 block mt-1">Logo</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <input
                        key={`symbol-logo-${symbolLogoInputKey}`}
                        id="cand-symbol-logo-input"
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const dataUrl = await prepareImageDataUrl(file);
                            setNewSymbolLogoUrl(dataUrl);
                          } catch (err) {
                            e.target.value = '';
                            showToast(
                              err instanceof Error ? err.message : 'Symbol logo upload failed.',
                              'error'
                            );
                          }
                        }}
                        className="block w-full text-xs text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#151F32] file:text-cyan-400 file:font-medium hover:file:bg-slate-800 cursor-pointer"
                      />
                      <p className="text-[11px] text-slate-400">
                        Supported formats: JPG, JPEG, PNG, WEBP
                      </p>
                      {newSymbolLogoUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewSymbolLogoUrl('');
                            setSymbolLogoInputKey((k) => k + 1);
                          }}
                          className="text-xs text-slate-400 hover:text-red-400 cursor-pointer"
                        >
                          Remove symbol logo
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetAddCandidateForm();
                      setActiveTab('dashboard');
                    }}
                    className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold tracking-wide text-slate-200 cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={registering}
                    className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm font-bold text-white inline-flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{registering ? 'REGISTERING...' : 'REGISTER CANDIDATE'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: REMOVE CANDIDATE */}
          {activeTab === 'remove' && (
            <div className="space-y-5">
              <div className="rounded-xl bg-[#151F32] border border-slate-800/90 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-white">REMOVE CANDIDATE</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Removing a candidate permanently deletes the candidate and all their voting records, updating election totals and charts immediately.
                  </p>
                </div>
              </div>

              {activeCandidates.length === 0 ? (
                <div className="rounded-xl bg-[#151F32] border border-slate-800 p-10 text-center text-sm text-slate-400">
                  No registered candidates available to remove.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {activeCandidates.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl bg-[#151F32] border border-slate-800 p-5 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <CandidateAvatar name={c.name} photoUrl={c.photoUrl} size="md" />
                        <div className="min-w-0">
                          <h3 className="font-display font-semibold text-white truncate">{c.name}</h3>
                          {c.designation && (
                            <p className="text-xs font-semibold text-cyan-300 truncate">
                              {c.designation}
                            </p>
                          )}
                          <p className="text-xs text-slate-400 truncate">
                            {c.classSection ? `Class ${c.classSection}` : 'No class specified'}
                          </p>
                          {c.symbol && (
                            <p className="text-xs text-cyan-400 inline-flex items-center gap-1.5 mt-0.5">
                              {c.symbolLogoUrl && (
                                <img
                                  src={c.symbolLogoUrl}
                                  alt={`${c.symbol} logo`}
                                  className="w-4 h-4 rounded object-contain bg-white p-0.5 shrink-0"
                                />
                              )}
                              <span>{c.symbol}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setRemovingCandidate(c)}
                        className="px-4 py-2 rounded-lg bg-red-600/85 hover:bg-red-600 text-xs font-bold text-white shrink-0 cursor-pointer"
                      >
                        REMOVE
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Edit Candidate Modal */}
      {editingCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md rounded-xl bg-[#151F32] border border-slate-700 shadow-2xl overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-white">Edit Candidate</h3>
              <button
                type="button"
                onClick={() => setEditingCandidate(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  1. Candidate Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-3.5 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  2. Candidate Photo (JPG, JPEG, PNG, WEBP)
                </label>
                <div className="flex items-center gap-3">
                  <CandidateAvatar name={editName || 'Candidate'} photoUrl={editPhotoUrl} size="md" />
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          setEditPhotoUrl(await prepareImageDataUrl(file));
                        } catch (err) {
                          e.target.value = '';
                          showToast(err instanceof Error ? err.message : 'Photo upload failed.', 'error');
                        }
                      }
                    }}
                    className="block w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#0B1120] file:text-cyan-400 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  3. Class and Section
                </label>
                <input
                  type="text"
                  required
                  value={editClassSection}
                  onChange={(e) => setEditClassSection(e.target.value)}
                  placeholder="e.g. 9th A, 10th B"
                  className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-3.5 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  4. Designation / Position Contesting For
                </label>
                <input
                  type="text"
                  required
                  value={editDesignation}
                  onChange={(e) => setEditDesignation(e.target.value)}
                  placeholder="e.g. Head Boy, Head Girl, School Captain"
                  className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-3.5 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  5. Candidate Symbol Name
                </label>
                <input
                  type="text"
                  required
                  value={editSymbol}
                  onChange={(e) => setEditSymbol(e.target.value)}
                  placeholder="e.g. Eagle, Sun, Tree, Flower"
                  className="w-full rounded-lg bg-[#0B1120] border border-slate-700 px-3.5 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  6. Candidate Symbol Logo (JPG, JPEG, PNG, WEBP)
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-white/95 border border-slate-700 overflow-hidden flex items-center justify-center p-1.5 shrink-0">
                    {editSymbolLogoUrl ? (
                      <img
                        src={editSymbolLogoUrl}
                        alt={editSymbol || 'Symbol logo'}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Upload className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          setEditSymbolLogoUrl(await prepareImageDataUrl(file));
                        } catch (err) {
                          e.target.value = '';
                          showToast(
                            err instanceof Error ? err.message : 'Symbol logo upload failed.',
                            'error'
                          );
                        }
                      }
                    }}
                    className="block w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#0B1120] file:text-cyan-400 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCandidate(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white cursor-pointer"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Candidate Confirmation Modal */}
      {removingCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-[#151F32] border border-slate-700 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-red-400">Confirm Candidate Removal</span>
              <button
                type="button"
                onClick={() => setRemovingCandidate(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-white leading-relaxed">
                    Are you sure you want to remove this candidate and all their voting records?
                  </p>
                  <p className="text-xs text-slate-300">
                    Candidate: <strong className="text-white">{removingCandidate.name}</strong>
                    {removingCandidate.classSection ? ` (Class ${removingCandidate.classSection})` : ''}
                  </p>
                </div>
              </div>
              <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3 leading-relaxed">
                This will permanently delete <strong>{removingCandidate.name}</strong> and all votes recorded for them. Votes for other candidates will not be affected.
              </div>
              {status === 'active' && (
                <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 leading-relaxed">
                  Voting is currently active. Removing this candidate will immediately update the Voter Panel and Admin results.
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                disabled={removingLoading}
                onClick={() => setRemovingCandidate(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removingLoading}
                onClick={handleConfirmRemoveCandidate}
                className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 text-xs font-bold text-white cursor-pointer"
              >
                {removingLoading ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm End Election Modal */}
      {endElectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-[#151F32] border border-slate-700 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-red-400">Confirm End Election</span>
              <button
                type="button"
                onClick={() => setEndElectionModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-display text-base font-bold text-white">
                    Are you sure you want to end the election?
                  </h3>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                    All VOTE buttons in the Voter Panel will be disabled immediately and students will see{' '}
                    <strong>VOTING HAS ENDED</strong>.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2.5 rounded-lg bg-[#0B1120] border border-slate-800 px-3.5 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={publishOnEnd}
                  onChange={(e) => setPublishOnEnd(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-200">
                  Publish final results to the <strong>Result Panel</strong> immediately
                </span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEndElectionModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-medium text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleElectionStatus('ended', publishOnEnd)}
                className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white cursor-pointer"
              >
                Confirm End Election
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    <ElectionReportModal
      open={reportModalOpen}
      dashboard={dashboard}
      generatedAt={reportGeneratedAt}
      onClose={() => setReportModalOpen(false)}
    />
    </>
  );
}
