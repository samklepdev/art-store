import type { NextConfig } from "next";

const bucketHost = process.env.S3_PUBLIC_BASE_URL
  ? new URL(process.env.S3_PUBLIC_BASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  images: {
    // 90 is used in the lightbox so brushwork and paper texture hold up.
    qualities: [75, 90],
    remotePatterns: [
      // Placeholder images from the seed data. Replace with your own host
      // (S3, R2, Cloudinary, etc.) or serve files from /public/art.
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      ...(bucketHost ? [{ protocol: "https" as const, hostname: bucketHost }] : []),
    ],
  },
};

export default nextConfig;
