# NBA Łamaki

Wyszukiwarka schematów i zależności dla zdarzeń 1/2, 2/1 i X (remis po 4. kwarcie) w NBA.

## Struktura repo

```
data/
  games_all.json        - surowa baza wszystkich meczów (źródło prawdy)
  enriched_data.json     - wersja przeliczona (streaki, kontekst, klasyfikacje) - to zużywa strona
  preseason_results.json - wyniki preseason po kwartach (mały plik; strona dociąga go sama po otwarciu)
site/
  dashboard_template.html - szablon HTML/CSS strony
  app.js                  - cała logika frontendu
scripts/
  team_mapping.py         - mapowanie skrótów NBA -> nazw w bazie
  fetch_new_games.py       - pobiera nowe zakończone mecze sezonu ze stats.nba.com (preseason pomija)
  fetch_preseason_24score.py - pobiera wyniki PRESEASONU z en.24score.com -> data/preseason_results.json
  enrich.py                - przelicza games_all.json -> enriched_data.json
  build_site.py            - składa finalny index.html
  parse_24score.py         - parser historycznych plików HTML z en.24score.com (użyty jednorazowo do zbudowania bazy 3 sezonów)
.github/workflows/
  daily-update.yml         - GitHub Action uruchamiana codziennie rano
index.html                 - GOTOWA STRONA (to ją otwiera użytkownik / serwuje GitHub Pages)
```

## Jak to uruchomić na GitHubie

1. **Załóż repozytorium** i wrzuć do niego całą zawartość tego folderu (zachowaj strukturę katalogów).

2. **Włącz GitHub Pages**: Settings → Pages → Source: `Deploy from a branch` → branch `main`, folder `/ (root)`. Strona pojawi się pod `https://<user>.github.io/<repo>/` w ciągu paru minut.

3. **Włącz uprawnienia do zapisu dla Actions** (inaczej bot nie będzie mógł commitować aktualizacji):
   Settings → Actions → General → Workflow permissions → zaznacz **"Read and write permissions"** → Save.

4. **Gotowe.** Workflow `.github/workflows/daily-update.yml` uruchomi się automatycznie codziennie o 8:00 czasu polskiego (dwa terminy cron + bramka czasu, żeby działało i latem, i zimą). Możesz go też odpalić ręcznie: zakładka **Actions** → `Codzienna aktualizacja NBA Łamaki` → `Run workflow`.

## Jak działa codzienna aktualizacja

1. `fetch_regular_24score.py` pobiera z en.24score.com stronę sezonu zasadniczego
   (`.../basketball/usa/nba/2026-2027/regular_season/fixtures/`), dopisuje nowe zakończone mecze do `data/games_all.json`
   i odświeża cały terminarz w `data/fixtures_2026_27.json`. To to samo źródło, z którego pochodzi cała historia
   (stats.nba.com odpadło - GitHub Actions jest tam blokowany, a daty bywały inne o dzień).
2. `fetch_preseason_24score.py` robi to samo dla preseasonu (`data/preseason_results.json`).
3. Gdy są zmiany: `enrich.py` przelicza bazę (razem z `data/history_2015_2023.json`), `build_site.py` składa `index.html`.
4. Bot commituje i pushuje. `enriched_data.json` powstaje na nowo przy każdej przebudowie i NIE jest commitowany.

Plan B (gdyby 24score blokowało serwery GitHuba): zapisz stronę w przeglądarce (Ctrl+S) i wrzuć jako
`data/inbox/regular.html` - wrzucenie samo uruchamia przebieg. `fetch_new_games.py` (stats.nba.com) zostaje w repo,
ale nie jest już używany - dwa źródła naraz dawałyby zdublowane mecze.

**Ważne:** plik workflow MUSI leżeć w `.github/workflows/daily-update.yml` - GitHub ignoruje go w innym miejscu.

## Ręczna aktualizacja / debugowanie lokalnie

```bash
pip install -r requirements.txt
python scripts/fetch_regular_24score.py
python scripts/enrich.py
python scripts/build_site.py
```

**Uwaga:** `fetch_new_games.py` wymaga zwykłego dostępu do internetu do stats.nba.com. Nie zadziała w piaskownicach, które blokują ten adres.

## Dodawanie kolejnych historycznych sezonów HTML z en.24score.com

Jeśli kiedyś zechcesz dogrywać starsze sezony ręcznie z zapisanych stron en.24score.com:

```python
from scripts.parse_24score import parse_file
games = parse_file('sciezka/do/pliku.html', '2022-23', 'regular')
```

i dopisz wynik do `data/games_all.json` (z dedupem po `date`+`home_team`+`away_team`), potem uruchom `enrich.py` i `build_site.py`.
