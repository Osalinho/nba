"""
Codzienne pobieranie wyników NBA Preseason z en.24score.com -> data/preseason_results.json

Plik wynikowy jest MAŁY (kilka KB, jeden mecz = jedna linia), więc commit z nowymi wynikami
prawie nic nie waży - w odróżnieniu od przebudowy index.html (8 MB). Strona sama dociąga
ten plik po otwarciu, więc nowe wyniki widać bez przebudowy index.html.

Skrypt NIGDY nie kończy się błędem z powodu sieci/blokady strony - w takim wypadku wypisuje
ostrzeżenie, zostawia dane bez zmian i kończy z kodem 0 (reszta workflow działa dalej).

Użycie:
    python scripts/fetch_preseason_24score.py                 # pobiera ze strony
    python scripts/fetch_preseason_24score.py --file strona.html   # z zapisanego pliku HTML
    python scripts/fetch_preseason_24score.py --url <inny adres>   # np. inny turniej / sezon

Plan B (gdyby 24score blokowało serwery GitHuba): zapisz stronę w przeglądarce (Ctrl+S, "Strona internetowa,
HTML") i wrzuć jako data/inbox/preseason.html - skrypt użyje jej, gdy pobranie ze strony się nie powiedzie.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

try:  # opcjonalnie: odcisk TLS prawdziwej Chrome - przechodzi tam, gdzie zwykłe `requests` dostaje 403
    from curl_cffi import requests as cffi_requests
except Exception:  # noqa: BLE001
    cffi_requests = None

sys.path.insert(0, str(Path(__file__).parent))
from parse_24score import parse_html
from team_mapping import from_24score_name

ROOT = Path(__file__).parent.parent
OUT_PATH = ROOT / 'data' / 'preseason_results.json'

URL = 'https://en.24score.com/basketball/usa/nba_preseason/2026/regular_season/fixtures/'
INBOX_PATH = ROOT / 'data' / 'inbox' / 'preseason.html'  # plan B: ręcznie zapisana strona (patrz README)
HEADERS = {
    'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Upgrade-Insecure-Requests': '1',
}


def has_matches_table(html):
    return BeautifulSoup(html, 'html.parser').select_one('table.t1.matches') is not None


def snippet(text, n=160):
    return re.sub(r'\s+', ' ', BeautifulSoup(text or '', 'html.parser').get_text(' '))[:n]


def clients():
    out = []
    if cffi_requests is not None:
        out.append(('curl_cffi (Chrome)', cffi_requests.Session(impersonate='chrome'), False))
    sess = requests.Session()
    sess.headers.update(HEADERS)
    out.append(('requests', sess, True))
    return out


def download(url, retries=2):
    """Pobiera stronę z en.24score.com. Loguje dokładnie co przyszło, żeby dało się zdiagnozować blokadę."""
    parts = urlparse(url)
    home = f'{parts.scheme}://{parts.netloc}/'
    for name, sess, send_headers in clients():
        print(f'[{name}] start')
        try:  # rozgrzewka: strona główna daje ciasteczka, potem wchodzimy "z linku"
            w = sess.get(home, **({'headers': HEADERS} if send_headers else {}), timeout=30)
            print(f'  strona główna -> HTTP {w.status_code}')
        except Exception as e:  # noqa: BLE001
            print(f'  strona główna -> błąd: {e}')
        for attempt in range(1, retries + 1):
            try:
                kw = {'headers': {**HEADERS, 'Referer': home}} if send_headers else {'headers': {'Referer': home}}
                r = sess.get(url, timeout=30, **kw)
                ok = r.status_code == 200 and has_matches_table(r.text)
                print(f'  próba {attempt}/{retries}: HTTP {r.status_code}, bajtów: {len(r.content)}, '
                      f'server: {r.headers.get("server", "?")}, tabela meczów: {"TAK" if ok else "NIE"}')
                if ok:
                    return r.text
                print(f'  treść: "{snippet(r.text)}"')
            except Exception as e:  # noqa: BLE001
                print(f'  próba {attempt}/{retries}: błąd sieci: {e}')
            time.sleep(3 * attempt)
    return None


def to_entry(g):
    return {
        'date': g['date'],  # data wg 24score (informacyjnie; do terminarza dopasowujemy po parze drużyn)
        'home_team': from_24score_name(g['home_team']),
        'away_team': from_24score_name(g['away_team']),
        'q': [[g['q1_home'], g['q1_away']], [g['q2_home'], g['q2_away']],
              [g['q3_home'], g['q3_away']], [g['q4_home'], g['q4_away']]],
        'ot': [list(p) for p in g['ot_periods']],
        'final_home': g['final_home'],
        'final_away': g['final_away'],
        'id': g['game_id'],
    }


def dump(entries):
    lines = [json.dumps(e, ensure_ascii=False, separators=(',', ':')) for e in entries]
    return '[\n' + ',\n'.join(lines) + '\n]\n' if lines else '[]\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--file', help='zamiast pobierać - wczytaj zapisany plik HTML')
    ap.add_argument('--url', default=URL, help='adres strony z meczami (domyślnie en.24score.com, preseason NBA 2026)')
    ap.add_argument('--out', default=str(OUT_PATH))
    args = ap.parse_args()
    out_path = Path(args.out)

    if args.file:
        html = Path(args.file).read_text(encoding='utf-8', errors='ignore')
    else:
        html = download(args.url)
        if not html and INBOX_PATH.exists():
            print(f'Plan B: używam ręcznie zapisanej strony {INBOX_PATH.relative_to(ROOT)}')
            html = INBOX_PATH.read_text(encoding='utf-8', errors='ignore')
    if not html:
        print('::warning::Nie udało się pobrać strony 24score (szczegóły w logu powyżej) - dane bez zmian.')
        return 0

    games = parse_html(html, '2026-27', 'preseason')
    existing = json.loads(out_path.read_text(encoding='utf-8')) if out_path.exists() else []
    index = {(e['home_team'], e['away_team']): i for i, e in enumerate(existing)}

    added = updated = 0
    for g in games:
        e = to_entry(g)
        key = (e['home_team'], e['away_team'])
        if key not in index:
            existing.append(e)
            index[key] = len(existing) - 1
            added += 1
            print(f"  + {e['date']} {e['home_team']} {e['final_home']}:{e['final_away']} {e['away_team']}")
        else:
            old = existing[index[key]]
            if any(old.get(k) != e[k] for k in ('q', 'ot', 'final_home', 'final_away')):
                e['date'] = old.get('date', e['date'])  # data zostaje z pierwszego zapisu (bez migotania przez strefy czasowe)
                existing[index[key]] = e
                updated += 1
                print(f"  ~ poprawiony wynik: {e['home_team']} - {e['away_team']}")

    print(f'Rozegranych meczów na stronie: {len(games)} | nowych: {added} | poprawionych: {updated}')
    new_text = dump(existing)
    if not out_path.exists() or out_path.read_text(encoding='utf-8') != new_text:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(new_text, encoding='utf-8')
        print(f'Zapisano {out_path} ({len(existing)} wyników)')
    else:
        print('Bez zmian.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
