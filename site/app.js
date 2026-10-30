// ============================================================
// NBA ŁAMAKI — logika aplikacji
// ============================================================
const RAW = JSON.parse(window.__NBA_RAW);
const ALL_GAMES = RAW.games.slice().sort((a, b) => a.date_iso.localeCompare(b.date_iso));
const TEAMS = RAW.teams;
const SEASONS = [...new Set([...RAW.games.map(g => g.season), '2026-27'])].sort();
(function fillSeasonSelect() { const sel = document.getElementById('global-season'); sel.innerHTML = '<option value="all">Wszystkie sezony (' + SEASONS.filter(s => s !== '2026-27').length + ')</option>' + SEASONS.slice().reverse().map(x => `<option value="${x}">${x}</option>`).join(''); })();

const isLamak = c => c === '1/2' || c === '2/1' || c === 'X';
const LABELS = { '1/2': '1/2', '2/1': '2/1', 'X': 'X', 'brak_lamaka': '—', 'remis_do_przerwy_bez_OT': '—' };
function badgeClass(cls) { return cls === '1/2' ? 'badge-12' : cls === '2/1' ? 'badge-21' : cls === 'X' ? 'badge-x' : 'badge-none'; }
function rowClass(cls) { return cls === '1/2' ? 'row-c12' : cls === '2/1' ? 'row-c21' : cls === 'X' ? 'row-cx' : 'row-cnone'; }
function pct(n, d) { return d ? (100 * n / d) : 0; }
function fmtPct(n, d, dec = 1) { return d ? (100 * n / d).toFixed(dec) + '%' : '—'; }
function fmtDate(iso) { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; }

// ---------- Filtr sezonu (globalny) ----------
let GLOBAL_SEASON = 'all';
function GAMES() {
  return GLOBAL_SEASON === 'all' ? ALL_GAMES : ALL_GAMES.filter(g => g.season === GLOBAL_SEASON);
}
function REGULAR_GAMES() { return GAMES().filter(g => g.stage === 'regular'); }

// ---------- Flatten do perspektywy drużyn (2 wiersze na mecz), przeliczane po zmianie sezonu ----------
let TEAM_ROWS = [];
function rebuildTeamRows() {
  TEAM_ROWS = [];
  GAMES().forEach(g => {
    TEAM_ROWS.push({ game: g, team: g.home_team, opp: g.away_team, ctx: g.home_ctx, oppCtx: g.away_ctx, isHome: true });
    TEAM_ROWS.push({ game: g, team: g.away_team, opp: g.home_team, ctx: g.away_ctx, oppCtx: g.home_ctx, isHome: false });
  });
  const byTeam = {};
  TEAM_ROWS.forEach(r => { (byTeam[r.team] = byTeam[r.team] || []).push(r); });
  Object.values(byTeam).forEach(rows => {
    rows.sort((a, b) => a.game.date_iso.localeCompare(b.game.date_iso));
    let prevOT = false, prevLost20 = false, prevWon20 = false, prevSeason = null;
    rows.forEach(r => {
      if (r.game.season !== prevSeason) { prevOT = false; prevLost20 = false; prevWon20 = false; }
      prevSeason = r.game.season;
      r.__prevOT = prevOT; r.__prevLost20 = prevLost20; r.__prevWon20 = prevWon20;
      prevOT = r.game.overtime; prevLost20 = r.ctx.team_lost_by_20plus; prevWon20 = r.ctx.team_won_by_20plus;
    });
  });
}

function teamGames(team, stage = null, season = null) {
  const src = season ? ALL_GAMES.filter(g => g.season === season) : GAMES();
  return src.filter(g => (g.home_team === team || g.away_team === team) && (!stage || g.stage === stage))
    .sort((a, b) => a.date_iso.localeCompare(b.date_iso));
}

function computeTeamStats(team, stage = 'regular') {
  const games = teamGames(team, stage);
  const total = games.length;
  let c12 = 0, c21 = 0, cx = 0, cnone = 0, blew = 0, comeback = 0;
  const oppLamakCount = {};
  games.forEach(g => {
    const cls = g.classification;
    if (cls === '1/2') c12++; else if (cls === '2/1') c21++; else if (cls === 'X') cx++; else cnone++;
    const ctx = g.home_team === team ? g.home_ctx : g.away_ctx;
    if (ctx.blew_lead) blew++;
    if (ctx.comeback_win) comeback++;
    if (isLamak(cls)) {
      const opp = g.home_team === team ? g.away_team : g.home_team;
      oppLamakCount[opp] = (oppLamakCount[opp] || 0) + 1;
    }
  });
  const totalLamak = c12 + c21 + cx;
  let maxNoLamak = 0, maxLamak = 0, runNo = 0, runYes = 0;
  games.forEach(g => {
    if (isLamak(g.classification)) { runYes++; runNo = 0; maxLamak = Math.max(maxLamak, runYes); }
    else { runNo++; runYes = 0; maxNoLamak = Math.max(maxNoLamak, runNo); }
  });
  const bySeasonMap = {};
  games.forEach(g => {
    bySeasonMap[g.season] = bySeasonMap[g.season] || { season: g.season, total: 0, c12: 0, c21: 0, cx: 0 };
    bySeasonMap[g.season].total++;
    if (g.classification === '1/2') bySeasonMap[g.season].c12++;
    else if (g.classification === '2/1') bySeasonMap[g.season].c21++;
    else if (g.classification === 'X') bySeasonMap[g.season].cx++;
  });
  return {
    team, total, c12, c21, cx, cnone, totalLamak,
    pctLamak: pct(totalLamak, total), pct12: pct(c12, total), pct21: pct(c21, total), pctX: pct(cx, total),
    blew, comeback, curNoLamak: runNo, curLamak: runYes, maxNoLamak, maxLamak,
    oppLamakCount, last5: games.slice(-5).reverse(), games,
    bySeason: SEASONS.map(s => bySeasonMap[s] || { season: s, total: 0, c12: 0, c21: 0, cx: 0 })
  };
}

let TEAM_STATS = {};
function rebuildTeamStats() { TEAMS.forEach(t => TEAM_STATS[t] = computeTeamStats(t, 'regular')); }

function h2hGames(teamA, teamB, stage = null) {
  return GAMES().filter(g =>
    ((g.home_team === teamA && g.away_team === teamB) || (g.home_team === teamB && g.away_team === teamA))
    && (!stage || g.stage === stage)
  ).sort((a, b) => a.date_iso.localeCompare(b.date_iso));
}
function h2hGamesAll(teamA, teamB) {
  return ALL_GAMES.filter(g =>
    (g.home_team === teamA && g.away_team === teamB) || (g.home_team === teamB && g.away_team === teamA)
  ).sort((a, b) => a.date_iso.localeCompare(b.date_iso));
}

function rebuildAll() { rebuildTeamRows(); rebuildTeamStats(); }
rebuildAll();

// ============================================================
// TABS
// ============================================================
const TABS = [
  { id: 'sezon2627', label: '🔥 Sezon 26/27' },
  { id: 'zakonczone', label: '✅ Zakończone' },
  { id: 'terminarz', label: '🗓 Terminarz (historia)' },
  { id: 'druzyny', label: '🏀 Drużyny i pary' },
  { id: 'analiza', label: '🔎 Wzorce i schematy' },
];
const tabsNav = document.getElementById('tabs-nav');
TABS.forEach((t, i) => {
  const b = document.createElement('button');
  b.className = 'tab-btn' + (i === 0 ? ' active' : '');
  b.textContent = t.label;
  b.onclick = () => selectTab(t.id);
  b.dataset.tab = t.id;
  tabsNav.appendChild(b);
});
function selectTab(id) {
  if (id === 'h2h') { druzynySub = 'h2h'; id = 'druzyny'; }
  if (id === 'wyniki') { zkSource = 'pre'; id = 'zakonczone'; }
  if (id === 'wnioski' || id === 'prognoza') id = 'analiza';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + id));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (RENDERERS[id]) RENDERERS[id]();
}

document.getElementById('global-season').onchange = e => {
  GLOBAL_SEASON = e.target.value;
  rebuildAll();
  const active = document.querySelector('.tab-btn.active').dataset.tab;
  RENDERERS[active]();
};

// ============================================================
// WSPÓLNE: kontekst "dlaczego" dla dowolnego meczu (używane w Terminarzu i Wnioskach)
// ============================================================
const DEP_DEFS = [
  { id: 'b2b', label: 'Back-to-back', test: r => r.ctx.back_to_back },
  { id: '3in4', label: '3 mecze w 4 dni', test: r => r.ctx.three_in_four_days },
  { id: 'firstaway', label: 'Pierwszy mecz wyjazdowy trasy', test: r => r.ctx.first_away_of_trip },
  { id: 'firsthome', label: 'Pierwszy mecz u siebie po wyjeździe', test: r => r.ctx.first_home_after_trip },
  { id: 'afterot', label: 'Po meczu z dogrywką', test: r => r.__prevOT },
  { id: 'winstreak3', label: 'Seria 3+ zwycięstw', test: r => r.ctx.win_streak_before >= 3 },
  { id: 'lossstreak2', label: 'Seria 2+ porażek', test: r => r.ctx.loss_streak_before >= 2 },
  { id: 'lost20', label: 'Po porażce 20+ punktami', test: r => r.__prevLost20 },
  { id: 'won20', label: 'Po zwycięstwie 20+ punktami', test: r => r.__prevWon20 },
];

function leagueRate(testFn, minSample = 15) {
  const rows = TEAM_ROWS.filter(r => r.game.stage === 'regular');
  const sub = rows.filter(testFn);
  if (sub.length < minSample) return null;
  const hit = sub.filter(r => isLamak(r.game.classification)).length;
  return { n: sub.length, rate: pct(hit, sub.length) };
}
function baselineRate() {
  const rows = TEAM_ROWS.filter(r => r.game.stage === 'regular');
  const hit = rows.filter(r => isLamak(r.game.classification)).length;
  return pct(hit, rows.length);
}

// Zwraca listę "powodów" (bullet points) dla konkretnego meczu na podstawie kontekstu obu drużyn
function analyzeGame(game) {
  const base = baselineRate();
  const reasons = [];
  const hCtx = game.home_ctx, aCtx = game.away_ctx;
  const cls = game.classification;

  function pushIfRelevant(sideLabel, ctx, prevOT, prevLost20, prevWon20) {
    if (ctx.back_to_back) {
      const lr = leagueRate(r => r.ctx.back_to_back);
      reasons.push({ ico: '🔁', text: `${sideLabel} grał(a) na back-to-back (drugi mecz z rzędu bez dnia przerwy).`, stat: lr ? `Drużyny w bazie na back-to-back łamią się w ${lr.rate.toFixed(1)}% meczów (śr. liga: ${base.toFixed(1)}%).` : null });
    }
    if (ctx.three_in_four_days) {
      reasons.push({ ico: '📅', text: `${sideLabel} rozgrywał(a) trzeci mecz w ciągu czterech dni.`, stat: null });
    }
    if (ctx.first_away_of_trip) {
      const lr = leagueRate(r => r.ctx.first_away_of_trip);
      reasons.push({ ico: '✈️', text: `${sideLabel} rozpoczynał(a) tym meczem wyjazdową trasę.`, stat: lr ? `Pierwsze mecze trasy kończą się łamakiem w ${lr.rate.toFixed(1)}% przypadków.` : null });
    }
    if (ctx.first_home_after_trip) {
      reasons.push({ ico: '🏠', text: `${sideLabel} wracał(a) do domu po serii meczów wyjazdowych.`, stat: null });
    }
    if (prevOT) {
      reasons.push({ ico: '⏱️', text: `Poprzedni mecz ${sideLabel.toLowerCase()} zakończył się dogrywką — możliwe zmęczenie.`, stat: null });
    }
    if (ctx.win_streak_before >= 3) {
      const lr = leagueRate(r => r.ctx.win_streak_before >= 3 && r.ctx.half_led, 10);
      reasons.push({ ico: '🔥', text: `${sideLabel} wchodził(a) w mecz z serią ${ctx.win_streak_before} zwycięstw z rzędu.`, stat: lr ? `Po takich seriach drużyny prowadzące do przerwy tracą to prowadzenie w ${lr.rate.toFixed(1)}% przypadków.` : null });
    }
    if (ctx.loss_streak_before >= 2) {
      reasons.push({ ico: '📉', text: `${sideLabel} wchodził(a) w mecz z serią ${ctx.loss_streak_before} porażek z rzędu.`, stat: null });
    }
    if (prevLost20) {
      reasons.push({ ico: '💥', text: `${sideLabel} przegrał(a) poprzedni mecz różnicą 20+ punktów.`, stat: null });
    }
  }
  pushIfRelevant('Gospodarz', hCtx, game.home_ctx.__prevOTflag, null, null);
  const hRow = TEAM_ROWS.find(r => r.game.game_id === game.game_id && r.team === game.home_team);
  const aRow = TEAM_ROWS.find(r => r.game.game_id === game.game_id && r.team === game.away_team);
  reasons.length = 0;
  if (hRow) pushIfRelevant('Gospodarz', hCtx, hRow.__prevOT, hRow.__prevLost20, hRow.__prevWon20);
  if (aRow) pushIfRelevant('Gość', aCtx, aRow.__prevOT, aRow.__prevLost20, aRow.__prevWon20);

  // H2H kontekst (wszystkie sezony, tylko spotkania PRZED tym meczem)
  const h2hBefore = h2hGamesAll(game.home_team, game.away_team).filter(g => g.date_iso < game.date_iso);
  if (h2hBefore.length >= 2) {
    const h2hLamak = h2hBefore.filter(g => isLamak(g.classification)).length;
    const rate = pct(h2hLamak, h2hBefore.length);
    if (rate >= base + 10) {
      reasons.push({ ico: '⚔️', text: `Te drużyny mają historię łamanych meczów między sobą.`, stat: `${h2hLamak}/${h2hBefore.length} (${rate.toFixed(0)}%) wcześniejszych spotkań tej pary zakończyło się łamakiem — powyżej średniej ligowej.` });
    }
  }

  if (reasons.length === 0) {
    reasons.push({ ico: 'ℹ️', text: 'Brak wyraźnych czynników kontekstowych (back-to-back, serii, historii H2H) — ten wynik wygląda na statystyczny przypadek.', stat: null });
  }
  return reasons;
}

// ============================================================
// WNIOSKI (strona startowa)
// ============================================================
function generateInsights() {
  const insights = [];
  const base = baselineRate();
  const arr = TEAMS.map(t => TEAM_STATS[t]);

  // 1. Najbardziej niestabilna i najbardziej stabilna druzyna
  const mostUnstable = [...arr].sort((a, b) => b.pctLamak - a.pctLamak)[0];
  const mostStable = [...arr].sort((a, b) => a.pctLamak - b.pctLamak)[0];
  insights.push({
    type: 'red', num: mostUnstable.pctLamak.toFixed(0) + '%',
    headline: `${mostUnstable.team} to najbardziej "łamliwa" drużyna w bazie`,
    sub: `${mostUnstable.totalLamak} łamaków na ${mostUnstable.total} meczów (śr. liga: ${base.toFixed(0)}%). Zobacz pełen profil w zakładce Drużyny.`,
    action: () => { selectTab('druzyny'); selectedTeam = mostUnstable.team; renderDruzyny(); }
  });
  insights.push({
    type: 'green', num: mostStable.pctLamak.toFixed(0) + '%',
    headline: `${mostStable.team} jest najbardziej stabilna — rzadko traci kontrolę nad meczem`,
    sub: `Tylko ${mostStable.totalLamak} łamaków na ${mostStable.total} meczów.`,
    action: () => { selectTab('druzyny'); selectedTeam = mostStable.team; renderDruzyny(); }
  });

  // 2. Najsilniejszy efekt kontekstowy (spośród DEP_DEFS)
  let bestDep = null;
  DEP_DEFS.forEach(d => {
    const lr = leagueRate(d.test, 20);
    if (lr) {
      const diff = lr.rate - base;
      if (!bestDep || Math.abs(diff) > Math.abs(bestDep.diff)) bestDep = { ...d, ...lr, diff };
    }
  });
  if (bestDep) {
    insights.push({
      type: bestDep.diff > 0 ? 'red' : 'green',
      num: (bestDep.diff > 0 ? '+' : '') + bestDep.diff.toFixed(1) + 'pp',
      headline: `Kontekst "${bestDep.label}" najmocniej wpływa na częstość łamaków`,
      sub: `W tej sytuacji łamak pada w ${bestDep.rate.toFixed(1)}% meczów vs ${base.toFixed(1)}% średnio (próbka: ${bestDep.n}). ${bestDep.diff > 0 ? 'To wyraźnie zwiększa ryzyko.' : 'To wyraźnie zmniejsza ryzyko.'}`,
      action: () => { analizaSubTab = 'filtry'; selectTab('analiza'); activeDepFilters = new Set([bestDep.id]); renderZaleznosci(); }
    });
  }

  // 2b. Poczatek sezonu vs koniec sezonu
  const earlyRate = leagueRate(r => r.ctx.game_num_in_season <= 10, 20);
  const lateRate = leagueRate(r => r.ctx.game_num_in_season > 70, 20);
  if (earlyRate && lateRate) {
    insights.push({
      type: earlyRate.rate > lateRate.rate ? 'red' : 'green',
      num: earlyRate.rate.toFixed(0) + '%',
      headline: `Łamaki zdarzają się wyraźnie częściej na początku sezonu`,
      sub: `Pierwsze 10 meczów sezonu: ${earlyRate.rate.toFixed(1)}% łamaków (próbka ${earlyRate.n}) vs ${lateRate.rate.toFixed(1)}% w ostatnich 10 meczach (próbka ${lateRate.n}). Warto szczególnie uważnie śledzić październik/listopad.`,
      action: () => { analizaSubTab = 'filtry'; selectTab('analiza'); activeDepFilters = new Set(['early10']); renderZaleznosci(); }
    });
  }

  // 3. Para H2H z najwyzszym % lamakow (min 4 spotkania w bazie - 3 sezony)
  const pairMap = {};
  REGULAR_GAMES().forEach(g => {
    const key = [g.home_team, g.away_team].sort().join(' — ');
    pairMap[key] = pairMap[key] || { pair: key, teams: [g.home_team, g.away_team], n: 0, lamak: 0 };
    pairMap[key].n++;
    if (isLamak(g.classification)) pairMap[key].lamak++;
  });
  const bestPair = Object.values(pairMap).filter(p => p.n >= 4).map(p => ({ ...p, rate: pct(p.lamak, p.n) })).sort((a, b) => b.rate - a.rate)[0];
  if (bestPair) {
    insights.push({
      type: 'gold', num: bestPair.rate.toFixed(0) + '%',
      headline: `${bestPair.pair} to najbardziej "łamliwa" para w lidze`,
      sub: `${bestPair.lamak} z ${bestPair.n} wzajemnych meczów zakończyło się łamakiem.`,
      action: () => { selectTab('h2h'); h2hA = bestPair.teams[0]; h2hB = bestPair.teams[1]; renderH2H(); }
    });
  }

  // 4. Aktualne serie - druzyna najblizej "peknięcia" (najdluzsza aktualna seria bez lamaka) w biezacym sezonie
  const cur = TEAMS.map(t => computeTeamStats(t, 'regular')).filter(s => s.total > 0);
  const longestNoLamak = [...cur].sort((a, b) => b.curNoLamak - a.curNoLamak)[0];
  if (longestNoLamak && longestNoLamak.curNoLamak >= 5) {
    insights.push({
      type: 'blue', num: longestNoLamak.curNoLamak,
      headline: `${longestNoLamak.team} nie złapał(a) łamaka od ${longestNoLamak.curNoLamak} meczów`,
      sub: `Najdłuższa aktualna seria bez 1/2, 2/1 czy X w wybranym zakresie danych.`,
      action: () => { selectTab('druzyny'); selectedTeam = longestNoLamak.team; renderDruzyny(); }
    });
  }
  const longestLamakStreak = [...cur].sort((a, b) => b.curLamak - a.curLamak)[0];
  if (longestLamakStreak && longestLamakStreak.curLamak >= 2) {
    insights.push({
      type: 'red', num: longestLamakStreak.curLamak,
      headline: `${longestLamakStreak.team} łamie się ${longestLamakStreak.curLamak}. mecz z rzędu`,
      sub: `Krótka, ale wyraźna passa — warto sprawdzić najbliższy terminarz tej drużyny.`,
      action: () => { selectTab('druzyny'); selectedTeam = longestLamakStreak.team; renderDruzyny(); }
    });
  }

  // 5. Miesiac z najwieksza czestoscia lamakow
  const byMonth = {};
  REGULAR_GAMES().forEach(g => {
    byMonth[g.month] = byMonth[g.month] || { month: g.month, n: 0, lamak: 0 };
    byMonth[g.month].n++;
    if (isLamak(g.classification)) byMonth[g.month].lamak++;
  });
  const monthArr = Object.values(byMonth).filter(m => m.n >= 20).map(m => ({ ...m, rate: pct(m.lamak, m.n) })).sort((a, b) => b.rate - a.rate);
  if (monthArr.length) {
    const topMonth = monthArr[0];
    insights.push({
      type: 'gold', num: topMonth.rate.toFixed(0) + '%',
      headline: `${topMonth.month} to miesiąc z najwyższym odsetkiem łamaków`,
      sub: `${topMonth.lamak}/${topMonth.n} meczów w tym miesiącu (wszystkie sezony) zakończyło się łamakiem.`,
      action: null
    });
  }

  return insights;
}

function renderMonthChartSVG() {
  const order = ['Październik', 'Listopad', 'Grudzień', 'Styczeń', 'Luty', 'Marzec', 'Kwiecień'];
  const short = { 'Październik': 'PAŹ', 'Listopad': 'LIS', 'Grudzień': 'GRU', 'Styczeń': 'STY', 'Luty': 'LUT', 'Marzec': 'MAR', 'Kwiecień': 'KWI' };
  const byMonth = {};
  REGULAR_GAMES().forEach(g => {
    byMonth[g.month] = byMonth[g.month] || { n: 0, lamak: 0 };
    byMonth[g.month].n++;
    if (isLamak(g.classification)) byMonth[g.month].lamak++;
  });
  const data = order.filter(m => byMonth[m] && byMonth[m].n >= 5).map(m => ({ m, short: short[m], rate: pct(byMonth[m].lamak, byMonth[m].n), n: byMonth[m].n, lamak: byMonth[m].lamak }));
  if (!data.length) return '<div class="empty-state">Za mało danych.</div>';

  const maxRate = Math.max(...data.map(d => d.rate), 1);
  const topIdx = data.reduce((best, d, i) => d.rate > data[best].rate ? i : best, 0);
  const avg = baselineRate();

  const W = 760, H = 260, padL = 40, padB = 40, padT = 20, padR = 20;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const barW = chartW / data.length * 0.6;
  const gap = chartW / data.length;

  const avgY = padT + chartH - (avg / maxRate) * chartH;

  let bars = data.map((d, i) => {
    const x = padL + i * gap + (gap - barW) / 2;
    const h = (d.rate / maxRate) * chartH;
    const y = padT + chartH - h;
    const color = i === topIdx ? 'var(--orange)' : 'var(--ink-soft)';
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${color}" opacity="${i === topIdx ? 1 : 0.55}"/>
      <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" font-family="IBM Plex Mono" font-size="12" font-weight="600" fill="${i === topIdx ? 'var(--orange)' : 'var(--ink)'}">${d.rate.toFixed(0)}%</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${(padT + chartH + 20).toFixed(1)}" text-anchor="middle" font-family="Oswald" font-size="11.5" letter-spacing="0.03em" fill="var(--ink-soft)">${d.short}</text>
    `;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-height:280px;">
    <line x1="${padL}" y1="${avgY.toFixed(1)}" x2="${W - padR}" y2="${avgY.toFixed(1)}" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="4,4"/>
    <text x="${W - padR}" y="${(avgY - 6).toFixed(1)}" text-anchor="end" font-family="IBM Plex Mono" font-size="11" fill="var(--ink-soft)">średnia ${avg.toFixed(1)}%</text>
    ${bars}
  </svg>`;
}

// ============================================================
// PRESEASON 2026/27 — RADAR RYZYKA (eksperymentalne, niska wiarygodność)
// ============================================================
// mapowanie pelnych nazw z terminarza na nazwy uzywane w naszej bazie (en.24score.com)
const TEAM_NAME_MAP = {
  'Golden State Warriors': 'Golden State', 'Los Angeles Lakers': 'LA Lakers', 'Los Angeles Clippers': 'LA Clippers',
  'Philadelphia 76ers': 'Philadelphia', 'Minnesota Timberwolves': 'Minnesota Timb.', 'New York Knicks': 'NY Knicks',
};
function mapTeamName(n) { return TEAM_NAME_MAP[n] || n; }

const PRESEASON_GAMES_RAW = [
  ['2026-10-04', '01:00', 'Toronto Raptors', 'Miami Heat'],
  ['2026-10-05', '01:00', 'Denver Nuggets', 'Utah Jazz'],
  ['2026-10-05', '01:00', 'Los Angeles Clippers', 'Golden State Warriors'],
  ['2026-10-06', '01:00', 'Atlanta Hawks', 'Memphis Grizzlies'],
  ['2026-10-06', '01:00', 'Detroit Pistons', 'Phoenix Suns'],
  ['2026-10-06', '01:00', 'Philadelphia 76ers', 'New York Knicks'],
  ['2026-10-06', '02:00', 'Milwaukee Bucks', 'Minnesota Timberwolves'],
  ['2026-10-06', '04:00', 'Sacramento Kings', 'Los Angeles Lakers'],
  ['2026-10-07', '01:00', 'Charlotte Hornets', 'Brooklyn Nets'],
  ['2026-10-07', '02:00', 'Oklahoma City Thunder', 'New Orleans Pelicans'],
  ['2026-10-07', '03:00', 'Utah Jazz', 'Denver Nuggets'],
  ['2026-10-07', '04:00', 'Golden State Warriors', 'Los Angeles Lakers'],
  ['2026-10-08', '01:00', 'Indiana Pacers', 'Minnesota Timberwolves'],
  ['2026-10-08', '02:00', 'Chicago Bulls', 'Phoenix Suns'],
  ['2026-10-08', '02:00', 'Memphis Grizzlies', 'Orlando Magic'],
  ['2026-10-08', '02:00', 'Oklahoma City Thunder', 'Milwaukee Bucks'],
  ['2026-10-08', '04:00', 'Portland Trail Blazers', 'Golden State Warriors'],
  ['2026-10-09', '01:00', 'Cleveland Cavaliers', 'Boston Celtics'],
  ['2026-10-09', '01:30', 'Brooklyn Nets', 'Philadelphia 76ers'],
  ['2026-10-09', '01:30', 'Miami Heat', 'New Orleans Pelicans'],
  ['2026-10-09', '01:30', 'New York Knicks', 'Washington Wizards'],
  ['2026-10-09', '02:00', 'San Antonio Spurs', 'Atlanta Hawks'],
  ['2026-10-09', '04:30', 'Los Angeles Lakers', 'Sacramento Kings'],
  ['2026-10-09', '14:00', 'Dallas Mavericks', 'Houston Rockets'],
  ['2026-10-10', '02:00', 'Chicago Bulls', 'Memphis Grizzlies'],
  ['2026-10-11', '00:30', 'Toronto Raptors', 'Los Angeles Clippers'],
  ['2026-10-11', '01:00', 'Indiana Pacers', 'Atlanta Hawks'],
  ['2026-10-11', '01:00', 'Washington Wizards', 'Detroit Pistons'],
  ['2026-10-11', '02:00', 'Boston Celtics', 'Philadelphia 76ers'],
  ['2026-10-11', '02:00', 'Miami Heat', 'Minnesota Timberwolves'],
  ['2026-10-11', '02:30', 'Golden State Warriors', 'Sacramento Kings'],
  ['2026-10-11', '04:30', 'Phoenix Suns', 'San Antonio Spurs'],
  ['2026-10-11', '12:00', 'Houston Rockets', 'Dallas Mavericks'],
  ['2026-10-12', '00:30', 'Cleveland Cavaliers', 'Orlando Magic'],
  ['2026-10-12', '01:00', 'Charlotte Hornets', 'Milwaukee Bucks'],
  ['2026-10-12', '03:00', 'Denver Nuggets', 'Chicago Bulls'],
  ['2026-10-12', '22:00', 'Portland Trail Blazers', 'London Lions'],
  ['2026-10-13', '01:00', 'Atlanta Hawks', 'Oklahoma City Thunder'],
  ['2026-10-13', '01:00', 'Washington Wizards', 'Brooklyn Nets'],
  ['2026-10-13', '01:30', 'New York Knicks', 'Minnesota Timberwolves'],
  ['2026-10-13', '03:00', 'Utah Jazz', 'San Antonio Spurs'],
  ['2026-10-14', '01:00', 'Orlando Magic', 'Cleveland Cavaliers'],
  ['2026-10-14', '01:00', 'Toronto Raptors', 'New York Knicks'],
  ['2026-10-14', '02:00', 'Oklahoma City Thunder', 'Indiana Pacers'],
  ['2026-10-14', '04:00', 'Los Angeles Lakers', 'Golden State Warriors'],
  ['2026-10-14', '04:00', 'Sacramento Kings', 'Portland Trail Blazers'],
  ['2026-10-15', '01:30', 'Boston Celtics', 'Charlotte Hornets'],
  ['2026-10-15', '01:30', 'Miami Heat', 'Brooklyn Nets'],
  ['2026-10-15', '02:00', 'Dallas Mavericks', 'New Orleans Pelicans'],
  ['2026-10-15', '02:00', 'Milwaukee Bucks', 'Chicago Bulls'],
  ['2026-10-15', '02:00', 'Minnesota Timberwolves', 'Detroit Pistons'],
  ['2026-10-15', '02:00', 'San Antonio Spurs', 'Phoenix Suns'],
  ['2026-10-15', '04:30', 'Los Angeles Clippers', 'Denver Nuggets'],
  ['2026-10-16', '01:30', 'New York Knicks', 'Toronto Raptors'],
  ['2026-10-16', '02:30', 'Houston Rockets', 'Oklahoma City Thunder'],
  ['2026-10-17', '01:00', 'Detroit Pistons', 'Toronto Raptors'],
  ['2026-10-17', '01:00', 'Indiana Pacers', 'Milwaukee Bucks'],
  ['2026-10-17', '01:00', 'Orlando Magic', 'Miami Heat'],
  ['2026-10-17', '01:00', 'Philadelphia 76ers', 'Boston Celtics'],
  ['2026-10-17', '02:00', 'Chicago Bulls', 'Minnesota Timberwolves'],
  ['2026-10-17', '02:00', 'Dallas Mavericks', 'Atlanta Hawks'],
  ['2026-10-17', '02:00', 'Memphis Grizzlies', 'Charlotte Hornets'],
  ['2026-10-17', '02:00', 'New Orleans Pelicans', 'Washington Wizards'],
  ['2026-10-17', '02:00', 'San Antonio Spurs', 'Sacramento Kings'],
  ['2026-10-17', '04:00', 'Golden State Warriors', 'Portland Trail Blazers'],
  ['2026-10-17', '04:00', 'Phoenix Suns', 'Utah Jazz'],
  ['2026-10-17', '04:30', 'Los Angeles Lakers', 'Denver Nuggets'],
];
const PRESEASON_GAMES = PRESEASON_GAMES_RAW.map(([date, time, home, away]) => ({
  date_iso: date, time, home_team: mapTeamName(home), away_team: mapTeamName(away)
}));

// ------------------------------------------------------------
// WYNIKI ROZEGRANYCH MECZÓW PRESEASON — pobierane automatycznie z en.24score.com
// (scripts/fetch_preseason_24score.py -> data/preseason_results.json, codziennie przez GitHub Actions).
// Strona ma wbudowaną kopię z chwili budowy, a po otwarciu dociąga świeży plik JSON
// (patrz refreshPreseasonResults) — dzięki temu nowe wyniki nie wymagają przebudowy index.html.
// Mecz łączymy z terminarzem po parze gospodarz–gość (nie po dacie), więc strefa czasowa nie ma znaczenia.
// ------------------------------------------------------------
function psKey(d, h, a) { return `${d}|${h}|${a}`; }
let PRESEASON_RESULTS = {};
function setPreseasonResults(list) {
  const out = {};
  (list || []).forEach(it => {
    const q = it.q;
    if (!q || q.length < 4) return;
    const fx = PRESEASON_GAMES.find(g => g.home_team === it.home_team && g.away_team === it.away_team);
    const [dd, mm, yy] = (it.date || '').split('.');
    const date_iso = fx ? fx.date_iso : (yy ? `${yy}-${mm}-${dd}` : '');
    const halfH = q[0][0] + q[1][0], halfA = q[0][1] + q[1][1];
    const regH = halfH + q[2][0] + q[3][0], regA = halfA + q[2][1] + q[3][1];
    out[psKey(date_iso, it.home_team, it.away_team)] = {
      date_iso, time: fx ? fx.time : '', home_team: it.home_team, away_team: it.away_team, q, halfH, halfA,
      final_home: it.final_home ?? regH, final_away: it.final_away ?? regA, ot: (it.ot || []).length,
      classification: classifyQuarters(q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1]),
    };
  });
  PRESEASON_RESULTS = out;
}
function allPreseasonResults() { return Object.values(PRESEASON_RESULTS).map(r => ({ ...r })); }
const PRESEASON_EMBEDDED = (() => {
  try { return JSON.parse(document.getElementById('preseason-data').textContent || '[]'); } catch (e) { return []; }
})();
setPreseasonResults(PRESEASON_EMBEDDED);
const clsLabel = c => c === 'brak_lamaka' ? 'NIC' : (LABELS[c] || '—');
// dociąga świeży data/preseason_results.json (działa na GitHub Pages; z pliku lokalnego cicho pomija)
function refreshPreseasonResults() {
  if (typeof fetch !== 'function' || location.protocol === 'file:') return;
  fetch('data/preseason_results.json?v=' + Date.now(), { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(list => {
      if (!Array.isArray(list)) return;
      const before = JSON.stringify(PRESEASON_RESULTS);
      setPreseasonResults(list);
      if (JSON.stringify(PRESEASON_RESULTS) === before) return;
      const act = document.querySelector('.tab-btn.active');
      if (act && RENDERERS[act.dataset.tab]) RENDERERS[act.dataset.tab]();
    })
    .catch(() => {});
}

function preseasonB2B(fixture) {
  const oneDayMs = 24 * 3600 * 1000;
  const d = new Date(fixture.date_iso).getTime();
  function hasNearbyGame(team) {
    return PRESEASON_GAMES.some(g => {
      if (g === fixture) return false;
      if (g.home_team !== team && g.away_team !== team) return false;
      const gd = new Date(g.date_iso).getTime();
      return Math.abs(gd - d) <= oneDayMs && gd !== d;
    });
  }
  return { home: hasNearbyGame(fixture.home_team), away: hasNearbyGame(fixture.away_team) };
}

function lastGamesFor(team, n = 5) {
  return ALL_GAMES.filter(g => (g.home_team === team || g.away_team === team) && g.stage !== 'playin')
    .sort((a, b) => b.date_iso.localeCompare(a.date_iso)).slice(0, n);
}

// ============================================================
// KLASYFIKACJA ŁAMAKA z wyniku po kwartach (używana dla rozegranych meczów preseason)
// ============================================================
function classifyQuarters(q1h, q1a, q2h, q2a, q3h, q3a, q4h, q4a) {
  const halfH = q1h + q2h, halfA = q1a + q2a;
  const regH = halfH + q3h + q4h, regA = halfA + q3a + q4a;
  if (regH === regA) return 'X';
  if (halfH === halfA) return 'brak_lamaka';
  const leader = halfH > halfA ? 'home' : 'away';
  const winner = regH > regA ? 'home' : 'away';
  if (leader === 'home' && winner === 'away') return '1/2';
  if (leader === 'away' && winner === 'home') return '2/1';
  return 'brak_lamaka';
}

// ============================================================
// SEZON 26/27 — terminarz tygodniowy + „teczka meczu” (fakty zamiast procentów)
// ============================================================
const FIXTURES = (() => { try { return JSON.parse(document.getElementById('fixtures-data').textContent || '[]'); } catch (e) { return []; } })();
const DOW_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
const DOW_FULL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
const CUR_SEASON = '2026-27';
const ODD_SEASONS = new Set(['2019-20', '2020-21']); // bąbel / skrócony sezon — inny kalendarz, nie liczymy do kolejek i dat
let s27Week = null, zkFilter = 'all', zkSource = 'regular';
let S27 = null, DOS = null;
const DAY_OPEN = {}, LAZY = {}, RK = {};
function localIso(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function isoPlus(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return localIso(d); }
function seasonDay(iso) { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); const st = new Date(`${m >= 8 ? y : y - 1}-10-01T12:00:00`); return Math.round((new Date(iso + 'T12:00:00') - st) / 864e5); }
function dayDist(a, b) { return Math.abs(seasonDay(a) - seasonDay(b)); }
function weekStart(d) { const dt = new Date(d + 'T12:00:00'); return isoPlus(d, -((dt.getDay() + 6) % 7)); }
function dowName(d) { return DOW_FULL[new Date(d + 'T12:00:00').getDay()]; }
const dm = d => `${d.slice(8)}.${d.slice(5, 7)}`;


// ---------- Wyniki i status na żywo (bez przebudowy strony) ----------
// Bot commituje data/fixtures_2026_27.json i data/update_status.json po każdym przebiegu; strona dociąga je sama (GitHub Pages).
let UPD_STATUS = null;
function renderStatusBox() {
  const el = document.getElementById('upd-status');
  if (!el) return;
  const fmt = ts => new Date(ts).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const played = FIXTURES.filter(f => f.q || f.fs);
  const lastRes = played.length ? played.map(f => f.d).sort().pop() : null;
  if (!UPD_STATUS) { el.innerHTML = `<div class="k">Aktualizacja wyników</div><div class="v">${lastRes ? 'wyniki do ' + dm(lastRes) : '—'}</div>`; return; }
  const st = UPD_STATUS, age = (Date.now() - new Date(st.ts).getTime()) / 36e5;
  const bad = !st.ok, stale = age > 30;
  const cls = bad ? 'bad' : stale ? 'warn' : 'ok';
  const line = bad ? `⚠ Pobieranie nie działa (${st.error || 'błąd'})` : stale ? `⚠ Brak aktualizacji od ${Math.round(age)} h` : '✅ Aktualizacja działa';
  el.innerHTML = `<div class="k">Aktualizacja wyników</div><div class="upd ${cls}">${line}</div>
    <div class="v">ost. przebieg: ${fmt(st.ts)}${lastRes ? `<br>wyniki do: ${dm(lastRes)} · rozegrane ${played.length}` : ''}${st.finals_without_quarters ? `<br>czeka na kwarty: ${st.finals_without_quarters}` : ''}</div>`;
}
function refreshLive() {
  renderStatusBox();
  if (typeof fetch !== 'function' || location.protocol === 'file:') return;
  const t = Date.now();
  fetch('data/update_status.json?v=' + t, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(st => { if (st) { UPD_STATUS = st; renderStatusBox(); } }).catch(() => {});
  fetch('data/fixtures_2026_27.json?v=' + t, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(list => {
    if (!Array.isArray(list) || list.length < 1000 || JSON.stringify(list) === JSON.stringify(FIXTURES)) return;
    FIXTURES.length = 0; list.forEach(x => FIXTURES.push(x));
    S27 = null; DOS = null; SCH = null; Object.keys(RK).forEach(k => delete RK[k]);
    renderStatusBox();
    const act = document.querySelector('.tab-btn.active'); if (act && RENDERERS[act.dataset.tab]) RENDERERS[act.dataset.tab]();
  }).catch(() => {});
}

// ---------- 1. Terminarz + wyniki ----------
function s27Build() {
  if (S27) return S27;
  const played = ALL_GAMES.filter(g => g.season === CUR_SEASON && g.stage === 'regular');
  const busy = new Set();
  FIXTURES.forEach(f => { busy.add(f.h + '|' + f.d); busy.add(f.a + '|' + f.d); });
  const used = new Set();
  const days = [...new Set(FIXTURES.map(f => f.d))].sort();
  const cnt = {}, last = {};
  const rows = FIXTURES.map((f, i) => {
    const known = TEAMS.includes(f.h) && TEAMS.includes(f.a);
    let res = null, synth = false;
    const g = played.find(p => !used.has(p.game_id) && p.home_team === f.h && p.away_team === f.a && Math.abs((new Date(p.date_iso) - new Date(f.d)) / 864e5) <= 1);
    if (g) {
      used.add(g.game_id);
      res = { fh: g.final_home, fa: g.final_away, ot: g.num_ot, halfH: g.half_home, halfA: g.half_away, cls: g.classification,
        q: [[g.q1_home, g.q1_away], [g.q2_home, g.q2_away], [g.q3_home, g.q3_away], [g.q4_home, g.q4_away]] };
    } else if (f.q) {
      const q = f.q, hh = q[0][0] + q[1][0], ha = q[0][1] + q[1][1];
      const rh = hh + q[2][0] + q[3][0], ra = ha + q[2][1] + q[3][1], ot = f.ot || [];
      res = { fh: rh + ot.reduce((a, x) => a + x[0], 0), fa: ra + ot.reduce((a, x) => a + x[1], 0), ot: ot.length, halfH: hh, halfA: ha, q,
        cls: classifyQuarters(q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1]) };
      synth = true;
    }
    if (res && !isLamak(res.cls)) res.cls = 'brak_lamaka';
    const p1 = isoPlus(f.d, -1), p2 = isoPlus(f.d, -2), p3 = isoPlus(f.d, -3);
    const t3 = t => busy.has(t + '|' + p1) && [p2, p3].some(x => busy.has(t + '|' + x));
    const gap = t => last[t] ? Math.round((new Date(f.d) - new Date(last[t])) / 864e5) - 1 : null;
    const ctx = { b2bH: busy.has(f.h + '|' + p1), b2bA: busy.has(f.a + '|' + p1), t3H: t3(f.h), t3A: t3(f.a), restH: gap(f.h), restA: gap(f.a) };
    last[f.h] = f.d; last[f.a] = f.d;
    const nH = (cnt[f.h] = (cnt[f.h] || 0) + 1), nA = (cnt[f.a] = (cnt[f.a] || 0) + 1);
    const final = !res && f.fs ? { fh: f.fs[0], fa: f.fs[1] } : null;
    return { i, f, known, res, synth, final, ctx, k: days.indexOf(f.d) + 1, nH, nA, dos: null };
  });
  const byDay = {};
  rows.forEach(r => { (byDay[r.f.d] = byDay[r.f.d] || []).push(r); });
  const weeks = [...new Set(days.map(weekStart))].sort();
  S27 = { rows, byDay, days, weeks };
  return S27;
}

// ---------- 2. Indeks historii ----------
function binomTail(k, n, p, upper) {
  if (!n) return 1;
  p = Math.min(0.999, Math.max(0.001, p));
  const lp = Math.log(p), lq = Math.log(1 - p);
  let lc = 0, s = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) lc += Math.log((n - i + 1) / i);
    if (upper ? i >= k : i <= k) s += Math.exp(lc + i * lp + (n - i) * lq);
  }
  return Math.min(1, s);
}
function mkFact(scope, short, label, hits, n, base, detail, kind = 'L', who = '') {
  const rate = n ? hits / n : 0;
  const up = binomTail(hits, n, base, true), lo = binomTail(hits, n, base, false);
  let dir = null;
  if (n >= 3 && hits >= 2 && rate - base >= 0.15 && up <= 0.08) dir = 'hot';
  else if (n >= 5 && base - rate >= 0.12 && lo <= 0.06) dir = 'cold';
  return { scope, short, label, who, hits, n, base, rate, p: dir === 'cold' ? lo : up, dir, detail: detail || '', kind };
}
function gchips(list) {
  return list.map(g => `<span class="gc ${g.l ? (g.cls === '1/2' ? 'c12' : g.cls === '2/1' ? 'c21' : 'cx') : 'cn'}" title="${g.season} · ${fmtDate(g.d)} · ${g.opp ? 'vs ' + g.opp : g.h + ' – ' + g.a}">${g.l ? g.cls : '–'}</span>`).join('');
}
const restB = x => (x == null ? null : x <= 0 ? 0 : x >= 3 ? 3 : x);
const restLab = b => (b === 0 ? 'back-to-back' : b === 1 ? '1 dzień przerwy' : b === 2 ? '2 dni przerwy' : '3+ dni przerwy');
const rankB = r => (r <= 5 ? '1–5' : r <= 10 ? '6–10' : r <= 15 ? '11–15' : r <= 20 ? '16–20' : r <= 25 ? '21–25' : '26–30');
const diffB = d => (d <= 4 ? '0–4' : d <= 9 ? '5–9' : d <= 14 ? '10–14' : '15+');

function dosIndex() {
  if (DOS) return DOS;
  const D = s27Build();
  const kMap = computeKolejkaMap('regular').map;
  const recs = [];
  const rd = v => (v == null || v > 14 ? null : v);
  ALL_GAMES.filter(g => g.stage === 'regular').forEach(g => {
    let k = kMap[g.game_id] || 0;
    if (g.season === CUR_SEASON) k = D.days.indexOf(D.days.find(x => x >= g.date_iso)) + 1;
    recs.push({ d: g.date_iso, season: g.season, h: g.home_team, a: g.away_team, cls: g.classification, k, dow: g.day_of_week,
      hb2b: !!g.home_ctx.back_to_back, ab2b: !!g.away_ctx.back_to_back, h3: !!g.home_ctx.three_in_four_days, a3: !!g.away_ctx.three_in_four_days,
      hw: g.final_home > g.final_away, hrest: rd(g.home_ctx.rest_days), arest: rd(g.away_ctx.rest_days) });
  });
  D.rows.filter(r => r.res && r.synth).forEach(r => {
    recs.push({ d: r.f.d, season: CUR_SEASON, h: r.f.h, a: r.f.a, cls: r.res.cls, k: r.k, dow: dowName(r.f.d),
      hb2b: r.ctx.b2bH, ab2b: r.ctx.b2bA, h3: r.ctx.t3H, a3: r.ctx.t3A, hw: r.res.fh > r.res.fa, hrest: rd(r.ctx.restH), arest: rd(r.ctx.restA) });
  });
  recs.sort((a, b) => a.d.localeCompare(b.d));
  recs.forEach(r => { r.l = isLamak(r.cls); r.x = r.cls === 'X'; r.hr = null; r.ar = null; });
  // miejsce w tabeli (wg % zwycięstw) tuż przed meczem — liczone dla każdej daty osobno
  let st = {}, cs = null;
  for (let i = 0; i < recs.length;) {
    let j = i; while (j < recs.length && recs[j].season === recs[i].season && recs[j].d === recs[i].d) j++;
    if (recs[i].season !== cs) { cs = recs[i].season; st = {}; }
    const order = Object.entries(st).map(([t, v]) => [t, v.w / (v.w + v.l), v.w + v.l]).sort((a, b) => b[1] - a[1] || b[2] - a[2] || a[0].localeCompare(b[0]));
    const rank = {}, gp = {}; order.forEach(([t, , n], ix) => { rank[t] = ix + 1; gp[t] = n; });
    for (let q = i; q < j; q++) { const r = recs[q]; if ((gp[r.h] || 0) >= 8 && (gp[r.a] || 0) >= 8) { r.hr = rank[r.h]; r.ar = rank[r.a]; } }
    for (let q = i; q < j; q++) { const r = recs[q]; (st[r.h] = st[r.h] || { w: 0, l: 0 }); (st[r.a] = st[r.a] || { w: 0, l: 0 }); if (r.hw) { st[r.h].w++; st[r.a].l++; } else { st[r.a].w++; st[r.h].l++; } }
    i = j;
  }
  const TG = {}, cn = {};
  recs.forEach(r => [[r.h, true, r.hb2b, r.h3, r.hw, r.a, r.hr, r.hrest], [r.a, false, r.ab2b, r.a3, !r.hw, r.h, r.ar, r.arest]].forEach(([t, home, b2b, t3, won, opp, rk, rest]) => {
    const key = t + '|' + r.season, n = (cn[key] = (cn[key] || 0) + 1);
    const list = TG[t] = TG[t] || [];
    const pv = list.length && list[list.length - 1].season === r.season ? list[list.length - 1] : null;
    list.push({ d: r.d, season: r.season, k: r.k, dow: r.dow, l: r.l, x: r.x, cls: r.cls, home, opp, n, b2b, t3, w: won, rk, rest,
      prevL: pv ? pv.l : null, ws: pv && pv.w ? pv.ws + 1 : 0, ls: pv && !pv.w ? pv.ls + 1 : 0 });
  }));
  const BL = recs.filter(r => r.l).length / recs.length, BX = recs.filter(r => r.x).length / recs.length;
  DOS = { recs, TG, BL, BX, slots: computeDaySlots('regular').slots };
  return DOS;
}
function cutIdx(d) { const R = dosIndex().recs; let lo = 0, hi = R.length; while (lo < hi) { const m = (lo + hi) >> 1; if (R[m].d < d) lo = m + 1; else hi = m; } return lo; }
function curRanks(d) {
  if (RK[d]) return RK[d];
  const st = {};
  dosIndex().recs.forEach(r => { if (r.season !== CUR_SEASON || r.d >= d) return; (st[r.h] = st[r.h] || { w: 0, l: 0 }); (st[r.a] = st[r.a] || { w: 0, l: 0 }); if (r.hw) { st[r.h].w++; st[r.a].l++; } else { st[r.a].w++; st[r.h].l++; } });
  const order = Object.entries(st).map(([t, v]) => [t, v.w / (v.w + v.l), v.w + v.l]).sort((a, b) => b[1] - a[1] || b[2] - a[2] || a[0].localeCompare(b[0]));
  const rank = {}, gp = {}; order.forEach(([t, , n], ix) => { rank[t] = ix + 1; gp[t] = n; });
  return (RK[d] = { rank, gp });
}

function dayFacts(d, K, N, prior) {
  const I = dosIndex(), D = s27Build(), dow = dowName(d);
  const hist = prior.filter(r => r.season !== CUR_SEASON), cal0 = hist.filter(r => !ODD_SEASONS.has(r.season));
  const out = [], L = a => a.filter(r => r.l).length;
  const per = a => [...new Set(a.map(r => r.season))].map(s => { const b = a.filter(r => r.season === s); return `${s.slice(2)}: <b>${L(b)}/${b.length}</b>`; }).join(' · ');
  const kk = cal0.filter(r => r.k === K);
  if (kk.length) {
    out.push(mkFact('day', `kolejka ${K}`, `Kolejka ${K} ligi w poprzednich sezonach`, L(kk), kk.length, I.BL, per(kk)));
    out.push(mkFact('day', `kolejka ${K} X`, `Dogrywki (X) w kolejce ${K}`, kk.filter(r => r.x).length, kk.length, I.BX, '', 'X'));
  }
  const wd = hist.filter(r => r.dow === dow);
  out.push(mkFact('day', dow.toLowerCase(), `${dow} — cała liga`, L(wd), wd.length, I.BL));
  const cal = cal0.filter(r => dayDist(r.d, d) <= 1);
  if (cal.length) out.push(mkFact('day', 'ta data', `Ta data kalendarzowa ±1 dzień`, L(cal), cal.length, I.BL, per(cal)));
  const sz = I.slots.filter(s => s.season !== CUR_SEASON && !ODD_SEASONS.has(s.season) && Math.abs(s.n - N) <= 1);
  if (sz.length) out.push(mkFact('day', `${N} meczów`, `Kolejki z ${N}±1 meczami`, sz.reduce((a, s) => a + s.l, 0), sz.reduce((a, s) => a + s.n, 0), I.BL, `${sz.length} takich kolejek w historii`));
  const yd = D.byDay[D.days[D.days.indexOf(d) - 1]];
  if (yd) { const pr = yd.filter(r => r.res); if (pr.length >= 3) out.push(mkFact('day', 'wczoraj', `Poprzednia kolejka (ten sezon)`, pr.filter(r => isLamak(r.res.cls)).length, pr.length, I.BL, 'ile łamaków było dzień wcześniej')); }
  return out;
}

function teamFacts(side, T, isHome, n, K, d, b2b, t3, rest, rank) {
  const I = dosIndex();
  const all = (I.TG[T] || []).filter(g => g.d < d);
  if (all.length < 5) return [];
  const prev = all.filter(g => g.season !== CUR_SEASON && !ODD_SEASONS.has(g.season));
  const base = all.filter(g => g.l).length / all.length;
  const dow = dowName(d);
  const nm = T.split(' ').pop(), sc = side, f = [];
  const mk = (a1, a2, a3, a4, a5, a6, a7, a8) => mkFact(a1, a2, a3, a4, a5, a6, a7, a8 || 'L', nm);
  const L = a => a.filter(g => g.l).length;
  const last5 = all.slice(-5);
  f.push(mk(sc, 'ostatnie 5', `${nm}: ostatnie 5 meczów`, L(last5), 5, base, gchips(last5)));
  const cur = all.filter(g => g.season === CUR_SEASON);
  if (cur.length >= 2) f.push(mk(sc, 'ten sezon', `${nm}: ten sezon`, L(cur), cur.length, base, gchips(cur)));
  const pw = prev.filter(g => Math.abs(g.n - n) <= 1), ex = prev.filter(g => g.n === n);
  if (pw.length) f.push(mk(sc, `mecze ${n - 1}–${n + 1}`, `${nm}: mecze nr ${n - 1}–${n + 1} sezonu (poprzednie sezony)`, L(pw), pw.length, base, ex.map(g => `${g.season.slice(2)} #${n}: ${gchips([g])}`).join(' ')));
  const pk = prev.filter(g => Math.abs(g.k - K) <= 1);
  if (pk.length) f.push(mk(sc, `kolejki ${K - 1}–${K + 1}`, `${nm}: kolejki ${K - 1}–${K + 1} ligi (poprzednie sezony)`, L(pk), pk.length, base, pk.map(g => `${g.season.slice(2)} K${g.k}: ${gchips([g])}`).join(' ')));
  const wd = all.filter(g => g.dow === dow);
  f.push(mk(sc, dow.slice(0, 3).toLowerCase() + '.', `${nm}: mecze w dzień „${dow}”`, L(wd), wd.length, base));
  const cal = prev.filter(g => dayDist(g.d, d) <= 2);
  if (cal.length) f.push(mk(sc, 'ta data', `${nm}: ta data kalendarzowa ±2 dni`, L(cal), cal.length, base, gchips(cal)));
  const role = all.filter(g => g.home === isHome);
  f.push(mk(sc, isHome ? 'u siebie' : 'wyjazd', `${nm}: mecze ${isHome ? 'u siebie' : 'na wyjeździe'}`, L(role), role.length, base));
  const lastG = all[all.length - 1];
  const aft = all.filter(g => g.prevL === lastG.l);
  f.push(mk(sc, lastG.l ? 'po łamaku' : 'po NIC', `${nm}: po meczu ${lastG.l ? 'z łamakiem' : 'bez łamaka'} (ostatni: ${lastG.cls === 'brak_lamaka' ? 'NIC' : lastG.cls})`, L(aft), aft.length, base));
  if (b2b) { const a = all.filter(g => g.b2b); f.push(mk(sc, 'b2b', `${nm}: back-to-back`, L(a), a.length, base)); }
  if (t3) { const a = all.filter(g => g.t3); f.push(mk(sc, '3 w 4 dni', `${nm}: 3 mecze w 4 dni`, L(a), a.length, base)); }
  const rb = restB(rest);
  if (rb != null && !b2b) { const a = all.filter(g => restB(g.rest) === rb); f.push(mk('table', 'odpoczynek', `${nm}: przy odpoczynku „${restLab(rb)}”`, L(a), a.length, base)); }
  if (rank) { const a = all.filter(g => g.rk && Math.abs(g.rk - rank) <= 2); f.push(mk('table', `miejsce ${rank}.`, `${nm}: gdy jest na miejscu ${rank}. ±2 w tabeli`, L(a), a.length, base)); }
  const ws = lastG.w ? lastG.ws + 1 : 0, ls = lastG.w ? 0 : lastG.ls + 1;
  if (ws >= 3) { const a = all.filter(g => g.ws >= 3); f.push(mk(sc, `seria ${ws}W`, `${nm}: po serii 3+ zwycięstw (teraz ${ws})`, L(a), a.length, base)); }
  if (ls >= 2) { const a = all.filter(g => g.ls >= 2); f.push(mk(sc, `seria ${ls}P`, `${nm}: po serii 2+ porażek (teraz ${ls})`, L(a), a.length, base)); }
  const l30 = all.slice(-30);
  f.push(mk(sc, 'X 30', `${nm}: dogrywki w ostatnich 30 meczach`, l30.filter(g => g.x).length, l30.length, I.BX, '', 'X'));
  return f;
}

function pairFacts(h, a, d, prior) {
  const I = dosIndex();
  const pg = prior.filter(r => (r.h === h && r.a === a) || (r.h === a && r.a === h));
  if (!pg.length) return [];
  const bs = t => { const g = (I.TG[t] || []).filter(x => x.d < d); return g.length ? g.filter(x => x.l).length / g.length : I.BL; };
  const base = (bs(h) + bs(a)) / 2, L = x => x.filter(r => r.l).length;
  const chipsP = x => gchips(x.map(r => ({ ...r, opp: null })));
  const out = [];
  out.push(mkFact('pair', 'H2H', `Wszystkie spotkania tej pary`, L(pg), pg.length, base, chipsP(pg)));
  const at = pg.filter(r => r.h === h);
  out.push(mkFact('pair', 'H2H dom', `Spotkania u ${h.split(' ').pop()}`, L(at), at.length, base, chipsP(at)));
  const mo = pg.filter(r => r.d.slice(5, 7) === d.slice(5, 7));
  if (mo.length) out.push(mkFact('pair', 'H2H miesiąc', `Spotkania w tym samym miesiącu`, L(mo), mo.length, base, chipsP(mo)));
  out.push(mkFact('pair', 'H2H X', `Dogrywki (X) w H2H`, pg.filter(r => r.x).length, pg.length, I.BX, '', 'X'));
  const c = k => pg.filter(r => r.cls === k).length;
  out[0].detail += ` <span class="small-note">· 1/2 ×${c('1/2')} · 2/1 ×${c('2/1')} · X ×${c('X')}</span>`;
  return out;
}

function tableFacts(row, prior) {
  const f = row.f, I = dosIndex(), out = [], L = a => a.filter(r => r.l).length;
  const rk = curRanks(f.d), rH = rk.rank[f.h], rA = rk.rank[f.a];
  row.rankH = (rk.gp[f.h] || 0) >= 8 ? rH : null; row.rankA = (rk.gp[f.a] || 0) >= 8 ? rA : null;
  if (row.rankH && row.rankA) {
    const wr = prior.filter(r => r.hr && r.ar);
    let a = wr.filter(r => rankB(r.hr) === rankB(rH));
    out.push(mkFact('table', `gosp. ${rankB(rH)}`, `Gospodarz z miejsca ${rankB(rH)} (jest ${rH}.) — cała liga`, L(a), a.length, I.BL));
    a = wr.filter(r => rankB(r.ar) === rankB(rA));
    out.push(mkFact('table', `gość ${rankB(rA)}`, `Gość z miejsca ${rankB(rA)} (jest ${rA}.) — cała liga`, L(a), a.length, I.BL));
    const df = Math.abs(rH - rA);
    a = wr.filter(r => diffB(Math.abs(r.hr - r.ar)) === diffB(df));
    out.push(mkFact('table', `różnica ${diffB(df)}`, `Różnica miejsc w tabeli ${diffB(df)} (jest ${df}) — cała liga`, L(a), a.length, I.BL));
    a = wr.filter(r => Math.abs(r.hr - rH) <= 2 && Math.abs(r.ar - rA) <= 2);
    out.push(mkFact('table', `${rH}. vs ${rA}.`, `Para miejsc ${rH}. vs ${rA}. (±2) — cała liga`, L(a), a.length, I.BL));
  }
  const rH0 = restB(row.ctx.restH), rA0 = restB(row.ctx.restA);
  if (rH0 != null && rA0 != null) {
    const wr = prior.filter(r => r.hrest != null && r.arest != null);
    let a = wr.filter(r => restB(r.hrest) === rH0 && restB(r.arest) === rA0);
    out.push(mkFact('table', 'odpoczynek pary', `Odpoczynek: gospodarz ${restLab(rH0)}, gość ${restLab(rA0)} — cała liga`, L(a), a.length, I.BL));
    a = wr.filter(r => restB(r.hrest) === rH0); out.push(mkFact('table', 'odp. gosp.', `Gospodarz: ${restLab(rH0)} — cała liga`, L(a), a.length, I.BL));
    a = wr.filter(r => restB(r.arest) === rA0); out.push(mkFact('table', 'odp. gość', `Gość: ${restLab(rA0)} — cała liga`, L(a), a.length, I.BL));
  }
  return out;
}

function dossierFor(row) {
  if (row.dos) return row.dos;
  const f = row.f, I = dosIndex();
  const prior = I.recs.slice(0, cutIdx(f.d));
  const N = s27Build().byDay[f.d].length;
  const rk = curRanks(f.d);
  const rH = (rk.gp[f.h] || 0) >= 8 ? rk.rank[f.h] : null, rA = (rk.gp[f.a] || 0) >= 8 ? rk.rank[f.a] : null;
  const facts = [
    ...teamFacts('home', f.h, true, row.nH, row.k, f.d, row.ctx.b2bH, row.ctx.t3H, row.ctx.restH, rH),
    ...teamFacts('away', f.a, false, row.nA, row.k, f.d, row.ctx.b2bA, row.ctx.t3A, row.ctx.restA, rA),
    ...pairFacts(f.h, f.a, f.d, prior),
    ...tableFacts(row, prior),
    ...dayFacts(f.d, row.k, N, prior)];
  const hot = facts.filter(x => x.dir === 'hot' && x.kind === 'L').sort((a, b) => a.p - b.p);
  const hotX = facts.filter(x => x.dir === 'hot' && x.kind === 'X');
  const cold = facts.filter(x => x.dir === 'cold' && x.kind === 'L');
  row.dos = { facts, hot, hotX, cold, M: facts.length, score: hot.reduce((s, x) => s - Math.log10(x.p), 0) };
  return row.dos;
}

function chipFact(x) {
  return `<span class="s-tag ${x.kind === 'X' ? 'tx' : ''}" title="${x.label} — ${x.hits}/${x.n}">${x.who ? x.who + ' · ' : ''}${x.short} <b>${x.hits}/${x.n}</b></span>`;
}

// ---------- 3. Teczka meczu (okno) ----------
function factCard(x, compact) {
  const r = 100 * x.rate, b = 100 * x.base, diff = r - b;
  const ico = x.dir === 'hot' ? '🔥' : x.dir === 'cold' ? '❄' : '';
  const verdict = x.dir === 'hot' ? `<b style="color:var(--orange)">+${diff.toFixed(0)} pkt</b> ponad bazę` : x.dir === 'cold' ? `<b style="color:var(--blue)">${diff.toFixed(0)} pkt</b> poniżej bazy` : `${diff >= 0 ? '+' : ''}${diff.toFixed(0)} pkt vs baza`;
  const odds = x.rate > 0 && x.n >= 3 ? ` · opłaca się od kursu <b>${(1 / x.rate).toFixed(2)}</b>` : '';
  return `<div class="fc ${x.dir || ''} ${x.kind === 'X' ? 'kx' : ''}">
    <div class="fc-top"><span class="fc-label">${x.label}</span>${ico ? `<span class="fc-ico">${ico}</span>` : ''}</div>
    <div class="fc-main"><b>${x.hits}/${x.n}</b><span>${r.toFixed(0)}%</span><em>${x.kind === 'X' ? 'dogrywek' : 'łamaków'}</em></div>
    <div class="fc-bar" title="Pasek = wynik, kreska = baza ${b.toFixed(0)}%"><i style="width:${Math.min(100, r)}%"></i><u style="left:${Math.min(100, b)}%"></u></div>
    <div class="fc-sub">baza ${b.toFixed(0)}% · ${verdict}${odds}</div>
    ${!compact && x.detail ? `<div class="fc-detail">${x.detail}</div>` : ''}
  </div>`;
}

function openMatchDossier(row) {
  const f = row.f, D = dossierFor(row), res = row.res;
  const order = x => (x.dir === 'hot' ? 0 : x.dir === 'cold' ? 1 : 2);
  const grid = fs => fs.length ? `<div class="fc-grid">${fs.slice().sort((a, b) => order(a) - order(b) || b.n - a.n).map(x => factCard(x)).join('')}</div>` : '<div class="small-note">Brak danych.</div>';
  const by = sc => D.facts.filter(x => x.scope === sc && x.n > 0);
  const hotAll = D.facts.filter(x => x.dir === 'hot');
  const exp = (0.08 * D.M * 0.8).toFixed(1);
  const tabs = [['top', '🔥 Najważniejsze', hotAll], ['home', '🏠 ' + f.h.split(' ').pop(), by('home')], ['away', '✈ ' + f.a.split(' ').pop(), by('away')], ['pair', '⚔ Para', by('pair')], ['table', '📊 Tabela i odpoczynek', by('table')], ['day', '🗓 Dzień', by('day')], ['hist', '📜 Spotkania', null]];
  const box = document.getElementById('modal-box');
  const rk = row.rankH ? ` · tabela: #${row.rankH} vs #${row.rankA}` : '';
  box.innerHTML = `
    <div class="modal-close" onclick="closeModal()">✕</div>
    <div class="modal-header ${res ? 'acc-' + (res.cls === '1/2' ? 'c12' : res.cls === '2/1' ? 'c21' : res.cls === 'X' ? 'cx' : 'cnone') : 'acc-cnone'}">
      <div class="modal-matchup"><div class="modal-team">${f.h}</div>
        <div class="modal-score" style="${res ? '' : 'font-size:16px;color:var(--ink-soft);'}">${res ? `${res.fh}:${res.fa}` : 'VS'}</div>
        <div class="modal-team">${f.a}</div></div>
      <div class="modal-meta">${fmtDate(f.d)} · kolejka K${row.k} · mecz nr ${row.nH} / ${row.nA}${rk}${res ? ` · przerwa ${res.halfH}:${res.halfA} · <b>${clsLabel(res.cls)}</b>` : ''}</div>
    </div>
    <div style="padding:16px 22px 24px;">
      <div class="fc-sum">
        <div><b style="color:var(--orange)">🔥 ${D.hot.length}</b><span>gorących</span></div>
        <div><b style="color:var(--blue)">❄ ${D.cold.length}</b><span>zimnych</span></div>
        <div><b>${D.M}</b><span>sprawdzonych</span></div>
        <div><b>~${exp}</b><span>gorących z samego przypadku</span></div>
      </div>
      <div class="small-note" style="margin:8px 0 14px;">Karta: <b>ile razy było / ile meczów</b>. Pasek = wynik, kreska = baza. 🔥 = min. +15 pkt ponad bazę i p ≤ 8%. „Opłaca się od kursu” = kurs, powyżej którego ten wynik historycznie by się zwracał. ${res ? 'Fakty liczone tylko z meczów sprzed tej daty.' : ''}</div>
      <div class="fc-tabs">${tabs.map((t, i) => `<button class="fc-tab ${i === 0 ? 'on' : ''}" data-t="${t[0]}">${t[1]}${t[2] ? `<small>${t[2].length}</small>` : ''}</button>`).join('')}</div>
      <div id="fc-body"></div>
    </div>`;
  const body = box.querySelector('#fc-body');
  const show = id => {
    box.querySelectorAll('.fc-tab').forEach(b => b.classList.toggle('on', b.dataset.t === id));
    if (id === 'hist') { body.innerHTML = h2hHistoryListHTML(f.h, f.a); body.querySelectorAll('[data-gid]').forEach(tr => { tr.onclick = () => openGameModal(tr.dataset.gid); }); return; }
    const fs = id === 'top' ? hotAll : by(id);
    body.innerHTML = id === 'top' && !fs.length ? '<div class="small-note">Żadna zależność nie przekroczyła progu — ten mecz nie ma wyraźnych wzorców. Sprawdź pozostałe zakładki.</div>' : grid(fs);
  };
  box.querySelectorAll('.fc-tab').forEach(b => { b.onclick = () => show(b.dataset.t); });
  show('top');
  document.getElementById('modal-overlay').classList.add('open');
}

// ---------- 4. Dni zwijane (wspólne dla Sezonu i Zakończonych) ----------
function heatClass(n) { return n >= 5 ? 'h3' : n >= 3 ? 'h2' : n >= 1 ? 'h1' : 'h0'; }
function dayOpen(key, def) { return key in DAY_OPEN ? DAY_OPEN[key] : def; }
function dayBlockHTML(key, head, bodyFn, open) {
  LAZY[key] = bodyFn;
  return `<section class="s-dayblock ${open ? '' : 'closed'}" data-key="${key}"><div class="s-dayhead click" data-toggle="${key}"><span class="caret">▾</span>${head}</div><div class="s-daybody" data-filled="${open ? 1 : 0}">${open ? bodyFn() : ''}</div></section>`;
}
function bindDays(el, afterFill) {
  el.querySelectorAll('[data-toggle]').forEach(h => {
    h.onclick = () => {
      const b = h.closest('.s-dayblock'), key = h.dataset.toggle, body = b.querySelector('.s-daybody');
      const open = b.classList.contains('closed');
      b.classList.toggle('closed'); DAY_OPEN[key] = open;
      if (open && body.dataset.filled === '0') { body.innerHTML = LAZY[key](); body.dataset.filled = '1'; afterFill(body); }
    };
  });
  afterFill(el);
}
function rowPills(rs) {
  const c = k => rs.filter(r => r.res.cls === k).length, l = c('1/2') + c('2/1') + c('X');
  return `<span class="day-pill" style="background:var(--orange-soft);color:var(--orange)">ŁAMAKI ${l}/${rs.length}</span>
    <span class="day-pill" style="background:var(--c12-soft);color:var(--c12)">1/2 ×${c('1/2')}</span><span class="day-pill" style="background:var(--c21-soft);color:var(--c21)">2/1 ×${c('2/1')}</span>
    <span class="day-pill" style="background:var(--cx-soft);color:var(--cx)">REMISY X ×${c('X')}</span><span class="day-pill" style="background:var(--cnone-soft);color:var(--cnone)">bez łamaka ×${c('brak_lamaka')}</span>`;
}

// ---------- 5. Widok: Sezon 26/27 (tygodnie → dni) ----------
function dayInfoHTML(d, rows) {
  const D = s27Build();
  const k = rows[0].k;
  const facts = dayFacts(d, k, rows.length, dosIndex().recs.slice(0, cutIdx(d))).filter(x => x.n > 0);
  const chips = facts.map(x => `<span class="s-tag ${x.dir === 'hot' ? '' : x.dir === 'cold' ? 'cd' : 'nt'}" title="${x.label} — ${x.hits}/${x.n} (${(100 * x.rate).toFixed(0)}%, baza ${(100 * x.base).toFixed(0)}%)">${x.dir === 'hot' ? '🔥 ' : x.dir === 'cold' ? '❄ ' : ''}${x.short} <b>${x.hits}/${x.n}</b></span>`).join('');
  const prevDays = D.days.filter(x => x < d && D.byDay[x].some(r => r.res)).slice(-7);
  const bars = prevDays.map(x => { const rs = D.byDay[x].filter(r => r.res), l = rs.filter(r => isLamak(r.res.cls)).length; return { x, l, n: rs.length }; });
  const tl = bars.reduce((a, b) => a + b.l, 0), tn = bars.reduce((a, b) => a + b.n, 0);
  const settle = bars.length ? `<div class="rz-wrap"><div class="rz-title">Rozliczenie · ${bars.length} ost. dni: <b>${tl}/${tn}</b> (${fmtPct(tl, tn, 0)})</div><div class="rz">${bars.map(b => `<div title="${dm(b.x)}: ${b.l}/${b.n} łamaków"><div class="rzbar"><i style="height:${pct(b.l, b.n)}%"></i></div><b>${b.l}/${b.n}</b><span>${dm(b.x)}</span></div>`).join('')}</div></div>` : '';
  const cold = facts.find(x => x.dir === 'cold' && x.kind === 'L' && x.short.startsWith('kolejka')), hot = facts.find(x => x.dir === 'hot' && x.kind === 'L');
  const todo = rows.filter(r => !r.res && r.dos).sort((a, b) => b.dos.hot.length - a.dos.hot.length || b.dos.score - a.dos.score);
  let tip = '';
  if (todo.length && todo[0].dos.hot.length >= 2) tip = `Najwięcej zbieżności: <b>${todo[0].f.h} – ${todo[0].f.a}</b> (🔥${todo[0].dos.hot.length}${todo[0].dos.hot[0] ? ': ' + todo[0].dos.hot[0].label : ''}).`;
  else if (cold) tip = `Kolejka ${k} historycznie rzadko łamie (${(100 * cold.rate).toFixed(0)}% vs ${(100 * cold.base).toFixed(0)}% bazy) — dzień raczej „zimny”.`;
  else if (hot) tip = `${hot.label}: ${hot.hits}/${hot.n} — dzień historycznie „gorący”.`;
  else tip = 'Brak wyraźnych schematów dla tego dnia — liga zachowuje się tu jak średnia.';
  return `<div class="s-dayinfo"><div class="s-tags">${chips}</div>${settle}<div class="s-tip">💡 ${tip}</div></div>`;
}

function seasonRowHTML(r) {
  const f = r.f, dd = dossierFor(r), res = r.res;
  const tags = [];
  if (r.ctx.b2bH || r.ctx.b2bA) tags.push(`<span class="s-tag b2b" title="Back-to-back w terminarzu">B2B ${[r.ctx.b2bH ? f.h.split(' ').pop() : null, r.ctx.b2bA ? f.a.split(' ').pop() : null].filter(Boolean).join(' + ')}</span>`);
  dd.hot.slice(0, 3).forEach(x => tags.push(chipFact(x)));
  dd.hotX.slice(0, 1).forEach(x => tags.push(chipFact(x)));
  const neutral = ['H2H', `mecze ${r.nH - 1}–${r.nH + 1}`, `mecze ${r.nA - 1}–${r.nA + 1}`].map((sh, ix) => dd.facts.find(x => x.short === sh && x.n > 0 && x.dir !== 'hot' && (ix === 0 || x.scope === (ix === 1 ? 'home' : 'away'))));
  neutral.filter(Boolean).slice(0, Math.max(0, 4 - tags.length)).forEach(x => tags.push(`<span class="s-tag nt" title="${x.label}">${x.who ? x.who + ' · ' : ''}${x.short} <b>${x.hits}/${x.n}</b></span>`));
  const sub = (role, n, rk, rest) => `${role} · mecz ${n}${rk ? ` · #${rk}` : ''}${rest != null ? ` · odp. ${rest}` : ''}`;
  const mid = res
    ? `<div><span class="s-score"><b>${res.fh}:${res.fa}</b>${res.ot ? ' <span class="small-note">OT</span>' : ''}</span> <span class="badge ${badgeClass(res.cls)}">${clsLabel(res.cls)}</span><div class="s-tags" style="margin-top:5px;">${tags.join('')}</div></div>`
    : `<div>${r.final ? `<div style="margin-bottom:4px;"><span class="s-score"><b>${r.final.fh}:${r.final.fa}</b></span> <span class="small-note">· wynik jest, czekamy na kwarty z 24score</span></div>` : ''}<div class="s-tags">${tags.join('') || '<span class="small-note">brak wyraźnych zależności</span>'}</div></div>`;
  return `<div class="s-row ${res ? rowClass(res.cls) : ''} ${heatClass(dd.hot.length)}" data-i="${r.i}">
    <div class="s-team">${f.h}<span class="vs">${sub('gosp.', r.nH, r.rankH, r.ctx.restH)}</span></div><div class="s-team">${f.a}<span class="vs">${sub('gość', r.nA, r.rankA, r.ctx.restA)}</span></div>
    ${mid}
    <div class="s-heat ${heatClass(dd.hot.length)}" title="Zależności wyraźnie ponad bazę (z ${dd.M} sprawdzonych)"><b>🔥 ${dd.hot.length}</b><span>z ${dd.M}</span></div></div>`;
}

function renderSezon2627() {
  const el = document.getElementById('view-sezon2627');
  const D = s27Build();
  const todayIso = localIso();
  if (!D.days.length) { el.innerHTML = `<div class="empty-state"><div class="ico">◇</div>Brak terminarza sezonu 26/27 (data/fixtures_2026_27.json).</div>`; return; }
  if (!s27Week || !D.weeks.includes(s27Week)) {
    const day = D.days.find(d => d >= todayIso && D.byDay[d].some(r => !r.res)) || D.days.find(d => d >= todayIso) || D.days[D.days.length - 1];
    s27Week = weekStart(day);
  }
  const done = D.rows.filter(r => r.res);
  const cnt = { '1/2': 0, '2/1': 0, 'X': 0 };
  done.forEach(r => { if (cnt[r.res.cls] !== undefined) cnt[r.res.cls]++; });
  const lam = cnt['1/2'] + cnt['2/1'] + cnt['X'];
  const wi = D.weeks.indexOf(s27Week);
  const wkLab = w => { const dd = D.days.filter(d => weekStart(d) === w); return `${dm(dd[0])}–${dm(dd[dd.length - 1])}`; };
  const wkBtns = D.weeks.map((w, i) => { const n = D.days.filter(d => weekStart(d) === w).reduce((a, d) => a + D.byDay[d].length, 0); return `<button class="s-day ${w === s27Week ? 'on' : ''} ${weekStart(todayIso) === w ? 'today' : ''}" data-week="${w}">Tydz. ${i + 1} · ${wkLab(w)}<small>${n}</small></button>`; }).join('');
  const days = D.days.filter(d => weekStart(d) === s27Week);
  const wkRows = days.flatMap(d => D.byDay[d]);
  const wDone = wkRows.filter(r => r.res), wl = wDone.filter(r => isLamak(r.res.cls)).length;

  el.innerHTML = `
  <div class="section-title"><h2>🔥 Sezon zasadniczy 26/27</h2><div class="rule"></div></div>
  <div class="s-stats">
    <div class="s-stat"><div class="k">Rozegrane</div><div class="v">${done.length}<span style="font-size:14px;color:var(--ink-soft)">/${D.rows.length}</span></div></div>
    <div class="s-stat hl"><div class="k">Łamaki w sezonie</div><div class="v">${done.length ? fmtPct(lam, done.length, 0) : '—'}</div><div class="s">${lam}/${done.length} · historia ${baselineRate().toFixed(1)}%</div></div>
    <div class="s-stat"><div class="k">1/2 · 2/1 · X</div><div class="v">${cnt['1/2']} · ${cnt['2/1']} · ${cnt['X']}</div></div>
    <div class="s-stat"><div class="k">Ten tydzień (${wkLab(s27Week)})</div><div class="v">${wkRows.length}<span style="font-size:14px;color:var(--ink-soft)"> mecz.</span></div><div class="s">${wDone.length ? `rozegrane: łamaki ${wl}/${wDone.length}` : 'jeszcze bez wyników'}</div></div>
  </div>
  <div class="s-days" id="s-weeks">${wkBtns}<input type="date" id="s-jump" value="${days[0]}" min="${D.days[0]}" max="${D.days[D.days.length - 1]}" style="flex:none;width:140px;font-size:12px;"></div>
  <div id="s-daylist">${days.map(d => {
    const rs = D.byDay[d], dn = rs.filter(r => r.res), allDone = dn.length === rs.length;
    const head = `<b>${dowName(d)} ${fmtDate(d)}</b><span class="kpill">K${rs[0].k}</span><span class="mono small-note" style="margin:0;">${rs.length} meczów</span>${dn.length ? rowPills(dn) : ''}${rs.some(r => r.final) ? `<span class="day-pill" style="background:var(--panel);color:var(--ink-soft)">wyniki bez kwart ×${rs.filter(r => r.final).length}</span>` : ''}`;
    const key = 's|' + d;
    return dayBlockHTML(key, head, () => {
      rs.forEach(dossierFor);
      const sorted = rs.slice().sort((a, b) => (a.res ? 1 : 0) - (b.res ? 1 : 0) || b.dos.hot.length - a.dos.hot.length || b.dos.score - a.dos.score);
      return dayInfoHTML(d, rs) + sorted.map(seasonRowHTML).join('');
    }, dayOpen(key, !allDone));
  }).join('')}</div>`;

  el.querySelectorAll('[data-week]').forEach(b => { b.onclick = () => { s27Week = b.dataset.week; renderSezon2627(); }; });
  document.getElementById('s-jump').onchange = e => { const v = e.target.value; if (!v) return; const dd = D.days.find(d => d >= v) || D.days[D.days.length - 1]; s27Week = weekStart(dd); renderSezon2627(); };
  const act = el.querySelector('.s-day.on'); if (act) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  bindDays(el, root => root.querySelectorAll('[data-i]').forEach(x => { x.onclick = () => { const r = D.rows[+x.dataset.i]; if (r.known) openMatchDossier(r); }; }));
}

// ---------- 6. Widok: Zakończone (sezon zasadniczy + preseason, dzień po dniu) ----------
function renderZakonczone() {
  const el = document.getElementById('view-zakonczone');
  const D = s27Build();
  const chip = (id, label, cur, attr) => `<div class="chip ${cur === id ? 'on' : ''}" data-${attr}="${id}">${label}</div>`;
  const test = c => zkFilter === 'all' ? true : zkFilter === 'lamak' ? isLamak(c) : c === zkFilter;
  const filters = `<div class="s-tools"><span class="lbl">Źródło</span>${chip('regular', 'Sezon zasadniczy 26/27', zkSource, 'zs')}${chip('pre', 'Preseason 26/27', zkSource, 'zs')}<span class="lbl">Typ</span>${chip('all', 'Wszystkie', zkFilter, 'zf')}${chip('lamak', 'Łamaki', zkFilter, 'zf')}${chip('1/2', '1/2', zkFilter, 'zf')}${chip('2/1', '2/1', zkFilter, 'zf')}${chip('X', 'X', zkFilter, 'zf')}</div>`;
  let head = '', blocks = '';
  let bind = () => {};
  if (zkSource === 'regular') {
    const done = D.rows.filter(r => r.res);
    if (!done.length) { el.innerHTML = `<div class="section-title"><h2>✅ Zakończone</h2><div class="rule"></div></div>${filters}<div class="empty-state"><div class="ico">◇</div>Brak rozegranych meczów sezonu zasadniczego.</div>`; bindZk(el); return; }
    const cnt = { '1/2': 0, '2/1': 0, 'X': 0, 'brak_lamaka': 0 };
    done.forEach(r => { cnt[r.res.cls]++; });
    const lam = cnt['1/2'] + cnt['2/1'] + cnt['X'];
    const recent = done.slice(-120); recent.forEach(r => { if (r.known) dossierFor(r); });
    const strong = recent.filter(r => r.dos && r.dos.hot.length >= 3), weak = recent.filter(r => r.dos && r.dos.hot.length < 3);
    const sl = strong.filter(r => isLamak(r.res.cls)).length, wl = weak.filter(r => isLamak(r.res.cls)).length;
    const days = [...new Set(done.map(r => r.f.d))].sort().reverse();
    head = `<div class="s-stats">
      <div class="s-stat"><div class="k">Rozegrane</div><div class="v">${done.length}</div><div class="s">w ${days.length} dniach ligowych</div></div>
      <div class="s-stat hl"><div class="k">Łamaki</div><div class="v">${lam}</div><div class="s">${fmtPct(lam, done.length)} meczów</div></div>
      <div class="s-stat"><div class="k">1/2 · 2/1</div><div class="v">${cnt['1/2']} · ${cnt['2/1']}</div></div>
      <div class="s-stat"><div class="k">Remisy po 4. kw. (X)</div><div class="v">${cnt['X']}</div></div>
      <div class="s-stat"><div class="k">Test wzorców (ost. ${recent.length})</div><div class="v" style="font-size:19px;">🔥≥3: ${sl}/${strong.length}</div><div class="s">reszta: ${wl}/${weak.length} łamaków</div></div></div>`;
    blocks = days.map((d, ix) => {
      const rs = done.filter(r => r.f.d === d), shown = rs.filter(r => test(r.res.cls));
      if (!shown.length) return '';
      const key = 'z|' + d;
      return dayBlockHTML(key, `<b>${dowName(d)} ${fmtDate(d)}</b><span class="kpill">K${rs[0].k}</span><span class="mono small-note" style="margin:0;">${rs.length} meczów</span>${rowPills(rs)}`,
        () => shown.map(r => { if (r.known) dossierFor(r); return finishedRowHTML(r); }).join(''), dayOpen(key, ix < 2));
    }).join('');
    bind = root => root.querySelectorAll('[data-i]').forEach(x => { x.onclick = () => { const r = D.rows[+x.dataset.i]; if (r.known) openMatchDossier(r); }; });
  } else {
    const res = allPreseasonResults().sort((a, b) => b.date_iso.localeCompare(a.date_iso) || b.time.localeCompare(a.time));
    const cnt = { '1/2': 0, '2/1': 0, 'X': 0, 'brak_lamaka': 0 };
    res.forEach(r => { cnt[r.classification] = (cnt[r.classification] || 0) + 1; });
    const lam = cnt['1/2'] + cnt['2/1'] + cnt['X'];
    const days = [...new Set(res.map(r => r.date_iso))];
    head = `<div class="s-stats"><div class="s-stat"><div class="k">Preseason · rozegrane</div><div class="v">${res.length}</div><div class="s">mecze towarzyskie — poza statystykami</div></div>
      <div class="s-stat hl"><div class="k">Łamaki</div><div class="v">${lam}</div><div class="s">${fmtPct(lam, res.length)}</div></div>
      <div class="s-stat"><div class="k">1/2 · 2/1 · X</div><div class="v">${cnt['1/2']} · ${cnt['2/1']} · ${cnt['X']}</div></div></div>`;
    blocks = days.map((d, ix) => {
      const rs = res.filter(r => r.date_iso === d), shown = rs.filter(r => test(r.classification));
      if (!shown.length) return '';
      const key = 'p|' + d, c = k => rs.filter(r => r.classification === k).length;
      return dayBlockHTML(key, `<b>${dowName(d)} ${fmtDate(d)}</b><span class="kpill">preseason</span><span class="mono small-note" style="margin:0;">${rs.length} meczów</span>
        <span class="day-pill" style="background:var(--orange-soft);color:var(--orange)">ŁAMAKI ${c('1/2') + c('2/1') + c('X')}/${rs.length}</span><span class="day-pill" style="background:var(--cx-soft);color:var(--cx)">REMISY X ×${c('X')}</span>`,
        () => shown.map(r => `<div class="s-row ${rowClass(r.classification)}" style="cursor:default;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,2fr);">
          <div class="s-team">${r.home_team}</div><div class="s-team">${r.away_team}</div>
          <div><span class="s-score"><b>${r.final_home}:${r.final_away}</b>${r.ot ? ' <span class="small-note">OT</span>' : ''}</span> <span class="badge ${badgeClass(r.classification)}">${clsLabel(r.classification)}</span>
          <div style="margin-top:3px;">${r.q.map(x => `<span class="mono" style="font-size:11px;color:var(--ink-soft);">${x[0]}:${x[1]}</span>`).join(' · ')} <span class="small-note">· przerwa ${r.halfH}:${r.halfA}</span></div></div></div>`).join(''), dayOpen(key, ix < 2));
    }).join('');
  }
  el.innerHTML = `<div class="section-title"><h2>✅ Zakończone</h2><div class="rule"></div></div>${head}${filters}${blocks || '<div class="empty-state"><div class="ico">◇</div>Brak meczów dla tego filtra.</div>'}`;
  bindZk(el);
  bindDays(el, bind);
}
function bindZk(el) {
  el.querySelectorAll('[data-zs]').forEach(c => { c.onclick = () => { zkSource = c.dataset.zs; renderZakonczone(); }; });
  el.querySelectorAll('[data-zf]').forEach(c => { c.onclick = () => { zkFilter = c.dataset.zf; renderZakonczone(); }; });
}
function finishedRowHTML(r) {
  const q = r.res.q.map(x => `<span class="mono" style="font-size:11px;color:var(--ink-soft);">${x[0]}:${x[1]}</span>`).join(' · ');
  return `<div class="s-row ${rowClass(r.res.cls)} ${r.dos ? heatClass(r.dos.hot.length) : ''}" data-i="${r.i}">
    <div class="s-team">${r.f.h}</div><div class="s-team">${r.f.a}</div>
    <div><span class="s-score"><b>${r.res.fh}:${r.res.fa}</b>${r.res.ot ? ' <span class="small-note">OT</span>' : ''}</span> <span class="badge ${badgeClass(r.res.cls)}">${clsLabel(r.res.cls)}</span>
      <div style="margin-top:3px;">${q} <span class="small-note">· przerwa ${r.res.halfH}:${r.res.halfA}</span></div></div>
    <div class="s-heat ${r.dos ? heatClass(r.dos.hot.length) : 'h0'}" title="Wzorce wskazane PRZED meczem"><b>🔥 ${r.dos ? r.dos.hot.length : '—'}</b><span>przed meczem</span></div></div>`;
}

// ---------- 7. Skaner schematów (wszystkie sezony, z testem powtarzalności) ----------
let schKind = 'L', schDir = 'hot', schStable = true, SCH = null;
function schemeData() {
  if (SCH) return SCH;
  const I = dosIndex();
  const seasons = [...new Set(I.recs.map(r => r.season))].filter(s => s !== CUR_SEASON).sort();
  const half = s => seasons.indexOf(s) % 2;
  const G = {}, C = {};
  const MON = ['', 'styczniu', 'lutym', 'marcu', 'kwietniu', 'maju', 'czerwcu', 'lipcu', 'sierpniu', 'wrześniu', 'październiku', 'listopadzie', 'grudniu'];
  const feed = cur => {
    const add = (key, dim, label, r) => {
      if (cur) { const c = C[key] || (C[key] = { n: 0, l: 0, x: 0 }); c.n++; if (r.l) c.l++; if (r.x) c.x++; return; }
      const g = G[key] || (G[key] = { dim, label, n: 0, l: 0, x: 0, hn: [0, 0], hl: [0, 0], hx: [0, 0] });
      const h = half(r.season); g.n++; g.hn[h]++; if (r.l) { g.l++; g.hl[h]++; } if (r.x) { g.x++; g.hx[h]++; }
    };
    I.recs.filter(r => (r.season === CUR_SEASON) === cur).forEach(r => {
      const odd = ODD_SEASONS.has(r.season), mo = +r.d.slice(5, 7);
      if (!odd) { add('K' + r.k, 'Kolejka', `Kolejka ${r.k} ligi (${r.k}. dzień ligowy sezonu)`, r); add('D' + r.d.slice(5), 'Data', `Data ${r.d.slice(8)}.${r.d.slice(5, 7)}`, r); }
      add('W' + r.dow + mo, 'Dzień × miesiąc', `${r.dow} w ${MON[mo]}`, r);
      add('P' + [r.h, r.a].sort().join('|'), 'Para drużyn', `Para: ${[r.h, r.a].sort().map(t => t.split(' ').pop()).join(' – ')}`, r);
      if (r.hr && r.ar) add('R' + rankB(r.hr) + '|' + rankB(r.ar), 'Tabela', `Miejsca w tabeli: gospodarz ${rankB(r.hr)} vs gość ${rankB(r.ar)}`, r);
      if (r.hrest != null && r.arest != null) add('S' + restB(r.hrest) + '|' + restB(r.arest), 'Odpoczynek', `Odpoczynek: gospodarz ${restLab(restB(r.hrest))}, gość ${restLab(restB(r.arest))}`, r);
    });
    Object.entries(I.TG).forEach(([t, list]) => list.filter(g => (g.season === CUR_SEASON) === cur).forEach(g => {
      const nm = t.split(' ').pop(), mo = +g.d.slice(5, 7), r = { season: g.season, l: g.l, x: g.x };
      add(`TD|${t}|${g.dow}`, 'Drużyna × dzień tyg.', `${nm}: ${g.dow.toLowerCase()}`, r);
      add(`TM|${t}|${mo}`, 'Drużyna × miesiąc', `${nm}: mecze w ${MON[mo]}`, r);
      const b = Math.floor((g.n - 1) / 5); add(`TN|${t}|${b}`, 'Drużyna × numer meczu', `${nm}: mecze nr ${b * 5 + 1}–${b * 5 + 5} sezonu`, r);
      if (g.rk) add(`TR|${t}|${rankB(g.rk)}`, 'Drużyna × tabela', `${nm}: gdy jest na miejscach ${rankB(g.rk)}`, r);
      if (g.rest != null && g.rest <= 14) add(`TS|${t}|${restB(g.rest)}`, 'Drużyna × odpoczynek', `${nm}: ${restLab(restB(g.rest))}`, r);
    }));
  };
  feed(false); feed(true);
  const all = Object.entries(G).filter(([, g]) => g.n >= 30).map(([k, g]) => ({ ...g, cur: C[k] || { n: 0, l: 0, x: 0 } }));
  SCH = { all, BL: I.BL, BX: I.BX, seasons: seasons.length };
  return SCH;
}
function renderSchematy(el) {
  const S = schemeData(), kx = schKind === 'X';
  const base = kx ? S.BX : S.BL;
  const rows = S.all.map(g => {
    const h = kx ? g.x : g.l, ha = kx ? g.hx : g.hl;
    const rate = h / g.n, hot = rate > base;
    const p = hot ? binomTail(h, g.n, base, true) : binomTail(h, g.n, base, false);
    const rA = g.hn[0] ? ha[0] / g.hn[0] : 0, rB = g.hn[1] ? ha[1] / g.hn[1] : 0;
    const min = Math.max(8, g.n * 0.12);
    const stable = g.hn[0] >= min && g.hn[1] >= min && (hot ? (rA > base + 0.02 && rB > base + 0.02) : (rA < base - 0.02 && rB < base - 0.02));
    const cur = kx ? g.cur.x : g.cur.l;
    return { g, h, rate, hot, p, rA, rB, stable, cur, curN: g.cur.n };
  });
  const T = rows.length, found = rows.filter(r => r.p <= 0.01), foundStable = found.filter(r => r.stable), bonf = rows.filter(r => r.p <= 0.05 / T);
  const fw = foundStable.filter(r => r.curN > 0), fwH = fw.reduce((a, r) => a + r.cur, 0), fwN = fw.reduce((a, r) => a + r.curN, 0), fwE = fw.reduce((a, r) => a + r.curN * (r.hot ? base : base), 0);
  const shown = rows.filter(r => (schDir === 'hot' ? r.hot : !r.hot) && (!schStable || r.stable)).sort((a, b) => a.p - b.p).slice(0, 40);
  const chip = (id, label, cur, attr) => `<div class="chip ${cur === id ? 'on' : ''}" data-${attr}="${id}">${label}</div>`;
  el.innerHTML = `
  <div class="s-tools"><span class="lbl">Szukaj</span>${chip('L', 'Łamaków', schKind, 'sk')}${chip('X', 'Remisów (X)', schKind, 'sk')}<span class="lbl">Kierunek</span>${chip('hot', '🔥 często', schDir, 'sd')}${chip('cold', '❄ rzadko', schDir, 'sd')}<span class="lbl">Filtr</span>${chip('1', 'Tylko powtarzalne', schStable ? '1' : '0', 'ss')}${chip('0', 'Wszystkie', schStable ? '1' : '0', 'ss')}</div>
  <div class="small-note" style="margin:0 0 10px;">Przeszukano <b>${T}</b> schematów w ${S.seasons} sezonach (kolejki, daty, dni × miesiące, pary drużyn, miejsca w tabeli, odpoczynek, drużyna × dzień / miesiąc / numer meczu / tabela / odpoczynek). Przy p ≤ 1% z samego przypadku wyszłoby ok. ${(T * 0.01 * 2).toFixed(0)}; wyszło <b>${found.length}</b> (powtarzalnych w obu połowach historii: ${foundStable.length}). Po korekcie na liczbę testów (p ≤ ${(0.05 / T).toFixed(5)}): <b>${bonf.length}</b>.<br>🔬 <b>Test na żywo (sezon 26/27, dane spoza historii):</b> schematy „powtarzalne” z p ≤ 1% zagrały dotąd ${fwH}/${fwN} ${kx ? 'dogrywek' : 'łamaków'} (sama baza dałaby ok. ${fwE.toFixed(1)}).</div>
  <div class="card" style="overflow-x:auto;padding:0;"><table style="font-size:12.5px;"><thead><tr><th>Rodzaj</th><th>Schemat</th><th class="num">Było</th><th class="num">%</th><th class="num">Baza</th><th class="num">p</th><th class="num">Połowa A / B</th><th class="num">26/27</th><th class="num">Kurs od</th></tr></thead><tbody>
  ${shown.map(r => `<tr class="${r.stable ? 'sch-stable' : ''}"><td class="small-note">${r.g.dim}</td><td>${r.g.label}</td><td class="num mono">${r.h}/${r.g.n}</td><td class="num mono"><b>${(100 * r.rate).toFixed(0)}%</b></td><td class="num mono small-note">${(100 * base).toFixed(0)}%</td><td class="num mono">${r.p < 0.0001 ? '<0.0001' : r.p.toFixed(4)}</td><td class="num mono small-note">${(100 * r.rA).toFixed(0)}% / ${(100 * r.rB).toFixed(0)}%</td><td class="num mono">${r.curN ? `${r.cur}/${r.curN}` : '—'}</td><td class="num mono">${r.rate > 0 ? (1 / r.rate).toFixed(2) : '—'}</td></tr>`).join('') || '<tr><td colspan="9" class="small-note" style="padding:16px;">Brak schematów spełniających filtr.</td></tr>'}
  </tbody></table></div>`;
  el.querySelectorAll('[data-sk]').forEach(c => { c.onclick = () => { schKind = c.dataset.sk; renderSchematy(el); }; });
  el.querySelectorAll('[data-sd]').forEach(c => { c.onclick = () => { schDir = c.dataset.sd; renderSchematy(el); }; });
  el.querySelectorAll('[data-ss]').forEach(c => { c.onclick = () => { schStable = c.dataset.ss === '1'; renderSchematy(el); }; });
}

function lastGamesListHTML(team) {
  const games = lastGamesFor(team, 5);
  if (!games.length) return '<div class="small-note">Brak historii.</div>';
  return `<div class="streak-track" style="margin-bottom:8px;">${games.slice().reverse().map(g => {
    const cls = g.classification;
    const color = isLamak(cls) ? (cls === '1/2' ? 'var(--c12)' : cls === '2/1' ? 'var(--c21)' : 'var(--cx)') : 'var(--cnone)';
    const label = isLamak(cls) ? LABELS[cls] : '';
    const opp = g.home_team === team ? g.away_team : g.home_team;
    const title = `${fmtDate(g.date_iso)} vs ${opp}: ${g.final_home}:${g.final_away} (${LABELS[cls] === '—' ? 'brak łamaka' : cls})`;
    return `<div class="streak-dot" style="background:${color};cursor:pointer;" title="${title}" data-gid="${g.game_id}">${label}</div>`;
  }).join('')}</div>
  <table style="font-size:12px;"><tbody>
  ${games.map(g => { const opp = g.home_team === team ? g.away_team : g.home_team; const home = g.home_team === team ? '(u siebie)' : '(wyjazd)'; return `
    <tr class="${rowClass(g.classification)}" style="cursor:pointer" data-gid="${g.game_id}">
      <td class="mono" style="padding:4px 6px;">${fmtDate(g.date_iso)}</td>
      <td style="padding:4px 6px;">vs ${opp} ${home}</td>
      <td class="mono" style="padding:4px 6px;">${g.final_home}:${g.final_away}</td>
      <td style="padding:4px 6px;"><span class="badge ${badgeClass(g.classification)}" style="font-size:10px;">${LABELS[g.classification]}</span></td>
    </tr>`; }).join('')}
  </tbody></table>`;
}

function h2hMonthPatternHTML(lamakGames) {
  const byMonth = {};
  lamakGames.forEach(g => { (byMonth[g.month] = byMonth[g.month] || []).push(g); });
  const repeatedMonths = Object.entries(byMonth).filter(([m, gs]) => gs.length >= 2);
  if (repeatedMonths.length) {
    return `<div class="small-note" style="background:var(--orange-soft);color:var(--orange);padding:8px 12px;border-radius:6px;margin-bottom:10px;">
      🔁 <b>Wzorzec do obserwacji:</b> ${repeatedMonths.map(([m, gs]) => `łamaki tej pary padały w <b>${m}</b> ${gs.length}× (${gs.map(g => fmtDate(g.date_iso)).join(', ')})`).join('; ')}.
      Przy tak małej próbce (${lamakGames.length} łamaków łącznie) to może być zbieg okoliczności, ale warto mieć oko na ten mecz właśnie w tym miesiącu w kolejnych sezonach.
    </div>`;
  } else if (lamakGames.length >= 2) {
    const months = [...new Set(lamakGames.map(g => g.month))];
    return `<div class="small-note" style="margin-bottom:10px;">Łamaki tej pary padały w różnych miesiącach (${months.join(', ')}) — na razie brak widocznego powtórzenia miesiąca, ale przy ${lamakGames.length} przypadkach to i tak mała próbka.</div>`;
  }
  return '';
}

function h2hHistoryListHTML(teamA, teamB) {
  const games = h2hGamesAll(teamA, teamB).sort((a, b) => b.date_iso.localeCompare(a.date_iso));
  if (!games.length) return `<div class="small-note">Brak wspólnych meczów w bazie (ta para nie grała ze sobą w ostatnich 3 sezonach).</div>`;
  const lamakGames = games.filter(g => isLamak(g.classification));
  const lamak = lamakGames.length;
  const patternNote = h2hMonthPatternHTML(lamakGames);

  return `<div class="small-note" style="margin-bottom:10px;">${games.length} spotkań w bazie, ${lamak} (${fmtPct(lamak, games.length)}) zakończonych łamakiem.</div>
  ${patternNote}
  <table style="font-size:12.5px;"><tbody>
  ${games.map(g => `
    <tr class="${rowClass(g.classification)}" style="cursor:pointer" data-gid="${g.game_id}">
      <td class="mono" style="padding:5px 8px;">${fmtDate(g.date_iso)}</td>
      <td style="padding:5px 8px;">${g.home_team} ${g.final_home}:${g.final_away} ${g.away_team}</td>
      <td style="padding:5px 8px;">${g.stage}</td>
      <td style="padding:5px 8px;"><span class="badge ${badgeClass(g.classification)}" style="font-size:10px;">${LABELS[g.classification]}</span></td>
    </tr>`).join('')}
  </tbody></table>`;
}

function openUpcomingForecastModal(fixture) {
  const sig = computeMatchSignal(fixture.home_team, fixture.away_team, false, false, fixture.date_iso);
  const fc = sig.fc;
  const b2b = fixture.b2b || preseasonB2B(fixture);
  const box = document.getElementById('modal-box');
  box.innerHTML = `
    <div class="modal-close" onclick="closeModal()">✕</div>
    <div class="modal-header acc-cnone">
      <div class="modal-matchup">
        <div class="modal-team">${fixture.home_team}</div>
        <div class="modal-score" style="font-size:16px;color:#B7C2CE;">VS</div>
        <div class="modal-team">${fixture.away_team}</div>
      </div>
      <div class="modal-meta">${fmtDate(fixture.date_iso)} · ${fixture.regular ? 'SEZON ZASADNICZY 26/27 — model o słabej mocy predykcyjnej' : fixture.time + ' · PRESEASON — sygnał niewiarygodny, patrz zastrzeżenie'}</div>
    </div>
    <div class="modal-body">
      ${signalBoxesHTML(sig)}
      ${signalTagsHTML(sig.tags)}
      <div class="card" style="margin-top:18px;">
        <h3>Szczegóły kierunkowe <span class="small-note" style="text-transform:none;font-family:'Inter',sans-serif;">(dla własnej analizy — którędy może pójść łamak)</span></h3>
        <div class="small-note">Historia: ${fixture.home_team} jako gospodarz kończy 1/2 w ${fc.hist12.toFixed(1)}% swoich meczów domowych; ${fixture.away_team} jako gość kończy 2/1 w ${fc.hist21.toFixed(1)}% meczów wyjazdowych. H2H (${fc.h2hN} spotkań w bazie): 1/2 ${fc.h2h12.toFixed(1)}%, 2/1 ${fc.h2h21.toFixed(1)}%, X ${fc.h2hX.toFixed(1)}%.
        ${(b2b.home || b2b.away) ? `<br><br>🔁 <b>Uwaga na terminarz:</b> ${[b2b.home ? fixture.home_team : null, b2b.away ? fixture.away_team : null].filter(Boolean).join(' i ')} ${(b2b.home && b2b.away) ? 'grają' : 'gra'} inny mecz ${fixture.regular ? '' : 'preseason '}w ciągu doby od tego spotkania — możliwa rotacja składu lub zmęczenie.` : ''}
        </div>
      </div>
      <div class="card" style="margin-top:18px;">
        <h3>${fixture.home_team} vs ${fixture.away_team} — wzajemne mecze (H2H)</h3>
        ${h2hHistoryListHTML(fixture.home_team, fixture.away_team)}
      </div>
      <div class="grid grid-2" style="margin-top:18px;">
        <div class="card">
          <h3>${fixture.home_team} — ostatnie mecze (solo)</h3>
          ${lastGamesListHTML(fixture.home_team)}
        </div>
        <div class="card">
          <h3>${fixture.away_team} — ostatnie mecze (solo)</h3>
          ${lastGamesListHTML(fixture.away_team)}
        </div>
      </div>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
  box.querySelectorAll('[data-gid]').forEach(elx => { elx.onclick = () => openGameModal(elx.dataset.gid); });
}

function renderWnioski() {
  const el = document.getElementById('view-wnioski');
  const base = baselineRate();
  const totalG = REGULAR_GAMES().length;
  const totalLamak = REGULAR_GAMES().filter(g => isLamak(g.classification)).length;
  const c12 = REGULAR_GAMES().filter(g => g.classification === '1/2').length;
  const c21 = REGULAR_GAMES().filter(g => g.classification === '2/1').length;
  const cx = REGULAR_GAMES().filter(g => g.classification === 'X').length;

  const insights = generateInsights();

  let html = `
  <div class="section-title"><h2>Wnioski</h2><div class="rule"></div></div>
  <div class="section-desc">Automatycznie wygenerowane obserwacje na podstawie wybranego zakresu danych (${GLOBAL_SEASON === 'all' ? 'wszystkie 3 sezony' : 'sezon ' + GLOBAL_SEASON}, ${totalG} meczów regular season). Kliknij kartę żeby przejść do szczegółów.</div>

  <div class="hero-strip">
    <div class="hero-box"><div class="val">${fmtPct(totalLamak, totalG, 1)}</div><div class="lbl">Łamak w meczu</div></div>
    <div class="hero-box accent-green"><div class="val">${c12}</div><div class="lbl">1/2 (${fmtPct(c12, totalG, 1)})</div></div>
    <div class="hero-box accent-yellow"><div class="val">${c21}</div><div class="lbl">2/1 (${fmtPct(c21, totalG, 1)})</div></div>
    <div class="hero-box accent-purple"><div class="val">${cx}</div><div class="lbl">X — dogrywka (${fmtPct(cx, totalG, 1)})</div></div>
  </div>

  <div id="insights-list"></div>

  <div class="card" style="margin-top:24px;">
    <h3>Rozkład łamaków wg miesiąca</h3>
    <div class="small-note" style="margin-top:-8px;margin-bottom:6px;">Odsetek meczów zakończonych łamakiem (1/2, 2/1 lub X) w danym miesiącu, w wybranym zakresie danych.</div>
    ${renderMonthChartSVG()}
  </div>

  <details style="margin-top:30px;">
    <summary style="cursor:pointer;font-family:'Oswald',sans-serif;text-transform:uppercase;font-size:14px;color:var(--ink-soft);padding:10px 0;">Pełne rankingi sezonu (surowe dane) ▾</summary>
    <div id="ranking-tables" style="margin-top:14px;"></div>
  </details>
  `;
  el.innerHTML = html;

  const listBox = document.getElementById('insights-list');
  insights.forEach(ins => {
    const card = document.createElement('div');
    card.className = 'insight-card type-' + ins.type;
    card.innerHTML = `
      <div class="insight-num">${ins.num}</div>
      <div class="insight-text"><div class="headline">${ins.headline}</div><div class="sub">${ins.sub}</div></div>
      ${ins.action ? '<div class="insight-cta">Zobacz →</div>' : ''}
    `;
    if (ins.action) card.onclick = ins.action;
    listBox.appendChild(card);
  });

  renderRankingTables(document.getElementById('ranking-tables'));
}

function renderRankingTables(container) {
  const arr = TEAMS.map(t => TEAM_STATS[t]);
  function table(title, rows, cols) {
    let html = `<div class="card" style="margin-bottom:16px;"><h3>${title}</h3><table><thead><tr><th>#</th><th>Drużyna</th>${cols.map(c => `<th class="num">${c.label}</th>`).join('')}</tr></thead><tbody>`;
    rows.forEach((r, i) => {
      html += `<tr><td><span class="rank-num">${i + 1}</span></td><td class="team-cell">${r.team}</td>`;
      cols.forEach(c => html += `<td class="num">${c.fmt(r)}</td>`);
      html += `</tr>`;
    });
    return html + `</tbody></table></div>`;
  }
  let html = `<div class="grid grid-2">`;
  html += table('Najwięcej 1/2', [...arr].sort((a, b) => b.c12 - a.c12).slice(0, 10), [{ label: '1/2', fmt: r => r.c12 }, { label: '%', fmt: r => fmtPct(r.c12, r.total) }]);
  html += table('Najwięcej 2/1', [...arr].sort((a, b) => b.c21 - a.c21).slice(0, 10), [{ label: '2/1', fmt: r => r.c21 }, { label: '%', fmt: r => fmtPct(r.c21, r.total) }]);
  html += table('Najwięcej remisów (X)', [...arr].sort((a, b) => b.cx - a.cx).slice(0, 10), [{ label: 'X', fmt: r => r.cx }, { label: '%', fmt: r => fmtPct(r.cx, r.total) }]);
  html += table('Najdłuższa seria bez łamaka', [...arr].sort((a, b) => b.maxNoLamak - a.maxNoLamak).slice(0, 10), [{ label: 'Seria', fmt: r => r.maxNoLamak }]);
  html += `</div>`;
  container.innerHTML = html;
}

// ============================================================
// TERMINARZ
// ============================================================
let terminarzTeamFilter = 'all';
let terminarzTypeFilter = 'all'; // all | 1/2 | 2/1 | X | none
let terminarzStageFilter = 'regular';

let terminarzRoundFrom = null, terminarzRoundTo = null;

// ============================================================
// KOLEJKA = SLOT LIGOWY (dzień rozgrywkowy, w którym żadna drużyna nie gra dwa razy)
// + WZORCE KOLEJEK w Terminarzu
// ============================================================
function computeDaySlots(stageFilter) {
  const stage = stageFilter === 'preseason' ? 'regular' : stageFilter;
  const bySeason = {};
  ALL_GAMES.filter(g => stage === 'all' || g.stage === stage).forEach(g => {
    const s = bySeason[g.season] = bySeason[g.season] || {};
    (s[g.date_iso] = s[g.date_iso] || []).push(g);
  });
  const slots = []; const byKey = {};
  Object.keys(bySeason).sort().forEach(season => {
    const dates = Object.keys(bySeason[season]).sort();
    let prev = null;
    dates.forEach((date, i) => {
      const gs = bySeason[season][date];
      const c = { '1/2': 0, '2/1': 0, 'X': 0 };
      gs.forEach(g => { if (c[g.classification] !== undefined) c[g.classification]++; });
      const sl = { season, date, k: i + 1, kMax: dates.length, n: gs.length, c12: c['1/2'], c21: c['2/1'], x: c['X'],
        l: c['1/2'] + c['2/1'] + c['X'], dow: gs[0].day_of_week, games: gs, prev };
      slots.push(sl); byKey[season + '|' + date] = sl; prev = sl;
    });
  });
  return { slots, byKey };
}

function computeKolejkaMap(stageFilter) {
  const { slots } = computeDaySlots(stageFilter);
  const map = {}; const maxPerSeason = {};
  slots.forEach(s => { s.games.forEach(g => { map[g.game_id] = s.k; }); maxPerSeason[s.season] = s.kMax; });
  return { map, maxPerSeason };
}

let terminarzSlotFilter = 'all'; // all | nolamak | withx | hi40 | afterx
let patK = null, patDate = '', patOpen = false;
let CUR_SLOT_BY_KEY = {};

function slotAgg(list) {
  return list.reduce((a, s) => ({ days: a.days + 1, n: a.n + s.n, l: a.l + s.l, x: a.x + s.x }), { days: 0, n: 0, l: 0, x: 0 });
}
function zScore(h, n, p) { return n && p > 0 && p < 1 ? (h / n - p) / Math.sqrt(p * (1 - p) / n) : 0; }
function zTag(z) { const a = Math.abs(z); return a >= 3 ? 'sygnał' : a >= 2 ? 'słaby' : 'szum'; }
function zCell(h, n, p) {
  if (!n) return '—';
  const z = zScore(h, n, p);
  const strong = Math.abs(z) >= 2;
  return `<b>${(100 * h / n).toFixed(0)}%</b> <span class="small-note" style="${strong ? 'color:var(--orange);font-weight:600;' : ''}">${h}/${n} · z ${z >= 0 ? '+' : ''}${z.toFixed(1)}</span>`;
}

function slotFeatures(s) {
  const f = [];
  f.push(['Dzień tygodnia', s.dow]);
  f.push(['Liczba meczów w kolejce', s.n <= 4 ? '1–4 mecze' : s.n <= 8 ? '5–8 meczów' : s.n <= 11 ? '9–11 meczów' : s.n <= 14 ? '12–14 meczów' : '15+ meczów']);
  const ph = Math.floor((s.k - 1) / 30);
  f.push(['Faza sezonu (co 30 kolejek)', `kolejki ${ph * 30 + 1}–${ph * 30 + 30}`]);
  f.push(['Miesiąc', monthNameFromISO(s.date)]);
  const dom = +s.date.slice(8, 10);
  f.push(['Część miesiąca', dom <= 10 ? '1.–10. dzień' : dom <= 20 ? '11.–20. dzień' : '21.–31. dzień']);
  if (s.prev) {
    f.push(['Poprzednia kolejka: dogrywki', s.prev.x > 0 ? 'była min. 1 dogrywka (X)' : 'bez X']);
    f.push(['Poprzednia kolejka: łamaki', s.prev.l === 0 ? 'zero łamaków' : (s.prev.l / s.prev.n >= 0.4 ? '≥40% łamaków' : '1–39% łamaków')]);
  }
  return f;
}

function slotPassesFilter(s) {
  if (terminarzSlotFilter === 'nolamak') return s.l === 0;
  if (terminarzSlotFilter === 'withx') return s.x > 0;
  if (terminarzSlotFilter === 'hi40') return s.l / s.n >= 0.4;
  if (terminarzSlotFilter === 'afterx') return !!s.prev && s.prev.x > 0;
  return true;
}

function renderKolejkaPatterns() {
  const box = document.getElementById('term-patterns');
  if (!box) return;
  if (terminarzStageFilter === 'preseason') { box.innerHTML = ''; return; }
  const { slots } = computeDaySlots(terminarzStageFilter);
  const tot = slotAgg(slots);
  if (!tot.n) { box.innerHTML = ''; return; }
  const BL = tot.l / tot.n, BX = tot.x / tot.n;
  const noL = slots.filter(s => s.l === 0).length, withX = slots.filter(s => s.x > 0).length;
  const maxK = Math.max(...slots.map(s => s.kMax));

  box.innerHTML = `<details class="card" id="pat-details" style="margin-bottom:14px;padding:14px 18px;" ${patOpen ? 'open' : ''}>
    <summary style="cursor:pointer;font-family:'Oswald',sans-serif;font-size:15px;text-transform:uppercase;letter-spacing:0.02em;">Wzorce kolejek — kiedy łamią, a kiedy remis</summary>
    <div class="small-note" style="margin:10px 0;">Kolejka = dzień rozgrywkowy ligi (K1 = pierwszy dzień sezonu). Baza dla wybranej fazy: łamak <b>${(100 * BL).toFixed(1)}%</b> meczów, X (dogrywka) <b>${(100 * BX).toFixed(1)}%</b> · ${slots.length} kolejek, ${tot.n} meczów · kolejek bez żadnego łamaka: ${(100 * noL / slots.length).toFixed(0)}%, z min. 1 dogrywką: ${(100 * withX / slots.length).toFixed(0)}%.
    <b>z</b> = odchylenie od bazy w jednostkach błędu standardowego: |z| &lt; 2 to szum, 2–3 słaby trop, ≥ 3 dopiero coś godnego uwagi.</div>

    <h3 style="margin:14px 0 8px;">1. Sprawdź kolejkę lub dzień</h3>
    <div class="controls-row" style="margin-bottom:10px;">
      <div class="field"><label>Numer kolejki (1–${maxK})</label><input type="number" id="pat-k" min="1" max="${maxK}" value="${patK ?? ''}" style="width:90px;"></div>
      <div class="field"><label>albo data</label><input type="date" id="pat-date" value="${patDate}"></div>
      <div class="field"><label>&nbsp;</label><button class="btn secondary" id="pat-clear" type="button">Wyczyść</button></div>
    </div>
    <div id="pat-check"></div>

    <h3 style="margin:18px 0 8px;">2. Skaner schematów — co odstaje od bazy</h3>
    <div id="pat-scan"></div>
  </details>`;

  document.getElementById('pat-details').ontoggle = e => { patOpen = e.target.open; };
  document.getElementById('pat-k').oninput = e => { patK = +e.target.value || null; renderPatCheck(slots, BL, BX); };
  document.getElementById('pat-date').oninput = e => { patDate = e.target.value; renderPatCheck(slots, BL, BX); };
  document.getElementById('pat-clear').onclick = () => { patK = null; patDate = ''; renderKolejkaPatterns(); };
  renderPatCheck(slots, BL, BX);
  renderPatScan(slots, BL, BX);
}

function renderPatCheck(slots, BL, BX) {
  const out = document.getElementById('pat-check');
  const K = patK, dt = patDate;
  if (!K && !dt) { out.innerHTML = `<div class="small-note">Wpisz numer kolejki i/lub datę, żeby zobaczyć, co działo się w podobnych kolejkach w historii.</div>`; return; }
  const groups = [];
  if (K) {
    groups.push({ label: `Kolejka ${K} (we wszystkich sezonach)`, list: slots.filter(s => s.k === K) });
    groups.push({ label: `Kolejki ${Math.max(1, K - 3)}–${K + 3}`, list: slots.filter(s => Math.abs(s.k - K) <= 3) });
  }
  if (dt) {
    const DOW = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
    const dow = DOW[new Date(dt + 'T12:00:00').getDay()], dom = +dt.slice(8, 10), mon = +dt.slice(5, 7);
    groups.push({ label: `${dow} (każdy taki dzień tygodnia)`, list: slots.filter(s => s.dow === dow) });
    groups.push({ label: `${dom}. dzień miesiąca`, list: slots.filter(s => +s.date.slice(8, 10) === dom) });
    groups.push({ label: `${monthNameFromISO(dt)} (cały miesiąc)`, list: slots.filter(s => +s.date.slice(5, 7) === mon) });
    if (K) groups.push({ label: `${dow} w okolicy kolejki ${K} (±15)`, list: slots.filter(s => s.dow === dow && Math.abs(s.k - K) <= 15) });
  }
  const rows = groups.map(g => ({ ...g, a: slotAgg(g.list) }));
  const anyStrong = rows.some(r => r.a.n && (Math.abs(zScore(r.a.l, r.a.n, BL)) >= 2 || Math.abs(zScore(r.a.x, r.a.n, BX)) >= 2));
  let html = `<div class="card" style="overflow-x:auto;padding:0;"><table><thead><tr><th>Grupa kolejek</th><th class="num">Kolejek</th><th>Łamak</th><th>X (dogrywka)</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${r.label}</td><td class="num">${r.a.days}</td><td>${zCell(r.a.l, r.a.n, BL)}</td><td>${zCell(r.a.x, r.a.n, BX)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="small-note" style="margin-top:6px;">${anyStrong ? 'Przynajmniej jedna grupa odbiega od bazy (|z| ≥ 2) — sprawdź, czy próbka jest sensowna (kolumna „Kolejek”).' : 'Żadna z grup nie odbiega istotnie od bazy — to, co widać, mieści się w zwykłym szumie.'}</div>`;
  if (K) {
    const per = slots.filter(s => s.k === K);
    html += `<div style="margin-top:12px;font-family:'Oswald',sans-serif;font-size:13px;text-transform:uppercase;">Kolejka ${K} sezon po sezonie</div>
    <div class="card" style="overflow-x:auto;padding:0;"><table><thead><tr><th>Sezon</th><th>Data</th><th class="num">Meczów</th><th class="num">1/2</th><th class="num">2/1</th><th class="num">X</th><th class="num">Łamaki</th></tr></thead><tbody>
    ${per.map(s => `<tr><td>${s.season}</td><td class="mono">${fmtDate(s.date)} <span class="small-note">${s.dow}</span></td><td class="num">${s.n}</td>
      <td class="num">${s.c12 ? `<span class="badge badge-12">${s.c12}</span>` : '0'}</td><td class="num">${s.c21 ? `<span class="badge badge-21">${s.c21}</span>` : '0'}</td>
      <td class="num">${s.x ? `<span class="badge badge-x">${s.x}</span>` : '0'}</td><td class="num">${s.l}/${s.n} (${(100 * s.l / s.n).toFixed(0)}%)</td></tr>`).join('') || '<tr><td colspan="7" style="color:var(--ink-soft)">Brak takiej kolejki w wybranej fazie.</td></tr>'}
    </tbody></table></div>`;
  }
  out.innerHTML = html;
}

function renderPatScan(slots, BL, BX) {
  const out = document.getElementById('pat-scan');
  const agg = {};
  slots.forEach(s => slotFeatures(s).forEach(([grp, val]) => {
    const a = agg[grp + '|' + val] = agg[grp + '|' + val] || { grp, val, days: 0, n: 0, l: 0, x: 0 };
    a.days++; a.n += s.n; a.l += s.l; a.x += s.x;
  }));
  const all = Object.values(agg).filter(a => a.n >= 40).map(a => ({ ...a, zl: zScore(a.l, a.n, BL), zx: zScore(a.x, a.n, BX) }));
  all.forEach(a => { a.m = Math.max(Math.abs(a.zl), Math.abs(a.zx)); });
  all.sort((a, b) => b.m - a.m);
  const expected = (all.length * 2 * 0.0455).toFixed(1);
  const strong = all.filter(a => a.m >= 2).length;
  out.innerHTML = `<div class="small-note" style="margin-bottom:8px;">Przetestowano ${all.length} wartości cech kolejki. Przy tylu testach samo z siebie wypadnie ok. ${expected} wyników z |z| ≥ 2 (osobno dla łamaka i X) — tu jest ich ${strong}. Gdy wynik jest bliski tej liczbie, to nie schemat, tylko przypadek.</div>
  <div class="card" style="overflow-x:auto;padding:0;"><table><thead><tr><th>Cecha</th><th>Wartość</th><th class="num">Kolejek</th><th>Łamak</th><th>X</th><th>Ocena</th></tr></thead><tbody>
  ${all.slice(0, 12).map(a => `<tr><td>${a.grp}</td><td>${a.val}</td><td class="num">${a.days}</td><td>${zCell(a.l, a.n, BL)}</td><td>${zCell(a.x, a.n, BX)}</td><td class="small-note">${zTag(a.m >= 0 ? (Math.abs(a.zl) >= Math.abs(a.zx) ? a.zl : a.zx) : 0)}</td></tr>`).join('')}
  </tbody></table></div>`;
}


// ============================================================
// WYNIKI — rozegrane mecze preseason 26/27 (po kwartach) + wpisywanie kolejnych
// ============================================================
function renderWyniki() {
  const el = document.getElementById('view-wyniki');
  const res = allPreseasonResults().sort((a, b) => b.date_iso.localeCompare(a.date_iso) || b.time.localeCompare(a.time));
  const cnt = { '1/2': 0, '2/1': 0, 'X': 0, 'brak_lamaka': 0 };
  res.forEach(r => { cnt[r.classification] = (cnt[r.classification] || 0) + 1; });
  const lamaki = cnt['1/2'] + cnt['2/1'] + cnt['X'];

  function predText(r) {
    if (!TEAMS.includes(r.home_team) || !TEAMS.includes(r.away_team)) return '—';
    try {
      const sig = computeMatchSignal(r.home_team, r.away_team, false, false, r.date_iso);
      return `ŁAMAK ${sig.pLamak.toFixed(0)}% · REMIS ${sig.pRemis.toFixed(0)}%`;
    } catch (e) { return '—'; }
  }

  let html = `<div class="section-title"><h2>🧪 Preseason 26/27 — wyniki</h2><div class="rule"></div></div>
  <div class="section-desc">Rozegrane mecze preseason 26/27 z wynikami po kwartach — uzupełniane automatycznie każdego ranka z en.24score.com. Kolory jak w całej aplikacji: zielony 1/2, żółty 2/1, fioletowy X, czerwony NIC. Kolumna „Prognoza” to to, co model dawał przed meczem.</div>
  <div class="grid grid-3" style="margin:16px 0;">
    <div class="card"><div class="stat"><div class="val">${res.length}</div><div class="lbl">Rozegranych meczów</div></div></div>
    <div class="card"><div class="stat"><div class="val">${lamaki}/${res.length}</div><div class="lbl">Łamaki (${fmtPct(lamaki, res.length)})</div></div></div>
    <div class="card"><div class="stat"><div class="val">${cnt['1/2']} · ${cnt['2/1']} · ${cnt['X']}</div><div class="lbl">1/2 · 2/1 · X</div></div></div>
  </div>`;

  if (!res.length) {
    html += `<div class="empty-state"><div class="ico">◇</div>Brak rozegranych meczów.</div>`;
  } else {
    html += `<div class="card" style="overflow-x:auto;"><table><thead><tr>
      <th>Data</th><th>Mecz</th><th class="num">Q1</th><th class="num">Q2</th><th class="num">Q3</th><th class="num">Q4</th>
      <th class="num">Przerwa</th><th class="num">Wynik</th><th>Typ</th><th>Prognoza</th></tr></thead><tbody>
      ${res.map(r => `<tr class="${rowClass(r.classification)}">
          <td class="mono">${fmtDate(r.date_iso)}<div class="small-note">${r.time}</div></td>
          <td>${r.home_team} — ${r.away_team}</td>
          ${r.q.map(x => `<td class="num mono">${x[0]}:${x[1]}</td>`).join('')}
          <td class="num mono">${r.halfH}:${r.halfA}</td>
          <td class="num mono"><b>${r.final_home}:${r.final_away}</b>${r.ot ? ' <span class="small-note">OT</span>' : ''}</td>
          <td><span class="badge ${badgeClass(r.classification)}">${clsLabel(r.classification)}</span></td>
          <td class="small-note">${predText(r)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  el.innerHTML = html;
}

// Preseason w zakładce Terminarz (historia) — wybierany w polu „Faza”
function renderPreseasonHistory(box) {
  let res = allPreseasonResults();
  if (terminarzTeamFilter !== 'all') res = res.filter(r => r.home_team === terminarzTeamFilter || r.away_team === terminarzTeamFilter);
  if (terminarzTypeFilter === 'lamak') res = res.filter(r => isLamak(r.classification));
  else if (terminarzTypeFilter !== 'all') res = res.filter(r => r.classification === terminarzTypeFilter);
  res.sort((a, b) => b.date_iso.localeCompare(a.date_iso) || b.time.localeCompare(a.time));
  if (!res.length) { box.innerHTML = `<div class="empty-state"><div class="ico">◇</div>Brak rozegranych meczów preseason dla wybranych filtrów.</div>`; return; }

  const counts = { '1/2': 0, '2/1': 0, 'X': 0 };
  res.forEach(r => { if (counts[r.classification] !== undefined) counts[r.classification]++; });
  let html = `<div class="card" style="padding:14px 18px;">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="font-family:'Oswald',sans-serif;font-size:15px;text-transform:uppercase;letter-spacing:0.02em;">Preseason 2026/27</span>
      <span class="mono small-note">${res.length} mecz.</span>
      <span class="day-pill" style="background:var(--c12-soft);color:var(--c12)">1/2 ×${counts['1/2']}</span>
      <span class="day-pill" style="background:var(--c21-soft);color:var(--c21)">2/1 ×${counts['2/1']}</span>
      <span class="day-pill" style="background:var(--cx-soft);color:var(--cx)">X ×${counts['X']}</span>
    </div>
    <div class="small-note" style="margin-top:6px;">Mecze towarzyskie — nie wliczają się do statystyk drużyn, H2H ani prognozy.</div>`;
  let lastDay = null;
  res.forEach(r => {
    if (r.date_iso !== lastDay) {
      html += `<div class="day-divider" style="cursor:default;"><span class="dname">${fmtDate(r.date_iso)}</span></div>`;
      lastDay = r.date_iso;
    }
    const half = `<div class="small-note" style="font-weight:400;">przerwa ${r.halfH}:${r.halfA}</div>`;
    const title = r.q.map(x => `${x[0]}:${x[1]}`).join(', ');
    html += `<div class="game-row-nodate ${rowClass(r.classification)}" style="cursor:default;" title="${title}">
      <div>${r.home_team}</div><div class="gscore mono">${r.final_home}:${r.final_away}${r.ot ? ' OT' : ''}${half}</div><div>${r.away_team}</div>
      <div class="gbadge"><span class="badge ${badgeClass(r.classification)}">${clsLabel(r.classification)}</span></div></div>`;
  });
  box.innerHTML = html + `</div>`;
}

function renderTerminarz() {
  const el = document.getElementById('view-terminarz');
  const { maxPerSeason } = computeKolejkaMap(terminarzStageFilter === 'preseason' ? 'regular' : terminarzStageFilter);
  const globalMax = Math.max(...Object.values(maxPerSeason), 1);
  if (terminarzRoundFrom === null) terminarzRoundFrom = 1;
  if (terminarzRoundTo === null) terminarzRoundTo = globalMax;

  let html = `<div class="section-title"><h2>Terminarz</h2><div class="rule"></div></div>
  <div class="section-desc">Wszystkie mecze z wyraźnie oznaczonymi łamakami, pogrupowane wg sezonu → miesiąca → dnia. Kliknij mecz, żeby zobaczyć analizę "dlaczego".</div>
  <div class="controls-row">
    <div class="field"><label>Drużyna</label>
      <select id="term-team"><option value="all">Wszystkie</option>${TEAMS.map(t => `<option ${t === terminarzTeamFilter ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Faza</label>
      <select id="term-stage">
        <option value="regular" ${terminarzStageFilter === 'regular' ? 'selected' : ''}>Sezon zasadniczy</option>
        <option value="playoff" ${terminarzStageFilter === 'playoff' ? 'selected' : ''}>Playoff</option>
        <option value="playin" ${terminarzStageFilter === 'playin' ? 'selected' : ''}>Play-in</option>
        <option value="all" ${terminarzStageFilter === 'all' ? 'selected' : ''}>Wszystko</option>
        <option value="preseason" ${terminarzStageFilter === 'preseason' ? 'selected' : ''}>Preseason 26/27</option>
      </select>
    </div>
    <div class="field"><label>Od kolejki (1 = pierwszy dzień sezonu)</label>
      <input type="number" id="term-round-from" min="1" max="${globalMax}" value="${terminarzRoundFrom}" style="width:90px;">
    </div>
    <div class="field"><label>Do kolejki (max ${globalMax} = koniec sezonu)</label>
      <input type="number" id="term-round-to" min="1" max="${globalMax}" value="${terminarzRoundTo}" style="width:90px;">
    </div>
    <div class="field"><label>&nbsp;</label><button class="btn secondary" id="term-round-reset" type="button">Cały sezon</button></div>
  </div>
  <div class="small-note" style="margin-bottom:14px;">"Kolejka" = dzień rozgrywkowy ligi w danym sezonie (1 = pierwszy dzień, ${globalMax} = ostatni). Ustawiasz np. 30–60 żeby zobaczyć środek sezonu, niezależnie od miesięcy kalendarzowych.</div>
  <div id="term-patterns"></div>
  <div class="controls-row" style="margin-bottom:12px;"><div class="field"><label>Typ kolejki</label>
    <select id="term-slot">
      <option value="all" ${terminarzSlotFilter === 'all' ? 'selected' : ''}>Wszystkie kolejki</option>
      <option value="nolamak" ${terminarzSlotFilter === 'nolamak' ? 'selected' : ''}>Bez żadnego łamaka</option>
      <option value="withx" ${terminarzSlotFilter === 'withx' ? 'selected' : ''}>Z min. 1 dogrywką (X)</option>
      <option value="hi40" ${terminarzSlotFilter === 'hi40' ? 'selected' : ''}>≥40% łamaków</option>
      <option value="afterx" ${terminarzSlotFilter === 'afterx' ? 'selected' : ''}>Po kolejce z dogrywką</option>
    </select></div></div>
  <div class="chip-wrap" style="margin-bottom:12px;" id="term-type-chips"></div>
  <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">
    <button class="btn secondary" id="term-collapse-all" type="button">Zwiń wszystko</button>
    <button class="btn secondary" id="term-expand-all" type="button">Rozwiń wszystko</button>
  </div>
  <div id="term-list"></div>`;
  el.innerHTML = html;

  document.getElementById('term-collapse-all').onclick = () => {
    document.querySelectorAll('#term-list details').forEach(d => d.open = false);
    document.querySelectorAll('#term-list .day-group').forEach(g => g.classList.add('collapsed'));
  };
  document.getElementById('term-expand-all').onclick = () => {
    document.querySelectorAll('#term-list details').forEach(d => d.open = true);
    document.querySelectorAll('#term-list .day-group').forEach(g => g.classList.remove('collapsed'));
  };

  document.getElementById('term-slot').onchange = e => { terminarzSlotFilter = e.target.value; renderTerminarzList(); };
  document.getElementById('term-team').onchange = e => { terminarzTeamFilter = e.target.value; renderTerminarzList(); };
  document.getElementById('term-stage').onchange = e => { terminarzStageFilter = e.target.value; terminarzRoundFrom = null; terminarzRoundTo = null; renderTerminarz(); };
  document.getElementById('term-round-from').onchange = e => { terminarzRoundFrom = Math.max(1, +e.target.value || 1); renderTerminarzList(); };
  document.getElementById('term-round-to').onchange = e => { terminarzRoundTo = Math.max(1, +e.target.value || globalMax); renderTerminarzList(); };
  document.getElementById('term-round-reset').onclick = () => { terminarzRoundFrom = 1; terminarzRoundTo = globalMax; renderTerminarz(); };

  const typeChips = [
    { id: 'all', label: 'Wszystkie mecze' },
    { id: '1/2', label: '1/2' },
    { id: '2/1', label: '2/1' },
    { id: 'X', label: 'X (dogrywka)' },
    { id: 'lamak', label: 'Tylko łamaki' },
  ];
  const chipsBox = document.getElementById('term-type-chips');
  typeChips.forEach(c => {
    const d = document.createElement('div');
    d.className = 'chip' + (terminarzTypeFilter === c.id ? ' on' : '');
    d.textContent = c.label;
    d.onclick = () => { terminarzTypeFilter = c.id; renderTerminarz(); };
    chipsBox.appendChild(d);
  });

  renderKolejkaPatterns();
  renderTerminarzList();
}

function renderTerminarzList() {
  const box = document.getElementById('term-list');
  if (terminarzStageFilter === 'preseason') { renderPreseasonHistory(box); return; }
  const { map: kolejkaMap } = computeKolejkaMap(terminarzStageFilter);
  CUR_SLOT_BY_KEY = computeDaySlots(terminarzStageFilter).byKey;

  let games = GAMES().filter(g => terminarzStageFilter === 'all' || g.stage === terminarzStageFilter);
  if (terminarzTeamFilter !== 'all') games = games.filter(g => g.home_team === terminarzTeamFilter || g.away_team === terminarzTeamFilter);
  if (terminarzTypeFilter === 'lamak') games = games.filter(g => isLamak(g.classification));
  else if (terminarzTypeFilter !== 'all') games = games.filter(g => g.classification === terminarzTypeFilter);
  const rf = terminarzRoundFrom ?? 1, rt = terminarzRoundTo ?? 999;
  games = games.filter(g => { const k = kolejkaMap[g.game_id]; return k >= rf && k <= rt; });
  if (terminarzSlotFilter !== 'all') games = games.filter(g => { const sl = CUR_SLOT_BY_KEY[g.season + '|' + g.date_iso]; return sl && slotPassesFilter(sl); });

  games = games.slice().sort((a, b) => b.date_iso.localeCompare(a.date_iso));

  if (!games.length) { box.innerHTML = `<div class="empty-state"><div class="ico">◇</div>Brak meczów dla wybranych filtrów.</div>`; return; }

  const bySeason = {};
  const seasonOrder = [];
  games.forEach(g => {
    if (!bySeason[g.season]) { bySeason[g.season] = []; seasonOrder.push(g.season); }
    bySeason[g.season].push(g);
  });

  let html = '';
  seasonOrder.forEach((season, sIdx) => {
    const seasonGames = bySeason[season];
    const counts = { '1/2': 0, '2/1': 0, 'X': 0 };
    seasonGames.forEach(g => { if (counts[g.classification] !== undefined) counts[g.classification]++; });
    html += `<details class="card" style="margin-bottom:10px;padding:14px 18px;" ${sIdx === 0 ? 'open' : ''}>
      <summary style="cursor:pointer;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-family:'Oswald',sans-serif;font-size:15px;text-transform:uppercase;letter-spacing:0.02em;">Sezon ${season}</span>
        <span class="mono small-note">${seasonGames.length} mecz.</span>
        <span class="day-pill" style="background:var(--c12-soft);color:var(--c12)">1/2 ×${counts['1/2']}</span>
        <span class="day-pill" style="background:var(--c21-soft);color:var(--c21)">2/1 ×${counts['2/1']}</span>
        <span class="day-pill" style="background:var(--cx-soft);color:var(--cx)">X ×${counts['X']}</span>
      </summary>
      <div style="margin-top:10px;">${renderSeasonGameGroups(seasonGames)}</div>
    </details>`;
  });

  box.innerHTML = html;
  box.querySelectorAll('[data-gid]').forEach(row => { row.onclick = () => openGameModal(row.dataset.gid); });
  box.querySelectorAll('[data-toggle]').forEach(div => { div.onclick = () => { div.closest('.day-group').classList.toggle('collapsed'); }; });
}

function renderSeasonGameGroups(games) {
  let html = '';
  let lastMonthKey = null;
  let monthBuffer = [];
  let monthIdx = 0;

  function flushMonth() {
    if (!monthBuffer.length) return;
    monthIdx++;
    const m = monthBuffer[0];
    const counts = { '1/2': 0, '2/1': 0, 'X': 0 };
    monthBuffer.forEach(g => { if (counts[g.classification] !== undefined) counts[g.classification]++; });
    html += `<details class="month-block" data-monthid="m${m.season}_${monthIdx}" open>
      <summary class="month-divider" style="cursor:pointer;display:flex;align-items:center;gap:10px;">
        <span>${m.month.toUpperCase()} ${m.date_iso.slice(0, 4)}</span>
        <span class="mono" style="color:var(--ink-soft);font-size:11px;">· ${monthBuffer.length} mecz.</span>
        ${counts['1/2'] ? `<span class="day-pill" style="background:var(--c12-soft);color:var(--c12)">1/2 ×${counts['1/2']}</span>` : ''}
        ${counts['2/1'] ? `<span class="day-pill" style="background:var(--c21-soft);color:var(--c21)">2/1 ×${counts['2/1']}</span>` : ''}
        ${counts['X'] ? `<span class="day-pill" style="background:var(--cx-soft);color:var(--cx)">X ×${counts['X']}</span>` : ''}
      </summary>
      <div>${renderDayGroups(monthBuffer)}</div>
    </details>`;
    monthBuffer = [];
  }

  games.forEach(g => {
    const monthKey = g.date_iso.slice(0, 7);
    if (monthKey !== lastMonthKey) { flushMonth(); lastMonthKey = monthKey; }
    monthBuffer.push(g);
  });
  flushMonth();
  return html;
}

function renderDayGroups(games) {
  let html = '';
  let lastDay = null;
  let dayBuffer = [];
  let dayIdx = 0;

  function flushDay() {
    if (!dayBuffer.length) return;
    dayIdx++;
    const d = dayBuffer[0];
    const counts = { '1/2': 0, '2/1': 0, 'X': 0 };
    dayBuffer.forEach(g => { if (counts[g.classification] !== undefined) counts[g.classification]++; });
    const dow = d.day_of_week;
    html += `<div class="day-group" data-dayid="d${d.season}_${d.date_iso}_${dayIdx}">
      <div class="day-divider" data-toggle="d${d.season}_${d.date_iso}_${dayIdx}"><span class="chev">▾</span><span class="dname">${dow}</span><span>${fmtDate(d.date_iso)}</span><span class="mono" style="color:var(--ink-soft)">· ${dayBuffer.length} mecz.</span>${(function () { const sl = CUR_SLOT_BY_KEY[d.season + '|' + d.date_iso]; return sl ? `<span class="mono" style="color:var(--ink-soft)">· K${sl.k} · ${sl.l}/${sl.n} łamaków (${(100 * sl.l / sl.n).toFixed(0)}%)</span>` : ''; })()}
      <div class="dcount">
        ${counts['1/2'] ? `<span class="day-pill" style="background:var(--c12-soft);color:var(--c12)">1/2 ×${counts['1/2']}</span>` : ''}
        ${counts['2/1'] ? `<span class="day-pill" style="background:var(--c21-soft);color:var(--c21)">2/1 ×${counts['2/1']}</span>` : ''}
        ${counts['X'] ? `<span class="day-pill" style="background:var(--cx-soft);color:var(--cx)">X ×${counts['X']}</span>` : ''}
      </div></div>
      <div class="day-rows">`;
    dayBuffer.forEach(g => {
      html += `<div class="game-row-nodate ${rowClass(g.classification)}" data-gid="${g.game_id}">
        <div>${g.home_team}</div>
        <div class="gscore">${g.final_home}:${g.final_away}${g.overtime ? ' <span class="mono" style="font-size:10px;color:var(--ink-soft)">OT</span>' : ''}</div>
        <div>${g.away_team}</div>
        <div class="gbadge"><span class="badge ${badgeClass(g.classification)}">${LABELS[g.classification]}</span></div>
      </div>`;
    });
    html += `</div></div>`;
    dayBuffer = [];
  }

  games.forEach(g => {
    if (g.date_iso !== lastDay) { flushDay(); lastDay = g.date_iso; }
    dayBuffer.push(g);
  });
  flushDay();
  return html;
}

// ---------- Modal analizy meczu ----------
function openGameModal(gameId) {
  const game = ALL_GAMES.find(g => g.game_id === gameId);
  if (!game) return;
  const reasons = analyzeGame(game);

  const hStats = computeTeamStats(game.home_team);
  const aStats = computeTeamStats(game.away_team);
  const hRow = TEAM_ROWS.find(r => r.game.game_id === game.game_id && r.team === game.home_team);
  const aRow = TEAM_ROWS.find(r => r.game.game_id === game.game_id && r.team === game.away_team);

  const h2hBefore = h2hGamesAll(game.home_team, game.away_team).filter(g => g.date_iso < game.date_iso);
  const h2hLamakBefore = h2hBefore.filter(g => isLamak(g.classification)).length;

  const box = document.getElementById('modal-box');
  box.innerHTML = `
    <div class="modal-close" onclick="closeModal()">✕</div>
    <div class="modal-header acc-${rowClass(game.classification).replace('row-', '')}">
      <div class="modal-matchup">
        <div class="modal-team">${game.home_team}</div>
        <div class="modal-score">${game.final_home} : ${game.final_away}</div>
        <div class="modal-team">${game.away_team}</div>
      </div>
      <div class="modal-meta">${fmtDate(game.date_iso)} · ${game.stage === 'regular' ? 'Sezon zasadniczy' : game.stage === 'playoff' ? 'Playoff' : 'Play-in'} · sezon ${game.season} · 1. poł. ${game.half_home}:${game.half_away}${game.overtime ? ' · OT' : ''}
        &nbsp;&nbsp;<span class="badge ${badgeClass(game.classification)}" style="vertical-align:middle;">${LABELS[game.classification]}</span>
      </div>
    </div>
    <div class="modal-body">
      <div class="context-grid">
        <div class="context-team-card">
          <h4>${game.home_team} — kontekst przed meczem</h4>
          <div class="ctx-row"><span>Seria wejściowa</span><b>${hRow.ctx.win_streak_before >= 1 ? hRow.ctx.win_streak_before + 'W' : hRow.ctx.loss_streak_before >= 1 ? hRow.ctx.loss_streak_before + 'L' : '—'}</b></div>
          <div class="ctx-row"><span>Back-to-back</span><b>${hRow.ctx.back_to_back ? 'Tak' : 'Nie'}</b></div>
          <div class="ctx-row"><span>Dni odpoczynku</span><b>${hRow.ctx.rest_days ?? '—'}</b></div>
          <div class="ctx-row"><span>Łamaki w sezonie ${game.season}</span><b>${computeTeamStats(game.home_team, 'regular').team ? '' : ''}${(function () { const s = teamGames(game.home_team, 'regular', game.season); const before = s.filter(x => x.date_iso < game.date_iso); const l = before.filter(x => isLamak(x.classification)).length; return `${l}/${before.length}`; })()}</b></div>
        </div>
        <div class="context-team-card">
          <h4>${game.away_team} — kontekst przed meczem</h4>
          <div class="ctx-row"><span>Seria wejściowa</span><b>${aRow.ctx.win_streak_before >= 1 ? aRow.ctx.win_streak_before + 'W' : aRow.ctx.loss_streak_before >= 1 ? aRow.ctx.loss_streak_before + 'L' : '—'}</b></div>
          <div class="ctx-row"><span>Back-to-back</span><b>${aRow.ctx.back_to_back ? 'Tak' : 'Nie'}</b></div>
          <div class="ctx-row"><span>Dni odpoczynku</span><b>${aRow.ctx.rest_days ?? '—'}</b></div>
          <div class="ctx-row"><span>Łamaki w sezonie ${game.season}</span><b>${(function () { const s = teamGames(game.away_team, 'regular', game.season); const before = s.filter(x => x.date_iso < game.date_iso); const l = before.filter(x => isLamak(x.classification)).length; return `${l}/${before.length}`; })()}</b></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px;">
        <h3>H2H przed tym meczem</h3>
        <div class="small-note" style="margin-top:-6px;">${h2hBefore.length ? `${h2hLamakBefore}/${h2hBefore.length} (${fmtPct(h2hLamakBefore, h2hBefore.length)}) wcześniejszych spotkań tej pary zakończyło się łamakiem.` : 'To pierwsze spotkanie tej pary w bazie.'}</div>
      </div>

      <div class="card">
        <h3>Dlaczego mógł wystąpić ten wynik?</h3>
        <ul class="reason-list">
          ${reasons.map(r => `<li><span class="ico">${r.ico}</span><div><div>${r.text}</div>${r.stat ? `<div class="small-note" style="margin-top:3px;">${r.stat}</div>` : ''}</div></li>`).join('')}
        </ul>
      </div>

      <div class="card" style="margin-top:18px;">
        <h3>Wynik po kwartach</h3>
        <table><thead><tr><th></th><th class="num">Q1</th><th class="num">Q2</th><th class="num">Q3</th><th class="num">Q4</th>${game.ot_periods.map((_, i) => `<th class="num">OT${i + 1}</th>`).join('')}<th class="num">Wynik</th></tr></thead>
        <tbody>
          <tr><td>${game.home_team}</td><td class="num">${game.q1_home}</td><td class="num">${game.q2_home}</td><td class="num">${game.q3_home}</td><td class="num">${game.q4_home}</td>${game.ot_periods.map(p => `<td class="num">${p[0]}</td>`).join('')}<td class="num"><b>${game.final_home}</b></td></tr>
          <tr><td>${game.away_team}</td><td class="num">${game.q1_away}</td><td class="num">${game.q2_away}</td><td class="num">${game.q3_away}</td><td class="num">${game.q4_away}</td>${game.ot_periods.map(p => `<td class="num">${p[1]}</td>`).join('')}<td class="num"><b>${game.final_away}</b></td></tr>
        </tbody></table>
      </div>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });

// ============================================================
// DRUŻYNY
// ============================================================
let selectedTeam = TEAMS[0];
let druzynySub = 'team';
function renderDruzynyHost() {
  const el = document.getElementById('view-druzyny');
  el.innerHTML = `<div class="subnav"><button class="btn ${druzynySub === 'team' ? '' : 'secondary'}" id="dz-team" type="button">🏀 Drużyna</button><button class="btn ${druzynySub === 'h2h' ? '' : 'secondary'}" id="dz-h2h" type="button">⚔ Para (H2H)</button></div><div id="sub-team" style="${druzynySub === 'team' ? '' : 'display:none'}"></div><div id="sub-h2h" style="${druzynySub === 'h2h' ? '' : 'display:none'}"></div>`;
  document.getElementById('dz-team').onclick = () => { druzynySub = 'team'; renderDruzynyHost(); };
  document.getElementById('dz-h2h').onclick = () => { druzynySub = 'h2h'; renderDruzynyHost(); };
  if (druzynySub === 'team') renderDruzyny(); else renderH2H();
}
function renderDruzyny() {
  const el = document.getElementById('sub-team');
  let html = `<div class="section-title"><h2>Analiza drużyny</h2><div class="rule"></div></div>
  <div class="controls-row">
    <div class="field"><label>Drużyna</label>
      <select id="team-select">${TEAMS.map(t => `<option value="${t}" ${t === selectedTeam ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>
  </div>
  <div id="team-detail"></div>`;
  el.innerHTML = html;
  document.getElementById('team-select').onchange = e => { selectedTeam = e.target.value; renderTeamDetail(); };
  renderTeamDetail();
}

function streakDots(games) {
  const last = games.slice(-20);
  return `<div class="streak-track">` + last.map(g => {
    const cls = g.classification;
    const color = isLamak(cls) ? (cls === '1/2' ? 'var(--c12)' : cls === '2/1' ? 'var(--c21)' : 'var(--cx)') : 'var(--cnone)';
    const label = isLamak(cls) ? LABELS[cls] : '';
    const title = `${fmtDate(g.date_iso)}: ${g.home_team} ${g.final_home}:${g.final_away} ${g.away_team}`;
    return `<div class="streak-dot" style="background:${color};cursor:pointer;" title="${title}" data-gid="${g.game_id}">${label}</div>`;
  }).join('') + `</div>`;
}

function teamRowsFor(team) { return TEAM_ROWS.filter(r => r.team === team); }

function bucketRate(rows, bucketFn, minN = 1) {
  const map = {};
  rows.forEach(r => {
    const b = bucketFn(r);
    if (b === null || b === undefined) return;
    map[b] = map[b] || { bucket: b, n: 0, lamak: 0 };
    map[b].n++;
    if (isLamak(r.game.classification)) map[b].lamak++;
  });
  return Object.values(map).filter(x => x.n >= minN).map(x => ({ ...x, rate: pct(x.lamak, x.n) }));
}

function generateTeamInsights(team) {
  const rows = teamRowsFor(team);
  const regRows = rows.filter(r => r.game.stage === 'regular');
  const s = TEAM_STATS[team];
  const teamBase = s.pctLamak;
  const insights = [];

  const sortedByRate = [...TEAMS].map(t => TEAM_STATS[t]).sort((a, b) => b.pctLamak - a.pctLamak);
  const rank = sortedByRate.findIndex(x => x.team === team) + 1;
  insights.push({ icon: '🏆', headline: `${rank}. miejsce w lidze pod względem częstości łamaków (na ${TEAMS.length} drużyn)`,
    sub: `${s.pctLamak.toFixed(1)}% meczów tej drużyny kończy się łamakiem, przy średniej ligowej ${baselineRate().toFixed(1)}%.` });

  const oppEntries = Object.entries(s.oppLamakCount).sort((a, b) => b[1] - a[1]);
  if (oppEntries.length) {
    const [opp, n] = oppEntries[0];
    insights.push({ icon: '⚔️', headline: `Najczęściej łamie się w meczach z ${opp}`,
      sub: `${n} łamaków we wzajemnych spotkaniach w bazie — pełne szczegóły w zakładce H2H.` });
  }

  const monthOrder = ['Październik', 'Listopad', 'Grudzień', 'Styczeń', 'Luty', 'Marzec', 'Kwiecień'];
  const monthBuckets = bucketRate(regRows, r => r.ctx.month, 8);
  if (monthBuckets.length >= 3) {
    const top = [...monthBuckets].sort((a, b) => b.rate - a.rate)[0];
    if (top.rate - teamBase >= 8) insights.push({ icon: '📅', headline: `Najwięcej łamaków notuje w miesiącu: ${top.bucket}`,
      sub: `${top.rate.toFixed(1)}% meczów w tym miesiącu (próbka ${top.n}) vs ${teamBase.toFixed(1)}% średnio w sezonie.` });
  }

  const dowBuckets = bucketRate(regRows, r => r.ctx.day_of_week, 8);
  if (dowBuckets.length >= 3) {
    const top = [...dowBuckets].sort((a, b) => b.rate - a.rate)[0];
    if (top.rate - teamBase >= 8) insights.push({ icon: '🗓️', headline: `Wyraźnie częściej łamie się w dniu: ${top.bucket}`,
      sub: `${top.rate.toFixed(1)}% (próbka ${top.n}) vs ${teamBase.toFixed(1)}% średnio.` });
  }

  const phaseBuckets = [
    { bucket: 'na początku sezonu (mecze 1-10)', test: r => r.ctx.game_num_in_season <= 10 },
    { bucket: 'w środku sezonu', test: r => r.ctx.game_num_in_season > 10 && r.ctx.game_num_in_season <= 70 },
    { bucket: 'pod koniec sezonu (mecze 71+)', test: r => r.ctx.game_num_in_season > 70 },
  ].map(p => { const sub = regRows.filter(p.test); return { ...p, n: sub.length, rate: pct(sub.filter(r => isLamak(r.game.classification)).length, sub.length) }; });
  const topPhase = [...phaseBuckets].filter(p => p.n >= 8).sort((a, b) => b.rate - a.rate)[0];
  if (topPhase && topPhase.rate - teamBase >= 8) insights.push({ icon: '⏳', headline: `Najbardziej podatna na łamaki ${topPhase.bucket}`,
    sub: `${topPhase.rate.toFixed(1)}% (próbka ${topPhase.n}) vs ${teamBase.toFixed(1)}% średnio w sezonie.` });

  const homeHalfLed = regRows.filter(r => r.isHome && r.ctx.half_led);
  const awayHalfLed = regRows.filter(r => !r.isHome && r.ctx.half_led);
  const homeBlowRate = pct(homeHalfLed.filter(r => r.ctx.blew_lead).length, homeHalfLed.length);
  const awayBlowRate = pct(awayHalfLed.filter(r => r.ctx.blew_lead).length, awayHalfLed.length);
  if (homeHalfLed.length >= 8 && awayHalfLed.length >= 8 && Math.abs(homeBlowRate - awayBlowRate) >= 12) {
    const worse = homeBlowRate > awayBlowRate ? 'grając u siebie' : 'grając na wyjeździe';
    insights.push({ icon: homeBlowRate > awayBlowRate ? '🏠' : '✈️', headline: `Częściej oddaje prowadzenie po 1. połowie ${worse}`,
      sub: `Tracąc prowadzenie: u siebie ${homeBlowRate.toFixed(1)}% (${homeHalfLed.length} sytuacji), na wyjeździe ${awayBlowRate.toFixed(1)}% (${awayHalfLed.length} sytuacji).` });
  }

  const b2bRows = regRows.filter(r => r.ctx.back_to_back);
  const b2bRate = pct(b2bRows.filter(r => isLamak(r.game.classification)).length, b2bRows.length);
  if (b2bRows.length >= 8 && Math.abs(b2bRate - teamBase) >= 10) {
    insights.push({ icon: '🔁', headline: `${b2bRate > teamBase ? 'Wyraźnie częściej' : 'Rzadziej niż zwykle'} łamie się grając na back-to-back`,
      sub: `${b2bRate.toFixed(1)}% na back-to-back (próbka ${b2bRows.length}) vs ${teamBase.toFixed(1)}% ogółem.` });
  }

  const afterWinsHalfLed = regRows.filter(r => r.ctx.half_led && r.ctx.win_streak_before >= 3);
  const afterWinsBlow = pct(afterWinsHalfLed.filter(r => r.ctx.blew_lead).length, afterWinsHalfLed.length);
  const baseHalfLed = regRows.filter(r => r.ctx.half_led);
  const baseBlow = pct(baseHalfLed.filter(r => r.ctx.blew_lead).length, baseHalfLed.length);
  if (afterWinsHalfLed.length >= 6 && afterWinsBlow - baseBlow >= 12) {
    insights.push({ icon: '🔥', headline: `Po serii 3+ zwycięstw wyraźnie częściej traci prowadzenie do przerwy`,
      sub: `${afterWinsBlow.toFixed(1)}% takich sytuacji kończy się stratą prowadzenia (próbka ${afterWinsHalfLed.length}) vs ${baseBlow.toFixed(1)}% normalnie.` });
  }

  const afterLossHalfTrail = regRows.filter(r => r.ctx.half_trailed && r.ctx.loss_streak_before >= 2);
  const afterLossComeback = pct(afterLossHalfTrail.filter(r => r.ctx.comeback_win).length, afterLossHalfTrail.length);
  const baseHalfTrail = regRows.filter(r => r.ctx.half_trailed);
  const baseComeback = pct(baseHalfTrail.filter(r => r.ctx.comeback_win).length, baseHalfTrail.length);
  if (afterLossHalfTrail.length >= 6 && Math.abs(afterLossComeback - baseComeback) >= 12) {
    insights.push({ icon: '📉', headline: `Po serii porażek ${afterLossComeback > baseComeback ? 'częściej' : 'rzadziej'} odrabia straty z przerwy`,
      sub: `${afterLossComeback.toFixed(1)}% takich sytuacji kończy się wygraną (próbka ${afterLossHalfTrail.length}) vs ${baseComeback.toFixed(1)}% normalnie.` });
  }

  return insights;
}

function teamMonthChartSVG(team) {
  const order = ['Październik', 'Listopad', 'Grudzień', 'Styczeń', 'Luty', 'Marzec', 'Kwiecień'];
  const short = { 'Październik': 'PAŹ', 'Listopad': 'LIS', 'Grudzień': 'GRU', 'Styczeń': 'STY', 'Luty': 'LUT', 'Marzec': 'MAR', 'Kwiecień': 'KWI' };
  const regRows = teamRowsFor(team).filter(r => r.game.stage === 'regular');
  const buckets = bucketRate(regRows, r => r.ctx.month, 2);
  const data = order.filter(m => buckets.find(b => b.bucket === m)).map(m => { const b = buckets.find(x => x.bucket === m); return { short: short[m], rate: b.rate, n: b.n }; });
  if (data.length < 3) return '<div class="small-note">Za mało danych na wykres miesięczny w tym zakresie.</div>';
  const maxRate = Math.max(...data.map(d => d.rate), 1);
  const topIdx = data.reduce((best, d, i) => d.rate > data[best].rate ? i : best, 0);
  const W = 720, H = 190, padL = 20, padB = 36, padT = 20, padR = 20;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const gap = chartW / data.length, barW = gap * 0.6;
  const bars = data.map((d, i) => {
    const x = padL + i * gap + (gap - barW) / 2;
    const h = (d.rate / maxRate) * chartH;
    const y = padT + chartH - h;
    const color = i === topIdx ? 'var(--orange)' : 'var(--ink-soft)';
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${color}" opacity="${i === topIdx ? 1 : 0.5}"/>
      <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle" font-family="IBM Plex Mono" font-size="11" font-weight="600" fill="${i === topIdx ? 'var(--orange)' : 'var(--ink)'}">${d.rate.toFixed(0)}%</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${(padT + chartH + 18).toFixed(1)}" text-anchor="middle" font-family="Oswald" font-size="10.5" fill="var(--ink-soft)">${d.short}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-height:200px;">${bars}</svg>`;
}

function renderTeamDetail() {
  const s = TEAM_STATS[selectedTeam];
  const oppSorted = Object.entries(s.oppLamakCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxSeasonTotal = Math.max(...s.bySeason.map(x => x.total), 1);

  let html = `
  <div class="grid grid-4" style="margin-bottom:18px;">
    <div class="card"><div class="stat"><div class="val">${s.totalLamak}</div><div class="lbl">Łamaki łącznie / ${s.total} meczów</div></div></div>
    <div class="card"><div class="stat"><div class="val" style="color:var(--c12)">${fmtPct(s.c12, s.total, 0)}</div><div class="lbl">1/2 — ${s.c12}×</div></div></div>
    <div class="card"><div class="stat"><div class="val" style="color:var(--c21)">${fmtPct(s.c21, s.total, 0)}</div><div class="lbl">2/1 — ${s.c21}×</div></div></div>
    <div class="card"><div class="stat"><div class="val" style="color:var(--cx)">${s.cx}</div><div class="lbl">Remisy (X) — dogrywki</div></div></div>
  </div>
  <div class="grid grid-2" style="margin-bottom:18px;">
    <div class="card"><div class="stat"><div class="val">${s.curNoLamak}</div><div class="lbl">Obecna seria bez łamaka</div></div>
      <div class="small-note">Rekord w zakresie danych: ${s.maxNoLamak} meczów z rzędu</div></div>
    <div class="card"><div class="stat"><div class="val">${s.curLamak}</div><div class="lbl">Obecna seria łamaków z rzędu</div></div>
      <div class="small-note">Rekord w zakresie danych: ${s.maxLamak} meczów z rzędu</div></div>
  </div>

  <div class="section-title" style="margin:26px 0 14px;"><h2 style="font-size:16px;">Analiza i wnioski — ${selectedTeam}</h2><div class="rule"></div></div>
  <div id="team-insights-list"></div>
  <div id="team-watch-card"></div>

  <div class="card" style="margin-bottom:18px;margin-top:18px;">
    <h3>Rozkład łamaków wg miesiąca</h3>
    ${teamMonthChartSVG(selectedTeam)}
  </div>

  <div class="grid grid-2" style="margin-bottom:18px;">
    <div class="card">
      <h3>Wg dnia tygodnia</h3>
      <table><thead><tr><th>Dzień</th><th class="num">Meczów</th><th class="num">Łamaki</th><th class="num">%</th></tr></thead><tbody>
      ${['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'].map(d => {
    const rows = teamRowsFor(selectedTeam).filter(r => r.game.stage === 'regular' && r.ctx.day_of_week === d);
    const lamak = rows.filter(r => isLamak(r.game.classification)).length;
    return `<tr><td>${d}</td><td class="num">${rows.length}</td><td class="num">${lamak}</td><td class="num">${fmtPct(lamak, rows.length)}</td></tr>`;
  }).join('')}
      </tbody></table>
    </div>
    <div class="card">
      <h3>Po seriach zwycięstw / porażek</h3>
      <div class="small-note" style="margin-top:-6px;margin-bottom:10px;">Wśród sytuacji, gdy drużyna prowadziła do przerwy (odsetek utraty tego prowadzenia).</div>
      <table><thead><tr><th>Kontekst</th><th class="num">Sytuacji</th><th class="num">Traci prowadzenie</th></tr></thead><tbody>
      ${[
    { label: 'Bez serii / seria 1-2', test: r => r.ctx.win_streak_before < 3 && r.ctx.loss_streak_before < 3 },
    { label: 'Seria 3+ zwycięstw', test: r => r.ctx.win_streak_before >= 3 },
    { label: 'Seria 3+ porażek', test: r => r.ctx.loss_streak_before >= 3 },
  ].map(g => {
    const rows = teamRowsFor(selectedTeam).filter(r => r.game.stage === 'regular' && r.ctx.half_led && g.test(r));
    const blew = rows.filter(r => r.ctx.blew_lead).length;
    return `<tr><td>${g.label}</td><td class="num">${rows.length}</td><td class="num">${fmtPct(blew, rows.length)}</td></tr>`;
  }).join('')}
      </tbody></table>
    </div>
  </div>

  <div class="card" style="margin-bottom:18px;">
    <h3>Ostatnie 20 meczów <span class="small-note" style="text-transform:none;font-family:'Inter',sans-serif;">(kliknij mecz po analizę)</span></h3>
    ${streakDots(s.games)}
  </div>
  <div class="grid grid-2">
    <div class="card">
      <h3>Najczęściej z tą drużyną kończy się łamakiem</h3>
      <table><thead><tr><th>Przeciwnik</th><th class="num">Łamaki</th></tr></thead><tbody>
      ${oppSorted.map(([opp, n]) => `<tr><td class="team-cell">${opp}</td><td class="num">${n}</td></tr>`).join('') || '<tr><td colspan=2 style="color:var(--ink-soft)">Brak danych</td></tr>'}
      </tbody></table>
    </div>
    <div class="card">
      <h3>Ostatnie mecze zakończone łamakiem</h3>
      <table><thead><tr><th>Data</th><th>Mecz</th><th>Typ</th></tr></thead><tbody>
      ${s.games.filter(g => isLamak(g.classification)).slice(-8).reverse().map(g => `
        <tr class="${rowClass(g.classification)}" style="cursor:pointer" data-gid="${g.game_id}"><td class="mono">${fmtDate(g.date_iso)}</td><td>${g.home_team} ${g.final_home}:${g.final_away} ${g.away_team}</td>
        <td><span class="badge ${badgeClass(g.classification)}">${g.classification}</span></td></tr>`).join('') || '<tr><td colspan=3 style="color:var(--ink-soft)">Brak łamaków w tym zakresie</td></tr>'}
      </tbody></table>
    </div>
  </div>
  <div class="card" style="margin-top:18px;">
    <h3>Rozkład sezon po sezonie</h3>
    ${s.bySeason.map(sb => `
      <div style="margin-top:14px;display:flex;align-items:center;gap:16px;">
        <div style="font-family:'Oswald',sans-serif;font-size:14px;min-width:70px;">${sb.season}</div>
        <div class="pct-split" style="max-width:400px;">
          <div style="width:${pct(sb.c12, sb.total)}%;background:var(--c12)"></div>
          <div style="width:${pct(sb.c21, sb.total)}%;background:var(--c21)"></div>
          <div style="width:${pct(sb.cx, sb.total)}%;background:var(--cx)"></div>
        </div>
        <div class="mono small-note">${fmtPct(sb.c12 + sb.c21 + sb.cx, sb.total)} (${sb.total} mecz.)</div>
      </div>`).join('')}
  </div>
  `;
  document.getElementById('team-detail').innerHTML = html;
  document.querySelectorAll('#team-detail [data-gid]').forEach(elx => { elx.onclick = () => openGameModal(elx.dataset.gid); });

  const teamInsights = generateTeamInsights(selectedTeam);
  const listBox = document.getElementById('team-insights-list');
  listBox.innerHTML = '';
  teamInsights.forEach(ins => {
    const card = document.createElement('div');
    card.className = 'insight-card';
    card.style.borderLeftColor = 'var(--orange)';
    card.style.cursor = 'default';
    card.innerHTML = `<div class="insight-num" style="font-size:20px;">${ins.icon}</div>
      <div class="insight-text"><div class="headline">${ins.headline}</div><div class="sub">${ins.sub}</div></div>`;
    listBox.appendChild(card);
  });

  // "Na co zwrocic uwage" - synteza: obecna forma + 2 najsilniejsze odkryte wzorce
  const watchPoints = [];
  if (s.curLamak >= 2) watchPoints.push(`Jest w trakcie serii ${s.curLamak} łamaków z rzędu — kolejny mecz warto obserwować ze szczególną uwagą.`);
  if (s.curNoLamak >= 6) watchPoints.push(`Nie łamała się od ${s.curNoLamak} meczów — długa seria bez łamaka statystycznie zwiększa szansę, że seria się przerwie.`);
  teamInsights.slice(2, 5).forEach(ins => watchPoints.push(ins.headline + '.'));
  const watchBox = document.getElementById('team-watch-card');
  if (watchPoints.length) {
    watchBox.innerHTML = `<div class="card" style="margin-bottom:18px;background:var(--panel-alt);">
      <h3>Na co zwrócić uwagę przed kolejnymi meczami</h3>
      <ul class="reason-list">
        ${watchPoints.map(w => `<li><span class="ico">👉</span><div>${w}</div></li>`).join('')}
      </ul>
      <div class="small-note" style="margin-top:8px;">To ogólne wzorce z dotychczasowych danych, nie prognoza na konkretny mecz — podeślij terminarz nowego sezonu, a dorobimy listę realnych, nadchodzących meczów z podniesionym ryzykiem.</div>
    </div>`;
  } else {
    watchBox.innerHTML = '';
  }
}

// ============================================================
// H2H
// ============================================================
let h2hA = TEAMS[0], h2hB = TEAMS[1];
function renderH2H() {
  const el = document.getElementById('sub-h2h');
  let html = `<div class="section-title"><h2>Analiza H2H</h2><div class="rule"></div></div>
  <div class="two-col-select" style="margin-bottom:22px;">
    <div class="field"><label>Drużyna A</label><select id="h2h-a">${TEAMS.map(t => `<option ${t === h2hA ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="field"><label>Drużyna B</label><select id="h2h-b">${TEAMS.map(t => `<option ${t === h2hB ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
  </div>
  <div id="h2h-detail"></div>`;
  el.innerHTML = html;
  document.getElementById('h2h-a').onchange = e => { h2hA = e.target.value; renderH2HDetail(); };
  document.getElementById('h2h-b').onchange = e => { h2hB = e.target.value; renderH2HDetail(); };
  renderH2HDetail();
}

function renderH2HDetail() {
  const box = document.getElementById('h2h-detail');
  if (h2hA === h2hB) { box.innerHTML = `<div class="empty-state"><div class="ico">⚠</div>Wybierz dwie różne drużyny.</div>`; return; }
  const games = h2hGames(h2hA, h2hB);
  const total = games.length;
  let c12 = 0, c21 = 0, cx = 0;
  games.forEach(g => { if (g.classification === '1/2') c12++; else if (g.classification === '2/1') c21++; else if (g.classification === 'X') cx++; });
  const totalLamak = c12 + c21 + cx;

  let curStreak = 0, curType = null;
  for (let i = games.length - 1; i >= 0; i--) {
    const l = isLamak(games[i].classification);
    if (curType === null) { curType = l; curStreak = 1; }
    else if (l === curType) curStreak++;
    else break;
  }

  let html = `
  <div class="h2h-vs">
    <div class="h2h-team"><div class="name">${h2hA}</div></div>
    <div class="h2h-vs-mid">VS<br><span class="mono" style="font-size:20px;color:var(--ink)">${total}</span><br>spotkań</div>
    <div class="h2h-team"><div class="name">${h2hB}</div></div>
  </div>
  <div class="grid grid-4" style="margin-bottom:18px;">
    <div class="card"><div class="stat"><div class="val" style="color:var(--c12)">${c12}</div><div class="lbl">1/2 (${fmtPct(c12, total, 0)})</div></div></div>
    <div class="card"><div class="stat"><div class="val" style="color:var(--c21)">${c21}</div><div class="lbl">2/1 (${fmtPct(c21, total, 0)})</div></div></div>
    <div class="card"><div class="stat"><div class="val" style="color:var(--cx)">${cx}</div><div class="lbl">X (${fmtPct(cx, total, 0)})</div></div></div>
    <div class="card"><div class="stat"><div class="val">${fmtPct(totalLamak, total, 0)}</div><div class="lbl">Łącznie "łamak" w spotkaniach</div></div></div>
  </div>
  <div class="card" style="margin-bottom:18px;">
    <h3>Obecna seria</h3>
    <div class="stat"><div class="val">${curStreak > 0 ? curStreak : '—'}</div><div class="lbl">${curType === null ? 'brak danych' : curType ? 'spotkań z rzędu z łamakiem' : 'spotkań z rzędu bez łamaka'}</div></div>
  </div>
  ${h2hMonthPatternHTML(games.filter(g => isLamak(g.classification)))}
  <div class="card">
    <h3>Wszystkie spotkania <span class="small-note" style="text-transform:none;font-family:'Inter',sans-serif;">(kliknij po analizę)</span></h3>
    <table><thead><tr><th>Data</th><th>Faza</th><th>Gospodarz</th><th class="num">Wynik</th><th>Gość</th><th>1. poł.</th><th>Typ</th></tr></thead><tbody>
    ${games.slice().reverse().map(g => `
      <tr class="${rowClass(g.classification)}" style="cursor:pointer" data-gid="${g.game_id}"><td class="mono">${fmtDate(g.date_iso)}</td><td class="mono">${g.stage}</td>
      <td>${g.home_team}</td><td class="num mono">${g.final_home}:${g.final_away}</td><td>${g.away_team}</td>
      <td class="mono">${g.half_home}:${g.half_away}</td>
      <td><span class="badge ${badgeClass(g.classification)}">${LABELS[g.classification]}</span></td></tr>
    `).join('') || '<tr><td colspan=7 style="color:var(--ink-soft)">Brak wspólnych meczów w bazie</td></tr>'}
    </tbody></table>
  </div>
  `;
  box.innerHTML = html;
  box.querySelectorAll('[data-gid]').forEach(elx => { elx.onclick = () => openGameModal(elx.dataset.gid); });
}

// ============================================================
// ZALEŻNOŚCI
// ============================================================
const DEP_FILTERS = [
  { id: 'early10', label: 'Pierwsze 10 meczów sezonu', group: 'Faza sezonu', test: r => r.ctx.game_num_in_season <= 10 },
  { id: 'mid', label: 'Środek sezonu (11-70)', group: 'Faza sezonu', test: r => r.ctx.game_num_in_season > 10 && r.ctx.game_num_in_season <= 70 },
  { id: 'late10', label: 'Ostatnie 10 meczów sezonu', group: 'Faza sezonu', test: r => r.ctx.game_num_in_season > 70 },

  { id: 'm10', label: 'Październik', group: 'Miesiąc', test: r => r.ctx.month === 'Październik' },
  { id: 'm11', label: 'Listopad', group: 'Miesiąc', test: r => r.ctx.month === 'Listopad' },
  { id: 'm12', label: 'Grudzień', group: 'Miesiąc', test: r => r.ctx.month === 'Grudzień' },
  { id: 'm1', label: 'Styczeń', group: 'Miesiąc', test: r => r.ctx.month === 'Styczeń' },
  { id: 'm2', label: 'Luty', group: 'Miesiąc', test: r => r.ctx.month === 'Luty' },
  { id: 'm3', label: 'Marzec', group: 'Miesiąc', test: r => r.ctx.month === 'Marzec' },
  { id: 'm4', label: 'Kwiecień', group: 'Miesiąc', test: r => r.ctx.month === 'Kwiecień' },

  { id: 'mon', label: 'Poniedziałki', group: 'Dzień tygodnia', test: r => r.ctx.day_of_week === 'Poniedziałek' },
  { id: 'tue', label: 'Wtorki', group: 'Dzień tygodnia', test: r => r.ctx.day_of_week === 'Wtorek' },
  { id: 'wed', label: 'Środy', group: 'Dzień tygodnia', test: r => r.ctx.day_of_week === 'Środa' },
  { id: 'thu', label: 'Czwartki', group: 'Dzień tygodnia', test: r => r.ctx.day_of_week === 'Czwartek' },
  { id: 'fri', label: 'Piątki', group: 'Dzień tygodnia', test: r => r.ctx.day_of_week === 'Piątek' },
  { id: 'sat', label: 'Soboty', group: 'Dzień tygodnia', test: r => r.ctx.day_of_week === 'Sobota' },
  { id: 'sun', label: 'Niedziele', group: 'Dzień tygodnia', test: r => r.ctx.day_of_week === 'Niedziela' },

  { id: 'dm1', label: '1.–7. dnia miesiąca', group: 'Dzień miesiąca', test: r => { const d = +r.ctx.date_iso.slice(8, 10); return d >= 1 && d <= 7; } },
  { id: 'dm2', label: '8.–14. dnia miesiąca', group: 'Dzień miesiąca', test: r => { const d = +r.ctx.date_iso.slice(8, 10); return d >= 8 && d <= 14; } },
  { id: 'dm3', label: '15.–21. dnia miesiąca', group: 'Dzień miesiąca', test: r => { const d = +r.ctx.date_iso.slice(8, 10); return d >= 15 && d <= 21; } },
  { id: 'dm4', label: '22.–28. dnia miesiąca', group: 'Dzień miesiąca', test: r => { const d = +r.ctx.date_iso.slice(8, 10); return d >= 22 && d <= 28; } },
  { id: 'dm5', label: '29.–31. dnia miesiąca', group: 'Dzień miesiąca', test: r => { const d = +r.ctx.date_iso.slice(8, 10); return d >= 29; } },

  { id: 'b2b', label: 'Back-to-back', group: 'Kontekst meczowy', test: r => r.ctx.back_to_back },
  { id: '3in4', label: '3 mecze w 4 dni', group: 'Kontekst meczowy', test: r => r.ctx.three_in_four_days },
  { id: 'firstaway', label: 'Pierwszy mecz wyjazdowy (trip)', group: 'Kontekst meczowy', test: r => r.ctx.first_away_of_trip },
  { id: 'firsthome', label: 'Pierwszy mecz u siebie po wyjeździe', group: 'Kontekst meczowy', test: r => r.ctx.first_home_after_trip },
  { id: 'afterot', label: 'Po meczu z dogrywką', group: 'Kontekst meczowy', test: r => r.__prevOT },
  { id: 'winstreak3', label: 'Po serii 3+ zwycięstw', group: 'Kontekst meczowy', test: r => r.ctx.win_streak_before >= 3 },
  { id: 'lossstreak2', label: 'Po serii 2+ porażek', group: 'Kontekst meczowy', test: r => r.ctx.loss_streak_before >= 2 },
  { id: 'lost20', label: 'Po porażce 20+ punktami', group: 'Kontekst meczowy', test: r => r.__prevLost20 },
  { id: 'won20', label: 'Po zwycięstwie 20+ punktami', group: 'Kontekst meczowy', test: r => r.__prevWon20 },
  { id: 'home', label: 'Mecze u siebie', group: 'Kontekst meczowy', test: r => r.isHome },
  { id: 'away', label: 'Mecze na wyjeździe', group: 'Kontekst meczowy', test: r => !r.isHome },
];
const DEP_GROUPS = ['Faza sezonu', 'Miesiąc', 'Dzień tygodnia', 'Dzień miesiąca', 'Kontekst meczowy'];

let activeDepFilters = new Set();
let depDetailTeam = null;

let analizaSubTab = 'schematy';
function renderAnaliza() {
  const el = document.getElementById('view-analiza');
  el.innerHTML = `
  <div class="section-title"><h2>Wzorce i schematy</h2><div class="rule"></div></div>
  <div class="subnav">
    <button class="btn ${analizaSubTab === 'schematy' ? '' : 'secondary'}" id="analiza-btn-schematy" type="button">🧬 Skaner schematów</button>
    <button class="btn ${analizaSubTab === 'filtry' ? '' : 'secondary'}" id="analiza-btn-filtry" type="button">🔎 Filtry zależności</button>
    <button class="btn ${analizaSubTab === 'wzorce' ? '' : 'secondary'}" id="analiza-btn-wzorce" type="button">🧩 Gotowe wzorce</button>
  </div>
  <div id="analiza-content"></div>`;
  document.getElementById('analiza-btn-schematy').onclick = () => { analizaSubTab = 'schematy'; renderAnaliza(); };
  document.getElementById('analiza-btn-filtry').onclick = () => { analizaSubTab = 'filtry'; renderAnaliza(); };
  document.getElementById('analiza-btn-wzorce').onclick = () => { analizaSubTab = 'wzorce'; renderAnaliza(); };
  if (analizaSubTab === 'schematy') renderSchematy(document.getElementById('analiza-content'));
  else if (analizaSubTab === 'filtry') renderZaleznosci(); else renderWzorce();
}

function renderZaleznosci() {
  const el = document.getElementById('analiza-content');
  let html = `<div class="section-desc">Rozwiń kategorię i wybierz jeden lub kilka filtrów (łączone jako "i" — AND). Zobaczysz jak zmienia się odsetek łamaków względem średniej ligowej, które drużyny najsilniej reagują na dany kontekst, oraz konkretne mecze z datami.</div>
  <div id="dep-groups"></div>
  <div id="dep-results" style="margin-top:20px;"></div>`;
  el.innerHTML = html;

  const groupsBox = document.getElementById('dep-groups');
  DEP_GROUPS.forEach(groupName => {
    const filtersInGroup = DEP_FILTERS.filter(f => f.group === groupName);
    const activeCount = filtersInGroup.filter(f => activeDepFilters.has(f.id)).length;
    const details = document.createElement('details');
    details.className = 'card';
    details.style.marginBottom = '10px';
    details.style.padding = '14px 18px';
    if (activeCount > 0) details.open = true;
    details.innerHTML = `<summary style="cursor:pointer;font-family:'Oswald',sans-serif;text-transform:uppercase;font-size:13.5px;letter-spacing:0.02em;color:var(--ink);">
      ${groupName} ${activeCount ? `<span class="mono" style="color:var(--orange);font-size:12px;">· ${activeCount} aktywnych</span>` : ''}
    </summary>
    <div class="chip-wrap" style="margin-top:12px;"></div>`;
    const chipWrap = details.querySelector('.chip-wrap');
    filtersInGroup.forEach(f => {
      const c = document.createElement('div');
      c.className = 'chip' + (activeDepFilters.has(f.id) ? ' on' : '');
      c.textContent = f.label;
      c.onclick = () => {
        if (activeDepFilters.has(f.id)) activeDepFilters.delete(f.id); else activeDepFilters.add(f.id);
        depDetailTeam = null;
        renderZaleznosci();
      };
      chipWrap.appendChild(c);
    });
    groupsBox.appendChild(details);
  });

  renderDepResults();
}

function renderDepResults() {
  const box = document.getElementById('dep-results');
  const activeFilters = DEP_FILTERS.filter(f => activeDepFilters.has(f.id));
  const baseRows = TEAM_ROWS.filter(r => r.game.stage === 'regular');
  const filtered = activeFilters.length ? baseRows.filter(r => activeFilters.every(f => f.test(r))) : baseRows;

  const baseLamak = baseRows.filter(r => isLamak(r.game.classification)).length;
  const baseRate = pct(baseLamak, baseRows.length);
  const filtLamak = filtered.filter(r => isLamak(r.game.classification)).length;
  const filtRate = pct(filtLamak, filtered.length);
  const diff = filtRate - baseRate;

  let html = ``;
  if (activeFilters.length) {
    html += `<div class="chip-wrap" style="margin-bottom:14px;">${activeFilters.map(f => `<span class="chip on" style="cursor:default;">${f.label}</span>`).join('')}</div>`;
  }

  html += `
  <div class="grid grid-3" style="margin-bottom:18px;">
    <div class="card"><div class="stat"><div class="val">${filtered.length}</div><div class="lbl">Wystąpień w bazie (perspektywa drużyny)</div></div></div>
    <div class="card"><div class="stat"><div class="val">${filtRate.toFixed(1)}%</div><div class="lbl">Odsetek łamaków w tym kontekście</div></div></div>
    <div class="card"><div class="stat"><div class="val" style="color:${diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--green)' : 'var(--ink)'}">${diff > 0 ? '+' : ''}${diff.toFixed(1)} pkt.proc.</div><div class="lbl">Różnica vs średnia (${baseRate.toFixed(1)}%)</div></div></div>
  </div>`;

  if (filtered.length < 30) {
    html += `<div class="small-note">⚠ Umiarkowana próbka (${filtered.length}) — im więcej sezonów w bazie, tym pewniejszy wynik.</div>`;
  }

  const byTeam = {};
  filtered.forEach(r => {
    byTeam[r.team] = byTeam[r.team] || { team: r.team, n: 0, lamak: 0 };
    byTeam[r.team].n++;
    if (isLamak(r.game.classification)) byTeam[r.team].lamak++;
  });
  const teamRows = Object.values(byTeam).filter(t => t.n >= 3).map(t => ({ ...t, rate: pct(t.lamak, t.n) })).sort((a, b) => b.rate - a.rate || b.n - a.n);

  html += `<div class="card" style="margin-top:18px;">
    <h3>Które drużyny najsilniej reagują na ten kontekst</h3>
    <div class="small-note" style="margin-top:-8px;margin-bottom:12px;">Minimum 3 wystąpienia w bazie. Kliknij drużynę żeby zobaczyć konkretne mecze z datami.</div>
    <table><thead><tr><th>#</th><th>Drużyna</th><th class="num">Wystąpień</th><th class="num">Łamaki</th><th class="num">%</th></tr></thead><tbody>
    ${teamRows.slice(0, 15).map((t, i) => `<tr style="cursor:pointer" data-team="${t.team}"><td><span class="rank-num">${i + 1}</span></td><td class="team-cell">${t.team}</td><td class="num">${t.n}</td><td class="num">${t.lamak}</td><td class="num">${t.rate.toFixed(0)}%</td></tr>`).join('') || '<tr><td colspan=5 style="color:var(--ink-soft)">Za mało danych dla wybranych filtrów</td></tr>'}
    </tbody></table>
  </div>
  <div id="dep-team-detail" style="margin-top:14px;"></div>`;

  box.innerHTML = html;
  box.querySelectorAll('[data-team]').forEach(row => {
    row.onclick = () => { depDetailTeam = row.dataset.team; renderDepTeamDetail(filtered); };
  });
  if (depDetailTeam) renderDepTeamDetail(filtered);
}

function renderDepTeamDetail(filtered) {
  const box = document.getElementById('dep-team-detail');
  if (!depDetailTeam) { box.innerHTML = ''; return; }
  const rows = filtered.filter(r => r.team === depDetailTeam && isLamak(r.game.classification)).sort((a, b) => b.game.date_iso.localeCompare(a.game.date_iso));
  const allCount = filtered.filter(r => r.team === depDetailTeam).length;
  box.innerHTML = `<div class="card">
    <h3>${depDetailTeam} — łamaki w tym kontekście <span class="small-note" style="text-transform:none;font-family:'Inter',sans-serif;">(${rows.length} z ${allCount} meczów w tym kontekście, kliknij po analizę)</span></h3>
    <table><thead><tr><th>Data</th><th>Mecz</th><th>Typ</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="${rowClass(r.game.classification)}" style="cursor:pointer" data-gid="${r.game.game_id}">
      <td class="mono">${fmtDate(r.game.date_iso)}</td>
      <td>${r.game.home_team} ${r.game.final_home}:${r.game.final_away} ${r.game.away_team}</td>
      <td><span class="badge ${badgeClass(r.game.classification)}">${LABELS[r.game.classification]}</span></td>
    </tr>`).join('') || '<tr><td colspan=3 style="color:var(--ink-soft)">Brak łamaków tej drużyny w tym kontekście</td></tr>'}
    </tbody></table>
  </div>`;
  box.querySelectorAll('[data-gid]').forEach(elx => { elx.onclick = () => openGameModal(elx.dataset.gid); });
}

// ============================================================
// WYSZUKIWARKA SCHEMATÓW
// ============================================================
function groupRate(rows, hitTest, minN = 3) {
  const byTeam = {};
  rows.forEach(r => {
    byTeam[r.team] = byTeam[r.team] || { label: r.team, n: 0, hit: 0 };
    byTeam[r.team].n++;
    if (hitTest(r)) byTeam[r.team].hit++;
  });
  return Object.values(byTeam).filter(t => t.n >= minN).map(t => ({ ...t, rate: pct(t.hit, t.n) })).sort((a, b) => b.rate - a.rate);
}

const PATTERNS = [
  { id: 'blow_after_3wins', q: 'Które drużyny po 3+ zwycięstwach z rzędu najczęściej tracą prowadzenie do przerwy?',
    run: () => groupRate(TEAM_ROWS.filter(r => r.game.stage === 'regular' && r.ctx.win_streak_before >= 3 && r.ctx.half_led), r => r.ctx.blew_lead, 3),
    cols: ['Sytuacji z prowadzeniem po serii 3+ zwycięstw', 'Stracone prowadzenie', '%'] },
  { id: 'comeback_after_half_down', q: 'Które drużyny najczęściej odrabiają straty po pierwszej połowie?',
    run: () => groupRate(TEAM_ROWS.filter(r => r.game.stage === 'regular' && r.ctx.half_trailed), r => r.ctx.comeback_win, 5),
    cols: ['Sytuacji przegrywania do przerwy', 'Odrobione straty (wygrana)', '%'] },
  { id: 'pairs_30pct', q: 'Które pary drużyn mają ponad 30% spotkań kończonych łamakiem?',
    run: () => {
      const pairMap = {};
      REGULAR_GAMES().forEach(g => {
        const key = [g.home_team, g.away_team].sort().join(' — ');
        pairMap[key] = pairMap[key] || { key, n: 0, lamak: 0 };
        pairMap[key].n++;
        if (isLamak(g.classification)) pairMap[key].lamak++;
      });
      return Object.values(pairMap).filter(p => p.n >= 3).map(p => ({ label: p.key, n: p.n, hit: p.lamak, rate: pct(p.lamak, p.n) }))
        .filter(p => p.rate > 30).sort((a, b) => b.rate - a.rate);
    }, cols: ['Spotkań', 'Łamaki', '%'] },
  { id: 'blow_after_loss20', q: 'Które drużyny po porażce 20+ punktami najczęściej tracą prowadzenie w kolejnym meczu?',
    run: () => groupRate(TEAM_ROWS.filter(r => r.game.stage === 'regular' && r.__prevLost20 && r.ctx.half_led), r => r.ctx.blew_lead, 2),
    cols: ['Sytuacji z prowadzeniem po porażce 20+', 'Stracone prowadzenie', '%'] },
  { id: 'b2b_lamak', q: 'Które drużyny grają najwięcej łamaków na back-to-back?',
    run: () => groupRate(TEAM_ROWS.filter(r => r.game.stage === 'regular' && r.ctx.back_to_back), r => isLamak(r.game.classification), 4),
    cols: ['Meczów back-to-back', 'Łamaki', '%'] },
  { id: 'road_trip_lamak', q: 'Które drużyny najczęściej łapią łamaka na pierwszym meczu wyjazdowym w trasie?',
    run: () => groupRate(TEAM_ROWS.filter(r => r.game.stage === 'regular' && r.ctx.first_away_of_trip), r => isLamak(r.game.classification), 4),
    cols: ['Pierwszych meczów trasy', 'Łamaki', '%'] },
  { id: 'most_ties', q: 'Które drużyny najczęściej wchodzą w remis po 4. kwarcie (dogrywki)?',
    run: () => groupRate(TEAM_ROWS.filter(r => r.game.stage === 'regular'), r => r.game.classification === 'X', 20),
    cols: ['Meczów w bazie', 'Remisy (X)', '%'] },
];

const DATE_PATTERN = {
  id: 'day_of_month_recurrence',
  q: 'Czy któraś drużyna ma powtarzalny "pechowy" dzień miesiąca (np. 28. każdego miesiąca)?',
  run: () => {
    const byTeamDay = {};
    TEAM_ROWS.filter(r => r.game.stage === 'regular' && isLamak(r.game.classification)).forEach(r => {
      const day = +r.game.date_iso.slice(8, 10);
      const key = r.team + '|' + day;
      byTeamDay[key] = byTeamDay[key] || { team: r.team, day, games: [] };
      byTeamDay[key].games.push(r.game);
    });
    return Object.values(byTeamDay).filter(x => x.games.length >= 2)
      .sort((a, b) => b.games.length - a.games.length || a.day - b.day);
  }
};

let activePattern = null;
function renderWzorce() {
  const el = document.getElementById('analiza-content');
  let html = `<div class="section-desc">Gotowe zapytania o powtarzalne wzorce. Kliknij pytanie żeby zobaczyć wynik.</div>
  <div class="grid grid-2" id="pattern-cards" style="margin-bottom:24px;"></div>
  <div id="pattern-result"></div>`;
  el.innerHTML = html;
  const cardsBox = document.getElementById('pattern-cards');
  [...PATTERNS, DATE_PATTERN].forEach(p => {
    const c = document.createElement('div');
    c.className = 'pattern-card' + (activePattern === p.id ? ' active' : '');
    c.innerHTML = `<div class="q">${p.q}</div><div class="n">SCHEMAT · ${p.id}</div>`;
    c.onclick = () => { activePattern = p.id; renderWzorce(); };
    cardsBox.appendChild(c);
  });
  const resBox = document.getElementById('pattern-result');
  if (!activePattern) { resBox.innerHTML = `<div class="empty-state"><div class="ico">◇</div>Wybierz pytanie powyżej.</div>`; return; }

  if (activePattern === DATE_PATTERN.id) {
    const results = DATE_PATTERN.run();
    resBox.innerHTML = `<div class="card">
      <h3>${DATE_PATTERN.q}</h3>
      <div class="small-note" style="margin-top:-6px;margin-bottom:14px;">⚠ Testujemy 30 drużyn × 31 dni miesiąca = 930 kombinacji naraz — same przez przypadek część z nich "wyjdzie" 2-3 razy. Traktuj to jako ciekawostkę do obserwacji, nie regułę, dopóki próbka nie urośnie z kolejnymi sezonami.</div>
      <table><thead><tr><th>#</th><th>Drużyna</th><th class="num">Dzień miesiąca</th><th class="num">Wystąpień</th><th>Konkretne daty</th></tr></thead><tbody>
      ${results.slice(0, 20).map((r, i) => `<tr><td><span class="rank-num">${i + 1}</span></td><td class="team-cell">${r.team}</td><td class="num">${r.day}.</td><td class="num">${r.games.length}</td>
        <td>${r.games.map(g => `<span class="badge ${badgeClass(g.classification)}" style="cursor:pointer;margin:2px;" data-gid="${g.game_id}">${fmtDate(g.date_iso)}</span>`).join('')}</td></tr>`).join('') || '<tr><td colspan=5 style="color:var(--ink-soft)">Brak powtórzeń w bazie</td></tr>'}
      </tbody></table>
    </div>`;
    resBox.querySelectorAll('[data-gid]').forEach(elx => { elx.onclick = () => openGameModal(elx.dataset.gid); });
    return;
  }

  const p = PATTERNS.find(x => x.id === activePattern);
  const results = p.run();
  resBox.innerHTML = `<div class="card">
    <h3>${p.q}</h3>
    <table><thead><tr><th>#</th><th>Drużyna / para</th><th class="num">${p.cols[0]}</th><th class="num">${p.cols[1]}</th><th class="num">${p.cols[2]}</th></tr></thead><tbody>
    ${results.slice(0, 15).map((r, i) => `<tr><td><span class="rank-num">${i + 1}</span></td><td class="team-cell">${r.label}</td><td class="num">${r.n}</td><td class="num">${r.hit}</td><td class="num">${r.rate.toFixed(0)}%</td></tr>`).join('') || '<tr><td colspan=5 style="color:var(--ink-soft)">Za mało danych</td></tr>'}
    </tbody></table>
  </div>`;
}

// ============================================================
// PROGNOZA MECZU
// ============================================================
let fcHome = TEAMS[0], fcAway = TEAMS[1];
function renderPrognoza() {
  const el = document.getElementById('view-prognoza');
  let html = `<div class="section-title"><h2>Prognoza kolejnego meczu</h2><div class="rule"></div></div>
  <div class="section-desc">Model punktowy (nie AI): 35% historia drużyny, 25% forma z ostatnich 10 meczów, 20% H2H, 10% terminarz, 10% aktualna seria. Bazuje na wybranym zakresie danych (u góry strony).</div>
  <div class="two-col-select" style="margin-bottom:10px;">
    <div class="field"><label>Gospodarz</label><select id="fc-home">${TEAMS.map(t => `<option ${t === fcHome ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="field"><label>Gość</label><select id="fc-away">${TEAMS.map(t => `<option ${t === fcAway ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="field"><label>&nbsp;</label>
      <div style="display:flex;gap:14px;">
        <label style="font-size:12.5px;display:flex;gap:5px;align-items:center;"><input type="checkbox" id="fc-b2b-home"> gospodarz na back-to-back</label>
        <label style="font-size:12.5px;display:flex;gap:5px;align-items:center;"><input type="checkbox" id="fc-b2b-away"> gość na back-to-back</label>
      </div>
    </div>
  </div>
  <div id="fc-result"></div>
  <details style="margin-top:30px;">
    <summary style="cursor:pointer;font-family:'Oswald',sans-serif;text-transform:uppercase;font-size:14px;color:var(--ink-soft);padding:10px 0;">📊 Jak dobry jest ten model? (weryfikacja na poprzednim sezonie) ▾</summary>
    <div id="prognoza-verification"></div>
  </details>`;
  el.innerHTML = html;
  document.getElementById('fc-home').onchange = e => { fcHome = e.target.value; renderForecastResult(); };
  document.getElementById('fc-away').onchange = e => { fcAway = e.target.value; renderForecastResult(); };
  document.getElementById('fc-b2b-home').onchange = renderForecastResult;
  document.getElementById('fc-b2b-away').onchange = renderForecastResult;
  renderForecastResult();
  renderWeryfikacja();
}

function recentForm(team, n = 10) {
  const games = teamGames(team, 'regular').slice(-n);
  let lamak = 0;
  games.forEach(g => { if (isLamak(g.classification)) lamak++; });
  return { n: games.length, rate: pct(lamak, games.length) };
}

// ============================================================
// WERYFIKACJA MODELU (backtest bez przecieku danych)
// ============================================================
const BACKTEST_TRAIN_SEASONS = ['2023-24', '2024-25'];
const BACKTEST_TEST_SEASON = '2025-26';

function backtestTeamStats(team) {
  const gs = ALL_GAMES.filter(g => g.stage === 'regular' && BACKTEST_TRAIN_SEASONS.includes(g.season) && (g.home_team === team || g.away_team === team));
  const asHost = gs.filter(g => g.home_team === team);
  const asGuest = gs.filter(g => g.away_team === team);
  return {
    hist12: pct(asHost.filter(g => g.classification === '1/2').length, asHost.length),
    hist21: pct(asGuest.filter(g => g.classification === '2/1').length, asGuest.length),
    histX: pct(gs.filter(g => g.classification === 'X').length, gs.length),
  };
}
let BACKTEST_STATS = null;

function backtestH2H(teamA, teamB) {
  return ALL_GAMES.filter(g => g.stage === 'regular' && BACKTEST_TRAIN_SEASONS.includes(g.season) &&
    ((g.home_team === teamA && g.away_team === teamB) || (g.home_team === teamB && g.away_team === teamA)));
}

function backtestPredict(homeTeam, awayTeam) {
  const H = BACKTEST_STATS[homeTeam], A = BACKTEST_STATS[awayTeam];
  const h2h = backtestH2H(homeTeam, awayTeam);
  const h2h12 = h2h.length ? pct(h2h.filter(g => g.classification === '1/2').length, h2h.length) : H.hist12;
  const h2h21 = h2h.length ? pct(h2h.filter(g => g.classification === '2/1').length, h2h.length) : A.hist21;
  const h2hX = h2h.length ? pct(h2h.filter(g => g.classification === 'X').length, h2h.length) : (H.histX + A.histX) / 2;
  const p12 = 0.65 * H.hist12 + 0.35 * h2h12;
  const p21 = 0.65 * A.hist21 + 0.35 * h2h21;
  const pX = 0.65 * ((H.histX + A.histX) / 2) + 0.35 * h2hX;
  return { p12, p21, pX, total: p12 + p21 + pX };
}

function quantileBuckets(items, valueFn, k = 4) {
  const sorted = [...items].sort((a, b) => valueFn(a) - valueFn(b));
  const size = Math.ceil(sorted.length / k);
  const buckets = [];
  for (let i = 0; i < k; i++) {
    const slice = sorted.slice(i * size, (i + 1) * size);
    if (slice.length) buckets.push(slice);
  }
  return buckets;
}

let BACKTEST_RESULT_CACHE = null;
function runBacktest() {
  if (BACKTEST_RESULT_CACHE) return BACKTEST_RESULT_CACHE;
  BACKTEST_STATS = {}; TEAMS.forEach(t => BACKTEST_STATS[t] = backtestTeamStats(t));
  const testGames = ALL_GAMES.filter(g => g.season === BACKTEST_TEST_SEASON && g.stage === 'regular');
  const results = testGames.map(g => {
    const pred = backtestPredict(g.home_team, g.away_team);
    return { g, pred, a12: g.classification === '1/2', a21: g.classification === '2/1', aX: g.classification === 'X', aLamak: isLamak(g.classification) };
  });

  function analyze(valueFn, actualFn, label) {
    const buckets = quantileBuckets(results, valueFn, 4);
    return {
      label,
      rows: buckets.map((b, i) => ({
        range: `${valueFn(b[0]).toFixed(0)}–${valueFn(b[b.length - 1]).toFixed(0)}%`,
        n: b.length,
        predAvg: b.reduce((s, r) => s + valueFn(r), 0) / b.length,
        actualRate: pct(b.filter(actualFn).length, b.length),
      }))
    };
  }

  BACKTEST_RESULT_CACHE = {
    n: results.length,
    combined: analyze(r => r.pred.total, r => r.aLamak, 'Łączne ryzyko łamaka (1/2+2/1+X)'),
    p12: analyze(r => r.pred.p12, r => r.a12, 'Prognoza 1/2'),
    p21: analyze(r => r.pred.p21, r => r.a21, 'Prognoza 2/1'),
    pX: analyze(r => r.pred.pX, r => r.aX, 'Prognoza X'),
  };
  return BACKTEST_RESULT_CACHE;
}

function renderWeryfikacja() {
  const el = document.getElementById('prognoza-verification');
  if (!el) return;
  const bt = runBacktest();

  function bucketTable(section) {
    const spread = section.rows[section.rows.length - 1].actualRate - section.rows[0].actualRate;
    const monotonic = section.rows.every((r, i) => i === 0 || r.actualRate >= section.rows[i - 1].actualRate - 3);
    return `<div class="card" style="margin-bottom:16px;">
      <h3>${section.label}</h3>
      <table><thead><tr><th>Kwartyl (prognozowane %)</th><th class="num">Mecze</th><th class="num">Śr. prognoza</th><th class="num">Rzeczywisty %</th><th></th></tr></thead><tbody>
      ${section.rows.map((r, i) => `<tr>
        <td>Q${i + 1} (${r.range})</td><td class="num">${r.n}</td><td class="num">${r.predAvg.toFixed(1)}%</td><td class="num"><b>${r.actualRate.toFixed(1)}%</b></td>
        <td class="bar-cell"><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, r.actualRate * 2.2)}%;background:var(--orange)"></div></div></td>
      </tr>`).join('')}
      </tbody></table>
      <div class="small-note" style="margin-top:10px;">Rozstęp Q4−Q1: <b style="color:${spread > 3 ? 'var(--green)' : 'var(--red)'}">${spread > 0 ? '+' : ''}${spread.toFixed(1)} pkt.proc.</b> ${monotonic ? '— w miarę monotonicznie rosnąco, model coś wyłapuje.' : '— brak jasnego trendu, model raczej nie różnicuje w tym wymiarze.'}</div>
    </div>`;
  }

  el.innerHTML = `
  <div class="section-desc" style="margin-top:14px;">
    Uczciwy test: model uczony <b>wyłącznie</b> na sezonach 2023-24 i 2024-25 (historia drużyny jako gospodarz/gość + H2H — bez znajomości przyszłości), sprawdzony na ${bt.n} meczach sezonu 2025-26, którego "nie widział". Dzielimy mecze na 4 kwartyle według prognozowanego ryzyka i patrzymy, czy w kwartylu z wyższą prognozą faktycznie pada więcej łamaków.
  </div>
  ${bucketTable(bt.combined)}
  <div class="grid grid-2">
    ${bucketTable(bt.p12)}
    ${bucketTable(bt.p21)}
  </div>
  ${bucketTable(bt.pX)}
  <div class="card" style="background:var(--panel-alt);">
    <h3>Jak to czytać</h3>
    <div class="small-note">
      To uproszczona wersja modelu (tylko historia + H2H, bez formy/terminarza/serii — te wymagałyby danych "w trakcie" sezonu, a to zepsułoby uczciwość testu). Jeśli rozstęp Q4−Q1 jest wyraźnie dodatni, znaczy że drużyny/pary z wyższą historyczną tendencją do łamania się faktycznie łamią się częściej niż te z niższą — model ma jakąś moc predykcyjną, choć niedużą (to sport, nie fizyka). Jeśli rozstęp jest bliski zeru albo losowy, oznacza to że na tej próbce (3 sezony) różnice między drużynami są zbyt małe / zbyt szumiące żeby cokolwiek pewnie przewidzieć — i to też jest ważna, uczciwa informacja.
    </div>
  </div>`;
}

// ============================================================
// UPROSZCZONY SYGNAŁ: ŁAMAK / REMIS / BRAK WYRAŹNEGO SYGNAŁU + tagi "dlaczego"
// ============================================================
const MONTHS_PL_FULL = ['', 'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
function monthNameFromISO(iso) { return MONTHS_PL_FULL[+iso.slice(5, 7)]; }

function computeMatchSignal(homeTeam, awayTeam, b2bHome = false, b2bAway = false, dateIso = null) {
  const fc = computeForecast(homeTeam, awayTeam, b2bHome, b2bAway);
  const pLamak = fc.p12 + fc.p21;
  const pRemis = fc.pX;
  const pBrak = Math.max(0, 100 - pLamak - pRemis);
  const base = baselineRate();
  const hn = t => t.split(' ').pop();
  const sH = TEAM_STATS[homeTeam], sA = TEAM_STATS[awayTeam];
  const tags = [];

  if (fc.h2hN >= 3) {
    const h2hTotal = fc.h2h12 + fc.h2h21 + fc.h2hX;
    const diff = h2hTotal - base;
    if (diff >= 10) tags.push({ label: `H2H (${fc.h2hN} mecz.) — ta para często się łamie`, short: 'H2H↑', w: diff });
    else if (diff <= -10) tags.push({ label: `H2H (${fc.h2hN} mecz.) — ta para rzadko się łamie`, short: 'H2H↓', w: -diff });
  }

  if (dateIso) {
    const monthName = monthNameFromISO(dateIso);
    const lamakH2h = h2hGamesAll(homeTeam, awayTeam).filter(g => isLamak(g.classification));
    const sameMonth = lamakH2h.filter(g => g.month === monthName);
    if (sameMonth.length >= 2) tags.push({ label: `Powtarzalny schemat: łamaki tej pary w miesiącu ${monthName} (${sameMonth.length}×, ${sameMonth.map(g => fmtDate(g.date_iso)).join(', ')})`, short: 'Wzorzec miesiąca', w: 30 });
  }

  const formH = recentForm(homeTeam), formA = recentForm(awayTeam);
  const formDiff = (formH.rate + formA.rate) / 2 - base;
  if (formDiff >= 12) tags.push({ label: 'Gorąca forma ostatnich meczów obu drużyn', short: 'Forma↑', w: formDiff });
  else if (formDiff <= -12) tags.push({ label: 'Stabilna forma ostatnich meczów obu drużyn', short: 'Forma↓', w: -formDiff });

  if (sH.curLamak >= 2) tags.push({ label: `${hn(homeTeam)} w serii ${sH.curLamak} łamaków z rzędu`, short: 'Seria łamaków', w: 16 });
  if (sA.curLamak >= 2) tags.push({ label: `${hn(awayTeam)} w serii ${sA.curLamak} łamaków z rzędu`, short: 'Seria łamaków', w: 16 });
  if (sH.curNoLamak >= 6) tags.push({ label: `${hn(homeTeam)} bez łamaka od ${sH.curNoLamak} meczów`, short: 'Długa seria bez', w: 10 });
  if (sA.curNoLamak >= 6) tags.push({ label: `${hn(awayTeam)} bez łamaka od ${sA.curNoLamak} meczów`, short: 'Długa seria bez', w: 10 });

  if (b2bHome) tags.push({ label: `${hn(homeTeam)} na back-to-back`, short: 'B2B', w: 13 });
  if (b2bAway) tags.push({ label: `${hn(awayTeam)} na back-to-back`, short: 'B2B', w: 13 });

  if (fc.hist12 - base >= 10) tags.push({ label: `${hn(homeTeam)} historycznie często traci prowadzenie u siebie`, short: 'Historia gospodarza', w: fc.hist12 - base });
  if (fc.hist21 - base >= 10) tags.push({ label: `${hn(awayTeam)} historycznie często traci prowadzenie na wyjeździe`, short: 'Historia gościa', w: fc.hist21 - base });

  tags.sort((a, b) => b.w - a.w);
  return { pLamak, pRemis, pBrak, tags: tags.slice(0, 3), fc };
}

function signalBoxesHTML(sig) {
  return `<div class="forecast-result" style="margin-top:0;">
    <div class="forecast-box" style="background:var(--orange-soft);"><div class="pct" style="color:var(--orange)">${sig.pLamak.toFixed(0)}%</div><div class="lbl" style="color:var(--orange)">ŁAMAK</div></div>
    <div class="forecast-box" style="background:var(--cx-soft);"><div class="pct" style="color:var(--cx)">${sig.pRemis.toFixed(0)}%</div><div class="lbl" style="color:var(--cx)">REMIS</div></div>
    <div class="forecast-box" style="background:var(--panel-alt);"><div class="pct" style="color:var(--ink-soft)">${sig.pBrak.toFixed(0)}%</div><div class="lbl" style="color:var(--ink-soft)">BRAK WYRAŹNEGO SYGNAŁU</div></div>
  </div>`;
}

function signalTagsHTML(tags) {
  if (!tags.length) return `<div class="small-note" style="margin-top:10px;">Brak wyraźnych sygnałów kontekstowych dla tego meczu — statystyczny "środek stawki", bez konkretnej wskazówki.</div>`;
  return `<div class="chip-wrap" style="margin-top:10px;">${tags.map(t => `<span class="chip" style="cursor:default;">${t.label}</span>`).join('')}</div>`;
}

function computeForecast(fcHome, fcAway, b2bHome = false, b2bAway = false) {
  const sH = TEAM_STATS[fcHome], sA = TEAM_STATS[fcAway];

  const homeAsHost = teamGames(fcHome, 'regular').filter(g => g.home_team === fcHome);
  const awayAsGuest = teamGames(fcAway, 'regular').filter(g => g.away_team === fcAway);
  const hist12 = pct(homeAsHost.filter(g => g.classification === '1/2').length, homeAsHost.length);
  const hist21 = pct(awayAsGuest.filter(g => g.classification === '2/1').length, awayAsGuest.length);
  const histX = (sH.pctX + sA.pctX) / 2;

  const formH = recentForm(fcHome), formA = recentForm(fcAway);
  const formLamak = (formH.rate + formA.rate) / 2;
  const totalHistLamakH = sH.c12 + sH.c21 + sH.cx || 1;
  const totalHistLamakA = sA.c12 + sA.c21 + sA.cx || 1;

  const h2h = h2hGames(fcHome, fcAway, 'regular');
  const h2hN = h2h.length;
  const h2h12 = pct(h2h.filter(g => g.classification === '1/2').length, h2hN) || hist12;
  const h2h21 = pct(h2h.filter(g => g.classification === '2/1').length, h2hN) || hist21;
  const h2hX = pct(h2h.filter(g => g.classification === 'X').length, h2hN) || histX;

  const schedBoost12 = b2bHome ? 1.4 : 1.0;
  const schedBoost21 = b2bAway ? 1.4 : 1.0;
  const schedBoostX = (b2bHome || b2bAway) ? 1.15 : 1.0;

  const streakBoost12 = sH.curNoLamak >= 5 ? 0.8 : 1.0;
  const streakBoost21 = sA.curNoLamak >= 5 ? 0.8 : 1.0;

  function blend(hist, form, h2hVal, boost, streakBoost) {
    // im wiecej wzajemnych spotkan, tym mocniej H2H przebija surowa "historie" druzyny -
    // przy 0 spotkaniach h2hVal i tak jest rownowazne hist (patrz fallback wyzej), wiec to bezpieczne
    const h2hWeight = 0.20 + h2hConfidence * 0.15;   // 0.20 -> 0.35
    const histWeight = 0.35 - h2hConfidence * 0.15;  // 0.35 -> 0.20
    const b = histWeight * hist + 0.25 * form + h2hWeight * h2hVal;
    return b * boost * streakBoost;
  }

  // im wiecej wzajemnych meczow w bazie, tym bardziej H2H powinno "przebijac" surowa historie
  // (przy 2 spotkaniach to szum, przy 8+ to juz konkretny sygnal)
  const h2hConfidence = Math.min(1, h2hN / 8);

  let p12 = blend(hist12, formLamak * (sH.c12 / totalHistLamakH || 0.4), h2h12, schedBoost12, streakBoost12);
  let p21 = blend(hist21, formLamak * (sA.c21 / totalHistLamakA || 0.4), h2h21, schedBoost21, streakBoost21);
  let pX = blend(histX, formLamak * 0.15, h2hX, schedBoostX, 1.0);

  p12 = Math.max(2, Math.min(45, p12));
  p21 = Math.max(2, Math.min(45, p21));
  pX = Math.max(1, Math.min(20, pX));

  return { p12, p21, pX, hist12, hist21, histX, h2h12, h2h21, h2hX, h2hN, formLamak };
}

function renderForecastResult() {
  const box = document.getElementById('fc-result');
  if (fcHome === fcAway) { box.innerHTML = `<div class="empty-state"><div class="ico">⚠</div>Wybierz dwie różne drużyny.</div>`; return; }
  const sH = TEAM_STATS[fcHome], sA = TEAM_STATS[fcAway];
  const b2bHome = document.getElementById('fc-b2b-home')?.checked;
  const b2bAway = document.getElementById('fc-b2b-away')?.checked;

  const sig = computeMatchSignal(fcHome, fcAway, b2bHome, b2bAway, null);
  const { hist12, hist21, histX, h2h12, h2h21, h2hX, h2hN, formLamak } = sig.fc;
  const formH = recentForm(fcHome), formA = recentForm(fcAway);

  const html = `
  <div class="h2h-vs">
    <div class="h2h-team"><div class="name">${fcHome}</div><div class="small-note">gospodarz</div></div>
    <div class="h2h-vs-mid">VS</div>
    <div class="h2h-team"><div class="name">${fcAway}</div><div class="small-note">gość</div></div>
  </div>
  ${signalBoxesHTML(sig)}
  ${signalTagsHTML(sig.tags)}
  <details style="margin-top:20px;">
    <summary style="cursor:pointer;font-family:'Oswald',sans-serif;text-transform:uppercase;font-size:13px;color:var(--ink-soft);padding:8px 0;">Szczegóły kierunkowe i składniki modelu (dla własnej analizy) ▾</summary>
    <div class="card" style="margin-top:10px;">
      <table>
        <thead><tr><th>Składnik</th><th class="num">Waga</th><th class="num">${fcHome} → 1/2</th><th class="num">${fcAway} → 2/1</th><th class="num">X</th></tr></thead>
        <tbody>
          <tr><td>Historia (gospodarz u siebie / gość na wyjeździe)</td><td class="num">35%*</td><td class="num">${hist12.toFixed(1)}%</td><td class="num">${hist21.toFixed(1)}%</td><td class="num">${histX.toFixed(1)}%</td></tr>
          <tr><td>Forma z ostatnich ${formH.n}/${formA.n} meczów</td><td class="num">25%</td><td class="num" colspan="3">${formLamak.toFixed(1)}% obu drużyn łącznie miało łamaka</td></tr>
          <tr><td>H2H (${h2hN} spotkań w bazie)</td><td class="num">20-35%*</td><td class="num">${h2h12.toFixed(1)}%</td><td class="num">${h2h21.toFixed(1)}%</td><td class="num">${h2hX.toFixed(1)}%</td></tr>
          <tr><td>Terminarz (back-to-back)</td><td class="num">mnożnik</td><td class="num">${b2bHome ? '+40%' : '—'}</td><td class="num">${b2bAway ? '+40%' : '—'}</td><td class="num">${(b2bHome || b2bAway) ? '+15%' : '—'}</td></tr>
          <tr><td>Aktualna seria bez łamaka</td><td class="num">mnożnik</td><td class="num">${sH.curNoLamak} mecz.</td><td class="num">${sA.curNoLamak} mecz.</td><td class="num">—</td></tr>
        </tbody>
      </table>
      <div class="small-note" style="margin-top:8px;">* waga historii i H2H jest dynamiczna — im więcej wzajemnych spotkań tej pary w bazie (${h2hN}), tym mocniej H2H przebija samą historię drużyny (przy 8+ spotkaniach niemal się z nią zrównuje).</div>
      <div class="small-note">Model bazuje na ${GLOBAL_SEASON === 'all' ? '3 sezonach' : 'sezonie ' + GLOBAL_SEASON} — traktuj jako punkt wyjścia do własnej analizy, nie gotowy typ.</div>
    </div>
  </details>`;
  box.innerHTML = html;
}

// ============================================================
// INIT
// ============================================================
const RENDERERS = {
  sezon2627: renderSezon2627, zakonczone: renderZakonczone, terminarz: renderTerminarz, druzyny: renderDruzynyHost, analiza: renderAnaliza
};
selectTab('sezon2627');
refreshPreseasonResults();
refreshLive();

// ============================================================
// GLOBALNE WYSZUKIWANIE DRUŻYNY (dostępne z każdej zakładki)
// ============================================================
(function setupGlobalSearch() {
  const input = document.getElementById('global-team-search');
  const results = document.getElementById('team-search-results');

  function showResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) { results.style.display = 'none'; return; }
    const matches = TEAMS.filter(t => t.toLowerCase().includes(q)).slice(0, 6);
    if (!matches.length) { results.innerHTML = `<div style="padding:10px 14px;color:var(--ink-soft);font-size:13px;">Brak wyników</div>`; results.style.display = 'block'; return; }
    results.innerHTML = matches.map(t => `<div class="search-result-item" data-team="${t}" style="padding:9px 14px;cursor:pointer;font-size:13.5px;border-bottom:1px solid var(--line-soft);">${t}</div>`).join('');
    results.style.display = 'block';
    results.querySelectorAll('[data-team]').forEach(el => {
      el.onmouseenter = () => el.style.background = 'var(--panel-alt)';
      el.onmouseleave = () => el.style.background = '';
      el.onclick = () => { goToTeam(el.dataset.team); };
    });
  }

  function goToTeam(team) {
    selectedTeam = team;
    input.value = '';
    results.style.display = 'none';
    selectTab('druzyny');
  }

  input.addEventListener('input', e => showResults(e.target.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = input.value.trim().toLowerCase();
      const match = TEAMS.find(t => t.toLowerCase().includes(q));
      if (match) goToTeam(match);
    } else if (e.key === 'Escape') {
      input.value = ''; results.style.display = 'none';
    }
  });
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !results.contains(e.target)) results.style.display = 'none';
  });
})();
