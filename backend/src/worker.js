/* drain-com API: Cloudflare Worker + D1.
   Уникальность считается по CF-Connecting-IP (хеш, без сырого IP). */

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...(headers || {}) },
  });
}

function corsFor(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "https://alfor564.github.io")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(request) {
  const cf = request.headers.get("CF-Connecting-IP");
  if (cf) return cf;
  const fwd = request.headers.get("X-Forwarded-For");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

async function stats(env, hash) {
  const visits = await env.DB.prepare("SELECT COUNT(*) AS n FROM visitors").first();
  const likes = await env.DB.prepare("SELECT COUNT(*) AS n FROM votes WHERE vote = 'like'").first();
  const dislikes = await env.DB.prepare("SELECT COUNT(*) AS n FROM votes WHERE vote = 'dislike'").first();
  const mine = await env.DB.prepare("SELECT vote FROM votes WHERE ip_hash = ?").bind(hash).first();
  return {
    visits: Number(visits && visits.n) || 0,
    likes: Number(likes && likes.n) || 0,
    dislikes: Number(dislikes && dislikes.n) || 0,
    vote: mine && (mine.vote === "like" || mine.vote === "dislike") ? mine.vote : null,
  };
}

export default {
  async fetch(request, env) {
    const cors = corsFor(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      const url = new URL(request.url);
      const ip = clientIp(request);
      const hash = await sha256Hex(ip + "|" + (env.IP_SALT || "drain-com-local-salt"));

      if (url.pathname === "/visit" && request.method === "POST") {
        const now = Date.now();
        await env.DB.prepare(
          "INSERT INTO visitors (ip_hash, first_seen, last_seen) VALUES (?, ?, ?) " +
          "ON CONFLICT(ip_hash) DO UPDATE SET last_seen = excluded.last_seen"
        ).bind(hash, now, now).run();
        return json(await stats(env, hash), 200, cors);
      }

      if (url.pathname === "/vote" && request.method === "POST") {
        let body = null;
        try { body = await request.json(); } catch (_) {}
        const want = body && body.vote;
        if (want !== "like" && want !== "dislike") {
          return json({ error: "vote must be 'like' or 'dislike'" }, 400, cors);
        }

        const current = await env.DB.prepare("SELECT vote FROM votes WHERE ip_hash = ?").bind(hash).first();
        if (current && current.vote === want) {
          await env.DB.prepare("DELETE FROM votes WHERE ip_hash = ?").bind(hash).run();
        } else {
          await env.DB.prepare(
            "INSERT INTO votes (ip_hash, vote, updated_at) VALUES (?, ?, ?) " +
            "ON CONFLICT(ip_hash) DO UPDATE SET vote = excluded.vote, updated_at = excluded.updated_at"
          ).bind(hash, want, Date.now()).run();
        }
        return json(await stats(env, hash), 200, cors);
      }

      if (url.pathname === "/stats" && request.method === "GET") {
        return json(await stats(env, hash), 200, cors);
      }

      return json({ error: "not found" }, 404, cors);
    } catch (error) {
      return json({ error: "server error" }, 500, cors);
    }
  },
};
