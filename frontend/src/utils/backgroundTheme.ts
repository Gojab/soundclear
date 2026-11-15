import type { BackgroundMode, CustomBackgroundSettings } from '../types/music';

export type BackgroundAssetKey = 'emerald_aurora' | 'studio_console' | 'vinyl_night';

export interface BackgroundPresetOption {
  id: string;
  name: string;
  subtitle: string;
  kind: 'image' | 'gradient';
  assetKey?: BackgroundAssetKey;
  previewGradient: string;
  cssBackground: string;
}

export const BACKGROUND_PRESETS: BackgroundPresetOption[] = [
  {
    id: 'emerald_aurora',
    name: 'Emerald Aurora',
    subtitle: 'Gelombang sutra gelap mint',
    kind: 'image',
    assetKey: 'emerald_aurora',
    previewGradient: 'linear-gradient(135deg, #0F1F17 0%, #01BA53 55%, #08120D 100%)',
    cssBackground: 'linear-gradient(135deg, #0F1F17 0%, #01BA53 55%, #08120D 100%)',
  },
  {
    id: 'studio_console',
    name: 'Mastering Studio',
    subtitle: 'Konsol analog cahaya hangat',
    kind: 'image',
    assetKey: 'studio_console',
    previewGradient: 'linear-gradient(135deg, #16120B 0%, #2B2111 50%, #08120D 100%)',
    cssBackground: 'linear-gradient(135deg, #16120B 0%, #2B2111 50%, #08120D 100%)',
  },
  {
    id: 'vinyl_night',
    name: 'Vinyl Midnight',
    subtitle: 'Ruang dengar larut malam',
    kind: 'image',
    assetKey: 'vinyl_night',
    previewGradient: 'linear-gradient(135deg, #0B151A 0%, #172A33 52%, #08120D 100%)',
    cssBackground: 'linear-gradient(135deg, #0B151A 0%, #172A33 52%, #08120D 100%)',
  },
  {
    id: 'midnight_emerald',
    name: 'Zamrud Malam',
    subtitle: 'Gradasi radial mint lembut',
    kind: 'gradient',
    previewGradient:
      'radial-gradient(circle at 18% 20%, #01BA53 0%, #0F1F17 48%, #08120D 100%)',
    cssBackground:
      'radial-gradient(circle at 18% 20%, rgba(25, 238, 138, 0.28) 0%, rgba(10, 211, 108, 0.16) 38%, #08120D 85%)',
  },
  {
    id: 'nordic_indigo',
    name: 'Safir Atmosfer',
    subtitle: 'Biru malam & cyan tenang',
    kind: 'gradient',
    previewGradient: 'linear-gradient(135deg, #0D1B3E 0%, #132A4A 48%, #070B14 100%)',
    cssBackground:
      'radial-gradient(circle at 80% 18%, rgba(56, 189, 248, 0.24) 0%, transparent 45%), linear-gradient(135deg, #0B1633 0%, #12243F 50%, #06080E 100%)',
  },
  {
    id: 'amber_lounge',
    name: 'Lounge Senja',
    subtitle: 'Hangat tembaga & obsidian',
    kind: 'gradient',
    previewGradient: 'linear-gradient(135deg, #331B0E 0%, #1E1318 55%, #09080A 100%)',
    cssBackground:
      'radial-gradient(circle at 22% 24%, rgba(245, 196, 81, 0.22) 0%, transparent 48%), linear-gradient(135deg, #2B170D 0%, #1B1218 52%, #08080A 100%)',
  },
];

export const QUICK_SOLID_COLORS = [
  { label: 'Zamrud Gelap', value: '#0F1F17' },
  { label: 'Laut Dalam', value: '#0B1D36' },
  { label: 'Ungu Malam', value: '#1E1133' },
  { label: 'Merah Anggur', value: '#2B0E17' },
  { label: 'Cokelat Studio', value: '#24180E' },
  { label: 'Abu Arang', value: '#15291F' },
];

export const QUICK_GRADIENT_PAIRS = [
  { label: 'Mint Malam', from: '#01BA53', to: '#0F1F17', angle: 135 },
  { label: 'Oseanik', from: '#0C2D48', to: '#121024', angle: 135 },
  { label: 'Senja Hangat', from: '#3E1C10', to: '#100C18', angle: 135 },
  { label: 'Nebula', from: '#28113B', to: '#0B1D2C', angle: 135 },
];

export const DEFAULT_CUSTOM_BACKGROUND: CustomBackgroundSettings = {
  mode: 'default',
  presetId: 'emerald_aurora',
  solidColor: '#0F1F17',
  gradientFrom: '#01BA53',
  gradientTo: '#0F1F17',
  gradientAngle: 135,
  customImageDataUrl: null,
  customImageName: null,
  blurPx: 12,
  dimOpacity: 58,
  panelGlass: true,
};

const VALID_MODES: ReadonlySet<BackgroundMode> = new Set([
  'default',
  'ambient',
  'preset',
  'color',
  'gradient',
  'image',
]);

export function clampBackgroundNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sanitizeHexColor(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

export function isSafeBackgroundImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-zA-Z0-9+/=]+$/i.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//');
  }
  return /^https?:\/\/.+$/i.test(trimmed);
}

export function normalizeCustomBackground(
  raw?: Partial<CustomBackgroundSettings> | null,
  externalImageDataUrl?: string | null,
): CustomBackgroundSettings {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const mode: BackgroundMode =
    typeof safe.mode === 'string' && VALID_MODES.has(safe.mode as BackgroundMode)
      ? (safe.mode as BackgroundMode)
      : DEFAULT_CUSTOM_BACKGROUND.mode;

  const presetExists = BACKGROUND_PRESETS.some((p) => p.id === safe.presetId);
  const presetId = presetExists
    ? (safe.presetId as string)
    : DEFAULT_CUSTOM_BACKGROUND.presetId;

  const candidateImage =
    externalImageDataUrl !== undefined ? externalImageDataUrl : safe.customImageDataUrl;
  const customImageDataUrl = isSafeBackgroundImageUrl(candidateImage) ? candidateImage : null;

  return {
    mode,
    presetId,
    solidColor: sanitizeHexColor(safe.solidColor, DEFAULT_CUSTOM_BACKGROUND.solidColor),
    gradientFrom: sanitizeHexColor(safe.gradientFrom, DEFAULT_CUSTOM_BACKGROUND.gradientFrom),
    gradientTo: sanitizeHexColor(safe.gradientTo, DEFAULT_CUSTOM_BACKGROUND.gradientTo),
    gradientAngle: clampBackgroundNumber(
      safe.gradientAngle,
      0,
      360,
      DEFAULT_CUSTOM_BACKGROUND.gradientAngle,
    ),
    customImageDataUrl,
    customImageName:
      typeof safe.customImageName === 'string' && safe.customImageName.trim()
        ? safe.customImageName.trim().slice(0, 120)
        : null,
    blurPx: clampBackgroundNumber(safe.blurPx, 0, 40, DEFAULT_CUSTOM_BACKGROUND.blurPx),
    dimOpacity: clampBackgroundNumber(
      safe.dimOpacity,
      25,
      90,
      DEFAULT_CUSTOM_BACKGROUND.dimOpacity,
    ),
    panelGlass:
      typeof safe.panelGlass === 'boolean'
        ? safe.panelGlass
        : DEFAULT_CUSTOM_BACKGROUND.panelGlass,
  };
}

export function getBackgroundPreset(presetId: string): BackgroundPresetOption {
  return BACKGROUND_PRESETS.find((p) => p.id === presetId) ?? BACKGROUND_PRESETS[0];
}

export function hasActiveCustomBackground(bg: CustomBackgroundSettings): boolean {
  if (bg.mode === 'default') return false;
  if (bg.mode === 'image' && !bg.customImageDataUrl) return false;
  return true;
}

export interface BackgroundPresentation {
  isActive: boolean;
  useGlassPanels: boolean;
  imageUrl: string | null;
  backgroundCss: string;
  blurPx: number;
  scrimOpacity: number;
}

export function computeBackgroundPresentation(
  bg: CustomBackgroundSettings,
  opts?: {
    currentTrackThumbnail?: string | null;
    ambientColor?: { r: number; g: number; b: number };
    resolvedPresetImageUrl?: string | null;
  },
): BackgroundPresentation {
  const scrimOpacity = Number((clampBackgroundNumber(bg.dimOpacity, 25, 90, 58) / 100).toFixed(2));
  const blurPx = clampBackgroundNumber(bg.blurPx, 0, 40, 12);

  if (bg.mode === 'default') {
    return {
      isActive: false,
      useGlassPanels: false,
      imageUrl: null,
      backgroundCss: '#000000',
      blurPx: 0,
      scrimOpacity: 0,
    };
  }

  if (bg.mode === 'ambient') {
    const rgb = opts?.ambientColor ?? { r: 25, g: 238, b: 138 };
    const thumb = isSafeBackgroundImageUrl(opts?.currentTrackThumbnail)
      ? opts?.currentTrackThumbnail
      : null;
    return {
      isActive: true,
      useGlassPanels: bg.panelGlass,
      imageUrl: thumb,
      backgroundCss: `radial-gradient(circle at 24% 20%, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.48), rgba(8, 18, 13, 0.96) 72%)`,
      blurPx: thumb ? Math.max(14, blurPx) : 0,
      scrimOpacity,
    };
  }

  if (bg.mode === 'preset') {
    const preset = getBackgroundPreset(bg.presetId);
    const resolvedImage =
      preset.kind === 'image' && isSafeBackgroundImageUrl(opts?.resolvedPresetImageUrl)
        ? opts?.resolvedPresetImageUrl
        : null;
    return {
      isActive: true,
      useGlassPanels: bg.panelGlass,
      imageUrl: resolvedImage,
      backgroundCss: preset.cssBackground,
      blurPx: resolvedImage ? blurPx : 0,
      scrimOpacity,
    };
  }

  if (bg.mode === 'color') {
    return {
      isActive: true,
      useGlassPanels: bg.panelGlass,
      imageUrl: null,
      backgroundCss: bg.solidColor,
      blurPx: 0,
      scrimOpacity: Math.min(scrimOpacity, 0.65),
    };
  }

  if (bg.mode === 'gradient') {
    return {
      isActive: true,
      useGlassPanels: bg.panelGlass,
      imageUrl: null,
      backgroundCss: `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientFrom} 0%, ${bg.gradientTo} 100%)`,
      blurPx: 0,
      scrimOpacity: Math.min(scrimOpacity, 0.65),
    };
  }

  // mode === 'image'
  if (!bg.customImageDataUrl) {
    return {
      isActive: false,
      useGlassPanels: false,
      imageUrl: null,
      backgroundCss: '#000000',
      blurPx: 0,
      scrimOpacity: 0,
    };
  }

  return {
    isActive: true,
    useGlassPanels: bg.panelGlass,
    imageUrl: bg.customImageDataUrl,
    backgroundCss: '#08120D',
    blurPx,
    scrimOpacity,
  };
}
