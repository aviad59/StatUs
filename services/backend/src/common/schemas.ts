import { z } from 'zod';

/** Body of CreateCommentBody / SendMessageBody (see @status/shared). */
export const textBody = z.object({ text: z.string().trim().min(1).max(1000) });
