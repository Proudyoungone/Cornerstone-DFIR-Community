// ---------------------------
// THEME
// ---------------------------
const htmlEl = document.documentElement;

function iconFor(theme){
  if(theme === "light"){
    return `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" stroke="currentColor" stroke-width="2"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
  }
  return `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M21 14.5A7.5 7.5 0 0 1 9.5 3a6.5 6.5 0 1 0 11.5 11.5Z"
        stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    </svg>`;
}

function setTheme(theme){
  htmlEl.setAttribute("data-theme", theme);
  localStorage.setItem("csdfir-theme", theme);

  const label = document.getElementById("themeLabel");
  const icon = document.getElementById("themeIcon");

  if(label) label.textContent = theme === "light" ? "Light" : "Dark";
  if(icon) icon.innerHTML = iconFor(theme);
}


function initTheme(){
  const stored = localStorage.getItem("csdfir-theme");
  setTheme(stored || "dark");
}

function initThemeToggle(){
  const btn = document.getElementById("themeToggle");
  if(!btn) return;

  btn.addEventListener("click", () => {
    const current = htmlEl.getAttribute("data-theme");
    setTheme(current === "dark" ? "light" : "dark");
  });
}

// ---------------------------
// UTIL
// ---------------------------
async function getJSON(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json();
}

function el(tag, attrs={}, children=[]){
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if(k === "class") node.className = v;
    else node.setAttribute(k,v);
  });
  children.forEach(c=>node.appendChild(typeof c==="string"?document.createTextNode(c):c));
  return node;
}

function fmtDate(iso){
  if(!iso) return "Rolling";
  return new Date(iso).toLocaleDateString();
}

function isPastDeadline(d){
  if(!d) return false;
  return new Date(d) < new Date();
}

// ---------------------------
// OPPORTUNITIES
// ---------------------------
// ---------------------------
// OPPORTUNITIES (search + sort + pills)
// ---------------------------
async function initOpportunities(){
  const grid = document.getElementById("opportunityGrid");
  if(!grid) return;

  const searchEl = document.getElementById("oppSearch");
  const sortEl = document.getElementById("oppSort");
  const pills = Array.from(document.querySelectorAll('.pill[data-filter]'));

  let data = [];
  let filter = "all";

  try{
    data = await getJSON("./data/opportunities.json");
  }catch(e){
    console.error(e);
    grid.innerHTML = `
      <div class="item">
        <h4>Opportunities failed to load</h4>
        <p class="meta">Check that <strong>/data/opportunities.json</strong> exists, is valid JSON, and you’re running a local server.</p>
      </div>`;
    return;
  }

  function matchesFilter(item){
    if(filter === "all") return true;
    return (item.filters || []).map(x => String(x).toLowerCase()).includes(filter);
  }

  function matchesSearch(item, q){
    if(!q) return true;
    const blob = [
      item.title, item.summary, item.type, item.focus,
      ...(item.vendor ? [item.vendor] : []),
      ...(item.tags || []),
      ...(item.filters || [])
    ].join(" ").toLowerCase();
    return blob.includes(q);
  }

  function sortItems(list){
    const mode = sortEl?.value || "deadline_asc";
    const copy = [...list];

    const deadlineKey = (x) => x.deadline ? String(x.deadline) : "";

    if(mode === "deadline_asc"){
      copy.sort((a,b) => {
        // open first, then soonest deadline, then title
        const ac = isPastDeadline(a.deadline);
        const bc = isPastDeadline(b.deadline);
        if(ac !== bc) return ac ? 1 : -1;

        const ad = deadlineKey(a) || "9999-12-31";
        const bd = deadlineKey(b) || "9999-12-31";
        const byDate = ad.localeCompare(bd);
        if(byDate !== 0) return byDate;

        return (a.title || "").localeCompare(b.title || "");
      });
    }else if(mode === "deadline_desc"){
      copy.sort((a,b) => {
        const ad = deadlineKey(a) || "0000-01-01";
        const bd = deadlineKey(b) || "0000-01-01";
        const byDate = bd.localeCompare(ad);
        if(byDate !== 0) return byDate;
        return (a.title || "").localeCompare(b.title || "");
      });
    }else if(mode === "title_asc"){
      copy.sort((a,b) => (a.title || "").localeCompare(b.title || ""));
    }

    return copy;
  }

  function card(item){
    const tagClass =
      item.type === "Scholarship" ? "purple" :
      item.type === "Grant" ? "green" :
      item.type === "CFP" ? "amber" : "";

    const closed = isPastDeadline(item.deadline);

    const links = el("div", {class:"links"}, (item.links || []).slice(0,3).map(l =>
      el("a", {class:"link", href:l.url, target:"_blank", rel:"noopener"}, [l.label])
    ));

    return el("article", {class:"item"}, [
      el("div", {class:"item-top"}, [
        el("h4", {}, [item.title || "Untitled"]),
        el("span", {class:`tag ${tagClass}`}, [item.type || "Opportunity"])
      ]),
      el("div", {class:"meta"}, [
        "Deadline: ",
        el("strong", {}, [item.deadline ? fmtDate(item.deadline) : "Rolling"]),
        ...(closed ? [" • ", el("strong", {}, ["CLOSED"])] : []),
        item.focus ? " • Focus: " : "",
        ...(item.focus ? [el("strong", {}, [item.focus])] : [])
      ]),
      item.summary ? el("p", {}, [item.summary]) : el("p", {}, [""]),
      links
    ]);
  }

  function render(){
    const q = (searchEl?.value || "").trim().toLowerCase();

    const filtered = sortItems(data)
      .filter(i => matchesFilter(i))
      .filter(i => matchesSearch(i, q));

    grid.innerHTML = "";

    if(filtered.length === 0){
      grid.appendChild(el("div", {class:"item"}, [
        el("h4", {}, ["No matches"]),
        el("p", {class:"meta"}, ["Try a different filter or search term."])
      ]));
      return;
    }

    filtered.forEach(i => grid.appendChild(card(i)));
  }

  pills.forEach(p => {
    p.addEventListener("click", () => {
      pills.forEach(x => x.classList.remove("active"));
      p.classList.add("active");
      filter = (p.getAttribute("data-filter") || "all").toLowerCase();
      render();
    });
  });

  searchEl?.addEventListener("input", render);
  sortEl?.addEventListener("change", render);

  render();
}


// ---------------------------
// CONFERENCES
// ---------------------------
async function initConferences(){
  const grid=document.getElementById("conferenceGrid");
  if(!grid) return;

  const data=await getJSON("./data/conferences.json");

  grid.innerHTML="";
  data.forEach(c=>{
    grid.appendChild(el("article",{class:"item"},[
      el("h4",{},[c.name]),
      el("p",{class:"meta"},[c.dateRange+" • "+c.location]),
      el("p",{},[c.notes||""]),
      el("a",{href:c.links?.[0]?.url,target:"_blank",class:"link"},["Event"])
    ]));
  });
}

// ---------------------------
// HTML ESCAPE (prevents crashes + keeps text safe)
// ---------------------------
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ---------------------------
// RESOURCES (sections + card grids, renders into #resourceGrid)
// ---------------------------
async function initResources(){
  const grid = document.getElementById("resourceGrid");
  if(!grid) return;

  const searchEl = document.getElementById("resSearch");
  const sortEl = document.getElementById("resSort");

  let data = [];
  try{
    data = await getJSON("./data/resources.json");
  }catch(e){
    console.error(e);
    grid.innerHTML = `
      <div class="item">
        <h4>Resources failed to load</h4>
        <p class="meta">Check that <strong>/data/resources.json</strong> exists and is valid JSON, and you are running a local server.</p>
      </div>`;
    return;
  }

  function blob(r){
    return [
      r.name, r.type, r.notes, r.category,
      ...(r.tags || [])
    ].join(" ").toLowerCase();
  }

  // Bucketing rules (edit any keywords you want)
  function bucketFor(r){
    const t = blob(r);

    if(t.includes("academy") || t.includes("training") || t.includes("certification") || t.includes("sans") || t.includes("giac") || t.includes("nw3c") || t.includes("ncfi") || t.includes("hexordia")){
      return "Training & Academies";
    }
    if(t.includes("imaging") || t.includes("acquire") || t.includes("ftk") || t.includes("guymager") || t.includes("triage")){
      return "Triage & Imaging";
    }
    if(t.includes("memory") || t.includes("volatility") || t.includes("ram")){
      return "Memory Forensics";
    }
    if(t.includes("mobile") || t.includes("ios") || t.includes("android") || t.includes("ileapp") || t.includes("aleapp") || t.includes("ufade") || t.includes("alex")){
      return "Mobile & Device Forensics";
    }
    if(t.includes("windows") || t.includes("kape") || t.includes("registry") || t.includes("endpoint") || t.includes("zimmerman")){
      return "Windows / Endpoint";
    }
    if(t.includes("macos") || t.includes("mac_apt") || t.includes("osx") || t.includes("apple")){
      return "macOS";
    }
    if(t.includes("network") || t.includes("pcap") || t.includes("wireshark") || t.includes("zeek") || t.includes("suricata")){
      return "Network Forensics";
    }
    if(t.includes("community") || t.includes("advocacy") || t.includes("wicys") || t.includes("cyversity") || t.includes("mentorship")){
      return "Communities & Advocacy";
    }
    if(t.includes("university") || t.includes("college") || t.includes("bachelor") || t.includes("master") || t.includes("degree")){
      return "School Programs";
    }
    return "DFIR Sites & Research";
  }

  const sectionOrder = [
    "Triage & Imaging",
    "Memory Forensics",
    "Mobile & Device Forensics",
    "Windows / Endpoint",
    "macOS",
    "Network Forensics",
    "Training & Academies",
    "DFIR Sites & Research",
    "Communities & Advocacy",
    "School Programs"
  ];

  const sectionSub = {
    "Triage & Imaging": "Disk imaging, quick triage, and evidence acquisition.",
    "Memory Forensics": "RAM acquisition and deep analysis of live system artifacts.",
    "Mobile & Device Forensics": "iOS, Android, unified logs / backups, and mobile artifact parsers.",
    "Windows / Endpoint": "Endpoint artifact collection, triage, and Windows analysis.",
    "macOS": "macOS artifact parsing and Apple-focused DFIR resources.",
    "Network Forensics": "PCAP analysis, network telemetry, and intrusion visibility.",
    "Training & Academies": "Courses, academies, certifications, and structured learning paths.",
    "DFIR Sites & Research": "Reports, standards, writeups, and learning hubs.",
    "Communities & Advocacy": "Peer support, mentoring, and professional groups.",
    "School Programs": "Bachelor’s and Master’s programs related to DFIR/cyber."
  };

  function cardHTML(r){
    const links = (r.links || []).slice(0, 2).map(l =>
      `<a class="link" href="${l.url}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`
    ).join("");

    const tags = (r.tags || []).slice(0, 4).map(t =>
      `<span class="tag">${escapeHtml(t)}</span>`
    ).join("");

    return `
      <article class="item">
        <div class="item-top">
          <h4>${escapeHtml(r.name || "Resource")}</h4>
          <span class="tag purple">${escapeHtml(r.type || "Resource")}</span>
        </div>
        <p class="meta" style="margin-top:0;">${escapeHtml(r.notes || "")}</p>
        <div class="links" style="margin-top:10px;">${links}</div>
        <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">${tags}</div>
      </article>
    `;
  }

  function apply(){
    const q = (searchEl?.value || "").trim().toLowerCase();
    const sort = sortEl?.value || "name_asc";

    let items = [...data];

    // Search filter
    if(q){
      items = items.filter(r => blob(r).includes(q));
    }

    // Sort
    items.sort((a,b)=>{
      if(sort === "name_desc") return (b.name||"").localeCompare(a.name||"");
      if(sort === "category_asc") return (a.category||"").localeCompare(b.category||"") || (a.name||"").localeCompare(b.name||"");
      return (a.name||"").localeCompare(b.name||"");
    });

    // Bucket
    const buckets = {};
    sectionOrder.forEach(s => buckets[s] = []);
    items.forEach(r => {
      const s = bucketFor(r);
      (buckets[s] ||= []).push(r);
    });

    // Render sections into the SAME grid container
    const out = sectionOrder.map(title => {
      const list = buckets[title] || [];
      if(list.length === 0) return ""; // hide empty sections during searches

      return `
        <section class="res-section">
          <div class="res-section-head">
            <div>
              <h3 class="res-h3">${escapeHtml(title)}</h3>
              <p class="meta res-sub">${escapeHtml(sectionSub[title] || "")}</p>
            </div>
            <div class="meta">${list.length} item${list.length===1?"":"s"}</div>
          </div>

          <div class="res-grid">
            ${list.map(cardHTML).join("")}
          </div>
        </section>
      `;
    }).join("");

    grid.innerHTML = out || `
      <div class="item">
        <h4>No results</h4>
        <p class="meta">Try clearing your search.</p>
      </div>`;
  }

  searchEl?.addEventListener("input", apply);
  sortEl?.addEventListener("change", apply);

  apply();
}

// ---------------------------
// DAILY QUOTE + RIDDLE (uses your existing IDs)
// ---------------------------
function utcDayIndex(){
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

// QUOTE: expects #qotdText and optional #qotdAuthor
async function initDailyQuote(){
  const textEl = document.getElementById("qotdText");
  const authorEl = document.getElementById("qotdAuthor");
  if(!textEl) return; // not on this page

  try{
    const quotes = await getJSON("./data/quotes.json");
    if(!Array.isArray(quotes) || quotes.length === 0) throw new Error("quotes.json is empty or not an array");

    const q = quotes[utcDayIndex() % quotes.length];

    if(typeof q === "string"){
      textEl.textContent = q;
      if(authorEl) authorEl.textContent = "";
    }else{
      textEl.textContent = q.text || "";
      if(authorEl) authorEl.textContent = q.author ? `— ${q.author}` : "";
    }
  }catch(e){
    console.error("Quote load failed:", e);
    textEl.textContent = "Quote failed to load. (Check /data/quotes.json and run a local server.)";
    if(authorEl) authorEl.textContent = "";
  }
}

// RIDDLE: uses #rotdPrompt, #revealRiddleBtn, #newRiddleBtn, and #rotdAnswer (creates if missing)
async function initDailyRiddle(){
  const promptEl = document.getElementById("rotdPrompt");
  const revealBtn = document.getElementById("revealRiddleBtn");
  const shuffleBtn = document.getElementById("newRiddleBtn");
  if(!promptEl) return; // not on this page

  // Ensure we have an answer element to control
  let answerEl = document.getElementById("rotdAnswer");
  if(!answerEl){
    answerEl = document.createElement("p");
    answerEl.id = "rotdAnswer";
    answerEl.className = "fine";
    answerEl.hidden = true;
    answerEl.style.margin = "8px 0 0";
    promptEl.insertAdjacentElement("afterend", answerEl);
  }

  let riddles = [];
  try{
    riddles = await getJSON("./data/riddles.json");
    if(!Array.isArray(riddles) || riddles.length === 0) throw new Error("riddles.json is empty or not an array");
  }catch(e){
    console.error("Riddle load failed:", e);
    promptEl.textContent = "Riddle failed to load. (Check /data/riddles.json and run a local server.)";
    answerEl.hidden = true;
    return;
  }

  function normalize(r){
    // supports: "string" OR {question,answer}
    if(typeof r === "string") return { question: r, answer: "" };
    return { question: r.question || "", answer: r.answer || "" };
  }

  function setRiddleByIndex(i){
    const r = normalize(riddles[i % riddles.length]);
    promptEl.textContent = r.question || "—";
    answerEl.textContent = r.answer || "";
    answerEl.hidden = true;
    if(revealBtn) revealBtn.setAttribute("aria-expanded", "false");
  }

  const dailyIndex = utcDayIndex() % riddles.length;
  setRiddleByIndex(dailyIndex);

  revealBtn?.addEventListener("click", () => {
    const r = normalize(riddles[dailyIndex]);
    if(!r.answer){
      // If there is no answer in your JSON, still toggle the area so it feels responsive
      answerEl.textContent = "No answer provided for this riddle yet.";
    } else {
      answerEl.textContent = r.answer;
    }
    answerEl.hidden = !answerEl.hidden;
    revealBtn.setAttribute("aria-expanded", answerEl.hidden ? "false" : "true");
    revealBtn.textContent = answerEl.hidden ? "Reveal answer" : "Hide answer";
  });

  shuffleBtn?.addEventListener("click", () => {
    const rand = Math.floor(Math.random() * riddles.length);
    setRiddleByIndex(rand);
    if(revealBtn) revealBtn.textContent = "Reveal answer";
  });
}

// ---------------------------
// INIT
// ---------------------------
document.addEventListener("DOMContentLoaded",()=>{
  initTheme();
  initThemeToggle();

  initOpportunities();
  initConferences();
  initResources();

  initDailyQuote();
  initDailyRiddle();
});
