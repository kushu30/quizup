interface QuestionImageProps {
  imageUrl?: string | null | undefined;
  imageAlt?: string | null | undefined;
  className?: string;
}

export function QuestionImage({ imageUrl, imageAlt, className = '' }: QuestionImageProps) {
  if (!imageUrl) {
    return null;
  }
  return (
    <img
      src={imageUrl}
      alt={imageAlt ?? ''}
      loading="lazy"
      className={`max-h-72 w-auto max-w-full rounded-lg border border-rule bg-surface object-contain ${className}`.trim()}
    />
  );
}
