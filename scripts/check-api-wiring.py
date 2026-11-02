"""Shows which portal page / component calls each spec operation, and lists operations nothing calls.
Run: python scripts/check-api-wiring.py [--map]"""
import os, re, sys, yaml

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
d = yaml.safe_load(open(os.path.join(ROOT, "openapispec.yaml"), encoding="utf-8"))
ops = [(m.upper(), p, o["tags"][0]) for p, v in d["paths"].items() for m, o in v.items() if m in ("get", "post", "put", "patch", "delete")]

CALL = re.compile(r"""(?:api|fetch|call|apiFetch|EventSource)\(\s*([`'"])(/api/[^`'"?]*?)(?:\?[^`'"]*)?\1""")
CALL_TPL = re.compile(r"""(?:api|fetch|call|apiFetch|EventSource)\(\s*`(/api/[^`]*)`""")
METHOD = re.compile(r"""method:\s*['"](\w+)['"]""")
LINK = re.compile(r"""(?:href|src)=\{?[`'"](/api/[^`'"?]*)""")
TPL = re.compile(r"\$\{[^}]*\}")


def call_args(text, pos):
    """Text of the remaining arguments of the call whose first argument ends at `pos`."""
    depth, i = 1, pos
    while i < len(text) and depth:
        depth += {"(": 1, ")": -1}.get(text[i], 0)
        i += 1
    return text[pos:i]


where = {}  # (METHOD, normalised path) -> files that call it
for top in ("app", "components", "public/js", "lib"):
    for dp, _, files in os.walk(os.path.join(ROOT, top)):
        rel = os.path.relpath(dp, ROOT).replace(os.sep, "/")
        if rel.startswith("app/api"):
            continue
        for f in files:
            if not f.endswith((".js", ".jsx")):
                continue
            text = open(os.path.join(dp, f), encoding="utf-8", errors="ignore").read()
            name = rel + "/" + f
            for rx in (CALL_TPL, CALL):
                for m in rx.finditer(text):
                    raw = m.group(1) if rx is CALL_TPL else m.group(2)
                    url = TPL.sub("{x}", raw.split("?")[0])
                    mm = METHOD.search(call_args(text, m.end()))
                    where.setdefault(((mm.group(1).upper() if mm else "GET"), url), set()).add(name)
            for m in LINK.finditer(text):  # plain links / images, e.g. a stored document or the QR image
                where.setdefault(("GET", TPL.sub("{x}", m.group(1))), set()).add(name)

# SupportCenter is shared by the Receptionist ( /api/support ) and Doctor ( /api/doctor/support ) portals
SC = "components/shared/SupportCenter.js"
SHARED = {}
for base in ("/api/support", "/api/doctor/support"):
    SHARED[("GET", base)] = SHARED[("POST", base)] = SHARED[("GET", base + "/{id}")] = SHARED[("POST", base + "/{id}/messages")] = SC
# queue actions are built from one template: /api/doctor/queue/${id}/${action}
Q = "app/doctor/queue/page.js"
for a in ("start", "complete", "skip", "recall"):
    SHARED[("POST", f"/api/doctor/queue/{{id}}/{a}")] = Q
SHARED[("GET", "/api/doctor/queue")] = SHARED[("POST", "/api/doctor/queue/call-next")] = Q

# Served by the portal's own server-rendered pages (they read the same data directly), or called by another system
SERVER_RENDERED = {
    ("POST", "/api/internal/events"): "called by another backend with INTERNAL_EVENT_KEY (the patient app uses /api/patient instead), not by a portal",
}


def callers(method, path):
    rx = re.compile("^" + re.sub(r"\\\{[^}]+\\\}", "[^/]+", re.escape(path)) + "$")
    files = {f for (m, u), fs in where.items() if m == method and rx.match(u.replace("{x}", "x")) for f in fs}
    if (method, path) in SHARED:
        files.add(SHARED[(method, path)])
    return sorted(files)


# The Patient tag is the API of the patient mobile app, which lives in its own project.
patient_ops = [(m, p) for m, p, t in ops if t == "Patient"]
unused = [(t, m, p) for m, p, t in ops if t != "Patient" and not callers(m, p) and (m, p) not in SERVER_RENDERED]
wired = sum(1 for m, p, t in ops if t != "Patient" and callers(m, p))
print(f"{len(ops)} operations: {wired} called by a portal page, {len(SERVER_RENDERED)} server-rendered / external, {len(patient_ops)} for the patient mobile app, {len(unused)} unwired")
for t, m, p in sorted(unused):
    print(f"  UNWIRED {m:6} {p}  [{t}]")
print("\nNot called from the browser, by design:")
for (m, p_), why in SERVER_RENDERED.items():
    print(f"  {m:6} {p_}  -> {why}")

if "--map" in sys.argv:
    print("\nOperation -> page / component that calls it")
    for m, p, t in ops:
        print(f"{t:22} {m:6} {p:55} {', '.join(callers(m, p)) or '(server-rendered / external)'}")
sys.exit(0)
