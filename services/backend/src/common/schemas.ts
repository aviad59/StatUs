import { z } from 'zod';

/** Body of CreateCommentBody / SendMessageBody (see @status/shared). */
export const textBody = z.object({ text: z.string().trim().min(1).max(1000) });

/** Body of UpdateMeBody. */
export const updateMeBody = z.object({ gender: z.enum(['female', 'male']) });

/** Text fields of CreatePostBody (the image comes as a multipart file). */
export const createPostBody = z.object({ caption: z.string().trim().max(2200).default('') });

/** Body of LikeBody. */
export const likeBody = z.object({ liked: z.boolean() });
