// The only place where the frontend chooses its data source.
// Phase 1: mock service. Phase 5: replace the line below with `import { httpApi } from './httpApi'`.
import { mockApi } from './mockApi';

export const api = mockApi;
