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
"""
import argparse
import json
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent))
from parse_24score import parse_html
from team_mapping import from_24score_name

ROOT = Path(__file__).parent.parent
OUT_PATH = ROOT / 'data' / 'preseason_results.json'

URLS = [
    'https://en.24score.com/basketball/usa/nba_preseason/2026/regular_season/fixtures/',
    'https://24score.pro/basketball/usa/nba_preseason/2026/regular_season/fixtures',  # lustro
]
HEADERS = {
    'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'),
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
}


def has_matches_table(html):
    return BeautifulSoup(html, 'html.parser').select_one('table.t1.matches') is not None


def download(urls, retries=3):
    for url in urls:
        for attempt in range(1, retries + 1):
            try:
                r = requests.get(url, headers=HEADERS, timeout=30)
                if r.status_code == 200 and has_matches_table(r.text):
                    print(f'Pobrano: {url}')
                    return r.text
                print(f'  {url} -> HTTP {r.status_code}, tabela meczów: {has_matches_table(r.text) if r.status_code == 200 else "-"} (próba {attempt}/{retries})')
            except requests.RequestException as e:
                print(f'  {url} -> błąd sieci: {e} (próba {attempt}/{retries})')
            time.sleep(2 * attempt)
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
    ap.add_argument('--url', help='inny adres strony z meczami (domyślnie preseason NBA 2026)')
    ap.add_argument('--out', default=str(OUT_PATH))
    args = ap.parse_args()
    out_path = Path(args.out)

    if args.file:
        html = Path(args.file).read_text(encoding='utf-8', errors='ignore')
    else:
        html = download([args.url] if args.url else URLS)
    if not html:
        print('::warning::Nie udało się pobrać strony 24score - dane bez zmian.')
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
