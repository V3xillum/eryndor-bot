import type Database from 'better-sqlite3';
import {
  cancelScheduledPost,
  insertScheduledPost,
  listDueScheduledPosts,
  listPendingScheduledPosts,
  markScheduledPostPosted,
} from '../db/index.js';
import type { Messages, ScheduledPost } from '../types.js';

export class AnnounceService {
  constructor(
    private readonly db: Database.Database,
    readonly messages: Messages,
  ) {}

  schedule(input: {
    guildId: string;
    channelId: string;
    body: string;
    postAt: Date;
    createdBy: string;
  }): ScheduledPost {
    return insertScheduledPost(this.db, {
      guildId: input.guildId,
      channelId: input.channelId,
      body: input.body,
      postAt: input.postAt.toISOString(),
      createdBy: input.createdBy,
    });
  }

  listPending(guildId: string): ScheduledPost[] {
    return listPendingScheduledPosts(this.db, guildId);
  }

  duePosts(now = new Date()): ScheduledPost[] {
    return listDueScheduledPosts(this.db, now.toISOString());
  }

  markPosted(id: number, when = new Date()): void {
    markScheduledPostPosted(this.db, id, when.toISOString());
  }

  cancel(guildId: string, id: number): boolean {
    return cancelScheduledPost(this.db, guildId, id);
  }
}
