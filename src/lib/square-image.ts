/**
 * Center-crops an image to a square and scales it down, in the browser, so an
 * avatar upload is small no matter what the user picked. WebP where the
 * browser can encode it, otherwise JPEG.
 */
export async function squareImageBlob(file: Blob, maxSide = 512): Promise<Blob> {
  const failure = new Error("Couldn't read that image. Try a different one.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw failure;
  });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(maxSide, side);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw failure;
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    for (const type of ["image/webp", "image/jpeg"]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
      if (blob?.type === type) return blob;
    }
    throw failure;
  } finally {
    bitmap.close();
  }
}
