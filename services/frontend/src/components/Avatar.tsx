interface AvatarProps {
  src: string
  alt: string
  /** Pixels, or 'fill' to take the parent's width. */
  size?: number | 'fill'
  ring?: boolean
}

export function Avatar({ src, alt, size = 32, ring = false }: AvatarProps) {
  const img = (
    <img
      src={src}
      alt={alt}
      className={`aspect-square rounded-full bg-neutral-200 object-cover dark:bg-neutral-800 ${
        size === 'fill' ? 'w-full' : ''
      }`}
      style={size === 'fill' ? undefined : { width: size, height: size }}
    />
  )

  if (!ring) return img

  return (
    <span className="block rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
      <span className="block rounded-full bg-white p-[2px] dark:bg-neutral-950">{img}</span>
    </span>
  )
}
