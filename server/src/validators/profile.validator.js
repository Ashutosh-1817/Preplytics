import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(60, 'Name cannot exceed 60 characters').optional(),
    targetExam: z.string().trim().max(80, 'Target exam cannot exceed 80 characters').optional(),
    emailNotificationsEnabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const avatarUrlSchema = z.object({ url: z.string().trim().url().max(500) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .refine((v) => v.trim().length >= 8, { message: 'Password cannot be empty or whitespace-only' }),
});

export const deleteAccountSchema = z.object({
  confirm: z.literal('DELETE', { message: 'Type DELETE to confirm' }),
  password: z.string().max(200).optional(),
});