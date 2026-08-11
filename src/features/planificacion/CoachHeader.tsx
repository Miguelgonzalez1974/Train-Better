import { useState } from 'react';
import { Brain, Settings } from 'lucide-react';
import { Modal } from '../shell/Modal';
import { PerfilRapido } from './PerfilRapido';
import { AdminInviteUser } from '../auth/AdminInviteUser';
import type { AthleteProfile } from '../../data/athlete/types';

interface CoachHeaderProps {
  profile: AthleteProfile;
  onSaveProfile: (profile: AthleteProfile) => void;
}

export function CoachHeader({ profile, onSaveProfile }: CoachHeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-surface">
            <span className="absolute inset-0 animate-pulse rounded-2xl bg-brand-neon/20 blur-lg" />
            <Brain size={24} strokeWidth={2} className="relative text-brand-neon drop-shadow-[0_0_6px_rgba(57,255,20,0.65)]" />
          </span>
          <div>
            <p className="text-lg font-bold tracking-tight text-white">Coach IA</p>
            <p className="text-xs text-neutral-500">Tu entrenador personal</p>
          </div>
        </div>

        <button
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-border text-neutral-400 transition-all duration-200 hover:rotate-45 hover:border-brand-gold hover:text-brand-gold"
        >
          <Settings size={18} />
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Tu perfil">
        <PerfilRapido
          profile={profile}
          onSave={(updated) => {
            onSaveProfile(updated);
            setOpen(false);
          }}
          onRemovePainFlag={(id) => onSaveProfile({ ...profile, painFlags: (profile.painFlags ?? []).filter((f) => f.id !== id) })}
        />
        <AdminInviteUser />
      </Modal>
    </>
  );
}
