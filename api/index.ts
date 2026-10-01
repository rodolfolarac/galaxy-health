/**
 * Entrypoint serverless da Vercel. Reaproveita exatamente o mesmo app
 * Express usado localmente, então não existe código duplicado.
 */
import { createApp } from '../server/app.js';

export default createApp();
