const GOOGLE_FONTS_CSS = "https://fonts.googleapis.com/css2";
const FONT_FAMILY = "Noto Sans KR";
const FETCH_TIMEOUT_MS = 5000;
const MAX_CACHE_ENTRIES = 32;

const fontCache = new Map<string, ArrayBuffer | null>();

function cacheKey(weight: number, chars: string) {
  return `${weight}:${chars}`;
}

function rememberFont(key: string, data: ArrayBuffer | null) {
  if (fontCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = fontCache.keys().next().value;
    if (oldest !== undefined) fontCache.delete(oldest);
  }
  fontCache.set(key, data);
}

/** 렌더링에 실제로 쓰이는 글자만 남긴다. 서브셋이 작을수록 폰트 다운로드가 가볍다. */
export function uniqueChars(text: string) {
  return Array.from(new Set(Array.from(text))).sort().join("");
}

/**
 * Satori(next/og)의 기본 폰트에는 한글 글리프가 없어 한국어가 통째로 빈칸으로 나온다.
 * Google Fonts의 `text=` 서브셋 API로 필요한 글자만 truetype으로 받아온다.
 * (모던 User-Agent를 보내지 않아야 woff2가 아닌 truetype이 돌아온다.)
 */
export async function loadKoreanFont(weight: number, text: string): Promise<ArrayBuffer | null> {
  const chars = uniqueChars(text);
  if (!chars) return null;

  const key = cacheKey(weight, chars);
  if (fontCache.has(key)) return fontCache.get(key) ?? null;

  try {
    const cssUrl = `${GOOGLE_FONTS_CSS}?family=${encodeURIComponent(FONT_FAMILY)}:wght@${weight}&text=${encodeURIComponent(chars)}`;
    const cssResponse = await fetch(cssUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!cssResponse.ok) throw new Error(`font css HTTP ${cssResponse.status}`);

    const css = await cssResponse.text();
    const fontUrl = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!fontUrl) throw new Error("font url not found in css");

    const fontResponse = await fetch(fontUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!fontResponse.ok) throw new Error(`font HTTP ${fontResponse.status}`);

    const data = await fontResponse.arrayBuffer();
    rememberFont(key, data);
    return data;
  } catch (error) {
    console.error("[widget] Korean font load failed:", error);
    // 폰트를 못 받아도 이미지 자체는 렌더링한다(숫자/기호는 기본 폰트로 보인다).
    rememberFont(key, null);
    return null;
  }
}

export function resetFontCacheForTests() {
  fontCache.clear();
}
