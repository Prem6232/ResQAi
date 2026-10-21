"""WP5.1 - Extract all routes from OpenAPI and save to routes.txt"""
import json, sys

with open("docs/verification/routes_openapi.json", encoding="utf-8") as f:
    spec = json.load(f)

routes = []
for path, methods in spec.get("paths", {}).items():
    for method in methods:
        if method.upper() in ("GET","POST","PUT","PATCH","DELETE","OPTIONS"):
            routes.append(f"{method.upper():7} {path}")

routes.sort(key=lambda x: x.split()[1])
with open("docs/verification/routes.txt", "w") as f:
    f.write("\n".join(routes))

print(f"WP5.1 | PASS | {len(routes)} routes saved to docs/verification/routes.txt")
# Print first 20
for r in routes[:20]:
    print(" ", r)
print(f"  ... and {len(routes)-20} more" if len(routes) > 20 else "")
