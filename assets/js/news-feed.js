/* Cornerstone DFIR - News Feed
   - Designed for static hosting (GitHub Pages)
   - Tries RSS->JSON bridge first (rss2json), then falls back to
     AllOrigins + local XML parsing to avoid CORS/rate-limit issues.
*/

const FEEDS = [
  {
    id: "forensicfocus",
    name: "Forensic Focus",
    url: "https://www.forensicfocus.com/feed/",
    homepage: "https://www.forensicfocus.com/",
    icon: "🧠",
    enabled: true,
  },
  {
    id: "hexordia",
    name: "Hexordia Blog",
    url: "https://www.hexordia.com/blog?format=rss",
    homepage: "https://www.hexordia.com/blog/",
    icon: "🔐",
    enabled: true,
  },

  // Add more feeds like this:
  // {
  //   id: "sansdfir",
  //   name: "SANS Internet Storm Center",
  //   url: "https://isc.sans.edu/rssfeed.xml",
  //   homepage: "https://isc.sans.edu/",
  //   icon: "🛰️",
  //   enabled: true,
  // },
];

// ---- Bridges / proxies ----
const RSS2JSON = (rssUrl) =>
  `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;

const ALLORIGINS_RAW = (url) =>
  `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

// ---- App bootstrap ----
window.addEventListener("DOMContentLoaded", () => {
  const els = getEls();

  // If the page doesn't have the required nodes, show an obvious error and stop.
  const missing = Object.entries(els)
    .filter(([, el]) => !el)
    .map(([k]) => k);

  if (missing.length) {
    console.error("News feed: missing required elements:", missing);
    // Best effort: show message somewhere if possible
    const fallback = document.getElementById("newsGrid") || document.body;
    fallback.innerHTML = `
      <div class="card subtle" style="margin:16px;">
        <h3>News page markup mismatch</h3>
        <p class="muted">Missing required elements: <code>${escapeHtml(missing.join(", "))}</code></p>
        <p class="muted">Make sure <code>news.html</code> contains IDs:
          <code>newsGrid</code>, <code>newsSearch</code>, <code>refreshNewsBtn</code>,
          <code>sourceFilter</code>, <code>year</code>.
        </p>
      </div>
    `;
    return;
  }

  // Set year (safe)
  els.year.textContent = new Date().getFullYear();

  // State
  let allItems = [];
  let activeSource = "all";
  let searchTerm = "";

  // Build filter options
  FEEDS.filter((f) => f.enabled).forEach((feed) => {
    const opt = document.createElement("option");
    opt.value = feed.id;
    opt.textContent = feed.name;
    els.filter.appendChild(opt);
  });

  // Events
  els.filter.addEventListener("change", () => {
    activeSource = els.filter.value;
    render();
  });

  els.search.addEventListener("input", () => {
    searchTerm = (els.search.value || "").trim().toLowerCase();
    render();
  });

  els.refresh.addEventListener("click", () => loadAllFeeds());

  // Initial load
  loadAllFeeds();

  // ---- Functions ----
  async function loadAllFeeds() {
    setLoading(true);

    const enabled = FEEDS.filter((f) => f.enabled);
    const results = await Promise.allSettled(enabled.map(loadFeedSafe));

    const items = [];
    results.forEach((r, idx) => {
      const feed = enabled[idx];
      if (r.status === "fulfilled") {
        items.push(...r.value);
      } else {
        console.warn(`Feed failed: ${feed.name}`, r.reason);
        items.push({
          _isError: true,
          sourceId: feed.id,
          sourceName: feed.name,
          sourceIcon: feed.icon || "📰",
          homepage: feed.homepage,
          title: `Couldn’t load ${feed.name}`,
          description:
            "This feed may be rate-limited, blocked by a proxy, or temporarily unavailable.",
          pubDate: null,
          link: feed.homepage,
        });
      }
    });

    // Sort newest first (items without dates go last)
    items.sort((a, b) => {
      const da = a.pubDate ? Date.parse(a.pubDate) : -Infinity;
      const db = b.pubDate ? Date.parse(b.pubDate) : -Infinity;
      return db - da;
    });

    allItems = items;
    setLoading(false);
    render();
  }

  async function loadFeedSafe(feed) {
    // Try rss2json first
    try {
      return await loadViaRss2Json(feed);
    } catch (e1) {
      console.warn(`rss2json failed for ${feed.name}:`, e1);
      // Fallback: AllOrigins + parse RSS/Atom ourselves
      return await loadViaAllOrigins(feed);
    }
  }

  async function loadViaRss2Json(feed) {
    const res = await fetch(RSS2JSON(feed.url), { cache: "no-store" });
    if (!res.ok) throw new Error(`rss2json HTTP ${res.status}`);

    const data = await res.json();
    if (!data || data.status !== "ok" || !Array.isArray(data.items)) {
      throw new Error("Bad rss2json response");
    }

    return data.items.slice(0, 12).map((item) => ({
      sourceId: feed.id,
      sourceName: feed.name,
      sourceIcon: feed.icon || "📰",
      homepage: feed.homepage,
      title: item.title || "Untitled",
      description: stripHtml(item.description || item.content || ""),
      pubDate: item.pubDate || item.published || null,
      link: item.link || feed.homepage,
    }));
  }

  async function loadViaAllOrigins(feed) {
    const res = await fetch(ALLORIGINS_RAW(feed.url), { cache: "no-store" });
    if (!res.ok) throw new Error(`AllOrigins HTTP ${res.status}`);

    const xmlText = await res.text();
    return parseRssOrAtomXml(xmlText, feed).slice(0, 12);
  }

  function parseRssOrAtomXml(xmlText, feed) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");

    // If parsing failed, some browsers include <parsererror>
    if (doc.getElementsByTagName("parsererror").length) {
      throw new Error("XML parse error");
    }

    // RSS items
    const rssItems = Array.from(doc.getElementsByTagName("item"));
    if (rssItems.length) {
      return rssItems.map((n) => ({
        sourceId: feed.id,
        sourceName: feed.name,
        sourceIcon: feed.icon || "📰",
        homepage: feed.homepage,
        title: textFromNode(n, "title") || "Untitled",
        description: stripHtml(
          textFromNode(n, "description") ||
            textFromNode(n, "content:encoded") ||
            ""
        ),
        pubDate: textFromNode(n, "pubDate") || null,
        link: textFromNode(n, "link") || feed.homepage,
      }));
    }

    // Atom entries
    const atomEntries = Array.from(doc.getElementsByTagName("entry"));
    if (atomEntries.length) {
      return atomEntries.map((n) => {
        const linkEl = n.getElementsByTagName("link")[0];
        const href = linkEl?.getAttribute("href") || "";
        return {
          sourceId: feed.id,
          sourceName: feed.name,
          sourceIcon: feed.icon || "📰",
          homepage: feed.homepage,
          title: textFromNode(n, "title") || "Untitled",
          description: stripHtml(
            textFromNode(n, "summary") || textFromNode(n, "content") || ""
          ),
          pubDate: textFromNode(n, "published") || textFromNode(n, "updated") || null,
          link: href || feed.homepage,
        };
      });
    }

    throw new Error("No RSS/Atom items found");
  }

  function render() {
    const filtered = allItems.filter((item) => {
      if (activeSource !== "all" && item.sourceId !== activeSource) return false;
      if (!searchTerm) return true;
      const hay = `${item.title} ${item.description} ${item.sourceName}`.toLowerCase();
      return hay.includes(searchTerm);
    });

    if (!filtered.length) {
      els.grid.innerHTML = `
        <div class="card subtle">
          <h3>No matches</h3>
          <p class="muted">Try a different search term or switch sources.</p>
        </div>
      `;
      return;
    }

    els.grid.innerHTML = filtered.map(renderCard).join("");
  }

  function renderCard(item) {
    const dateText = item.pubDate
      ? new Date(item.pubDate).toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

    const safeDesc = escapeHtml(item.description || "");
    const safeTitle = escapeHtml(item.title || "");

    return `
      <article class="card news-card">
        <div class="news-card-head">
          <div class="news-source">
            <span class="news-icon" aria-hidden="true">${item.sourceIcon}</span>
            <a class="news-source-link" href="${item.homepage}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(item.sourceName)}
            </a>
          </div>
          <div class="news-date">${escapeHtml(dateText)}</div>
        </div>

        <h3 class="news-title">
          <a href="${item.link}" target="_blank" rel="noopener noreferrer">${safeTitle}</a>
        </h3>

        <p class="news-desc">${safeDesc || ""}</p>

        <div class="news-footer">
          <a class="btn small" href="${item.link}" target="_blank" rel="noopener noreferrer">Open</a>
        </div>
      </article>
    `;
  }

  function setLoading(isLoading) {
    if (isLoading) {
      els.grid.innerHTML = `
        <div class="card subtle">
          <h3>Loading feeds…</h3>
          <p class="muted">Fetching the latest headlines.</p>
        </div>
      `;
    }
  }
});

// ---- DOM helpers ----
function getEls() {
  return {
    grid: document.getElementById("newsGrid"),
    search: document.getElementById("newsSearch"),
    refresh: document.getElementById("refreshNewsBtn"),
    filter: document.getElementById("sourceFilter"),
    year: document.getElementById("year"),
  };
}

function textFromNode(node, tagName) {
  // getElementsByTagName doesn't like colons sometimes, but usually works.
  // We'll try both direct and by local-name fallback.
  let el = node.getElementsByTagName(tagName)[0];
  if (!el && tagName.includes(":")) {
    const local = tagName.split(":").pop();
    el = Array.from(node.getElementsByTagName("*")).find(
      (x) => x.localName === local
    );
  }
  return el ? (el.textContent || "").trim() : "";
}

// ---- Sanitizers ----
function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
