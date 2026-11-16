"""
NBA Łamaki — typer v2 (zbudowany od zera, walidowany walk-forward na 11 sezonach).
Uruchom z korzenia repo:  python scripts/typer.py
Wejście : data/games_all.json, data/history_2015_2023.json, data/fixtures_2026_27.json
Wyjście : data/typy_2026_27.json  + raport backtestu w konsoli

Metoda (jedyny sygnał, który przetrwał test na danych spoza próby):
  1. Rating Elo drużyn (z marginesem, regresja 40% do średniej na starcie sezonu, +60 dla gospodarza)
     => p_home = szansa gospodarza przed meczem.
  2. Trzy regresje logistyczne (1/2, 2/1, X) na cechach: p_home, bliskość meczu (1-|2p-1|) i ich kwadraty.
     Uczone zawsze tylko na sezonach WCZEŚNIEJSZYCH niż testowany.
  3. Typ = zdarzenie o najwyższej pozycji percentylowej szansy (1/2 i 2/1: górny kwartyl, X: górny decyl).
     Mecze jednostronne (najniższe 15% bliskości) => NIC (tu łamaków jest ~20% zamiast ~28%).
"""
import json, datetime as dt, collections, warnings
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
warnings.filterwarnings('ignore')

TOP_Q = {'12': 0.75, '21': 0.75, 'x': 0.90}   # typ tylko dla górnego kwartyla (X: górnego decyla) szans danego zdarzenia
LONELY_Q = 0.15
FEATS = ['p_home', 'ph2', 'close', 'cl2', 'phc']

def load():
    g = json.load(open('data/games_all.json', encoding='utf-8')) + json.load(open('data/history_2015_2023.json', encoding='utf-8'))
    out, seen = [], set()
    for a in g:
        if a['stage'] != 'regular' or a['season'] == '2026-27': continue
        k = (a['date'], a['home_team'], a['away_team'])
        if k in seen: continue
        seen.add(k); a['d'] = dt.datetime.strptime(a['date'], '%d.%m.%Y').date(); out.append(a)
    fx = json.load(open('data/fixtures_2026_27.json', encoding='utf-8'))
    for x in fx:
        if not x.get('q'): continue
        q = x['q']
        out.append(dict(season='2026-27', d=dt.date.fromisoformat(x['d']), home_team=x['h'], away_team=x['a'],
                        q1_home=q[0][0], q1_away=q[0][1], q2_home=q[1][0], q2_away=q[1][1],
                        q3_home=q[2][0], q3_away=q[2][1], q4_home=q[3][0], q4_away=q[3][1]))
    for a in out:
        hh = a['q1_home'] + a['q2_home']; ha = a['q1_away'] + a['q2_away']
        rh = hh + a['q3_home'] + a['q4_home']; ra = ha + a['q3_away'] + a['q4_away']
        a['rh'], a['ra'] = rh, ra
        a['c'] = 'X' if rh == ra else '1/2' if (hh > ha and rh < ra) else '2/1' if (hh < ha and rh > ra) else '-'
    out.sort(key=lambda a: (a['d'], a['home_team']))
    return out

def elo_run(G):
    elo = collections.defaultdict(lambda: 1500.0); gn = collections.defaultdict(int); cur = None; rows = []
    for a in G:
        if a['season'] != cur:
            cur = a['season']; gn.clear()
            for t in list(elo): elo[t] = 1500 + 0.6 * (elo[t] - 1500)
        H, A = a['home_team'], a['away_team']
        d = elo[H] + 60 - elo[A]; p = 1 / (1 + 10 ** (-d / 400))
        rows.append(dict(season=a['season'], d=a['d'], H=H, A=A, c=a['c'], p_home=p, ok=gn[H] >= 10 and gn[A] >= 10))
        mar = a['rh'] - a['ra']; res = 1 if mar > 0 else 0.5 if mar == 0 else 0
        k = 20 * ((abs(mar) + 3) ** 0.8) / (7.5 + 0.006 * abs(elo[H] - elo[A]))
        elo[H] += k * (res - p); elo[A] -= k * (res - p); gn[H] += 1; gn[A] += 1
    return pd.DataFrame(rows), elo

def add(df):
    df['close'] = 1 - (2 * df.p_home - 1).abs(); df['ph2'] = df.p_home ** 2; df['cl2'] = df.close ** 2; df['phc'] = df.p_home * df.close
    return df

def fit(tr):
    m = {}
    for k, lab in (('12', '1/2'), ('21', '2/1'), ('x', 'X')):
        m[k] = make_pipeline(StandardScaler(), LogisticRegression(C=0.1, max_iter=1000)).fit(tr[FEATS], (tr.c == lab).astype(int))
    base = {'12': (tr.c == '1/2').mean(), '21': (tr.c == '2/1').mean(), 'x': (tr.c == 'X').mean()}
    pc = {k: np.quantile(m[k].predict_proba(tr[FEATS])[:, 1], TOP_Q[k]) for k in m}
    ranks = {k: np.sort(m[k].predict_proba(tr[FEATS])[:, 1]) for k in m}
    return m, base, tr.close.quantile(LONELY_Q), pc, ranks

def predict(te, model):
    m, base, lone, pc, ranks = model; te = te.copy()
    for k in m: te['P' + k] = m[k].predict_proba(te[FEATS])[:, 1]
    for k in m: te['R' + k] = np.searchsorted(ranks[k], te['P' + k]) / len(ranks[k])
    def typ(r):
        if r.close <= lone: return 'NIC'
        c = {lab: getattr(r, 'R' + k) for k, lab in (('12', '1/2'), ('21', '2/1'), ('x', 'X')) if getattr(r, 'P' + k) >= pc[k]}
        return max(c, key=c.get) if c else '—'
    te['typ'] = te.apply(typ, axis=1); return te

def backtest(df):
    res = []
    for s in sorted(df.season.unique())[3:]:
        tr = df[(df.season < s) & df.ok]; te = df[(df.season == s) & df.ok]
        if len(te) < 100: continue
        res.append(predict(te, fit(tr)))
    r = pd.concat(res); base_any = (r.c != '-').mean()
    print(f'BACKTEST walk-forward: {len(r)} meczów, sezony {r.season.min()}..{r.season.max()}, średnio łamak(1/2,2/1,X)={base_any:.3f}')
    for k in ('1/2', '2/1', 'X', 'NIC', '—'):
        s = r[r.typ == k]
        if not len(s): continue
        hit = (s.c == k).mean() if k in ('1/2', '2/1', 'X') else (s.c == '-').mean() if k == 'NIC' else np.nan
        ref = {'1/2': (r.c == '1/2').mean(), '2/1': (r.c == '2/1').mean(), 'X': (r.c == 'X').mean(), 'NIC': (r.c == '-').mean()}.get(k, np.nan)
        print(f'  typ {k:>3}: {len(s):5d} meczów ({100*len(s)/len(r):4.1f}%)  trafień {hit:.3f}  | średnia ligowa {ref:.3f}  | jakikolwiek łamak w tej grupie {(s.c!="-").mean():.3f}')
    return r

if __name__ == '__main__':
    G = load(); df = add(elo_run(G)[0]); R = backtest(df)
    df2, elo = elo_run(G); df2 = add(df2); model = fit(df2[df2.ok])
    fx = json.load(open('data/fixtures_2026_27.json', encoding='utf-8')); up = [x for x in fx if not x.get('q')]
    rows = []
    for x in up:
        d = elo[x['h']] + 60 - elo[x['a']]; rows.append(dict(d=x['d'], H=x['h'], A=x['a'], p_home=1 / (1 + 10 ** (-d / 400))))
    U = predict(add(pd.DataFrame(rows)), model)
    out = [dict(d=r.d, h=r.H, a=r.A, typ=r.typ, p_home=round(r.p_home, 3), p12=round(r.P12, 3), p21=round(r.P21, 3), px=round(r.Px, 3)) for r in U.itertuples()]
    json.dump(out, open('data/typy_2026_27.json', 'w', encoding='utf-8'), ensure_ascii=False)
    print('Typy:', U.typ.value_counts().to_dict(), '->', len(out), 'meczów zapisanych do data/typy_2026_27.json')
