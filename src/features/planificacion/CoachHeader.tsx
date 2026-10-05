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
        <div className="flex items-center gap-2">
          <Brain size={18} strokeWidth={2} className="text-brand-neon drop-shadow-[0_0_6px_rgba(57,255,20,0.65)]" />
          <p className="text-sm font-semibold tracking-tight text-neutral-300">Coach IA</p>
        </div>

        <button
          onClick={() => setOpen(true)}
          title="Tu perfil"
          aria-label="Tu perfil"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-border text-neutral-400 transition-all duration-200 hover:rotate-45 hover:border-brand-gold hover:text-brand-gold"
        >
          <Settings size={16} />
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
