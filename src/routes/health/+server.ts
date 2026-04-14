import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({
    status: 'ok',
    telemetry: {
      enabled: !!process.env.OTEL_ENDPOINT,
    },
  });
};
