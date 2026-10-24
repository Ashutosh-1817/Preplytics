import { z } from 'zod';

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(60, 'Name cannot exceed 60 characters'),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address'),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .refine((val) => val.trim().length >= 8, {
      message: 'Password cannot be empty or whitespace-only',
    }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const emailField = z.string().trim().toLowerCase().email('Invalid email address');
const codeField = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const emailOnlySchema = z.object({ email: emailField });

export const verifyEmailSchema = z.object({ email: emailField, code: codeField });

export const resetPasswordSchema = z.object({
  email: emailField,
  code: codeField,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .refine((val) => val.trim().length >= 8, { message: 'Password cannot be empty or whitespace-only' }),
});

export const googleSchema = z.object({ credential: z.string().min(20, 'Missing Google credential').max(4096) });