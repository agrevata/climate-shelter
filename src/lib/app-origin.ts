import 'server-only';
import { resolveAppOrigin } from '../../shared/app-origin';
export const appOrigin = () => resolveAppOrigin(process.env);
