"""Writes the route files under app/api/patient (one-off generator, kept for reference)."""
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "api", "patient")

# path (relative to app/api/patient) -> {METHOD: (needs, handler source)}
ROUTES = {
    "auth/otp": {"POST": ("auth", "async ({ body }) => auth.requestOtp(body.phone)", False)},
    "auth/verify": {"POST": ("auth account", "async ({ body }) => {\n  const { token, user } = await auth.verifyOtp(body.phone, body.code);\n  return { token, user: await account.userJson(user) };\n}", False)},
    "auth/logout": {"POST": ("auth", "async ({ me }) => auth.logout(me)", True)},
    "me": {
        "GET": ("account", "async ({ me }) => account.userJson(me.user)", True),
        "PUT": ("account", "async ({ me, body }) => account.updateProfile(me.user, body)", True),
        "DELETE": ("booking", "async ({ me }) => booking.deleteAccount(me)", True),
    },
    "dependents": {
        "GET": ("account", "async ({ me }) => ({ items: await account.dependents(me.user) })", True),
        "POST": ("account", "async ({ me, body }) => [201, await account.addDependent(me.user, body)]", True),
    },
    "dependents/[id]": {
        "PUT": ("account", "async ({ me, params, body }) => account.updateDependent(me.user, params.id, body)", True),
        "DELETE": ("account", "async ({ me, params }) => account.removeDependent(me.user, params.id)", True),
    },
    "qr/resolve": {"POST": ("catalog", "async ({ me, body }) => catalog.resolveQr(me, body.raw)", True)},
    "hospitals": {"GET": ("catalog", "async ({ me }) => ({ items: await catalog.linkedHospitals(me) })", True)},
    "hospitals/[id]": {"GET": ("catalog", "async ({ me, params }) => catalog.hospital(me, params.id)", True)},
    "hospitals/[id]/link": {
        "POST": ("catalog", "async ({ me, params, body }) => catalog.linkHospital(me, params.id, body.qrKeyId)", True),
        "DELETE": ("catalog", "async ({ me, params }) => catalog.unlinkHospital(me, params.id)", True),
    },
    "hospitals/[id]/relink": {"POST": ("catalog", "async ({ me, params }) => catalog.relinkHospital(me, params.id)", True)},
    "hospitals/[id]/departments": {"GET": ("catalog", "async ({ me, params }) => ({ items: await catalog.departments(me, params.id) })", True)},
    "hospitals/[id]/doctors": {"GET": ("catalog", "async ({ me, params }) => ({ items: await catalog.doctors(me, params.id) })", True)},
    "doctors/[id]": {"GET": ("catalog", "async ({ me, params }) => catalog.doctor(me, params.id)", True)},
    "doctors/[id]/slots": {"GET": ("catalog", "async ({ me, params, query }) => ({ items: await catalog.slots(me, params.id, query.date) })", True)},
    "doctors/[id]/next-available": {"GET": ("catalog", "async ({ me, params, query }) => catalog.nextAvailableDay(me, params.id, query.after)", True)},
    "doctors/[id]/quote": {"GET": ("catalog", "async ({ me, params }) => catalog.quote(me, params.id)", True)},
    "holds": {"POST": ("booking", "async ({ me, body }) => [201, await booking.holdSlot(me, body.slotId, body.patientId)]", True)},
    "holds/[id]": {"DELETE": ("booking", "async ({ me, params }) => booking.releaseHold(me, params.id)", True)},
    "holds/[id]/pay": {"POST": ("booking", "async ({ me, params, body, req }) => [201, await booking.pay(me, params.id, { ...body, simulate: req.headers.get('x-simulate-payment') })]", True)},
    "appointments": {"GET": ("booking", "async ({ me }) => ({ items: await booking.appointments(me) })", True)},
    "appointments/[id]": {"GET": ("booking", "async ({ me, params }) => booking.appointment(me, params.id)", True)},
    "appointments/[id]/cancel-quote": {"GET": ("booking", "async ({ me, params }) => booking.cancelQuote(me, params.id)", True)},
    "appointments/[id]/cancel": {"POST": ("booking", "async ({ me, params, body }) => booking.cancel(me, params.id, body.reason)", True)},
    "appointments/[id]/reschedule-check": {"GET": ("booking", "async ({ me, params }) => booking.rescheduleCheck(me, params.id)", True)},
    "appointments/[id]/reschedule": {"POST": ("booking", "async ({ me, params, body }) => booking.reschedule(me, params.id, body.slotId)", True)},
    "notifications": {"GET": ("notifications", "async ({ me }) => notifications.list(me.user)", True)},
    "notifications/read": {"POST": ("notifications", "async ({ me }) => notifications.markRead(me.user)", True)},
}

for path, methods in ROUTES.items():
    depth = len(path.split("/")) + 3  # app/api/patient/<path>/route.js -> project root
    up = "../" * depth
    needs = sorted({n for needs, _, _ in methods.values() for n in needs.split()})
    lines = [f"import {{ patientRoute }} from '{up}lib/patientApi';"]
    for n in needs:
        lines.append(f"import {n} from '{up}services/patient/{n}';")
    lines.append("")
    for method, (_, handler, signed_in) in methods.items():
        opts = "" if signed_in else ", { signedIn: false }"
        lines.append(f"export const {method} = patientRoute({handler}{opts});")
    folder = os.path.join(ROOT, *path.split("/"))
    os.makedirs(folder, exist_ok=True)
    open(os.path.join(folder, "route.js"), "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print(len(ROUTES), "route files written")
