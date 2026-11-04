# chain/ — NEAR testnet layer (experimental)

> **Experimental. Not integrated with the playable prototype yet.**
> The prototype in the repository root keeps all money rules in a server ledger with test DINO.
> This folder is where the same rules move into NEAR contracts, so they are enforced on-chain.

## Plan

| Step | What | Status |
|---|---|---|
| 0 | Tools: Rust, `cargo-near`, `near-cli-rs` (inside WSL Ubuntu) | pending |
| 1 | `dino-token`: NEP-141 fungible token, 2 decimals, fixed supply, no mint | pending |
| 2 | `dino-arena`: escrow, 19 / 0.5 / 0.5 split, refunds, shelter counter, event prizes | pending |
| 3 | Server as oracle: reports only `A wins`, `B wins` or `refund` | pending |
| 4 | On-chain log page with explorer links | pending |

## What the contract must enforce

Constants fixed at deploy, public, no admin key afterwards:

- Entry 10 DINO per player, pot 20, winner 19, operation 0.5, shelter 0.5.
- Refund with no fee: tie under 500 ms, nobody solves, room not completed in 5 minutes, cancelled before the start.
- Shelter goal 100 valid duels **and** 50 DINO, then a free event paying 25 / 15 / 10; unpaid prizes return to the shelter.
- The contract never pays more than it holds.

## What stays off-chain

Who solved the puzzle is decided by the game server (the board is simulated off-chain). The oracle can only pick one of three outcomes and cannot move money to another account. If it disappears, anyone can force a refund after the deadline. The contract therefore trusts the oracle's key for the result, and this is stated openly.

## Commands

Commands come from the official NEAR documentation and must be checked there before use.
Nothing is deployed yet.
