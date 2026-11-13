import bgEmeraldAurora from '../../../src/assets/images/bg_emerald_aurora_1794575234508.jpg';
import bgStudioConsole from '../../../src/assets/images/bg_studio_console_1794575234368.jpg';
import bgVinylNight from '../../../src/assets/images/bg_vinyl_night_1794575234851.jpg';
import type { BackgroundAssetKey } from './backgroundTheme';

export const BACKGROUND_ASSET_URLS: Record<BackgroundAssetKey, string> = {
  emerald_aurora: bgEmeraldAurora,
  studio_console: bgStudioConsole,
  vinyl_night: bgVinylNight,
};

export function resolvePresetAssetUrl(assetKey?: BackgroundAssetKey): string | null {
  if (!assetKey) return null;
  return BACKGROUND_ASSET_URLS[assetKey] ?? null;
}
