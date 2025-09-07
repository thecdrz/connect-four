# Changelog

All notable changes to this project will be documented in this file. Dates use UTC.

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
