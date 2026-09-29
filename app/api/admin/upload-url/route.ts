import { isAdmin } from "@/lib/admin/auth";
import { MAX_UPLOAD_BYTES, presignUpload } from "@/lib/admin/storage";

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { productId?: unknown; contentType?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const productId = Number(body.productId);
  if (!Number.isInteger(productId)) {
    return Response.json({ error: "Unknown product." }, { status: 400 });
  }

  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `Images must be under ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` },
      { status: 400 },
    );
  }

  const presigned = await presignUpload(productId, String(body.contentType ?? ""));
  if (!presigned) {
    return Response.json({ error: "Use a JPEG, PNG, WebP or AVIF image." }, { status: 400 });
  }

  return Response.json(presigned);
}
