// fetch-stocks.js — runs via GitHub Actions at 1am IST every night
// Fetches all Nifty 100 from Yahoo Finance (direct, no proxy needed on server)
// Saves to Supabase so all website visitors load instantly

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": "Bearer " + SUPABASE_KEY
};

const UNIVERSE = [
  ["RELIANCE","Reliance Industries","Energy"],["TCS","Tata Consultancy Services","IT"],
  ["HDFCBANK","HDFC Bank","Banking"],["ICICIBANK","ICICI Bank","Banking"],
  ["INFY","Infosys","IT"],["HINDUNILVR","Hindustan Unilever","FMCG"],
  ["ITC","ITC Ltd","FMCG"],["SBIN","State Bank of India","Banking"],
  ["BHARTIARTL","Bharti Airtel","Telecom"],["KOTAKBANK","Kotak Mahindra Bank","Banking"],
  ["LT","Larsen & Toubro","Infra"],["AXISBANK","Axis Bank","Banking"],
  ["BAJFINANCE","Bajaj Finance","NBFC"],["ASIANPAINT","Asian Paints","Consumer"],
  ["MARUTI","Maruti Suzuki","Auto"],["HCLTECH","HCL Technologies","IT"],
  ["SUNPHARMA","Sun Pharma","Pharma"],["TITAN","Titan Company","Consumer"],
  ["ULTRACEMCO","UltraTech Cement","Cement"],["WIPRO","Wipro","IT"],
  ["NESTLEIND","Nestle India","FMCG"],["ADANIENT","Adani Enterprises","Conglomerate"],
  ["ADANIPORTS","Adani Ports","Infra"],["ONGC","Oil & Natural Gas Corp","Energy"],
  ["NTPC","NTPC Ltd","Power"],["POWERGRID","Power Grid Corp","Power"],
  ["M&M","Mahindra & Mahindra","Auto"],["TATAMOTORS","Tata Motors","Auto"],
  ["TATASTEEL","Tata Steel","Metals"],["JSWSTEEL","JSW Steel","Metals"],
  ["BAJAJFINSV","Bajaj Finserv","NBFC"],["TECHM","Tech Mahindra","IT"],
  ["INDUSINDBK","IndusInd Bank","Banking"],["GRASIM","Grasim Industries","Cement"],
  ["HINDALCO","Hindalco Industries","Metals"],["DRREDDY","Dr Reddy's Labs","Pharma"],
  ["CIPLA","Cipla","Pharma"],["EICHERMOT","Eicher Motors","Auto"],
  ["BRITANNIA","Britannia Industries","FMCG"],["DIVISLAB","Divi's Laboratories","Pharma"],
  ["COALINDIA","Coal India","Mining"],["BPCL","Bharat Petroleum","Energy"],
  ["IOC","Indian Oil Corp","Energy"],["SBILIFE","SBI Life Insurance","Insurance"],
  ["HDFCLIFE","HDFC Life Insurance","Insurance"],["BAJAJ-AUTO","Bajaj Auto","Auto"],
  ["HEROMOTOCO","Hero MotoCorp","Auto"],["SHREECEM","Shree Cement","Cement"],
  ["UPL","UPL Ltd","Chemicals"],["APOLLOHOSP","Apollo Hospitals","Healthcare"],
  ["TATACONSUM","Tata Consumer Products","FMCG"],["GODREJCP","Godrej Consumer","FMCG"],
  ["DABUR","Dabur India","FMCG"],["PIDILITIND","Pidilite Industries","Chemicals"],
  ["MARICO","Marico Ltd","FMCG"],["COLPAL","Colgate-Palmolive India","FMCG"],
  ["BERGEPAINT","Berger Paints","Consumer"],["SIEMENS","Siemens Ltd","Capital Goods"],
  ["ABB","ABB India","Capital Goods"],["HAVELLS","Havells India","Consumer"],
  ["DLF","DLF Ltd","Realty"],["GODREJPROP","Godrej Properties","Realty"],
  ["OBEROIRLTY","Oberoi Realty","Realty"],["BANKBARODA","Bank of Baroda","Banking"],
  ["PNB","Punjab National Bank","Banking"],["CANBK","Canara Bank","Banking"],
  ["IDFCFIRSTB","IDFC First Bank","Banking"],["AUBANK","AU Small Finance Bank","Banking"],
  ["FEDERALBNK","Federal Bank","Banking"],["BANDHANBNK","Bandhan Bank","Banking"],
  ["CHOLAFIN","Cholamandalam Finance","NBFC"],["MUTHOOTFIN","Muthoot Finance","NBFC"],
  ["LICHSGFIN","LIC Housing Finance","NBFC"],["PFC","Power Finance Corp","NBFC"],
  ["RECLTD","REC Ltd","NBFC"],["IRFC","Indian Railway Finance Corp","NBFC"],
  ["INDIGO","InterGlobe Aviation","Aviation"],["ZOMATO","Zomato Ltd","Internet"],
  ["NYKAA","FSN E-Commerce (Nykaa)","Internet"],["PAYTM","One97 Communications","Internet"],
  ["POLICYBZR","PB Fintech","Internet"],["NAUKRI","Info Edge India","Internet"],
  ["TRENT","Trent Ltd","Retail"],["DMART","Avenue Supermarts","Retail"],
  ["JUBLFOOD","Jubilant FoodWorks","Consumer"],["PAGEIND","Page Industries","Consumer"],
  ["ABFRL","Aditya Birla Fashion","Retail"],["VOLTAS","Voltas Ltd","Consumer Durables"],
  ["BLUESTARCO","Blue Star Ltd","Consumer Durables"],["CROMPTON","Crompton Greaves","Consumer Durables"],
  ["WHIRLPOOL","Whirlpool India","Consumer Durables"],["ESCORTS","Escorts Kubota","Auto"],
  ["ASHOKLEY","Ashok Leyland","Auto"],["TVSMOTOR","TVS Motor Company","Auto"],
  ["BHARATFORG","Bharat Forge","Auto Ancillary"],["MOTHERSON","Samvardhana Motherson","Auto Ancillary"],
  ["EXIDEIND","Exide Industries","Auto Ancillary"],["SRF","SRF Ltd","Chemicals"],
  ["PIIND","PI Industries","Chemicals"],["AARTIIND","Aarti Industries","Chemicals"],
  ["DEEPAKNTR","Deepak Nitrite","Chemicals"],["NAVINFLUOR","Navin Fluorine","Chemicals"],
  ["GUJGASLTD","Gujarat Gas","Energy"],["PETRONET","Petronet LNG","Energy"],
  ["GAIL","GAIL India","Energy"],["ADANIGREEN","Adani Green Energy","Power"],
  ["TATAPOWER","Tata Power","Power"]
];

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function todayIST(){
  const now = new Date();
  const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  return ist.toISOString().slice(0, 10);
}

async function fetchCandles(symbol){
  const ySym = symbol.replace("&","-") + ".NS";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?range=1y&interval=1d`;
  try{
    const res = await fetch(url, {
      headers:{ "User-Agent":"Mozilla/5.0", "Accept":"application/json" },
      signal: AbortSignal.timeout(15000)
    });
    if(!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if(!result) throw new Error("No chart result");
    const ts = result.timestamp;
    const q  = result.indicators?.quote?.[0];
    const adj = result.indicators?.adjclose?.[0]?.adjclose;
    if(!ts || !q) throw new Error("Missing data");
    const candles = ts.map((t,i)=>({
      date:   new Date(t*1000).toISOString().slice(0,10),
      open:   q.open[i],
      high:   q.high[i],
      low:    q.low[i],
      close:  adj ? adj[i] : q.close[i],
      volume: q.volume[i]||0
    })).filter(c=> c.open!=null && c.close!=null && !isNaN(c.close) && c.close>0);
    if(candles.length < 20) throw new Error(`Only ${candles.length} candles`);
    console.log(`  ✓ ${symbol}: ${candles.length} candles`);
    return { candles, source:"live" };
  } catch(e){
    console.warn(`  ✗ ${symbol}: ${e.message}`);
    return { candles: null, source:"failed" };
  }
}

async function saveToSupabase(dateStr, stockData, liveCount){
  // Delete old data
  await fetch(`${SUPABASE_URL}/rest/v1/stock_cache?id=gte.0`, {
    method:"DELETE", headers: SB_HEADERS
  });
  // Save new data
  const res = await fetch(`${SUPABASE_URL}/rest/v1/stock_cache`, {
    method:"POST",
    headers:{ ...SB_HEADERS, "Prefer":"return=minimal" },
    body: JSON.stringify({ date: dateStr, data: stockData, live_count: liveCount })
  });
  if(!res.ok){
    const err = await res.text();
    throw new Error(`Supabase save failed: ${err}`);
  }
  console.log(`✅ Saved to Supabase — ${liveCount} live stocks`);
}

async function main(){
  console.log("=== Stock Signal — Nifty 100 Fetcher ===");
  console.log(`Date (IST): ${todayIST()}`);
  console.log(`Fetching ${UNIVERSE.length} stocks from Yahoo Finance NSE...\n`);

  const all = [];
  let liveCount = 0;

  // Fetch all in parallel batches of 10
  const BATCH = 10;
  for(let i=0; i<UNIVERSE.length; i+=BATCH){
    const batch = UNIVERSE.slice(i, i+BATCH);
    console.log(`\nBatch ${Math.floor(i/BATCH)+1}: ${batch.map(b=>b[0]).join(", ")}`);
    const results = await Promise.all(
      batch.map(async ([symbol, name, sector])=>{
        const { candles, source } = await fetchCandles(symbol);
        return { symbol, name, sector, candles, source };
      })
    );
    for(const r of results){
      if(r.candles){ all.push(r); liveCount++; }
    }
    if(i+BATCH < UNIVERSE.length) await sleep(2000); // small polite gap
  }

  console.log(`\n✅ Fetched ${liveCount}/${UNIVERSE.length} stocks successfully`);
  if(liveCount === 0){
    console.error("❌ No live stocks fetched — Yahoo may be blocking. Not saving to cache.");
    process.exit(1);
  }

  console.log("Saving to Supabase...");
  await saveToSupabase(todayIST(), all, liveCount);
  console.log("✅ All done! Visitors will load instantly all day.");
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
