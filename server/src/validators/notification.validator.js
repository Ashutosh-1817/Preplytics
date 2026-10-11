
import { z } from 'zod';

export const updatePreferencesSchema = z.object({
  emailNotificationsEnabled: z.boolean(),
});