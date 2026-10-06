"""Compares the route handlers under app/api with openapispec.yaml.
Run: python scripts/check-api-coverage.py   (exit 1 if they differ)"""
import os, re, sys, yaml

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
spec_file = os.path.join(ROOT, "openapispec.yaml")
d = yaml.safe_load(open(spec_file, encoding="utf-8"))
spec = {(m.upper(), p) for p, v in d["paths"].items() for m in v if m in ("get", "post", "put", "patch", "delete")}

code = set()
api = os.path.join(ROOT, "app", "api")
for dp, _, files in os.walk(api):
    if "route.js" not in files:
        continue
    rel = os.path.relpath(dp, api).replace("\\", "/")
    path = "/api" if rel == "." else "/api/" + rel.replace("[", "{").replace("]", "}")
    src = open(os.path.join(dp, "route.js"), encoding="utf-8").read()
    for m in re.findall(r"export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b", src):
        code.add((m, path))

print(f"handlers in code: {len(code)}   operations in spec: {len(spec)}")
extra, missing = sorted(code - spec), sorted(spec - code)
print("implemented but not in the spec:", extra or "none")
print("in the spec but not implemented:", missing or "none")
sys.exit(1 if extra or missing else 0)
