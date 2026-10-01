import { adapt } from '../../../lib/adaptExpress';
import searchController from '../../../controllers/searchController';

export const GET = adapt(searchController.search, { scope: 'receptionist' });
