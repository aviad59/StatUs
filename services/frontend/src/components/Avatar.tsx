interface AvatarProps {
  src: string
  alt: string
  size?: number
  ring?: boolean
}

export function Avatar({ src, alt, size = 32, ring = false }: AvatarProps) {
  const img = (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className="rounded-full bg-neutral-200 object-cover dark:bg-neutral-800"
      style={{ width: size, height: size }}
    />
  )

  if (!ring) return img

  return (
    <span className="inline-block rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
      <span className="block rounded-full bg-white p-[2px] dark:bg-neutral-950">{img}</span>
    </span>
  )
}
