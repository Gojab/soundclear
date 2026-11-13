import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';

interface FooterInfoModalData {
  title: string;
  subtitle: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function Footer() {
  const [infoModal, setInfoModal] = useState<FooterInfoModalData | null>(null);
  const navigate = useNavigationStore((s) => s.navigate);
  const setFilterType = useLibraryStore((s) => s.setFilterType);

  useEffect(() => {
    if (!infoModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInfoModal(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [infoModal]);

  const openInfo = (title: string, subtitle: string, body: string, ctaLabel?: string, onCta?: () => void) => {
    setInfoModal({ title, subtitle, body, ctaLabel, onCta });
  };

  const columns: Array<{
    heading: string;
    links: Array<{ label: string; onClick: () => void }>;
  }> = [
    {
      heading: 'Perusahaan',
      links: [
        {
          label: 'Tentang',
          onClick: () =>
            openInfo(
              'Tentang SoundClear',
              'Dikembangkan oleh zhafx.corp',
              'SoundClear adalah pemutar musik modern berfokus pada kejernihan suara, kontrol DSP lengkap (Equalizer 10-band, Bass Boost, Stereo Widener, Normalisasi LUFS), serta akses musik offline.',
            ),
        },
        {
          label: 'Pekerjaan',
          onClick: () =>
            openInfo(
              'Karier di zhafx.corp',
              'Audio Engineering & Web Platform',
              'Tim zhafx.corp berfokus membangun pengalaman audio fidelitas tinggi di browser dan perangkat seluler dengan arsitektur modern.',
            ),
        },
        {
          label: 'For the Record',
          onClick: () =>
            openInfo(
              'For the Record',
              'Buletin Resmi zhafx.corp',
              'Pembaruan rilis fitur SoundClear, peningkatan pemrosesan sinyal audio (DSP), serta pengumuman ekosistem musik terbaru.',
            ),
        },
      ],
    },
    {
      heading: 'Komunitas',
      links: [
        {
          label: 'Untuk Artis',
          onClick: () =>
            openInfo(
              'SoundClear untuk Artis',
              'Ekosistem Kreator & Musisi',
              'Kelola katalog, lihat profil artis, dan sajikan kualitas audio konsisten bagi pendengar melalui kurva EQ serta normalisasi terukur.',
            ),
        },
        {
          label: 'Untuk Kreator',
          onClick: () =>
            openInfo(
              'SoundClear untuk Kreator Podcast & Audio',
              'Publikasi & Pemutaran Fleksibel',
              'Mendukung episode podcast lengkap dengan kontrol kecepatan putar 0,5x–2x serta pelacakan progres otomatis.',
            ),
        },
        {
          label: 'Untuk Penulis',
          onClick: () =>
            openInfo(
              'SoundClear untuk Penulis Lagu',
              'Kredit & Lirik Tersinkronisasi',
              'Menampilkan kredit penulis, komposer, produser, dan lirik karaoke tersinkronisasi per lagu.',
            ),
        },
        {
          label: 'Pengembang',
          onClick: () =>
            openInfo(
              'Platform Pengembang zhafx.corp',
              'Web Audio API & Mesin Audio Terintegrasi',
              'Dirancang menggunakan Web Audio API dengan 10 BiquadFilterNode, AnalyserNode spektrum real-time, dan IndexedDB + Cache Storage offline.',
              'Buka Pengaturan Audio',
              () => {
                setInfoModal(null);
                navigate({ name: 'settings', tab: 'sound', focusEq: false });
              },
            ),
        },
        {
          label: 'Iklan',
          onClick: () =>
            openInfo(
              'Informasi Iklan',
              'Kemitraan zhafx.corp',
              'Solusi promosi rilisan musik dan kampanye audio yang relevan bagi pendengar.',
            ),
        },
        {
          label: 'Investors',
          onClick: () =>
            openInfo(
              'Hubungan Investor',
              'zhafx.corp Corporate Relations',
              'Laporan perkembangan produk, pertumbuhan ekosistem pemutaran audio, dan peta jalan teknologi SoundClear.',
            ),
        },
        {
          label: 'Vendors',
          onClick: () =>
            openInfo(
              'Mitra & Vendors',
              'Standar Kemitraan zhafx.corp',
              'Pedoman kerja sama teknologi, infrastruktur streaming, dan integrasi perangkat keras audio.',
            ),
        },
      ],
    },
    {
      heading: 'Tautan berguna',
      links: [
        {
          label: 'Dukungan',
          onClick: () =>
            openInfo(
              'Pusat Dukungan SoundClear',
              'Bantuan Cepat & Pintasan',
              'Butuh bantuan mengatur Equalizer, impor berkas audio lokal, atau unduhan offline? Jelajahi pintasan keyboard dan pengaturan lengkap.',
              'Buka Pintasan Keyboard',
              () => {
                setInfoModal(null);
                navigate({ name: 'shortcuts' });
              },
            ),
        },
        {
          label: 'Free Mobile App',
          onClick: () =>
            openInfo(
              'Aplikasi Web & Seluler (PWA)',
              'Pasang di Perangkat Anda',
              'SoundClear mendukung mode Progressive Web App (PWA) untuk pengalaman seluler mulus beserta dukungan cache unduhan offline.',
              'Buka Unduhan Offline',
              () => {
                setInfoModal(null);
                setFilterType('offline');
                navigate({ name: 'library' });
              },
            ),
        },
        {
          label: 'Populer berdasarkan Negara',
          onClick: () => navigate({ name: 'moods' }),
        },
        {
          label: 'Lirik Lagu Teratas',
          onClick: () => navigate({ name: 'search', query: 'populer' }),
        },
        {
          label: 'Impor musikmu',
          onClick: () => {
            setFilterType('local');
            navigate({ name: 'library' });
          },
        },
      ],
    },
    {
      heading: 'Paket SoundClear',
      links: [
        {
          label: 'Premium Standard',
          onClick: () =>
            openInfo(
              'SoundClear Premium Standard',
              'Semua Fitur Aktif',
              'Akses penuh ke pemutaran tanpa batas, Equalizer 10-band, Bass Boost, Stereo Widener, serta penyimpanan offline.',
              'Buka Pengaturan Audio',
              () => {
                setInfoModal(null);
                navigate({ name: 'settings', tab: 'sound', focusEq: false });
              },
            ),
        },
        {
          label: 'Premium Platinum',
          onClick: () =>
            openInfo(
              'SoundClear Premium Platinum',
              'Hi-Res Audio & DSP Lengkap',
              'Menghadirkan profil pemutaran Hi-Res Lossless, crossfade equal-power 0–12 detik, normalisasi LUFS, dan manajemen unduhan offline penuh.',
              'Atur Kualitas Hi-Res',
              () => {
                setInfoModal(null);
                navigate({ name: 'settings', tab: 'sound', focusEq: false });
              },
            ),
        },
        {
          label: 'Premium Student',
          onClick: () =>
            openInfo(
              'SoundClear Premium Student',
              'Paket Pelajar & Mahasiswa',
              'Nikmati seluruh fitur pemutaran audio fidelitas tinggi SoundClear termasuk mode fokus dan unduhan offline.',
            ),
        },
        {
          label: 'SoundClear Free',
          onClick: () =>
            openInfo(
              'SoundClear Free',
              'Akses Gratis dengan DSP & Offline Aktif',
              'Dengarkan musik katalog, impor file audio pribadi (MP3, FLAC, WAV, OGG), aktifkan semua efek DSP, dan simpan daftar lagu offline langsung di browser.',
            ),
        },
      ],
    },
  ];

  const legalLinks: Array<{ label: string; title: string; body: string }> = [
    {
      label: 'Hukum',
      title: 'Ketentuan Hukum',
      body: 'Layanan SoundClear dikelola oleh zhafx.corp. Seluruh hak cipta merek antarmuka dan mesin pemrosesan audio SoundClear merupakan milik zhafx.corp.',
    },
    {
      label: 'Pusat Keamanan & Privasi',
      title: 'Pusat Keamanan & Privasi',
      body: 'Data pustaka, riwayat putar, preset Equalizer kustom, dan berkas lokal Anda disimpan aman secara lokal di IndexedDB browser Anda.',
    },
    {
      label: 'Kebijakan Privasi',
      title: 'Kebijakan Privasi',
      body: 'zhafx.corp tidak menjual data pribadi pengguna. Anda dapat mengekspor atau menghapus seluruh data pustaka kapan saja lewat menu Pengaturan Umum.',
    },
    {
      label: 'Cookie',
      title: 'Kebijakan Cookie & Penyimpanan Lokal',
      body: 'SoundClear memanfaatkan IndexedDB, Cache Storage, dan LocalStorage browser untuk menyimpan preferensi DSP, playlist, dan antrean pemutaran terakhir.',
    },
    {
      label: 'Tentang Iklan',
      title: 'Tentang Iklan',
      body: 'SoundClear menjaga pengalaman mendengarkan tetap bersih tanpa pop-up mengganggu dan mengutamakan kontrol penuh pengguna atas pemutaran audio.',
    },
    {
      label: 'Aksesibilitas',
      title: 'Komitmen Aksesibilitas',
      body: 'Antarmuka SoundClear dirancang mendukung navigasi papan ketik, label ARIA standar, dan kontras teks yang jelas.',
    },
  ];

  return (
    <>
      <footer
        aria-label="Footer SoundClear"
        className="mt-12 pt-10 pb-8 px-4 sm:px-6 text-white"
      >
        {/* Top Columns + Social Icons */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-10 pb-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-8 flex-1 max-w-4xl">
            {columns.map((col) => (
              <div key={col.heading} className="space-y-3">
                <h3 className="text-[15px] font-bold text-white tracking-tight">
                  {col.heading}
                </h3>
                <ul className="space-y-2.5">
                  {col.links.map((item) => (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={item.onClick}
                        className="text-left text-sm font-normal text-[#B3B3B3] hover:text-white hover:underline transition-colors leading-snug"
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* 3 Circular Social Icon Buttons */}
          <div className="flex items-center gap-4 shrink-0">
            <button
              type="button"
              onClick={() =>
                openInfo(
                  'Instagram zhafx.corp',
                  '@zhafx.corp · SoundClear',
                  'Ikuti pembaruan visual, sorotan rilis mingguan, dan pengumuman fitur terbaru SoundClear dari zhafx.corp.',
                )
              }
              aria-label="Instagram zhafx.corp"
              title="Instagram"
              className="w-10 h-10 rounded-full bg-[#292929] hover:bg-[#3E3E3E] text-white flex items-center justify-center transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 fill-none stroke-current"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect width="18" height="18" x="3" y="3" rx="5" ry="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() =>
                openInfo(
                  'X zhafx.corp',
                  '@zhafx_corp · Pembaruan Real-Time',
                  'Dapatkan kabar cepat seputar rilis teknologi audio, pembaruan server, dan catatan rilis SoundClear.',
                )
              }
              aria-label="X zhafx.corp"
              title="X"
              className="w-10 h-10 rounded-full bg-[#292929] hover:bg-[#3E3E3E] text-white flex items-center justify-center transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() =>
                openInfo(
                  'Facebook zhafx.corp',
                  'Halaman Komunitas SoundClear',
                  'Bergabung bersama komunitas pendengar musik dan kreator di bawah naungan zhafx.corp.',
                )
              }
              aria-label="Facebook zhafx.corp"
              title="Facebook"
              className="w-10 h-10 rounded-full bg-[#292929] hover:bg-[#3E3E3E] text-white flex items-center justify-center transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Hairline Divider + Bottom Legal & Copyright */}
        <div className="border-t border-white/[0.1] pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {legalLinks.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => openInfo(item.title, 'zhafx.corp · SoundClear', item.body)}
                className="text-[13px] font-normal text-[#B3B3B3] hover:text-white hover:underline transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>

          <p className="text-[13px] font-normal text-[#B3B3B3] shrink-0">
            © 2026 zhafx.corp
          </p>
        </div>
      </footer>

      {infoModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={infoModal.title}
          onClick={() => setInfoModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#18181B] border border-white/[0.12] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-[#2EE6A6]">{infoModal.subtitle}</p>
                <h2 className="text-base font-bold text-white mt-0.5">{infoModal.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setInfoModal(null)}
                aria-label="Tutup dialog"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08]"
              >
                <X className="w-4 h-4" strokeWidth={1.85} />
              </button>
            </div>
            <p className="text-xs text-white/75 leading-relaxed">{infoModal.body}</p>
            <div className="flex items-center justify-end gap-2 pt-1">
              {infoModal.ctaLabel && infoModal.onCta && (
                <button
                  type="button"
                  onClick={infoModal.onCta}
                  className="px-4 py-2 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105"
                >
                  {infoModal.ctaLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => setInfoModal(null)}
                className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
