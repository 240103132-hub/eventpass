// The only place where the frontend chooses its data source.
// Real backend by default. For the offline demo run: VITE_USE_MOCK=true npm run dev
import { mockApi } from './mockApi';
import { httpApi } from './httpApi';

export const api = import.meta.env.VITE_USE_MOCK === 'true' ? mockApi : httpApi;
