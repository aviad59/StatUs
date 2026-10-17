import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Conversation, ConversationSummary, Message } from '@status/shared';
import { and, asc, desc, eq } from 'drizzle-orm';
import { toUser } from '../accounts/to-user';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { conversations, messages } from '../db/schema';

type Me = { id: string; worldId: string };

const toMessage = (message: typeof messages.$inferSelect, me: Me): Message => ({
  id: message.id,
  fromMe: message.senderId === me.id,
  text: message.text,
  createdAt: message.createdAt.toISOString(),
});

@Injectable()
export class ConversationsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // Most recent activity first.
  async list(me: Me): Promise<ConversationSummary[]> {
    const rows = await this.db.query.conversations.findMany({
      where: eq(conversations.worldId, me.worldId),
      with: {
        agent: true,
        messages: { orderBy: desc(messages.createdAt), limit: 1 },
      },
    });

    const lastActivity = (row: (typeof rows)[number]) =>
      (row.messages[0]?.createdAt ?? row.createdAt).getTime();

    return rows
      .sort((a, b) => lastActivity(b) - lastActivity(a))
      .map((row) => ({
        id: row.id,
        user: toUser(row.agent),
        lastMessage: row.messages[0] ? toMessage(row.messages[0], me) : null,
      }));
  }

  async get(me: Me, id: string): Promise<Conversation> {
    const row = await this.db.query.conversations.findFirst({
      where: and(eq(conversations.id, id), eq(conversations.worldId, me.worldId)),
      with: {
        agent: true,
        messages: { orderBy: asc(messages.createdAt) },
      },
    });
    if (!row) throw new NotFoundException();

    return {
      id: row.id,
      user: toUser(row.agent),
      messages: row.messages.map((message) => toMessage(message, me)),
    };
  }

  /** The user sends a DM. The agent replies on a later tick (if it chooses to). */
  async send(me: Me, id: string, text: string): Promise<Message> {
    const conversation = await this.db.query.conversations.findFirst({
      where: and(eq(conversations.id, id), eq(conversations.worldId, me.worldId)),
    });
    if (!conversation) throw new NotFoundException();

    const [row] = await this.db
      .insert(messages)
      .values({ conversationId: id, senderId: me.id, text })
      .returning();
    return toMessage(row, me);
  }
}
