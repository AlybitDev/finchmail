import { z } from "zod";

const hostSchema = z.string().trim().min(1).max(253).refine((value) => !/[\s/@?#]/.test(value), "Enter a valid server host");
const portSchema = z.coerce.number().int().min(1).max(65535);

export const setupSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  setupToken: z.string().min(32).max(256),
});

export function passwordHashOptions() {
  const configured = Number(process.env.ARGON2_MEMORY_COST ?? 19456);
  const memoryCost = Number.isInteger(configured) ? Math.min(Math.max(configured, 19456), 1048576) : 19456;
  return { type: 2 as const, memoryCost, timeCost: 2, parallelism: 1 };
}

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const accountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  imapHost: hostSchema.transform((value) => value.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase()),
  imapPort: portSchema.default(993),
  imapSecure: z.boolean().default(true),
  imapUsername: z.string().trim().min(1).max(254),
  imapPassword: z.string().min(1).max(512),
  smtpHost: hostSchema.transform((value) => value.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase()),
  smtpPort: portSchema.default(465),
  smtpSecure: z.boolean().default(true),
  smtpUsername: z.string().trim().min(1).max(254),
  smtpPassword: z.string().min(1).max(512),
});
