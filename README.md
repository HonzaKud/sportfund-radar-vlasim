# SportFund Radar — Možnosti pro hokej Vlašim

Veřejný funkční pilot zaměřený na hokej ve Vlašimi, bez klubové značky a loga.

- Web: https://honzakud.github.io/sportfund-radar-vlasim/
- Architektura: veřejné HTML zdroje → Python crawler → data/radar.json → statický frontend → GitHub Pages.
- Denní aktualizace: 06:00 Europe/Prague, včetně letního času.
- Bez placených API, databáze nebo tajných klíčů ve frontendu.
- Karty, priorita A/B/C, hledání, osobní výběr, checklist, textový export, zdroje a historie.

## Automatika a její meze
Crawler prochází registr zdrojů a nejvýše čtyři tematické HTML odkazy na každém z nich. Respektuje robots.txt a přiznává chyby. Udržuje otisky obsahu, první nález, poslední úspěšnou síťovou kontrolu, historii změn a uplynulé termíny. Nové články označuje jako neověřené podněty, nikoli potvrzené dotace. Může najít i starší článek. Třídění je pravidlové, nejde o běžící jazykový model.

PDF, přihlášené zdroje, JavaScript-only weby a weby mimo registr nejsou automaticky obsahově zpracovány. Historická partnerství nejsou vydávána za dnešní smlouvy. Neověřený kandidát není potvrzený nový kontakt.

## Odhady a důvěryhodnost
Redakční fakta jsou datována odděleně od síťových kontrol. Změna obsahu nastaví needsReview a neobnovuje verifiedAt. Skóre je priorita, nikoli procento úspěchu. Po 30 dnech bez redakčního ověření se karta označí k revizi. Souhrnný odhad zahrnuje jen otevřené, nezměněné, čerstvě ověřené projekty s explicitním odhadem. Nezahrnuje podporu rodin, získané peníze či investice s neznámým rozpočtem. Je nutné ověřit souběh a překryv výdajů.

Výběr a checklist jsou pouze v localStorage. Export je lokální textový soubor. Žádné e-maily, žádosti ani analytika se neodesílají.

## Provoz
Workflow spustí testy, validaci, crawler, novou validaci, commit dat a publikaci statických souborů. Při selhání validace nebo úplném výpadku zdrojů se poslední funkční web nenahradí. Dílčí chyby jsou vidět v přehledu. GitHub může čas běhu zpozdit a po 60 dnech neaktivity veřejného repozitáře plán pozastavit.

Ruční spuštění: Actions → Daily radar and Pages → Run workflow.
Pages: Settings → Pages → Source: GitHub Actions.

## Úpravy
Zdroj přidejte do data/radar.json s unikátním id, name, category a HTTPS url.
Při skutečné obsahové kontrole karty upravte fakta a stav, nastavte verifiedAt na den ověření, needsReview na false a přidejte událost do history.
Pro jiný klub vyměňte profil, místní zdroje a partnery. Tato instance nemá filtr města či sportu.

## Kontroly
Sedm regresních testů ověřuje validitu dat, bezpečné URL, HTML parser, zachování poslední úspěšné kontroly při chybě, označení změny, archivaci termínů a deduplikaci nálezů. GitHub kontroluje také syntaxi JavaScriptu a validitu JSON před i po běhu.

Místní příkazy nejsou pro provoz potřeba.

