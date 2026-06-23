// fetch-news.js — runs via GitHub Actions at 1am IST every night
// Fetches all news categories + top Nifty stocks from Marketaux API
// Saves to Supabase so website visitors never hit the daily API limit

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY; // your Marketaux token

const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": "Bearer " + SUPABASE_KEY
};

// ── News categories (must match your index.html exactly) ──────────────────────
const NEWS_CATEGORIES = [
  { key:"market",   search:"stock market OR sensex OR nifty OR shares",          countries:"in" },
  { key:"business", search:"business OR corporate OR earnings OR IPO",            countries:"in" },
  { key:"finance",  search:"finance OR banking OR RBI OR economy OR inflation",   countries:"in" },
  { key:"politics", search:"politics OR government OR election OR parliament",     countries:"in" },
  { key:"world",    search:"war OR conflict OR geopolitics OR sanctions",          countries:null  },
];

// Top stocks to pre-warm (most-searched, most clicked)
// These get their own news cache entries so StockNewsStrip loads instantly
const STOCK_NEWS_SYMBOLS = [
  "RELIANCE","TCS","HDFCBANK","ICICIBANK","INFY","BHARTIARTL",
  "SBIN","AXISBANK","BAJFINANCE","KOTAKBANK","LT","WIPRO",
  "HCLTECH","TATAMOTORS","ZOMATO","ADANIENT","SUNPHARMA","MARUTI"
];

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function todayIST(){
  const now = new Date();
  const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  return ist.toISOString().slice(0, 10);
}

// ── Marketaux fetch ───────────────────────────────────────────────────────────
async function fetchFromMarketaux(paramsStr){
  const url = `https://api.marketaux.com/v1/news/all?${paramsStr}&language=en&api_token=${NEWS_API_KEY}&limit=9`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(15000)
    });
    if(!res.ok){
      const body = await res.text().catch(()=>"");
      throw new Error(`HTTP ${res.status}: ${body.slice(0,120)}`);
    }
    const json = await res.json();
    if(json.error){
      throw new Error(`Marketaux error: ${json.error.message || JSON.stringify(json.error)}`);
    }
    return json.data || [];
  } catch(e){
    throw e;
  }
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function sbDeleteNewsForKey(date, key){
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/news_cache?date=eq.${date}&key=eq.${encodeURIComponent(key)}`,
    { method:"DELETE", headers: SB_HEADERS }
  );
  if(!res.ok) console.warn(`  [Supabase] Delete warning for ${key}: HTTP ${res.status}`);
}

async function sbInsertNews(date, key, articles){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/news_cache`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ date, key, data: articles })
  });
  if(!res.ok){
    const err = await res.text().catch(()=>"");
    throw new Error(`Supabase insert failed for ${key}: HTTP ${res.status} — ${err.slice(0,200)}`);
  }
}

async function saveNewsToSupabase(date, key, articles){
  await sbDeleteNewsForKey(date, key);
  await sbInsertNews(date, key, articles);
}

// ── Delete all yesterday's news rows ─────────────────────────────────────────
async function purgeOldNewsCache(todayStr){
  try {
    // Delete any rows not from today
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/news_cache?date=neq.${todayStr}`,
      { method:"DELETE", headers: SB_HEADERS }
    );
    if(res.ok) console.log("  🗑️  Purged old news cache rows");
  } catch(e){
    console.warn("  Purge warning:", e.message);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(){
  const today = todayIST();
  let totalSaved = 0;
  let totalFailed = 0;

  console.log("=== Stock Signal — News Fetcher ===");
  console.log(`Date (IST): ${today}`);
  console.log(`Marketaux key: ${NEWS_API_KEY ? NEWS_API_KEY.slice(0,6)+"…" : "❌ MISSING"}\n`);

  if(!NEWS_API_KEY){ console.error("❌ NEWS_API_KEY not set. Exiting."); process.exit(1); }
  if(!SUPABASE_URL){ console.error("❌ SUPABASE_URL not set. Exiting."); process.exit(1); }
  if(!SUPABASE_KEY){ console.error("❌ SUPABASE_KEY not set. Exiting."); process.exit(1); }

  // 1. Purge yesterday's cache
  await purgeOldNewsCache(today);

  // 2. Fetch & save each news category
  console.log(`\n── Category News (${NEWS_CATEGORIES.length} categories) ──`);
  for(const cat of NEWS_CATEGORIES){
    process.stdout.write(`  Fetching "${cat.key}"… `);
    try {
      let params = `search=${encodeURIComponent(cat.search)}`;
      if(cat.countries) params += `&countries=${cat.countries}`;
      const articles = await fetchFromMarketaux(params);
      if(articles.length === 0){
        console.log(`⚠️  0 articles returned`);
        totalFailed++;
      } else {
        await saveNewsToSupabase(today, cat.key, articles);
        console.log(`✓ ${articles.length} articles saved`);
        totalSaved++;
      }
    } catch(e){
      console.log(`✗ ${e.message}`);
      totalFailed++;
    }
    // Polite gap between requests — Marketaux rate-limits aggressively
    await sleep(1500);
  }

  // 3. Fetch & save stock-specific news
  console.log(`\n── Stock News (${STOCK_NEWS_SYMBOLS.length} symbols) ──`);
  for(const symbol of STOCK_NEWS_SYMBOLS){
    process.stdout.write(`  Fetching "${symbol}"… `);
    try {
      const params = `symbols=${encodeURIComponent(symbol + ".NSE")}&filter_entities=true`;
      const articles = await fetchFromMarketaux(params);
      if(articles.length === 0){
        console.log(`⚠️  0 articles`);
        // Don't count as failure — some stocks just have no recent news
      } else {
        await saveNewsToSupabase(today, `stock_${symbol}`, articles);
        console.log(`✓ ${articles.length} articles saved`);
        totalSaved++;
      }
    } catch(e){
      console.log(`✗ ${e.message}`);
      totalFailed++;
    }
    await sleep(1500);
  }

  // 4. Summary
  console.log(`\n${"─".repeat(40)}`);
  console.log(`✅ Done — ${totalSaved} keys saved, ${totalFailed} failed`);
  if(totalFailed > 0 && totalSaved === 0){
    console.error("❌ All fetches failed — check your Marketaux API key and quota.");
    process.exit(1);
  }
  console.log("Visitors will get instant cached news all day until next 1 AM IST run.");
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
