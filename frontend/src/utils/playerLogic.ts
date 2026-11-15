import type {
  ArtistDetailResponse,
  ArtistRef,
  LyricLine,
  MediaItem,
  MediaItemType,
  OfflineDownloadRecord,
  PodcastEpisode,
  RepeatMode,
  SearchFilter,
} from '../types/music';

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const hrs = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const secStr = secs < 10 ? `0${secs}` : `${secs}`;
  if (hrs > 0) {
    const minStr = mins < 10 ? `0${mins}` : `${mins}`;
    return `${hrs}:${minStr}:${secStr}`;
  }
  return `${mins}:${secStr}`;
}

export function formatArtists(artists: ArtistRef[] | undefined | null): string {
  if (!artists || artists.length === 0) return 'Artis tidak diketahui';
  return artists.map((a) => a.name).filter(Boolean).join(', ') || 'Artis tidak diketahui';
}

export function isLocalTrack(item: MediaItem | null | undefined): boolean {
  return Boolean(item && (item.type === 'local' || item.localFileId));
}

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeVideoId(id: string | null | undefined): boolean {
  return Boolean(id && YOUTUBE_VIDEO_ID_RE.test(id));
}

export function normalizeRouteId(id: string | null | undefined): string | null {
  if (typeof id !== 'string') return null;
  let raw = id.trim();
  if (!raw || raw === 'undefined' || raw === 'null') return null;
  if (raw.includes('youtube.com/') || raw.includes('youtu.be/')) {
    try {
      const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      const vParam = parsed.searchParams.get('v')?.trim();
      const listParam = parsed.searchParams.get('list')?.trim();
      if (vParam) {
        raw = vParam;
      } else if (listParam) {
        raw = listParam;
      } else {
        raw = parsed.pathname.replace(/\/+$/, '').split('/').pop()?.trim() ?? '';
      }
    } catch {
      raw = raw.split('?')[0].replace(/\/+$/, '').split('/').pop()?.trim() ?? '';
    }
  } else {
    if (raw.includes('?')) raw = raw.split('?')[0];
    if (raw.includes('/')) raw = raw.replace(/\/+$/, '').split('/').pop()?.trim() ?? '';
  }
  if (!raw || raw === 'undefined' || raw === 'null') return null;
  return raw;
}

export function getPlayableVideoId(item: MediaItem | null | undefined): string | null {
  if (!item || isLocalTrack(item)) return null;
  if (item.videoId) return item.videoId;
  if (item.type === 'song' || item.type === 'video' || item.type === 'episode') {
    return item.id || null;
  }
  return null;
}

export function getTrackUniqueId(item: MediaItem | null | undefined): string | null {
  if (!item) return null;
  if (isLocalTrack(item)) return item.localFileId || item.id;
  return getPlayableVideoId(item) || item.id || null;
}

export function isPlayableTrack(item: MediaItem | null | undefined): boolean {
  return Boolean(isLocalTrack(item) || getPlayableVideoId(item));
}

export function hasPlayableOfflineAudio(
  rec: Pick<OfflineDownloadRecord, 'hasAudioBlob' | 'mimeType' | 'blob'> | null | undefined,
): boolean {
  if (!rec) return false;
  if (rec.hasAudioBlob === false) return false;
  if (rec.mimeType === 'application/json') return false;
  return Boolean(rec.blob && rec.blob.size > 0);
}

export function findActiveLyricIndex(lines: LyricLine[], currentTimeMs: number): number {
  if (!lines || lines.length === 0 || currentTimeMs < 0) return -1;
  let active = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (currentTimeMs >= line.startTimeMs) {
      if (
        currentTimeMs < line.endTimeMs ||
        i === lines.length - 1 ||
        currentTimeMs < lines[i + 1].startTimeMs
      ) {
        active = i;
      }
    } else {
      break;
    }
  }
  return active;
}

export function computeNextIndex(
  currentIndex: number,
  queueLength: number,
  shuffle: boolean,
  repeat: RepeatMode,
  randomFn: () => number = Math.random,
): number | null {
  if (queueLength <= 0) return null;
  if (repeat === 'one') return currentIndex >= 0 ? currentIndex : 0;

  if (shuffle && queueLength > 1) {
    let candidate = Math.floor(randomFn() * queueLength);
    if (candidate === currentIndex) {
      candidate = (currentIndex + 1) % queueLength;
    }
    return candidate;
  }

  const next = currentIndex + 1;
  if (next < queueLength) return next;
  if (repeat === 'all') return 0;
  return null;
}

export function computePrevIndex(
  currentIndex: number,
  queueLength: number,
  currentTimeSeconds: number,
  repeat: RepeatMode,
): { action: 'restart' | 'jump'; index: number | null } {
  if (queueLength <= 0) return { action: 'restart', index: null };
  if (currentTimeSeconds > 3) {
    return { action: 'restart', index: currentIndex >= 0 ? currentIndex : 0 };
  }
  if (currentIndex > 0) {
    return { action: 'jump', index: currentIndex - 1 };
  }
  if (repeat === 'all') {
    return { action: 'jump', index: queueLength - 1 };
  }
  return { action: 'restart', index: 0 };
}

export function mergeWatchTracksIntoQueue(
  currentQueue: MediaItem[],
  currentIndex: number,
  watchTracks: MediaItem[],
): MediaItem[] {
  const existingVideoIds = new Set<string>();
  const head =
    currentIndex >= 0 && currentIndex < currentQueue.length
      ? currentQueue.slice(0, currentIndex + 1)
      : [];

  for (const item of head) {
    const vid = getPlayableVideoId(item);
    if (vid) existingVideoIds.add(vid);
  }

  const manualUpcoming = currentIndex >= 0 ? currentQueue.slice(currentIndex + 1) : [];
  for (const item of manualUpcoming) {
    const vid = getPlayableVideoId(item);
    if (vid) existingVideoIds.add(vid);
  }

  const additions: MediaItem[] = [];
  for (const track of watchTracks) {
    const vid = getPlayableVideoId(track);
    if (!vid || existingVideoIds.has(vid)) continue;
    existingVideoIds.add(vid);
    additions.push(track);
  }

  return [...head, ...manualUpcoming, ...additions];
}

export function formatNegativeRemaining(currentTime: number, duration: number): string {
  if (!Number.isFinite(duration) || duration <= 0) return '-0:00';
  const safeCurrent = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  const remaining = Math.max(0, Math.ceil(duration - safeCurrent));
  return `-${formatTime(remaining)}`;
}

export function getEffectiveThumbnail(
  url: string | null | undefined,
  dataSaver: boolean,
): string | null {
  if (!url) return null;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (dataSaver) {
    return url
      .replace(/=w\d+-h\d+[^&\s]*/, '=w120-h120-l90-rj')
      .replace(/=s\d+([^&\s]*)/, '=s120$1');
  }
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    const whMatch = url.match(/=w(\d+)-h(\d+)/);
    if (whMatch) {
      const w = Number(whMatch[1]);
      const h = Number(whMatch[2]);
      if (w < 544 || h < 544) {
        return url.replace(/=w\d+-h\d+[^&\s]*/, '=w544-h544-l90-rj');
      }
      return url;
    }
    const sMatch = url.match(/=s(\d+)/);
    if (sMatch && Number(sMatch[1]) < 544) {
      return url.replace(/=s\d+/, '=s544');
    }
  }
  if (url.includes('ytimg.com') && !url.includes('?')) {
    if (url.endsWith('/default.jpg') || url.endsWith('/0.jpg')) {
      return url.replace(/\/(?:default|0)\.jpg$/, '/hqdefault.jpg');
    }
  }
  return url;
}

export function isMissingYouTubeThumbnail(
  url: string | null | undefined,
  naturalWidth: number,
  naturalHeight: number,
): boolean {
  if (!url || !url.includes('ytimg.com')) return false;
  return naturalWidth === 120 && naturalHeight === 90;
}

export function shouldCropYouTubeLetterbox(
  url: string | null | undefined,
  naturalWidth: number,
  naturalHeight: number,
): boolean {
  if (!url || !url.includes('ytimg.com')) return false;
  if (naturalWidth <= 0 || naturalHeight <= 0) return false;
  const ratio = naturalWidth / naturalHeight;
  return Math.abs(ratio - 4 / 3) < 0.08;
}

export function findDuplicateTrackIndices(tracks: MediaItem[]): Set<number> {
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  tracks.forEach((track, idx) => {
    const key = getTrackUniqueId(track) || track.id;
    if (seen.has(key)) {
      duplicates.add(idx);
    } else {
      seen.add(key);
    }
  });
  return duplicates;
}

export function interleaveSmartShuffleTracks(
  upcoming: MediaItem[],
  recommended: MediaItem[],
  currentVideoId: string | null,
): MediaItem[] {
  const existingIds = new Set<string>();
  if (currentVideoId) existingIds.add(currentVideoId);
  for (const t of upcoming) {
    const vid = getTrackUniqueId(t);
    if (vid) existingIds.add(vid);
  }

  const freshRecs = recommended.filter((r) => {
    const vid = getPlayableVideoId(r);
    if (!vid || existingIds.has(vid)) return false;
    existingIds.add(vid);
    return true;
  });

  if (freshRecs.length === 0) return upcoming;
  if (upcoming.length === 0) return freshRecs.slice(0, 10);

  const result: MediaItem[] = [];
  let recIdx = 0;
  for (let i = 0; i < upcoming.length; i += 1) {
    result.push(upcoming[i]);
    if ((i + 1) % 2 === 0 && recIdx < freshRecs.length) {
      result.push(freshRecs[recIdx]);
      recIdx += 1;
    }
  }
  while (recIdx < Math.min(freshRecs.length, 6)) {
    result.push(freshRecs[recIdx]);
    recIdx += 1;
  }
  return result;
}

export function isCollectionPlayableType(type: MediaItemType): boolean {
  return type === 'album' || type === 'playlist' || type === 'artist' || type === 'podcast';
}

export function podcastEpisodesToMediaItems(
  episodes: PodcastEpisode[],
  fallbackAuthor?: string | null,
  fallbackThumbnail?: string | null,
): MediaItem[] {
  return episodes
    .filter((ep) => Boolean(ep.videoId || ep.id))
    .map((ep) => ({
      id: ep.videoId || ep.id,
      videoId: ep.videoId || ep.id,
      title: ep.title,
      artists: [{ id: null, name: ep.podcastTitle || fallbackAuthor || 'Podcast' }],
      duration: ep.duration ?? null,
      durationSeconds: ep.durationSeconds ?? null,
      thumbnail: ep.thumbnail || fallbackThumbnail || null,
      type: 'episode',
      published: ep.published ?? null,
      podcastId: ep.podcastId ?? null,
      description: ep.description ?? null,
    }));
}

export function extractTracksFromArtistDetail(artist: ArtistDetailResponse): MediaItem[] {
  const playableSongs = (artist.songs || []).filter((item) => isPlayableTrack(item));
  if (playableSongs.length > 0) return playableSongs;
  return (artist.videos || []).filter((item) => isPlayableTrack(item));
}

const CJK_HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const JAPANESE_KANA_RE = /[\u3040-\u30ff\u31f0-\u31ff\uff65-\uff9f]/;
const KOREAN_HANGUL_RE = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/;
const INDIC_SCRIPT_RE = /[\u0900-\u0d7f]/;
const MANDARIN_KEYWORD_RE =
  /\b(?:mandarin|mandopop|cantopop|c-?pop|chinese|zhongwen|hokkien|guoyu|taiwanese|taiwan)\b/i;
const XG_ARTIST_RE = /\b(?:XG|XGALX)\b/;
const JAPANESE_KEYWORD_RE =
  /\b(?:j-?pop|j-?rock|j-?rap|j-?indie|j-?metal|japanese|nihon|nippon|japan|anisong|anison|anime|vocaloid|hatsune\s*miku|city\s*pop|japanese\s*city\s*pop|enka|shibuya-?kei|touhou|hololive|nijisanji|anime\s+(?:ost|song|opening|ending|op|ed|theme)|yoasobi|ado|fujii\s*kaze|kenshi\s*yonezu|radwimps|official\s*hige\s*dandism|king\s*gnu|mrs\.?\s*green\s*apple|vaundy|creepy\s*nuts|aimyon|yorushika|zutomayo|aimer|milet|utada\s*hikaru|hikaru\s*utada|one\s*ok\s*rock|babymetal|kis-?my-?ft2|hey!\s*say!\s*jump|jinto\s*yoshida|snow\s*man|sixtones|naniwa\s*danshi|arashi|number_i|travis\s*japan|be:first|nogizaka46|sakurazaka46|hinatazaka46|akb48|ske48|nmb48|hkt48|atarashii\s*gakko|kyary\s*pamyu\s*pamyu|sekai\s*no\s*owari|back\s*number|bump\s*of\s*chicken|kana-?boon|asian\s*kung-?fu\s*generation|my\s*first\s*story|man\s*with\s*a\s*mission|uverworld|spyair|l'arc~?en~?ciel|x\s*japan|sakanaction|hoshino\s*gen|gen\s*hoshino|masaki\s*suda|tatsuya\s*kitani|natori|yuuri|imase|hoshimachi\s*suisei|mafumafu|soraru|syudou|kairiki\s*bear|deco\*?27|pinocchiop|inabakumori|millennium\s*parade|sheena\s*ringo|shiina\s*ringo|joe\s*hisaishi|hiroyuki\s*sawano|yuki\s*kajiura|yoko\s*kanno|ryuichi\s*sakamoto|miki\s*matsubara|mariya\s*takeuchi|tatsuro\s*yamashita|taeko\s*onuki|ichiko\s*aoba|haruomi\s*hosono|kaneko\s*ayano|saucy\s*dog|macaroni\s*empitsu|wagakkiband|namie\s*amuro|ayumi\s*hamasaki|koda\s*kumi|mika\s*nakashima|ai\s*otsuka|suiatsu|musashi|ai\s+no\s+katachi|yoru\s+ni\s+kakeru|kaibutsu|gurenge|zankyou\s+sanka|shinunoga\s+e-?wa|odoriko|hakujitsu|sayonara|arigatou|aishiteru|daisuki|watashi\s+no|kimi\s+no|anata\s+no|boku\s+no|ai\s+no|koi\s+no|kokoro|shiawase|kanashimi|yoru\s+ni|seishun|kanojo|kareshi|tomodachi|natsukashii|japanese\s+ver\.?|jp\s+ver\.?|nihongo|komorebi|taiyou|hanabi|matsuri|oshi\s*no\s*ko|lilas|ikura|lagu\s+jepang|musik\s+jepang)\b/i;
const INDIAN_KEYWORD_RE =
  /\b(?:india|indian|bollywood|kollywood|tollywood|mollywood|sandalwood|punjabi|hindi|tamil|telugu|malayalam|kannada|bhojpuri|marathi|gujarati|bengali|hindustani|carnatic|bhangra|ghazal|qawwali|bhajan|desi|i-?pop|t-?series|zee\s*music|saregama|sony\s*music\s*india|yrf|tips\s*official|speed\s*records|eros\s*now|desimelodies|white\s*hill\s*music|udit\s*narayan|arijit\s*singh|arjit\s*singh|arijitsingh|arjitsingh|shreya\s*ghoshal|alka\s*ynik|alka\s*yagnik|kumar\s*sanu|lata\s*mangeshkar|kishore\s*kumar|sonu\s*nigam|a\.?\s*r\.?\s*rahman|diljit\s*dosanjh|sidhu\s*moose\s*wala|ap\s*dhillon|anirudh\s*ravichander|neha\s*kakkar|jubin\s*nautiyal|atif\s*aslam|sunidhi\s*chauhan|asha\s*bhosle|mohammed\s*rafi|ilayaraja|sp\s*balasubrahmanyam|rito\s*riba|siddhant\s*kaushal|badshah|honey\s*singh|guru\s*randhawa|armaan\s*malik|darshan\s*raval|vishal\s*mishra|b\s*praak|tanishk\s*bagchi|pritam|mithoon|sachet\s*tandon|shankar\s*mahadevan|kailash\s*kher|rahat\s*fateh\s*ali\s*khan|nusrat\s*fateh\s*ali\s*khan|mohit\s*chauhan|himesh\s*reshammiya|mika\s*singh|sukhwinder\s*singh|karan\s*aujla|shubh|talwinder|anuv\s*jain|prateek\s*kuhad|emiway\s*bantai|mc\s*stan|mc\s*sairaj|jyoti\s*magar|akshay\s*kumar|dhadkan|ramayana|harrdy\s*sandhu|jass\s*manak|ammy\s*virk|parmish\s*verma|satinder\s*sartaaj|nimrat\s*khaira|sunanda\s*sharma|tulsi\s*kumar|dhvani\s*bhanushali|palak\s*muchhal|jonita\s*gandhi|shilpa\s*rao|kanika\s*kapoor|jasleen\s*royal|rekha\s*bhardwaj|kavita\s*krishnamurthy|salim-?sulaiman|amit\s*trivedi|vishal-?shekhar|sachin-?jigar|devi\s*sri\s*prasad|yuvan\s*shankar\s*raja|santhosh\s*narayanan|harris\s*jayaraj|sid\s*sriram|stebin\s*ben|asees\s*kaur|tony\s*kakkar|raghav\s*chaitanya|arjan\s*dhillon|babbu\s*maan|gurdas\s*maan|daler\s*mehndi|dilruba|dilnasheen|ishq|pyaar|pyar|mohabbat|zindagi|aashiq|aashiqui|ashiqui|deewana|bewafa|judai|tanhai|khwab|musafir|barsaat|mehndi|sangeet|balam|sajna|sajni|rabba|maula|yaara|heeriye|sohniye|soniye|shayari|lagu\s+india|musik\s+india|channa\s+mereya|(?:tera|mera)\s+(?:yaar|naam|ishq|pyaar|dil|chehra|nasha|fitoor)|(?:tum|hum)\s+(?:hi|se|ko|bin|mile|safar|tum)|dil\s+(?:se|ko|mein|ne|ke|ka|ki|bara|galti|chori|de|diya)|ae\s+dil|o\s+sajna|o\s+maahi|tu\s+(?:hi|jaane|mera|hai|mere)|kaise\s+hua|kuch\s+kuch|kabhi\s+(?:khushi|alvida))\b/i;

const SPACED_LETTERS_RE = /(?:\b[A-Za-z]\s+){2,}[A-Za-z]\b/g;

export function isExcludedRegionalText(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false;
  const normText = text.normalize('NFKC');
  if (INDIC_SCRIPT_RE.test(normText)) return true;
  if (JAPANESE_KANA_RE.test(normText)) return true;
  const collapsed = normText.replace(SPACED_LETTERS_RE, (m) => m.replace(/\s+/g, ''));
  for (const candidate of collapsed !== normText ? [normText, collapsed] : [normText]) {
    if (INDIAN_KEYWORD_RE.test(candidate)) return true;
    if (JAPANESE_KEYWORD_RE.test(candidate)) return true;
    if (XG_ARTIST_RE.test(candidate)) return true;
    if (MANDARIN_KEYWORD_RE.test(candidate)) return true;
  }
  if (CJK_HAN_RE.test(normText) && !KOREAN_HANGUL_RE.test(normText)) return true;
  return false;
}

export function isExcludedRegionalItem(
  item: Pick<MediaItem, 'title' | 'artists' | 'album' | 'description'> | null | undefined,
): boolean {
  if (!item) return false;
  const parts: string[] = [item.title || ''];
  for (const a of item.artists || []) {
    if (a?.name) parts.push(a.name);
  }
  if (item.album?.name) parts.push(item.album.name);
  if (item.description) parts.push(item.description);
  return isExcludedRegionalText(parts.join(' '));
}

const KOPLO_DANGDUT_KEYWORD_RE =
  /\b(?:koplo|dangdut|campursari|gamelan|tayub|tarling|jaipong|orgen\s*tunggal|elekton|om\s+adella|new\s+pallapa|om\s+monata|new\s+monata|ageng\s+music|dc\.?\s*production|dc\s+musik|ta\s*pro\s*music|lembayung\s+music|berkah\s+talenta|aneeska|savana\s+music|sri\s+surya|bajol\s+ndanu|one\s+nada|mahesa\s+music|pantura|sinden|ketipung|kendang|gedruk|jandhut|ambyar(?:\s+everywhere)?|da7|dj\s+tiktok|jedag\s+jedug|full\s+bass|live\s+dangdut|dangdut\s+jamming|cover\s+ai|ai\s+cover|karaoke|jeyma\s+monica|denny\s+caknan|yeni\s+inka|della\s+monica|dini\s+kurnia|shinta\s+gisul|laila\s+ayu|ajeng\s+febria|happy\s+asmara|sasya\s+arkhisna|silvy\s+kumalasari|maulana\s+ardiansyah|melly\s+lee|ndarboy\s+genk|guyon\s+waton|gilga\s+sahid|difarina\s+indra|arlida\s+putri|tasya\s+rosmala|niken\s+salindry)\b/i;

const KOPLO_DANGDUT_ARTISTS = new Set([
  'jeyma monica',
  'denny caknan',
  'yeni inka',
  'della monica',
  'dini kurnia',
  'shinta gisul',
  'laila ayu',
  'ajeng febria',
  'happy asmara',
  'sasya arkhisna',
  'silvy kumalasari',
  'maulana ardiansyah',
  'ndarboy genk',
  'ndarboy',
  'guyon waton',
  'aftershine',
  'gilga sahid',
  'gildcoustic',
  'masdddho',
  'difarina indra',
  'arlida putri',
  'tasya rosmala',
  'syahiba saufa',
  'niken salindry',
  'lala widy',
  'vita alvia',
  'safira inema',
  'esa risty',
  'woro widowati',
  'damara de',
  'via vallen',
  'nella kharisma',
  'ayu ting ting',
  'siti badriah',
  'farel prayoga',
  'abah lala',
  'om adella',
  'new pallapa',
  'dc. production',
  'dc production',
  'ta pro music & publishing',
  'ta pro music',
  'lembayung music',
  'berkah talenta',
  'ageng music',
]);

export function isKoploOrDangdutItem(
  item: Pick<MediaItem, 'title' | 'artists' | 'album' | 'description'> | null | undefined,
): boolean {
  if (!item) return false;
  const parts: string[] = [item.title || ''];
  for (const a of item.artists || []) {
    const name = a?.name?.trim();
    if (!name) continue;
    if (KOPLO_DANGDUT_ARTISTS.has(name.toLowerCase())) return true;
    parts.push(name);
  }
  if (item.album?.name) parts.push(item.album.name);
  if (item.description) parts.push(item.description);
  const combined = parts.join(' ');
  if (KOPLO_DANGDUT_KEYWORD_RE.test(combined)) return true;
  if (/~\s*cover\s+by\s*:/i.test(combined)) return true;
  return false;
}

export function diversifyIndonesianTracks<
  T extends Pick<MediaItem, 'id' | 'videoId' | 'title' | 'artists' | 'album' | 'description'>,
>(items: T[], maxKoplo = 1, maxPerArtist = 2): T[] {
  if (!items || items.length === 0) return [];
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const mainstream: T[] = [];
  const koplo: T[] = [];

  for (const item of items) {
    const vid = (item.videoId || item.id || '').trim();
    const cleanTitle = (item.title || '')
      .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (vid && seenIds.has(vid)) continue;
    if (cleanTitle && seenTitles.has(cleanTitle)) continue;
    if (vid) seenIds.add(vid);
    if (cleanTitle) seenTitles.add(cleanTitle);

    if (isKoploOrDangdutItem(item)) {
      koplo.push(item);
    } else {
      mainstream.push(item);
    }
  }

  const selected: T[] = [];
  const deferred: T[] = [];
  const artistCounts = new Map<string, number>();

  for (const item of mainstream) {
    const primaryArtist = (item.artists?.[0]?.name || '').trim().toLowerCase();
    if (primaryArtist && maxPerArtist > 0) {
      const count = artistCounts.get(primaryArtist) ?? 0;
      if (count >= maxPerArtist) {
        deferred.push(item);
        continue;
      }
      artistCounts.set(primaryArtist, count + 1);
    }
    selected.push(item);
  }

  for (const item of deferred) {
    selected.push(item);
  }

  if (maxKoplo > 0 && koplo.length > 0) {
    const allowed = selected.length > 0 ? maxKoplo : koplo.length;
    selected.push(...koplo.slice(0, allowed));
  }

  return selected;
}

export interface SearchFollowUpItem {
  id: string;
  label: string;
  query: string;
  filter: SearchFilter;
  kind: 'suggest' | 'artist' | 'track' | 'refine';
}

export function buildSearchFollowUps(
  submittedQuery: string,
  items: MediaItem[],
  suggestions: string[] = [],
  activeFilter: SearchFilter = 'all',
): SearchFollowUpItem[] {
  const cleanQuery = submittedQuery.trim();
  if (!cleanQuery) return [];

  const lowerQuery = cleanQuery.toLowerCase();
  const seenKeys = new Set<string>([`${lowerQuery}::${activeFilter}`]);
  const out: SearchFollowUpItem[] = [];

  const pushUnique = (entry: Omit<SearchFollowUpItem, 'id'>) => {
    const q = entry.query.trim();
    if (!q || isExcludedRegionalText(q)) return;
    const dedupeKey = `${q.toLowerCase()}::${entry.filter}`;
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);
    out.push({
      id: `${entry.kind}-${out.length}-${q.toLowerCase().slice(0, 24)}`,
      ...entry,
      query: q,
    });
  };

  // 1. Direct query refinements by filter
  if (activeFilter !== 'songs') {
    pushUnique({
      label: `Khusus lagu "${cleanQuery}"`,
      query: cleanQuery,
      filter: 'songs',
      kind: 'refine',
    });
  }
  if (activeFilter !== 'albums') {
    pushUnique({
      label: `Album "${cleanQuery}"`,
      query: cleanQuery,
      filter: 'albums',
      kind: 'refine',
    });
  }
  if (activeFilter !== 'playlists') {
    pushUnique({
      label: `Playlist "${cleanQuery}"`,
      query: cleanQuery,
      filter: 'playlists',
      kind: 'refine',
    });
  }

  // 2. Context-aware follow-ups derived from top artist/song results
  const primaryArtist =
    items.find((i) => i.type === 'artist')?.title ||
    items.find((i) => i.artists?.[0]?.name)?.artists?.[0]?.name ||
    null;
  const primaryTrack = items.find(
    (i) => i.type === 'song' || i.type === 'video',
  );

  if (primaryArtist && !isExcludedRegionalText(primaryArtist)) {
    pushUnique({
      label: `Lagu populer ${primaryArtist}`,
      query: `${primaryArtist} lagu populer`,
      filter: 'songs',
      kind: 'artist',
    });
    pushUnique({
      label: `Mix ${primaryArtist}`,
      query: `mix ${primaryArtist}`,
      filter: 'playlists',
      kind: 'artist',
    });
  }

  if (primaryTrack && !isExcludedRegionalText(primaryTrack.title)) {
    const cleanTitle = primaryTrack.title.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || primaryTrack.title;
    pushUnique({
      label: `Versi akustik ${cleanTitle}`,
      query: `${cleanTitle} akustik`,
      filter: 'songs',
      kind: 'track',
    });
    pushUnique({
      label: `Live ${cleanTitle}`,
      query: `${cleanTitle} live`,
      filter: 'videos',
      kind: 'track',
    });
  }

  // 3. Live catalog suggestions as next-step follow-up queries
  for (const s of suggestions) {
    const cleanS = s.trim();
    if (!cleanS || cleanS.toLowerCase() === lowerQuery) continue;
    pushUnique({
      label: cleanS,
      query: cleanS,
      filter: activeFilter === 'podcasts' || activeFilter === 'episodes' ? activeFilter : 'songs',
      kind: 'suggest',
    });
    if (out.length >= 10) break;
  }

  // 4. Safe discovery fallbacks if few follow-ups exist
  if (out.length < 4) {
    for (const fallback of ['Pop Indonesia', 'Musik Santai', 'Indie Indonesia', 'Lagu Hits Terbaru']) {
      pushUnique({
        label: fallback,
        query: fallback,
        filter: 'songs',
        kind: 'refine',
      });
    }
  }

  return out.slice(0, 10);
}

export type HomeCategoryFilter = 'all' | 'music' | 'podcast' | 'local';

export function filterHomeMediaItems<T extends Pick<MediaItem, 'type'>>(
  items: T[],
  category: HomeCategoryFilter,
): T[] {
  if (category === 'music') {
    return items.filter((item) => item.type !== 'podcast' && item.type !== 'episode');
  }
  if (category === 'podcast') {
    return items.filter((item) => item.type === 'podcast' || item.type === 'episode');
  }
  if (category === 'local') {
    return items.filter((item) => item.type === 'local');
  }
  return items;
}

export type DeepLinkTarget =
  | { kind: 'play'; videoId: string }
  | { kind: 'open'; itemType: 'album' | 'artist' | 'playlist' | 'podcast' | 'episode'; id: string };

const DEEP_LINK_OPEN_TYPES = new Set(['album', 'artist', 'playlist', 'podcast', 'episode']);

export function parseDeepLinkSearch(search: string): DeepLinkTarget | null {
  if (!search || typeof search !== 'string') return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const playId = normalizeRouteId(params.get('play'));
  if (playId) {
    return { kind: 'play', videoId: playId };
  }
  const openRaw = params.get('open')?.trim();
  if (!openRaw) return null;
  const sepIdx = openRaw.indexOf(':');
  if (sepIdx <= 0) return null;
  const itemType = openRaw.slice(0, sepIdx).trim().toLowerCase();
  const id = normalizeRouteId(openRaw.slice(sepIdx + 1));
  if (!id || !DEEP_LINK_OPEN_TYPES.has(itemType)) return null;
  return {
    kind: 'open',
    itemType: itemType as DeepLinkTarget & { kind: 'open' } extends { itemType: infer U } ? U : never,
    id,
  };
}

