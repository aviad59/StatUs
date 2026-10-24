// Phone photos are often 3–10 MB. Shrinking them before upload makes posting fast on
// mobile data and keeps the vision model's input (and cost) small.

const MAX_SIDE = 1080 // Instagram's width
const QUALITY = 0.85

/** Resizes an image file so its longer side is at most 1080 px, as a JPEG. */
export async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))),
      'image/jpeg',
      QUALITY,
    ),
  )
}
