import { useEffect, useState } from 'react';
import { UserCheck } from 'lucide-react';

interface CandidateAvatarProps {
  name: string;
  photoUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'VX';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function CandidateAvatar({ name, photoUrl, size = 'md', className = '' }: CandidateAvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [photoUrl]);

  const dims =
    size === 'sm'
      ? 'w-10 h-10 text-xs'
      : size === 'md'
        ? 'w-14 h-14 text-sm'
        : size === 'lg'
          ? 'w-20 h-20 text-lg'
          : 'w-full aspect-square text-2xl';

  if (photoUrl && !failed) {
    return (
      <div className={`relative overflow-hidden rounded-lg bg-[#0F172A] border border-slate-800 shrink-0 ${dims} ${className}`}>
        <img
          src={photoUrl}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover object-top"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-gradient-to-br from-[#1A2742] via-[#151F32] to-[#0E1729] border border-slate-700/70 flex flex-col items-center justify-center shrink-0 select-none ${dims} ${className}`}
      aria-label={name}
    >
      <span className="font-display font-semibold tracking-tight text-slate-200">{getInitials(name)}</span>
      {size === 'xl' && <UserCheck className="w-5 h-5 text-cyan-400/70 mt-1" />}
    </div>
  );
}
