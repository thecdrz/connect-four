# Changelog

All notable changes to this project will be documented in this file. Dates use UTC.

## [Unreleased]
### Added
- Lobby panel with real-time subscription (Socket event broadcasting game summaries).
- Spectator mode: snapshot sync (board, players, recent chat), live turn status, neutral game over modal.
- Stop Watching control clearing board and restoring full lobby actions.
- Player name map & unified turn-status logic (prevents incorrect perspective strings for spectators).
- Integrity guard: single active game per socket (no double join/create or self as both players).
- Height management upgrade: lobby participates in dynamic sizing (chat shrinks first, then lobby) with minimum thresholds.
- Neutral spectator game over modals (no rematch button) + rematch visibility restricted to active players.

### Changed
- Spectating hides other Spectate buttons; active game's button becomes disabled “Spectating”.
- Game Over modal refactored to branch logic for spectators vs players.

### Fixed
- Spectator previously saw loss/win messaging & rematch button (now neutral & hidden).
- Active Spectate button remained clickable while already spectating.

### Removed
- (none this cycle)

### Backlog / Ideas
- Scroll shadows / subtle fade edges for overflowing lobby & chat.
- Transition polish on dynamic height / lobby row updates.
- Dark / high-contrast & colorblind themes.
- Emoji reactions / lightweight emote bar.
- Optional QR code generator for invite link.
- Configurable CPU difficulty levels.

## [1.1.0] - 2025-09-07
### Added
- Dynamic chat height management (prevents chat pushing below game board; responsive resize handling).
- Back button logic in join flow: after any failed join attempt, Back dismisses modal.

### Changed
- Hybrid JS + CSS sizing for chat container (smooth transitions, no layout push).

### Fixed
- Initial multiplayer load could show chat a few pixels lower than board.
- Join modal re-opening path causing confusing navigation after invalid room codes.

### Notes
- Invite link `host` parameter remains informational only; does not auto-populate opponent name.

## [1.0.0] - Initial Release
- Core online multiplayer Connect 4 with chat, invite links, rematch flow, CPU mode, avatars, leaderboard, and modern responsive UI.

---

Semantic versioning is followed: MAJOR.MINOR.PATCH
