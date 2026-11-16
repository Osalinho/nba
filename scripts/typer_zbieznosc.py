import json, datetime as dt, collections, math, warnings
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
warnings.filterwarnings('ignore')
def load():
    g=json.load(open('data/games_all.json',encoding='utf-8'))+json.load(open('data/history_2015_2023.json',encoding='utf-8'))
    out=[];seen=set()
    for a in g:
        if a['stage']!='regular' or a['season']=='2026-27':continue
        k=(a['date'],a['home_team'],a['away_team'])
        if k in seen:continue
        seen.add(k);a['d']=dt.datetime.strptime(a['date'],'%d.%m.%Y').date()
        out.append(dict(season=a['season'],d=a['d'],H=a['home_team'],A=a['away_team'],a=a))
    fx=json.load(open('data/fixtures_2026_27.json',encoding='utf-8'))
    for x in fx:
        r=dict(season='2026-27',d=dt.date.fromisoformat(x['d']),H=x['h'],A=x['a'],a=None)
        if x.get('q'):
            q=x['q'];r['a']=dict(q1_home=q[0][0],q1_away=q[0][1],q2_home=q[1][0],q2_away=q[1][1],q3_home=q[2][0],q3_away=q[2][1],q4_home=q[3][0],q4_away=q[3][1])
        out.append(r)
    for r in out:
        a=r['a']
        if a is None: r['c']=None;continue
        hh=a['q1_home']+a['q2_home'];ha=a['q1_away']+a['q2_away'];rh=hh+a['q3_home']+a['q4_home'];ra=ha+a['q3_away']+a['q4_away']
        r['c']='X' if rh==ra else '1/2' if(hh>ha and rh<ra) else '2/1' if(hh<ha and rh>ra) else '-'
    out.sort(key=lambda r:(r['d'],r['H']))
    # kolejki
    bys=collections.defaultdict(list)
    for r in out:bys[r['season']].append(r)
    for s,gs in bys.items():
        k=1;cur=set()
        for r in gs:
            if r['H'] in cur or r['A'] in cur:k+=1;cur=set()
            cur|={r['H'],r['A']};r['k']=k
        n=k
        for r in gs:r['kfrac']=r['k']/n
    return out
class Acc:
    def __init__(s):s.n=collections.Counter();s.l=collections.Counter();s.x=collections.Counter()
    def add(s,key,c):
        s.n[key]+=1
        if c in('1/2','2/1'):s.l[key]+=1
        if c=='X':s.x[key]+=1
    def get(s,keys):
        n=sum(s.n[k] for k in keys);return n,sum(s.l[k] for k in keys),sum(s.x[k] for k in keys)
def z(h,n,p,m=0):
    return (h-n*p)/math.sqrt(max(n*p*(1-p),1e-9)) if n>=m else 0.0
def signals(G):
    T=Acc();L=Acc();D=Acc();K=Acc();P=Acc();Pv={};tot=collections.Counter()
    rows=[]
    for r in G:
        c=r['c'];H,A=r['H'],r['A'];md=(r['d'].month,r['d'].day);doy=r['d'].timetuple().tm_yday
        N=sum(tot.values()) or 1;pl=(tot['l']/N) or .22;px=(tot['x']/N) or .05
        pair=frozenset((H,A))
        f=dict(season=r['season'],d=r['d'],H=H,A=A,k=r['k'],c=c)
        # S1 historia drużyn: ogólna + w analogicznym okresie (ten sam miesiąc)
        def team(t,keyf):
            n,l,x=T.get([(t,)+keyf]);return n,l,x
        for nm,keyf in(('mc',(r['d'].month,)),('kb',(r['k']//12,))):
            nh,lh,xh=team(H,keyf);na,la,xa=team(A,keyf)
            f['S1_'+nm+'_l']=(z(lh,nh,pl)+z(la,na,pl))/2;f['S1_'+nm+'_x']=(z(xh,nh,px)+z(xa,na,px))/2
        nh,lh,xh=T.get([(H,'all')]);na,la,xa=T.get([(A,'all')])
        f['S1_all_l']=(z(lh,nh,pl)+z(la,na,pl))/2;f['S1_all_x']=(z(xh,nh,px)+z(xa,na,px))/2
        # S2 liga w analogicznych okresach: ta sama data kalendarzowa ±3 dni, ta sama kolejka ±1
        days=[(r['d']+dt.timedelta(days=i)) for i in range(-3,4)]
        n,l,x=D.get([(d.month,d.day) for d in days]);f['S2_date_l']=z(l,n,pl);f['S2_date_x']=z(x,n,px)
        n,l,x=K.get([k for k in(r['k']-1,r['k'],r['k']+1)]);f['S2_kol_l']=z(l,n,pl);f['S2_kol_x']=z(x,n,px)
        # S3 H2H
        n,l,x=P.get([pair]);f['S3_h2h_l']=z(l,n,pl);f['S3_h2h_x']=z(x,n,px);f['S3_n']=n
        f['S3_prev_l']=1 if Pv.get(pair)=='l' else 0;f['S3_prev_x']=1 if Pv.get(pair)=='x' else 0
        # S3b odwrotny wynik w rewanżu: poprzednie spotkanie to łamak w odwrotnej konfiguracji
        rows.append(f)
        if c is not None:
            T.add((H,'all'),c);T.add((A,'all'),c)
            for nm,keyf in((0,(r['d'].month,)),(1,(r['k']//12,))):
                T.add((H,)+keyf,c);T.add((A,)+keyf,c)
            D.add(md,c);K.add(r['k'],c);P.add(pair,c)
            Pv[pair]='l' if c in('1/2','2/1') else 'x' if c=='X' else 'n'
            tot['n']+=1;tot['l']+=c in('1/2','2/1');tot['x']+=c=='X'
    return pd.DataFrame(rows)

# ---------------------------------------------------------------- typer zbieżności
from sklearn.metrics import roc_auc_score
SL=['S1_all_l','S1_mc_l','S1_kb_l','S2_date_l','S2_kol_l','S3_h2h_l','S3_prev_l'];SX=[c.replace('_l','_x') for c in SL]
NAME={'S1_all':'historia drużyn (cały dorobek)','S1_mc':'historia drużyn w tym miesiącu','S1_kb':'historia drużyn w tym etapie sezonu (kolejki)',
 'S2_date':'liga w tej dacie kalendarzowej (±3 dni)','S2_kol':'liga w tej kolejce (±1)','S3_h2h':'H2H tej pary','S3_prev':'poprzednie spotkanie pary było takie samo'}
def fit(tr):
    m={}
    for tg,F in(('any',SL+SX),('x',SX)):
        y=(tr.c!='-').astype(int) if tg=='any' else (tr.c=='X').astype(int)
        mod=make_pipeline(StandardScaler(),LogisticRegression(C=0.02,max_iter=500)).fit(tr[F],y);m[tg]=(mod,F,np.sort(mod.predict_proba(tr[F])[:,1]))
    return m
def apply(te,m):
    te=te.copy()
    for tg,(mod,F,rk) in m.items():
        te['p_'+tg]=mod.predict_proba(te[F])[:,1];te['r_'+tg]=np.searchsorted(rk,te['p_'+tg])/len(rk)
    def typ(r):
        a,x=r.r_any>=.75,r.r_x>=.90
        if a and x:return 'ŁAMAK' if r.r_any>=r.r_x else 'REMIS'
        return 'ŁAMAK' if a else 'REMIS' if x else '—'
    te['typ']=te.apply(typ,axis=1);return te
def why(r):
    out=[]
    fam=SL if r.typ=='ŁAMAK' else SX if r.typ=='REMIS' else []
    for c in fam:
        v=getattr(r,c)
        if v>=1.0 or (c.startswith('S3_prev') and v>0):out.append(f"{NAME[c[:-2]]} (+{v:.1f}σ)" if not c.startswith('S3_prev') else NAME[c[:-2]])
    return out
if __name__=='__main__':
    G=load();df=signals(G);played=df[df.c.notna()];res=[]
    for s in sorted(played.season.unique())[3:]:
        res.append(apply(played[played.season==s],fit(played[played.season<s])))
    r=pd.concat(res);print(f'BACKTEST walk-forward {len(r)} meczów ({r.season.min()}..{r.season.max()})  łamak(1/2,2/1,X)={(r.c!="-").mean():.3f}  X={(r.c=="X").mean():.3f}')
    print(' AUC wag (łamak/remis łącznie):',round(roc_auc_score((r.c!='-'),r.p_any),3),' AUC remis:',round(roc_auc_score((r.c=='X'),r.p_x),3))
    for k in('ŁAMAK','REMIS','—'):
        s=r[r.typ==k];print(f' typ {k:6s}: {len(s):5d} meczów ({100*len(s)/len(r):4.1f}%)  łamak/remis w grupie {(s.c!="-").mean():.3f}  remis w grupie {(s.c=="X").mean():.3f}')
    m=fit(played);U=apply(df[df.c.isna()],m)
    out=[dict(d=str(x.d),h=x.H,a=x.A,k=int(x.k),typ=x.typ,pl=round(x.p_any,3),px=round(x.p_x,3),why=why(x)) for x in U.itertuples()]
    json.dump(out,open('data/typy_zbieznosc_2026_27.json','w',encoding='utf-8'),ensure_ascii=False)
    print('Typy:',U.typ.value_counts().to_dict(),'| z sygnałami:',sum(1 for o in out if o['why']))
