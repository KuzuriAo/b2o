# Changelog

Newest first. Changes that alter what a converted file contains are always listed first, under "Output-affecting".

## 0.0.11 (2026-10-14)

### Output-affecting

- Converted files now use Snapmaker Orca 2.4.0's preset names, for example "0.20mm Standard @Snapmaker U1 (0.4 nozzle)", so Snorca 2.4.0 opens them on its own system preset. Files converted before October 14, 2026 open in Snorca 2.4.0 as "Project-inside presets"; re-convert them if you want them attached to the system preset. This happens on the server, so it applies to every b2o version.
- When no tier exactly matches a file's layer height (for example 0.42mm on a 0.6 nozzle), the file keeps its own layer height instead of taking the nearest tier's. Also server-side.

### Profiles

- Tracks Snapmaker Orca 2.4.0: 18 tiers instead of 34. A retired profile id passed to `--profile` still works: the conversion uses the tier that replaced it and prints a warning. Run `b2o profiles` for the current list.

### Features

- `--high-flow` for printers with the Snapmaker × Phaetus Liber™ High Flow Hotend for U1 on all four toolheads. Sets every toolhead to high-flow and uses Snapmaker's high-flow speeds where a tier has them (today 0.20mm Standard, 0.4mm nozzle). If you're not sure, leave it off.
- `b2o profiles` marks tiers that have high-flow speeds.

### Fixes

- Conversion warnings are now printed, for example objects that ended up touching after being fitted to the bed. The CLI used to drop them; the web app always showed them.

## Earlier versions

0.0.4 to 0.0.10 predate this changelog. Notable fixes from that period: the source file's brim setting is always kept; Bambu-only nozzle settings are removed so they can't leak into U1 files; profiles synced to Snapmaker Orca 2.3.6.
