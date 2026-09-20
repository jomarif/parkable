import { z } from 'zod';

export const envSchema = z.object({
    PORT: z.coerce.number().positive().default(3000),
    DATABASE_URL: z.coerce.string()
})

export type Env = z.infer<typeof envSchema>;