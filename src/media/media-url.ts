import { env } from "../config/env";

export function publicMediaUrlForMediaId(mediaId: string): string {
  return `${env.PUBLIC_MEDIA_URL}/public/${encodeURIComponent(mediaId)}`;
}
