# VERIFICATION RULES (read this first, every session)

## Role
You are a VERIFIER, not a builder. Do not modify application code, tests, configs or migrations.
You may only create or edit files under `docs/verification/`. Put any helper scripts in `docs/verification/scripts/`.
If something is broken, record it. Do not fix it.

## Token discipline (strict)
1. Never open a file whole if it is over 80 lines. Use `grep -n`, `sed -n 'A,Bp'`, `head -n 40`, `wc -l`.
2. Never paste code or logs back to me. Cite `file:line` and at most a one-line quote.
3. Always trim command output: `| tail -25` or `| head -25`, `pytest -q --tb=line`, `-q` flags.
4. Do not re-read anything already checked. Trust PROGRESS.md.
5. No planning prose, no "I will now". Act, then record.
6. Prefer one small script that checks many things and prints one `PASS`/`FAIL` line each. Save it in `docs/verification/scripts/` and reuse it.
7. Do one work package (WP) per run. Stop after its checkpoint unless plenty of budget clearly remains.

## Checkpoint protocol (this is what keeps work from being lost)
- After EVERY check item, immediately append ONE line to `docs/verification/PROGRESS.md`. Never batch.
  Format: `WPn.m | PASS | evidence` (also FAIL, BLOCKED, N/A). Evidence is at most 120 characters.
- Every FAIL also gets one block appended to `docs/verification/FINDINGS.md`:
  `F-nnn | blocker/major/minor | WPn.m | what is wrong | file:line | expected vs actual (2 lines max)`
  Severity: blocker = safety, security or data loss, or breaks a core flow. major = wrong behaviour users would hit. minor = polish or docs.
- If you are close to running out of budget, or finish a WP, append `NEXT: WPn.m` to PROGRESS.md and stop.
- Never start a check you cannot finish. Split it and record the first half.

## Resuming
Read only this file and `tail -n 30 docs/verification/PROGRESS.md`. Continue at the line after the last `NEXT:` (or the first unchecked item in WORKPLAN.md). Do not re-run completed items.

## Evidence standard
- PASS needs proof: command output, a query result, or `file:line`. Never infer from names or from the README.
- README and docs statements are claims to verify, not proof.
- If you cannot run something, mark BLOCKED with the reason in one line.

## Safety
- Never print secrets, tokens or passwords. Mask them.
- No destructive commands: no `docker compose down -v`, no DROP or TRUNCATE on the dev database. Use a throwaway database named `resqai_verify` for anything that writes.
- Do not change git history. Do not commit.

## Reply format after each run (max 8 lines)
```
WP done: <id>
PASS x / FAIL y / BLOCKED z
New findings: F-nnn (severity), ...
NEXT: <id>
```
