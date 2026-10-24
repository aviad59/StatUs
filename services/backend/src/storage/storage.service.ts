import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// One public bucket for all media. Files sit under unguessable paths
// (<worldId>/<kind>/<uuid>), and only the backend can write (it holds the secret key).
const BUCKET = 'media';
const MAX_BYTES = 10 * 1024 * 1024;

/** Uploads images to Supabase Storage and returns their public URLs. */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient | null;

  constructor(config: ConfigService) {
    const url = config.get<string>('SUPABASE_URL');
    const key = config.get<string>('SUPABASE_SECRET_KEY');
    this.client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }

  /** Creates the bucket on first run. */
  async onModuleInit() {
    if (!this.client) {
      this.logger.warn('SUPABASE_URL / SUPABASE_SECRET_KEY not set: uploads are disabled');
      return;
    }
    const { error } = await this.client.storage.getBucket(BUCKET);
    if (!error) return;
    const created = await this.client.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });
    if (created.error) this.logger.error(`Could not create bucket "${BUCKET}": ${created.error.message}`);
    else this.logger.log(`Created storage bucket "${BUCKET}"`);
  }

  async upload(path: string, bytes: Buffer, contentType: string): Promise<string> {
    if (!this.client) throw new Error('Storage is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY)');
    const bucket = this.client.storage.from(BUCKET);
    const { error } = await bucket.upload(path, bytes, { contentType, upsert: false });
    if (error) throw new Error(`Upload to ${path} failed: ${error.message}`);
    return bucket.getPublicUrl(path).data.publicUrl;
  }
}
