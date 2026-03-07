export interface XLikeTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  author_name?: string;
  author_username?: string;
  like_count?: number;
  retweet_count?: number;
  reply_count?: number;
  quote_count?: number;
}

interface XApiTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
  };
}

interface XApiUser {
  id: string;
  name?: string;
  username?: string;
}

interface XApiResponse {
  data?: XApiTweet[];
  includes?: {
    users?: XApiUser[];
  };
  title?: string;
  detail?: string;
  type?: string;
}

function resolveAuthToken() {
  return (
    process.env.X_BEARER_TOKEN ||
    process.env.X_ACCESS_TOKEN ||
    ""
  );
}

export async function fetchLikedTweets(limit = 20): Promise<XLikeTweet[]> {
  const userId = process.env.X_USER_ID;
  const token = resolveAuthToken();

  if (!userId) throw new Error("X_USER_ID is required");
  if (!token) throw new Error("X_BEARER_TOKEN or X_ACCESS_TOKEN is required");

  const maxResults = Math.max(5, Math.min(limit, 100));
  const url = new URL(`https://api.x.com/2/users/${userId}/liked_tweets`);
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("tweet.fields", "created_at,author_id,public_metrics");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "name,username");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as XApiResponse;

  if (!res.ok) {
    const detail = json?.detail ? ` - ${json.detail}` : "";
    throw new Error(`X API error ${res.status}${detail}`);
  }

  const users = new Map<string, XApiUser>();
  for (const u of json.includes?.users ?? []) users.set(u.id, u);

  return (json.data ?? []).map((t) => {
    const author = t.author_id ? users.get(t.author_id) : undefined;
    return {
      id: t.id,
      text: t.text,
      created_at: t.created_at,
      author_id: t.author_id,
      author_name: author?.name,
      author_username: author?.username,
      like_count: t.public_metrics?.like_count,
      retweet_count: t.public_metrics?.retweet_count,
      reply_count: t.public_metrics?.reply_count,
      quote_count: t.public_metrics?.quote_count,
    };
  });
}

export function buildFallbackDigest(tweets: XLikeTweet[]) {
  if (tweets.length === 0) {
    return {
      summary: "최근 좋아요한 게시물이 없어요.",
      bullets: ["오늘은 좋아요 데이터가 없어서 요약을 만들지 않았어요."],
    };
  }

  const sorted = [...tweets].sort((a, b) => {
    const av = (a.like_count ?? 0) + (a.retweet_count ?? 0) * 2;
    const bv = (b.like_count ?? 0) + (b.retweet_count ?? 0) * 2;
    return bv - av;
  });

  const bullets = sorted.slice(0, 5).map((t, idx) => {
    const short = t.text.replace(/\s+/g, " ").slice(0, 90);
    const author = t.author_username ? `@${t.author_username}` : "unknown";
    return `${idx + 1}. ${author}: ${short}${t.text.length > 90 ? "…" : ""}`;
  });

  return {
    summary: `최근 좋아요 ${tweets.length}개를 기준으로 핵심 게시물 ${Math.min(5, tweets.length)}개를 정리했어요.`,
    bullets,
  };
}
