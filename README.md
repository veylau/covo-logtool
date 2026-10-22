# COVO-logtool

A local web tool for logging validator runs and model changes when the
**COVO-Validator** is applied iteratively to an ArchiMate model.
It was built as research material for a master's thesis.

*Nederlandse handleiding: zie [LEESMIJ.md](LEESMIJ.md). The user interface is in Dutch.*

## Purpose

Each record in the log describes one change to the model:

1. **Start (run before):** the validator output before the change (pasted as
   text), the mode (Construction/Audit), the validator build and screenshots.
2. **Change:** the constraint(s) and literal message(s) that triggered the
   change, whether each message was intuitive, the view(s) involved, the action
   (relation/element × add/remove/move/type changed, or deliberately left
   unresolved), a description, whether the validator was helpful (with later
   revisions kept separately), and whether requirements were affected or refined.
3. **Close (run after):** the validator output and screenshots after the change.
   The **effect** (number of messages per constraint before → after, new and
   disappeared constraints) is calculated automatically.

The tool parses the validator report (status, mode, selection, counts per
constraint, messages per section) and stores the parsed result together with
the raw text at the moment a record is saved. A later change to the parser
therefore never changes records that were already reviewed. It also shows
non-blocking warnings, for example when the output before a change differs
from the output after the previous change.

Views: a sortable table with a detail view (previous/next record, also with
the arrow keys), a chronological timeline, a lightbox for the before/after
screenshots, overviews, filters and search, and export to CSV (UTF-8 with BOM,
`;` separator) and JSON.

### Research parts (since v2)

One log can hold the records of several parts of the research. The active
part is chosen at the top of the screen and determines which records, form,
overview and CSV export you get. By default there are three parts:

| Part (type) | Run numbers | Form |
|---|---|---|
| COVO iteration (`covo`) | `R<group>.<nr>` | as above |
| TO-BE – model without COVO (`tobe-zonder`) | `T1.<nr>` | TO-BE requirement(s), views, action counts, description, screenshots; validator output only for information |
| TO-BE – model with COVO (`tobe-met`) | `T2.<nr>` | as without COVO, plus validator runs before/after with the effect and the **new messages**; a record is either a *TO-BE change* or a *COVO correction* (fixing messages caused by a change, attributed to a TO-BE requirement) |

Actions are counted per element/relation × add/remove/move/rename/type changed.
The duration of a record is calculated from the times before and after.
The **TO-BE comparison** shows, per TO-BE requirement, the model without COVO
next to the model with COVO (records, actions, duration, increase in messages,
corrections) and can be exported as CSV.

### Migration of existing logs

When a newer version of the tool opens an older `log.json`, it first writes a
byte-for-byte copy (`log.pre-migratie-<date>.json`) and verifies it, then only
**adds** fields (all existing records go to the COVO-iteration part), checks
that every existing value is unchanged, and only then saves. To go back to an
older version of the tool, also go back to that copy. See LEESMIJ.md for details.

## Context

The COVO-Validator is a jArchi plugin for Archi by Severin et al.:
<https://github.com/sefanja/COVO-Validator>.
This tool is independent of it and only reads the text report the validator
produces.

## Getting started

No installation, build step, server or external libraries are needed.

1. Download or clone this repository.
2. Open `index.html` in **Google Chrome** or **Microsoft Edge** (the tool uses
   the File System Access API, which other browsers do not support).
3. Click **Gegevensmap kiezen** (choose data folder) and select an empty
   folder. The tool remembers this folder and asks for permission again when
   needed.
4. Under **Instellingen** (settings), enter the views of your model, one per
   line. The research parts, the constraint list (C01–C13, M01, V01, V02),
   the requirements (R1–R8) and the TO-BE requirements can be adjusted there
   as well.
5. Click **+ Nieuw record** (new record) to start logging.

All data stays in the folder you choose; nothing is sent anywhere.

## Folder structure

```
covo-logtool/                 this repository (code only)
├─ index.html
├─ css/style.css
├─ js/parser.js               parses the validator output
├─ js/analyse.js              effect, duration, warnings, overviews
├─ js/storage.js              data folder, log.json, backups, screenshots
├─ js/export.js               CSV and JSON export
├─ js/app.js                  core: data, migration, navigation, filters, lightbox
├─ js/invoer.js               entry form (per research part)
├─ js/weergaven.js            table, timeline, overviews, comparison, settings
├─ scripts/kleur_toekennen.ajs  jArchi script to colour selected elements in Archi
├─ LEESMIJ.md                 Dutch manual
└─ README.md

data folder/                  chosen by the user, never part of this repository
├─ log.json                   all records and settings (saved automatically)
├─ log.backup-YYYY-MM-DD.json one per day: state before the first change of that day
├─ log.pre-migratie-YYYY-MM-DD.json  copy made before converting to a newer version
└─ screenshots/               R1.01_pre.png, R1.01_pre-2.png, R1.01_aft.png, T2.01_pre.png, …
```

COVO-iteration runs are numbered `R<group>.<number>` (e.g. `R1.01`); the group
is used in the overview. TO-BE runs use a fixed prefix (`T1.01`, `T2.01`).

### jArchi script

`scripts/kleur_toekennen.ajs` assigns a colour to the selected elements in an
Archi view (or to every occurrence of an element selected in the model tree),
optionally including nested elements. Copy it into your jArchi scripts folder
to use it. Its prompts are in Dutch.

## AI assistance

The code and documentation of this tool (README, LEESMIJ) were written with
AI assistance (Claude Code, Anthropic), based on the author's specification and
iterative feedback. The jArchi script `scripts/kleur_toekennen.ajs` was written
with AI assistance in a Claude chat conversation (Claude, Anthropic).

The research design, the requirements, the choices in the tool, and the testing
and use in the research context are the author's.

## License

[MIT](LICENSE) © 2026 Laurent Veys
