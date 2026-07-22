import { gateway } from '@/lib/gateway';

export { gateway };

export const API_URL = import.meta.env.VITE_API_GATEWAY_URL;

export type ApiResult<T> = { data: T | null; error: { message: string; code?: string } | null };
