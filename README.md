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

Views: a chronological timeline (with a lightbox for the before/after
screenshots), an overview per group of runs, filters, and export to CSV
(UTF-8 with BOM, `;` separator) and JSON.

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
   line. The constraint list (C01–C13, M01, V01, V02) and requirements
   (R1–R8) can be adjusted there as well.
5. Click **+ Nieuw record** (new record) to start logging.

All data stays in the folder you choose; nothing is sent anywhere.

## Folder structure

```
covo-logtool/                 this repository (code only)
├─ index.html
├─ css/style.css
├─ js/parser.js               parses the validator output
├─ js/analyse.js              effect, warnings, overview per group
├─ js/storage.js              data folder, log.json, backups, screenshots
├─ js/export.js               CSV and JSON export
├─ js/app.js                  user interface
├─ scripts/kleur_toekennen.ajs  jArchi script to colour selected elements in Archi
├─ LEESMIJ.md                 Dutch manual
└─ README.md

data folder/                  chosen by the user, never part of this repository
├─ log.json                   all records and settings (saved automatically)
├─ log.backup-YYYY-MM-DD.json one per day: state before the first change of that day
└─ screenshots/               R1.01_pre.png, R1.01_pre-2.png, R1.01_aft.png, …
```

Runs are numbered `R<group>.<number>` (e.g. `R1.01`); the group is used in the
overview.

### jArchi script

`scripts/kleur_toekennen.ajs` assigns a colour to the selected elements in an
Archi view (or to every occurrence of an element selected in the model tree),
optionally including nested elements. Copy it into your jArchi scripts folder
to use it. Its prompts are in Dutch.

## AI assistance

This tool was built with AI assistance (Claude Code, Anthropic). The design,
requirements and testing in the research context are the author's.

## License

[MIT](LICENSE) © 2026 Laurent Veys
