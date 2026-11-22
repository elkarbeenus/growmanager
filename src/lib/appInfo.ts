// Zentrale App-Informationen für den "Über"-Reiter und die Versionsanzeige.
// Hier die eigenen Angaben (Entwickler) eintragen.
// Die Version wird beim Build aus package.json übernommen (siehe vite.config.ts).
import { t } from '@/lib/i18n';

export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.5.3';

export const APP_NAME = 'growmanager';

export const DEVELOPER = {
  name: 'Dominic Lesina',
  role: () => t('Entwicklung & Design', 'Development & design'),
  github: '', // z. B. 'https://github.com/DEIN-NAME' (leer = nicht anzeigen)
  contact: '', // z. B. 'mail@example.com' (leer = nicht anzeigen)
};

export interface ChangelogEntry {
  version: string;
  items: { de: string; en: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.5.3',
    items: [
      { de: 'Neu: Bewässerungsplan pro Grow (Crop Steering light) – Pumpen-Laufzeit pro Shot, P1/P2-Zeitplan, letzter Shot, Ziel-Dryback und Wasser pro Tag', en: 'New: irrigation plan per grow (crop steering light) – pump run time per shot, P1/P2 schedule, last shot, target dryback and water per day' },
      { de: 'Medium frei wählbar (Steinwolle-Würfel, -Blöcke, -Matten, Töpfe, eigene Maße oder Liter); Durchfluss pro Tropfer × Tropfer pro Pflanze oder für die ganze Anlage', en: 'Medium freely selectable (rockwool cubes, blocks, slabs, pots, custom size or litres); flow per dripper × drippers per plant or for the whole system' },
      { de: 'Timer-Werte in Minuten:Sekunden zum Abtippen (z. B. Mars-Hydro-App), Tagesverlauf als Grafik und „Plan kopieren“', en: 'Timer values in minutes:seconds to copy over (e.g. the Mars Hydro app), day view as a graphic and “Copy plan”' },
      { de: 'Steuerung vegetativ ↔ generativ per Schieber oder automatisch nach Phase; Feinjustieren von Shot-Größe und Dryback', en: 'Steering vegetative ↔ generative with a slider or automatically by phase; fine-tune shot size and dryback' },
    ],
  },
  {
    version: '0.5.2',
    items: [
      { de: 'Auto-Update in der App: „Jetzt aktualisieren“ lädt die neue Version, prüft sie per SHA-256, ersetzt sie und startet neu – AppImage und Windows, Daten bleiben erhalten', en: 'In-app auto update: “Update now” downloads the new version, verifies it via SHA-256, replaces it and restarts – AppImage and Windows, data is kept' },
      { de: 'Nährlösung: Ansätze lassen sich nachträglich bearbeiten (Datum, Menge, Notiz, Verwendung, Grow, Woche) – kein Löschen und Neuanlegen mehr', en: 'Nutrient solution: batches can be edited afterwards (date, amount, note, purpose, grow, week) – no more deleting and re-adding' },
      { de: 'Nährlösung: Zur Auswahl stehen nur Grows, die gerade laufen; bereits zugeordnete bleiben erhalten', en: 'Nutrient solution: only grows that are currently running can be picked; existing assignments are kept' },
    ],
  },
  {
    version: '0.5.1',
    items: [
      { de: '11 dunkle Themes: Nachtzelt, Grünlicht, Natriumdampf, Blurple, OLED-Schwarz sowie Catppuccin Mocha, Dracula, Tokyo Night, Nord, Gruvbox und Rosé Pine', en: '11 dark themes: Night tent, Green light, Sodium, Blurple, OLED black plus Catppuccin Mocha, Dracula, Tokyo Night, Nord, Gruvbox and Rosé Pine' },
      { de: 'Theme-Wechsel sofort ohne Neustart – unten in der Seitenleiste oder unter Einstellungen → Erscheinungsbild (mit Vorschau); gespeichert pro Gerät', en: 'Switch themes instantly without a restart – at the bottom of the sidebar or under Settings → Appearance (with preview); saved per device' },
      { de: 'Update-Hinweis neu als Nachricht oben mittig: kurz „tippt …“, dann eine Sprechblase mit den wichtigsten Neuerungen; blockiert die App nicht', en: 'New update notice as a message at the top centre: a short “typing …”, then a bubble with the highlights; does not block the app' },
      { de: 'Fix: Die Update-Prüfung fragt jetzt das richtige GitHub-Repo ab', en: 'Fix: the update check now asks the correct GitHub repository' },
      { de: 'Einführungstour: neuer Schritt zu Themes und Sprache', en: 'Guided tour: new step for themes and language' },
    ],
  },
  {
    version: '0.5.0',
    items: [
      { de: 'Komplett neues Design „Grow-Zelt bei Nacht“: dunkle Pflaumentöne, Blattgrün für Aktionen, LED-Violett als Zweitfarbe und eine kräftigere Überschriften-Schrift', en: 'All-new “grow tent at night” design: dark plum tones, leaf green for actions, LED violet as second colour and a bolder heading font' },
      { de: 'Navigation in einer Seitenleiste links, gruppiert nach Garten, Werkzeuge und System; in kleinen Fenstern als Leiste oben', en: 'Navigation in a sidebar on the left, grouped into Garden, Tools and System; in small windows as a bar at the top' },
      { de: 'Grow-Karten neu: große Tageszahl, Farbkante je Grow und ein Lichtspektrum-Streifen, der pro erreichtem Meilenstein weiter leuchtet', en: 'Redesigned grow cards: large day count, colour edge per grow and a light-spectrum strip that lights up further with every milestone reached' },
      { de: 'Einführungstour überarbeitet: neuer Schritt zur Kopfzeile (Tour, Export, Import), Hinweise zur Seitenleiste und zum Spektrum-Streifen, Fortschrittspunkte', en: 'Guided tour reworked: new step for the header (Tour, Export, Import), notes on the sidebar and the spectrum strip, progress dots' },
      { de: 'Athena-Düngeschema: In Blüte 8 und 9 gibt es kein Bloom A/B mehr (nur PK, Fade, Cleanse) – Verbrauch und Kosten rechnen entsprechend', en: 'Athena feed schedule: no more Bloom A/B in flower weeks 8 and 9 (only PK, Fade, Cleanse) – usage and costs are calculated accordingly' },
      { de: 'Schriften werden mitgeliefert – die App sieht auch offline überall gleich aus; sichtbarer Tastatur-Fokus und weniger Animation bei „Bewegung reduzieren“', en: 'Fonts are bundled – the app looks the same everywhere, even offline; visible keyboard focus and less motion with “reduce motion”' },
      { de: 'Neue Versionsnummerierung ab 0.5.0 bis zur Version 1.0; frühere Entwicklungsstände (1.0–1.9) stehen in CHANGELOG.md', en: 'New version numbering from 0.5.0 up to version 1.0; earlier development builds (1.0–1.9) are listed in CHANGELOG.md' },
    ],
  },
];

