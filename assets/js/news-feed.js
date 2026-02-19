/* Cornerstone DFIR - News Feed
   - Designed for static hosting (GitHub Pages)
   - Uses an RSS->JSON bridge endpoint to avoid CORS issues
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
  //   name: "SANS DFIR",
  //   url: "https://isc.sans.edu/rssfeed.xml",
  //   homepage: "https://isc.sans.edu/",
  //   icon: "🛰️",
  //   enabled: true,
  // },
];

// RSS->JSON bridge
// Note: This is a third-party service. If you want *zero dependency*,
// use a GitHub Action later to generate a local JSON file instead.
const RSS2JSON = (rssUrl) =>
  `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;

const els = {
  grid: document.getElementById("newsGrid"),
  search: document.getElementById("newsSearch"),
  refresh: document.getElementById("refreshNewsBtn"),
  filter: document.getElementById("sourceFilter"),
};

document.getElementById("year").textContent = new Date().getFullYear();

let allItems = []; // normalized items
let activeSource = "all";
let searchTerm = "";

init();

function init() {
  // Build filter options
  FEEDS.filter(f => f.enabled).forEach(feed => {
    const opt = document.createElement("option");
    opt.value = feed.id;
    opt.textContent = feed.name;
    els.filter.appendChild(opt);
  });

  els.filter.addEventListener("change", () => {
    activeSource = els.filter.value;
    render();
  });

  els.search.addEventListener("input", () => {
    searchTerm = (els.search.value || "").trim().toLowerCase();
    render();
  });

  els.refresh.addEventListener("click", () => loadAllFeeds());

  loadAllFeeds();
}

async function loadAllFeeds() {
  setLoading(true);

  const enabled = FEEDS.filter(f => f.enabled);
  const results = await Promise.allSettled(enabled.map(loadFeed));

  const items = [];
  results.forEach((r, idx) => {
    const feed = enabled[idx];
    if (r.status === "fulfilled") {
      items.push(...r.value);
    } else {
      items.push({
        _isError: true,
        sourceId: feed.id,
        sourceName: feed.name,
        sourceIcon: feed.icon || "📰",
        homepage: feed.homepage,
        title: `Couldn’t load ${feed.name} right now`,
        description: "This feed may be rate-limited or temporarily unavailable.",
        pubDate: null,
        link: feed.homepage,
      });
    }
  });

  // Sort newest first (items without dates go last)
  items.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : -Infinity;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : -Infinity;
    return db - da;
  });

  allItems = items;
  setLoading(false);
  render();
}

async function loadFeed(feed) {
  const res = await fetch(RSS2JSON(feed.url), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  if (!data || data.status !== "ok" || !Array.isArray(data.items)) {
    throw new Error("Bad RSS2JSON response");
  }

  // Normalize
  return data.items.slice(0, 12).map(item => ({
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

function render() {
  const filtered = allItems.filter(item => {
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

