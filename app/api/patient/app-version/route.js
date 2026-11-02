import { patientRoute } from '../../../../lib/patientApi';
import appVersions from '../../../../services/patient/appVersions';

// Public, so the app can check before sign-in: GET /api/patient/app-version?platform=ANDROID&version=1.3.0
export const GET = patientRoute(async ({ query }) => appVersions.check(query), { signedIn: false });
