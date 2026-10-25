import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Conversation, ConversationSummary, Message, TickErrorCode } from '@status/shared';
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { toUser } from '../accounts/to-user';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { type accounts, conversations, messages, worlds } from '../db/schema';
import { AgentService } from '../world/agent.service';
import { currentEnergy, energyConfig, type EnergyConfig, spendOne } from '../world/energy';

type Me = { id: string; worldId: string };

type MessageRow = typeof messages.$inferSelect;

/** The agent wrote last, and the user hasn't opened the conversation since. */
const isUnread = (last: MessageRow | undefined, readAt: Date | null, me: Me) =>
  Boolean(last && last.senderId !== me.id && (!readAt || last.createdAt > readAt));

const toMessage = (message: MessageRow, me: Me): Message => ({
  id: message.id,
  fromMe: message.senderId === me.id,
  text: message.text,
  createdAt: message.createdAt.toISOString(),
});

@Injectable()
export class ConversationsService {
  private readonly energy: EnergyConfig;
  /** Conversations an agent is answering right now, so one DM never gets two replies. */
  private readonly replying = new Set<string>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly agents: AgentService,
    config: ConfigService,
  ) {
    this.energy = energyConfig(config);
  }

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
        unread: isUnread(row.messages[0], row.playerReadAt, me),
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
      unread: isUnread(row.messages.at(-1), row.playerReadAt, me),
    };
  }

  async markRead(me: Me, id: string) {
    const [row] = await this.db
      .update(conversations)
      .set({ playerReadAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.worldId, me.worldId)))
      .returning({ id: conversations.id });
    if (!row) throw new NotFoundException();
  }

  /**
   * The user sends a DM. One energy point buys DM_MESSAGES_PER_ENERGY messages; 409
   * NO_ENERGY when none are left and there's no energy to buy more. The agent's
   * answer comes from reply().
   */
  async send(me: Me, id: string, text: string): Promise<Message> {
    const conversation = await this.db.query.conversations.findFirst({
      where: and(eq(conversations.id, id), eq(conversations.worldId, me.worldId)),
    });
    if (!conversation) throw new NotFoundException();

    await this.payForMessage(me.worldId);
    const [row] = await this.db
      .insert(messages)
      .values({ conversationId: id, senderId: me.id, text })
      .returning();
    return toMessage(row, me);
  }

  /** The agent answers the user's last DM now. Null when there's nothing to answer. */
  async reply(me: typeof accounts.$inferSelect, id: string): Promise<Message | null> {
    if (this.replying.has(id)) return null;
    this.replying.add(id);
    try {
      const row = await this.agents.replyInDm(me, id);
      return row && toMessage(row, me);
    } finally {
      this.replying.delete(id);
    }
  }

  private async payForMessage(worldId: string): Promise<void> {
    // A message already paid for?
    const [prepaid] = await this.db
      .update(worlds)
      .set({ dmCredits: sql`${worlds.dmCredits} - 1` })
      .where(and(eq(worlds.id, worldId), gt(worlds.dmCredits, 0)))
      .returning({ id: worlds.id });
    if (prepaid) return;

    // Otherwise spend one energy point on a new batch; this message is its first.
    const world = await this.db.query.worlds.findFirst({ where: eq(worlds.id, worldId) });
    if (!world) throw new NotFoundException();
    if (currentEnergy(world, this.energy).current < 1) {
      const code: TickErrorCode = 'NO_ENERGY';
      throw new ConflictException({ code, message: 'Out of energy. Wait for it to regenerate.' });
    }
    // Only if the stored energy hasn't changed since we read it (a tick or another
    // message may have spent it); otherwise try again from the top.
    const [bought] = await this.db
      .update(worlds)
      .set({ ...spendOne(world, this.energy), dmCredits: this.energy.dmMessages - 1 })
      .where(
        and(
          eq(worlds.id, worldId),
          eq(worlds.energy, world.energy),
          eq(worlds.energyUpdatedAt, world.energyUpdatedAt),
        ),
      )
      .returning({ id: worlds.id });
    if (!bought) return this.payForMessage(worldId);
  }
}
