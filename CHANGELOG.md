# Changelog

All notable changes to this project will be documented in this file. Dates use UTC.

## [Unreleased]
### Backlog / Ideas
- Transition polish on dynamic height / lobby row updates.
- Dark / high-contrast & colorblind themes.
- Emoji reactions / lightweight emote bar.
- Optional QR code generator for invite link.
- Configurable CPU difficulty levels.

## [1.2.0] - 2025-09-07
### Added
- **Spectator Mode**: Watch any in-progress game in real-time with live board updates, turn status, and read-only chat history.
- **Live Lobby Panel**: Auto-updating list of active games showing host/opponent status with one-click join and spectate buttons.
- **Stop Watching Control**: Instantly exit spectated games with board clearing and lobby restoration.
- **Scroll Shadows**: Subtle gradient fades for lobby panel & chat window that dynamically update based on scroll position.
- **Bottom Stack Anchoring**: How To Play and Lobby sections now properly anchor to the bottom of the sidebar.
- **Enhanced UI Polish**: Improved modal styling, removed redundant elements, cleaner chat interface.

### Changed
- Spectator interface shows neutral game over messages (no rematch button or winner/loser perspective).
- While spectating, other Spectate buttons are hidden; current game shows disabled "Spectating" button.
- Chat container now uses single scroll container (removed nested scrollbars).
- Improved input field styling in name entry modal with better placeholder text.

### Fixed
- **Hidden "Connect 4" text** that was appearing behind Player 1 section.
- **Chat placeholder redundancy** - removed unnecessary "No messages yet" text.
- **Grey border** under Game Chat header that created visual clutter.
- **Column header strip** removed from game board for cleaner appearance.
- **CSS syntax errors** in modal styling that were breaking input field display.
- **Lobby panel margin** causing gap at bottom of sidebar.
- Spectators could previously see inappropriate win/loss messaging and rematch options.
- Chat height management ensures sidebar stays aligned with game board on all states.

### Removed
- Numeric column headers from game board (reduced visual clutter).
- Redundant chat empty state placeholder.
- Unnecessary scrollbars and borders from various UI elements.
### Added
- Lobby panel with real-time subscription (Socket event broadcasting game summaries).
- Spectator mode: snapshot sync (board, players, recent chat), live turn status, neutral game over modal.
- Stop Watching control clearing board and restoring full lobby actions.
- Player name map & unified turn-status logic (prevents incorrect perspective strings for spectators).
- Integrity guard: single active game per socket (no double join/create or self as both players).
- Height management upgrade: lobby participates in dynamic sizing (chat shrinks first, then lobby) with minimum thresholds.
- Neutral spectator game over modals (no rematch button) + rematch visibility restricted to active players.
 - Scroll shadows (subtle gradient fades) for lobby panel & chat window with dynamic updating.

### Changed
- Spectating hides other Spectate buttons; active game's button becomes disabled “Spectating”.
- Game Over modal refactored to branch logic for spectators vs players.

### Fixed
- Spectator previously saw loss/win messaging & rematch button (now neutral & hidden).
- Active Spectate button remained clickable while already spectating.

### Removed
- (none this cycle)

### Backlog / Ideas
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
