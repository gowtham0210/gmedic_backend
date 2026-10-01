import { adapt } from '../../../../lib/adaptExpress';
import hospitalController from '../../../../controllers/hospitalController';

export const GET = adapt(hospitalController.qrPng, { scope: 'receptionist' });
