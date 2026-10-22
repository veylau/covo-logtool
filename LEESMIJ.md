# COVO-logtool

Lokale webtool om validatorruns en modelwijzigingen te loggen. Geen installatie, geen server, geen externe bibliotheken.

## Starten

1. Open `index.html` in **Google Chrome** of **Microsoft Edge** (dubbelklik, of sleep het bestand in de browser).
2. De eerste keer: klik **Gegevensmap kiezen** en kies een (lege) map, bv. in OneDrive.
3. Volgende keren onthoudt de tool de map. Vraagt de browser opnieuw toestemming, klik dan **Toegang geven**.
4. Vul bij **Instellingen** de views van je model in (één per regel). Daar kun je ook de lijst met constraints (C01–C13, M01, V01, V02) en requirements (R1–R8) aanpassen.

*English version: see [README.md](README.md).*

## Mappen

```
tool/                        ← deze map (de code)
├─ index.html
├─ css/style.css
├─ js/parser.js              leest de validatoroutput
├─ js/analyse.js             gevolg, waarschuwingen, overzicht
├─ js/storage.js             map, log.json, back-ups, screenshots
├─ js/export.js              CSV en JSON
├─ js/app.js                 interface
└─ scripts/kleur_toekennen.ajs  jArchi-script: kleur toekennen aan elementen in Archi

gegevensmap/                 ← de map die je kiest (de data)
├─ log.json                  alle records + instellingen (automatisch opgeslagen)
├─ log.backup-2026-10-14.json  één per dag: toestand vóór de eerste wijziging van die dag
└─ screenshots/
   ├─ R1.01_pre.png          eerste screenshot vóór
   ├─ R1.01_pre-2.png        tweede screenshot vóór (hoort bij R1.01_aft-2.png)
   ├─ R1.01_aft.png
   ├─ R1.01_aft-2.png
   └─ R1.01_aft_2.png        bestaat de naam al (bv. na vervangen), dan _2, _3 …
```

Code en gegevens staan los van elkaar. Je kunt de tool vervangen door een nieuwe versie zonder je log te raken.

## Een record invoeren

**+ Nieuw record** opent de invoer in drie stappen:

1. **Opstart (run vóór).** Datum en tijd staan al ingevuld. Het runnummer wordt automatisch opgehoogd (R1.01 → R1.02); verander het naar `R2.01` voor een nieuwe groep. De Pre_Validatoroutput, de build en de Pre_Screenshot worden overgenomen van de afsluiting van het vorige record. De modus wordt uit de output gehaald.
2. **Wijziging.** Constraints die in de output vóór voorkomen staan bovenaan, met hun aantal. Per aangevinkte constraint vink je de letterlijke melding(en) aan, vul je vrije tekst in en duid je *intuïtief* aan. Daarna volgen view, actie(s), beschrijving, behulpzaam en requirements.
3. **Afsluiting (run na).** Plak de Aft_Validatoroutput. Datum en tijd vullen zich in bij het plakken. Het **Gevolg** verschijnt automatisch.

**Screenshots:** klik in het (lege) vak, druk `Ctrl+V` of sleep een of meer afbeeldingen. Elke afbeelding wordt meteen als PNG opgeslagen in `screenshots/`. Per moment (vóór/na) kunnen er meerdere zijn:
- De volgorde telt: screenshot *n* vóór hoort bij screenshot *n* na. Met ↑ en ↓ wijzig je de volgorde.
- De positie zit in de bestandsnaam: de eerste heet `R1.01_pre.png`, de volgende `R1.01_pre-2.png`, `R1.01_pre-3.png` … Na een andere volgorde of een ander runnummer hernoemt de tool de bestanden bij het bewaren.
- Plak of sleep je in een gevuld vak, dan vervang je die screenshot.
- Bij een nieuw record worden alle screenshots van na het vorige record overgenomen als screenshots vóór, in dezelfde volgorde. Overgenomen bestanden houden hun naam (bv. `R1.01_aft-2.png`).

**Bewaren:**
- *Bewaar als concept*: stap 3 mag nog leeg zijn. In de tijdlijn kies je later *Verder invullen*.
- *Afronden en bewaren*: de output van vóór en na zijn dan verplicht.
- Wat je intypt, wordt ook vóór het bewaren al bijgehouden (`werkversie` in `log.json`). Sluit je de browser per ongeluk, dan wordt de invoer bij de volgende start hersteld.

## Vastleggen van de parsing

Bij het bewaren legt de tool naast de ruwe tekst ook de geparste gegevens en het gevolg vast, met het versienummer van de parser. Tijdlijn, overzicht en export gebruiken altijd die vastgelegde gegevens. Een latere aanpassing aan de parser verandert oude records dus niet.

Wil je een record toch opnieuw laten lezen door een nieuwere parser: *Opnieuw parsen…* in de tijdlijn. De tool toont eerst de verschillen. Bevestig je, dan blijft de oude parsing bewaard in de historiek van het record.

## Behulpzaam herzien

Na het afronden ligt het oordeel van *het moment zelf* vast. Bij *Bewerken* kun je een **herziening** toevoegen (met datum). Het overzicht toont beide: het oordeel van het moment zelf en dat na herziening.

## Waarschuwingen (niet blokkerend)

- De Pre_Validatoroutput verschilt van de Aft_Validatoroutput van het vorige record. De regel `Validation completed in … ms` wordt daarbij genegeerd.
- De selectie (views, elements, relationships) verschilt tussen vóór en na.
- De modus in de output verschilt van het veld Modus.
- Opmerkingen van de parser, bv. meerdere rapporten in één veld of aantallen in de samenvatting die niet kloppen met de blokken.

## Weergaven en export

- **Tijdlijn:** klik op een rij voor de details, met de screenshots vóór en na naast elkaar en de ruwe output.
- **Lightbox:** klik op een screenshot om die groot te openen. Bovenaan staan altijd de run, PRE/AFT met het volgnummer (bv. `PRE 2/3`) en de bestandsnaam. Met ← → blader je door alle screenshots van de tijdlijn (met de actieve filters), per record eerst PRE en dan AFT. Home/End springt naar de eerste/laatste, Esc sluit. In de invoer blader je alleen door de screenshots van het record dat je bewerkt.
- **Overzicht:** per groep (eerste cijfer van het runnummer).
- **Filters** op groep, constraint, view en modus.
- **Export CSV:** UTF-8 met BOM, scheidingsteken `;`, meerdere waarden gescheiden door `|`. Het bestand komt in de downloadmap.
- **Export JSON:** volledige back-up.

## Goed om te weten

- De validator kapt lijsten af na 5 regels (`… and N more`). De aanvinklijst bij *Melding(en)* bevat daarom alleen de getoonde meldingen. Vrije tekst blijft mogelijk.
- Verwijderde records en geannuleerde invoer laten hun screenshots in `screenshots/` staan.
- "Records met nieuwe meldingen" in het overzicht = een constraint die nieuw verscheen óf waarvan het aantal steeg.
- Een kapotte `log.json` wordt nooit overschreven: de tool meldt het probleem. Hernoem dan een `log.backup-…json` naar `log.json`.
- Werk met de log in één browservenster tegelijk.
