"""
Codzienne pobieranie wyników SEZONU ZASADNICZEGO NBA z en.24score.com
(https://en.24score.com/basketball/usa/nba/2026-2027/regular_season/fixtures/)

Robi dwie rzeczy z jednej pobranej strony:
  1. dopisuje nowe, ZAKOŃCZONE mecze (z wynikami po kwartach) do data/games_all.json,
  2. odświeża cały terminarz w data/fixtures_2026_27.json (w tym wyniki rozegranych meczów).

To jest to samo źródło, z którego pochodzi cała historia w bazie - dzięki temu daty i nazwy drużyn
są spójne (stats.nba.com odpada: GitHub Actions jest tam blokowany, a daty bywały inne o dzień).

Skrypt NIGDY nie kończy się błędem z powodu sieci - ostrzega, zostawia dane bez zmian i kończy z kodem 0.
Do pliku data/.last_update_had_changes zapisuje 1 (są zmiany => przebuduj stronę) albo 0.

Użycie:
    python scripts/fetch_regular_24score.py                      # pobiera ze strony
    python scripts/fetch_regular_24score.py --file strona.html   # z zapisanej strony (test / plan B)
Plan B: zapisz stronę (Ctrl+S) i wrzuć jako data/inbox/regular.html - wrzucenie uruchamia workflow.
"""
import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch_preseason_24score import download  # noqa: E402  (to samo pobieranie z AJAX-em i ciasteczkami)
from parse_24score import parse_html  # noqa: E402
from parse_fixtures_2627 import parse_text  # noqa: E402
from team_mapping import from_24score_name  # noqa: E402

ROOT = Path(__file__).parent.parent
GAMES = ROOT / 'data' / 'games_all.json'
FIXTURES = ROOT / 'data' / 'fixtures_2026_27.json'
FLAG = ROOT / 'data' / '.last_update_had_changes'
INBOX = ROOT / 'data' / 'inbox' / 'regular.html'
URL = 'https://en.24score.com/basketball/usa/nba/2026-2027/regular_season/fixtures/'
SEASON = '2026-27'


def d(s):
    return datetime.strptime(s, '%d.%m.%Y').date()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--file')
    ap.add_argument('--url', default=URL)
    args = ap.parse_args()

    if args.file:
        html = Path(args.file).read_text(encoding='utf-8', errors='ignore')
    else:
        html = download(args.url)
        if not html and INBOX.exists():
            print(f'Plan B: używam ręcznie zapisanej strony {INBOX.relative_to(ROOT)}')
            html = INBOX.read_text(encoding='utf-8', errors='ignore')
    if not html:
        print('::warning::Nie udało się pobrać strony 24score (szczegóły w logu powyżej) - dane bez zmian.')
        FLAG.write_text('0')
        return 0

    played = parse_html(html, SEASON, 'regular')
    fixtures = parse_text(html)
    print(f'Strona: {len(fixtures)} meczów w terminarzu, rozegranych: {len(played)}')
    if len(fixtures) < 1000:  # zabezpieczenie: pusta/ucięta strona nie może nadpisać terminarza
        print('::warning::Terminarz na stronie wygląda na niepełny - nic nie zmieniam.')
        FLAG.write_text('0')
        return 0

    existing = json.loads(GAMES.read_text(encoding='utf-8'))
    keys = {(g['home_team'], g['away_team'], d(g['date'])) for g in existing if g['season'] == SEASON}
    new = []
    for g in played:
        g['home_team'], g['away_team'] = from_24score_name(g['home_team']), from_24score_name(g['away_team'])
        day = d(g['date'])
        # ten sam mecz nie może wejść drugi raz (tolerancja ±1 dzień na różnice stref czasowych)
        if any((g['home_team'], g['away_team'], day + timedelta(days=k)) in keys for k in (-1, 0, 1)):
            continue
        g['game_id'] = f"ls24_{g['game_id']}"
        keys.add((g['home_team'], g['away_team'], day))
        new.append(g)
        print(f"  + {g['date']} {g['home_team']} {g['final_home']}:{g['final_away']} {g['away_team']}")

    if new:
        existing.extend(new)
        GAMES.write_text(json.dumps(existing, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'Nowych meczów: {len(new)}')

    new_fx = json.dumps(fixtures, ensure_ascii=False, separators=(',', ':'))
    fx_changed = not FIXTURES.exists() or FIXTURES.read_text(encoding='utf-8') != new_fx
    if fx_changed:
        FIXTURES.write_text(new_fx, encoding='utf-8')
        print('Terminarz 26/27 zaktualizowany.')
    FLAG.write_text('1' if (new or fx_changed) else '0')
    return 0


if __name__ == '__main__':
    sys.exit(main())
