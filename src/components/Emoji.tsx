import React from 'react';

interface EmojiProps {
  /** Image URL for the emoji */
  url: string;
  /** Alt text (emoji name) */
  alt: string;
  /** Display size in pixels (default: 24) */
  size?: number;
  /** Additional CSS classes */
  className?: string;
}

export const Emoji: React.FC<EmojiProps> = ({
  url,
  alt,
  size = 24,
  className = ''
}) => {
  return (
    <img
      src={url}
      alt={alt}
      title={alt}
      width={size}
      height={size}
      className={`inline-block ${className}`}
      style={{
        verticalAlign: 'middle'
      }}
     loading="lazy" decoding="async" />
  );
};