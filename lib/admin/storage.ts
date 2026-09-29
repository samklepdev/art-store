import "server-only";
import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const ALLOWED_IMAGE_TYPES = Object.keys(EXTENSIONS) as readonly string[];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
}

/**
 * Issues a short-lived PUT URL so the browser uploads straight to the bucket.
 * Art scans are large; routing them through a Server Action (1 MB body limit)
 * or a route handler would mean holding whole files in app memory.
 *
 * Returns null for a content type we do not accept.
 */
export async function presignUpload(
  productId: number,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string } | null> {
  const extension = EXTENSIONS[contentType];
  if (!extension) return null;

  const key = `art/${productId}/${randomUUID()}.${extension}`;
  const uploadUrl = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: requireEnv("S3_BUCKET"), Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );

  const base = requireEnv("S3_PUBLIC_BASE_URL").replace(/\/$/, "");
  return { uploadUrl, publicUrl: `${base}/${key}` };
}
