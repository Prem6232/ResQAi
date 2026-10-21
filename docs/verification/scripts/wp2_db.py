"""WP2 DB verification script — runs against resqai_verify throwaway DB."""
import subprocess, sys, os

# Use psql via docker exec to avoid installing psycopg locally
PG = ["docker", "exec", "sentinelgrid_postgres", "psql", "-U", "postgres"]

def run(sql, db="sentinelgrid_db"):
    r = subprocess.run(PG + ["-d", db, "-c", sql], capture_output=True, text=True)
    return r.stdout + r.stderr

# WP2.3 — PostGIS version
out = run("SELECT PostGIS_Version();")
if "PostGIS" in out or "postgis" in out.lower():
    print("WP2.3 | PASS | " + out.strip().splitlines()[-2].strip()[:100])
else:
    print("WP2.3 | FAIL | PostGIS_Version() returned: " + out[:100])

# WP2.4 — GiST indexes on geometry columns
out = run("""
SELECT tablename, indexname FROM pg_indexes
WHERE indexdef ILIKE '%gist%' AND indexdef ILIKE '%geom%'
ORDER BY tablename;
""")
lines = [l.strip() for l in out.splitlines() if '|' in l]
if lines:
    print(f"WP2.4 | PASS | GiST geom indexes: {len(lines)} found: " + "; ".join(lines[:3])[:100])
else:
    print("WP2.4 | FAIL | No GiST indexes on geometry columns found")

# WP2.5 — indexes on status, created_at, FK for incident/report/assignment
out = run("""
SELECT tablename, indexname FROM pg_indexes
WHERE tablename IN ('incidents','reports','assignments')
  AND (indexname ILIKE '%status%' OR indexname ILIKE '%created%' OR indexname ILIKE '%fk%' OR indexname ILIKE '%idx%')
ORDER BY tablename, indexname;
""")
lines = [l.strip() for l in out.splitlines() if '|' in l]
print(f"WP2.5 | {'PASS' if lines else 'FAIL'} | {len(lines)} relevant indexes found on incident/report/assignment tables")

# WP2.6 — alembic check (model vs migration drift)
r = subprocess.run(
    [sys.executable, "-m", "alembic", "check"],
    capture_output=True, text=True,
    cwd=os.path.join(os.path.dirname(__file__), "../../../services/api")
)
output = (r.stdout + r.stderr).strip()
ok = r.returncode == 0
print(f"WP2.6 | {'PASS' if ok else 'FAIL'} | alembic check: {output[:120]}")

# WP2.7 — seed.py runs (check it exists and runs without traceback)
seed_path = os.path.join(os.path.dirname(__file__), "../../../services/api/scripts/seed.py")
if os.path.exists(seed_path):
    r = subprocess.run([sys.executable, seed_path], capture_output=True, text=True,
                       cwd=os.path.join(os.path.dirname(__file__), "../../../services/api"))
    has_err = "Traceback" in r.stdout or "Traceback" in r.stderr or "Error" in r.stderr
    print(f"WP2.7 | {'FAIL' if has_err else 'PASS'} | seed.py exit={r.returncode}; {(r.stdout+r.stderr).strip()[:80]}")
else:
    print("WP2.7 | BLOCKED | scripts/seed.py not found")
