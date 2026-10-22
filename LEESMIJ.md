# COVO-logtool

Lokale webtool om validatorruns en modelwijzigingen te loggen. Geen installatie, geen server, geen externe bibliotheken.

*English version: see [README.md](README.md).*

## Starten

1. Open `index.html` in **Google Chrome** of **Microsoft Edge** (dubbelklik, of sleep het bestand in de browser).
2. De eerste keer: klik **Gegevensmap kiezen** en kies een (lege) map, bv. in OneDrive.
3. Volgende keren onthoudt de tool de map. Vraagt de browser opnieuw toestemming, klik dan **Toegang geven**.
4. Vul bij **Instellingen** de views van je model in (één per regel). Daar beheer je ook de onderdelen, de constraints (C01–C13, M01, V01, V02), de requirements (R1–R8) en de TO-BE-requirements.

## Mappen

```
tool/                        ← deze map (de code)
├─ index.html
├─ css/style.css
├─ js/parser.js              leest de validatoroutput
├─ js/analyse.js             gevolg, duur, waarschuwingen, overzichten
├─ js/storage.js             map, log.json, back-ups, screenshots
├─ js/export.js              CSV en JSON
├─ js/app.js                 kern: gegevens, migratie, navigatie, filters, lightbox
├─ js/invoer.js              invoerformulier (per onderdeel)
├─ js/weergaven.js           tabel, tijdlijn, overzichten, vergelijking, instellingen
└─ scripts/kleur_toekennen.ajs  jArchi-script: kleur toekennen aan elementen in Archi

gegevensmap/                 ← de map die je kiest (de data)
├─ log.json                  alle records + instellingen (automatisch opgeslagen)
├─ log.backup-2026-10-14.json  één per dag: toestand vóór de eerste wijziging van die dag
├─ log.pre-migratie-2026-10-23.json  kopie van vóór de omzetting naar een nieuwe versie
└─ screenshots/
   ├─ R1.01_pre.png          eerste screenshot vóór
   ├─ R1.01_pre-2.png        tweede screenshot vóór (hoort bij R1.01_aft-2.png)
   ├─ R1.01_aft.png
   ├─ R1.01_aft-2.png
   ├─ R1.01_aft_2.png        bestaat de naam al (bv. na vervangen), dan _2, _3 …
   └─ T2.01_pre.png          TO-BE-runs gebruiken dezelfde map
```

Code en gegevens staan los van elkaar. Je kunt de tool vervangen door een nieuwe versie zonder je log te raken.

## Onderdelen

Eén `log.json` bevat de records van meerdere onderdelen van het onderzoek. Bovenaan kies je het **actieve onderdeel**. De balk en de badges krijgen de kleur van dat onderdeel, zodat je altijd ziet waar je werkt. Het actieve onderdeel bepaalt welke records de tabel, de tijdlijn en de filters tonen, welk formulier *Nieuw record* opent, welk overzicht je krijgt en welke CSV je exporteert. Tijdens een invoer is de keuzelijst geblokkeerd.

Standaard zijn er drie onderdelen. Ze zijn hernoembaar en je kunt er bijmaken in Instellingen; het **type** bepaalt het formulier:

| Onderdeel (type) | Runnummers | Wat |
|---|---|---|
| COVO-iteratie (`covo`) | `R<groep>.<nr>`, bv. R1.01 | de iteratieve toepassing van de validator |
| TO-BE – model zonder COVO (`tobe-zonder`) | `T1.<nr>` | TO-BE-requirements toepassen op het model zonder COVO |
| TO-BE – model met COVO (`tobe-met`) | `T2.<nr>` | TO-BE-requirements toepassen op het model met COVO |

Het runnummer wordt automatisch opgehoogd binnen het onderdeel en blijft aanpasbaar.

**Vorig record.** Bij *Nieuw record* neemt de tool de output, de build en de screenshots over van het vorige record **binnen hetzelfde onderdeel**. Het **eerste** record van *TO-BE met COVO* neemt de eindtoestand van de COVO-iteratie over (de laatste output en screenshots). Het eerste record van *TO-BE zonder COVO* neemt niets over: dat is een ander model.

### Velden per onderdeel

| Veld | COVO-iteratie | TO-BE zonder COVO | TO-BE met COVO |
|---|---|---|---|
| Run, datum en tijd vóór en na | ✔ | ✔ (start en einde) | ✔ |
| Validatoroutput vóór/na, modus, build | ✔ | alleen *ter info*: één eindrun, optioneel | ✔ |
| Soort record: TO-BE-wijziging of COVO-correctie | – | – | ✔ |
| Constraint(s), melding(en), intuïtief | ✔ | – | bij een COVO-correctie |
| TO-BE-requirement(s) | – | ✔ | ✔ (bij een correctie: *hoort bij*) |
| View(s) | ✔ | ✔ | ✔ |
| Acties | vinkjes, aantal optioneel | aantallen | aantallen |
| Beschrijving, screenshots vóór/na | ✔ | ✔ | ✔ |
| Behulpzaam | Ja / Nee / Twijfel | – | Ja / Nee / Twijfel / Nvt |
| Requirements geraakt/verfijnd (R1–R8) | ✔ | – | – |
| Duur (min) | – | berekend | berekend |
| Gevolg | ✔ | – | ✔, met nieuwe meldingen |

- **Acties:** element of relatie × toevoegen / verwijderen / verplaatsen / hernoemen / type gewijzigd. Bij de TO-BE-onderdelen vul je per combinatie een aantal in (standaard 0). Bij de COVO-iteratie blijven de vinkjes leidend en is het aantal optioneel; oude records hebben geen aantal (= niet ingevuld).
- **COVO-correctie** (TO-BE met COVO): gebruik dit recordtype wanneer je meldingen oplost die door een TO-BE-wijziging ontstonden. Duid aan bij welk TO-BE-requirement de correctie hoort; zo telt het correctiewerk mee in de vergelijking.
- **Duur** = tijdstip na − tijdstip vóór. Er is geen apart invoerveld.
- **Nieuwe meldingen** (in het gevolg): een constraint die nieuw verschijnt, een aantal dat stijgt, en de individuele meldingen die na voorkomen en vóór niet. *Zeker nieuw* als de lijst vóór volledig was, *mogelijk nieuw* als ze afgekapt was (`… and N more`). Is de lijst na afgekapt, dan meldt de tool dat er mogelijk nog meer zijn.

## Een record invoeren

**+ Nieuw record** opent de invoer in drie stappen (opstart, wijziging, afsluiting). Datum en tijd vóór staan al ingevuld; datum en tijd na vullen zich in bij het plakken van de output na, of met de knop *Nu*. De modus wordt uit de output gehaald. Het **gevolg** verschijnt automatisch.

**Screenshots:** klik in het (lege) vak, druk `Ctrl+V` of sleep een of meer afbeeldingen. Elke afbeelding wordt meteen als PNG opgeslagen in `screenshots/`. Per moment (vóór/na) kunnen er meerdere zijn:
- De volgorde telt: screenshot *n* vóór hoort bij screenshot *n* na. Met ↑ en ↓ wijzig je de volgorde.
- De positie zit in de bestandsnaam: de eerste heet `R1.01_pre.png`, de volgende `R1.01_pre-2.png`, `R1.01_pre-3.png` … Na een andere volgorde of een ander runnummer hernoemt de tool de bestanden bij het bewaren.
- Plak of sleep je in een gevuld vak, dan vervang je die screenshot.
- Overgenomen screenshots houden hun naam (bv. `R1.01_aft-2.png`).

**Bewaren:**
- *Bewaar als concept*: stap 3 mag nog leeg zijn. Later kies je *Verder invullen*.
- *Afronden en bewaren*: bij de onderdelen met validator zijn de output vóór en na dan verplicht.
- Wat je intypt, wordt ook vóór het bewaren al bijgehouden (`werkversie` in `log.json`). Sluit je de browser per ongeluk, dan wordt de invoer bij de volgende start hersteld.

## Vastleggen van de parsing

Bij het bewaren legt de tool naast de ruwe tekst ook de geparste gegevens en het gevolg vast, met het versienummer van de parser. Tabel, tijdlijn, overzicht en export gebruiken altijd die vastgelegde gegevens. Een latere aanpassing aan de parser verandert oude records dus niet.

Wil je een record toch opnieuw laten lezen door een nieuwere parser: *Opnieuw parsen…* in de details. De tool toont eerst de verschillen. Bevestig je, dan blijft de oude parsing bewaard in de historiek van het record.

## Behulpzaam herzien

Na het afronden ligt het oordeel van *het moment zelf* vast. Bij *Bewerken* kun je een **herziening** toevoegen (met datum). Het overzicht toont beide: het oordeel van het moment zelf en dat na herziening.

## Waarschuwingen (niet blokkerend)

- De Pre_Validatoroutput verschilt van de Aft_Validatoroutput van het vorige record. De regel `Validation completed in … ms` wordt daarbij genegeerd.
- De selectie (views, elements, relationships) verschilt tussen vóór en na.
- De modus in de output verschilt van het veld Modus.
- Bij de TO-BE-onderdelen: er is nog geen TO-BE-requirement gekozen.
- Opmerkingen van de parser, bv. meerdere rapporten in één veld of aantallen in de samenvatting die niet kloppen met de blokken.

## Weergaven

- **Tabel:** compacte weergave; klik op een kolomkop om te sorteren. Klik op een rij voor de **details**, met *‹ Vorige* / *Volgende ›* (ook met de pijltjestoetsen, in de volgorde en met de filters van de tabel) en de screenshots vóór en na naast elkaar. Esc keert terug naar de tabel.
- **Tijdlijn:** chronologisch; klik op een rij om de details open te klappen.
- **Filters en zoeken** (per onderdeel): groep, soort record, constraint, TO-BE-requirement, view, modus, en zoeken in run en beschrijving.
- **Lightbox:** klik op een screenshot om die groot te openen. Bovenaan staan altijd de run, PRE/AFT met het volgnummer (bv. `PRE 2/3`) en de bestandsnaam. Met ← → blader je door alle screenshots van de zichtbare records, per record eerst PRE en dan AFT. Home/End springt naar de eerste/laatste, Esc sluit. In de invoer blader je alleen door de screenshots van het record dat je bewerkt. Zolang de lightbox open is, bladeren de pijltjestoetsen door de afbeeldingen en niet door de records.
- **Overzicht:**
  - *COVO-iteratie:* per groep (eerste cijfer van het runnummer): meldingen bij het eerste en laatste record, acties, intuïtief, behulpzaam, requirements, records met nieuwe meldingen.
  - *TO-BE:* per TO-BE-requirement het aantal records, de som van de acties (totaal en per soort) en de totale duur; bij *met COVO* ook wijzigingen en correcties apart, de toename van het aantal meldingen en het aantal nieuwe constraints. Een record met meerdere requirements telt bij elk ervan mee; de totaalrij telt elk record één keer.
- **Vergelijking TO-BE:** combineert bewust beide TO-BE-onderdelen: per requirement *zonder COVO* naast *met COVO* (records, acties, duur, toename meldingen, correcties).

## Export

- **Export CSV** (bovenaan): de records van het **actieve onderdeel**. UTF-8 met BOM, scheidingsteken `;`, meerdere waarden gescheiden door `|`. De aantallen per actie staan in aparte kolommen (`element_toevoegen` … `relatie_type_gewijzigd`). Bij de COVO-iteratie betekent `x` een vinkje zonder aantal.
- **CSV vergelijking** (op het scherm *Vergelijking TO-BE*): één rij per requirement, met ook de aantallen per actiesoort voor beide modellen.
- **Export JSON:** volledige back-up van alles.

De bestanden komen in de downloadmap.

## Nieuwe versie van de tool en migratie

De structuur van `log.json` heeft een versienummer (`schemaVersion`). Opent een nieuwe versie van de tool een ouder log, dan zet ze het om:

1. Eerst schrijft de tool een **back-up**: `log.pre-migratie-<datum>.json`, byte voor byte gelijk aan `log.json`. Ze leest die terug en vergelijkt. Lukt dat niet, dan stopt ze en schrijft ze niets.
2. De omzetting **voegt alleen velden toe** (bv. `onderdeel`, `recordtype`, `tobeRequirements`). Bestaande waarden worden nooit gewijzigd of verwijderd. Alle bestaande records komen in het onderdeel *COVO-iteratie*.
3. Vóór het wegschrijven controleert de tool of elk bestaand veld van elk record nog identiek is. Wijkt er iets af, dan wordt `log.json` niet aangepast.
4. De omzetting wordt vermeld in `log.json` (`migraties`) en onderaan in Instellingen.

**Terug naar een oudere versie van de tool** (bv. v1.0.1): gebruik dan ook het log van vóór de omzetting. Hernoem `log.pre-migratie-<datum>.json` naar `log.json`. Wat je intussen met de nieuwe versie invoerde, zit daar niet in. Opent de tool een log van een nieuwere versie dan zijzelf, dan weigert ze te schrijven.

## Goed om te weten

- De validator kapt lijsten af na 5 regels (`… and N more`). De aanvinklijst bij *Melding(en)* bevat daarom alleen de getoonde meldingen. Vrije tekst blijft mogelijk.
- Verwijderde records en geannuleerde invoer laten hun screenshots in `screenshots/` staan.
- "Records met nieuwe meldingen" in het overzicht = een constraint die nieuw verscheen óf waarvan het aantal steeg.
- Een kapotte `log.json` wordt nooit overschreven: de tool meldt het probleem. Hernoem dan een `log.backup-…json` naar `log.json`.
- De run-prefix van een onderdeel kun je alleen wijzigen zolang het geen records heeft. Een onderdeel met records kun je niet verwijderen.
- Werk met de log in één browservenster tegelijk.

## AI-ondersteuning

De code en de documentatie van deze tool (README, LEESMIJ) werden geschreven met AI-ondersteuning (Claude Code, Anthropic), op basis van de specificatie en iteratieve feedback van de auteur. Het jArchi-script `scripts/kleur_toekennen.ajs` werd geschreven met AI-ondersteuning in een Claude-chatgesprek (Claude, Anthropic).

Het onderzoeksopzet, de requirements, de keuzes in de tool en het testen en gebruik in de onderzoekscontext zijn van de auteur.
