import type { ImageProvider } from './provider';

interface CloudflareRunResponse {
  success: boolean;
  result?: { image?: string };
  errors?: { message: string }[];
}

/**
 * Image generation through Cloudflare Workers AI's REST API
 * (https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/).
 * FLUX.1 schnell costs about 58 neurons per 1024px image; the free plan gives 10,000 a day.
 */
export class CloudflareImageProvider implements ImageProvider {
  readonly name: string;

  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    private readonly model: string,
  ) {
    this.name = `cloudflare:${model}`;
  }

  async generateImage(prompt: string): Promise<Buffer> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 4 }),
    });
    const body = (await response.json().catch(() => null)) as CloudflareRunResponse | null;
    const image = body?.result?.image;
    if (!response.ok || !image) {
      const reason =
        body?.errors?.map((e) => e.message).join('; ') ||
        (body ? `HTTP ${response.status}, no image in the response` : `HTTP ${response.status}, unreadable response body`);
      throw new Error(`Cloudflare image generation failed: ${reason}`);
    }
    return Buffer.from(image, 'base64');
  }
}
