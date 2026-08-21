# NBA Łamaki

Wyszukiwarka schematów i zależności dla zdarzeń 1/2, 2/1 i X (remis po 4. kwarcie) w NBA.

## Struktura repo

```
data/
  games_all.json        - surowa baza wszystkich meczów (źródło prawdy)
  enriched_data.json     - wersja przeliczona (streaki, kontekst, klasyfikacje) - to zużywa strona
site/
  dashboard_template.html - szablon HTML/CSS strony
  app.js                  - cała logika frontendu
scripts/
  team_mapping.py         - mapowanie skrótów NBA -> nazw w bazie
  fetch_new_games.py       - pobiera nowe zakończone mecze ze stats.nba.com
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

4. **Gotowe.** Workflow `.github/workflows/daily-update.yml` uruchomi się automatycznie codziennie o 6:00 UTC (7-8 rano czasu polskiego). Możesz go też odpalić ręcznie: zakładka **Actions** → `Codzienna aktualizacja NBA Łamaki` → `Run workflow`.

## Jak działa codzienna aktualizacja

1. `fetch_new_games.py` pyta oficjalne stats.nba.com (przez bibliotekę `nba_api`) o mecze z ostatnich 4 dni, żeby nie zgubić niczego nawet jeśli Action raz się nie uda.
2. Nowe, wcześniej niezapisane mecze (rozpoznawane po dacie + parze drużyn) dopisuje do `data/games_all.json`.
3. `enrich.py` przelicza całą bazę na nowo (klasyfikacje 1/2/2/1/X, serie, back-to-back, itd.) do `data/enriched_data.json`.
4. `build_site.py` składa `index.html` na nowo.
5. Jeśli coś się zmieniło, bot commituje i pushuje zmiany.

## Ręczna aktualizacja / debugowanie lokalnie

```bash
pip install -r requirements.txt
python scripts/fetch_new_games.py --days-back 7
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
