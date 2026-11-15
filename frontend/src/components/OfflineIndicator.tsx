import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../utils/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-24 lg:bottom-24 left-4 z-[95] flex items-center gap-2 rounded-full bg-[#0B0F0D]/80 backdrop-blur-xl border border-[#19EE8A]/35 px-3.5 py-1.5 text-xs font-medium text-[#E8FFF3] shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 text-[#19EE8A]" />
      <span>Mode Offline — Memutar lagu tersimpan</span>
    </div>
  );
}
