import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 90 is used in the lightbox so brushwork and paper texture hold up.
    qualities: [75, 90],
    remotePatterns: [
      // Placeholder images from the seed data. Replace with your own host
      // (S3, R2, Cloudinary, etc.) or serve files from /public/art.
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },
};

export default nextConfig;
