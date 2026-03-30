import { Link } from 'react-router-dom';
import { EmojiAsset, normalizeEmojiToHexCode } from './EmojiAsset';

interface MentionTextProps {
  text: string;
  className?: string;
}

const emojiRegex = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?/gu;

const renderWithEmojis = (str: string, keyPrefix: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(emojiRegex.source, 'gu');
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) parts.push(str.slice(last, m.index));
    const hex = normalizeEmojiToHexCode(m[0]);
    if (hex) {
      parts.push(<EmojiAsset key={`${keyPrefix}-e-${m.index}`} emoji={hex} alt={m[0]} size={18} className="inline-block align-[-3px]" />);
    } else {
      parts.push(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < str.length) parts.push(str.slice(last));
  return parts;
};

export const MentionText = ({ text, className = '' }: MentionTextProps) => {
  const renderTextWithMentions = (content: string) => {
    const mentionRegex = /@(\w+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(...renderWithEmojis(content.substring(lastIndex, match.index), `t-${lastIndex}`));
      }
      const username = match[1];
      parts.push(
        <Link
          key={`mention-${match.index}`}
          to={`/profile/${username}`}
          className="text-primary hover:underline font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          @{username}
        </Link>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push(...renderWithEmojis(content.substring(lastIndex), `t-${lastIndex}`));
    }

    return parts.length > 0 ? parts : renderWithEmojis(content, 'full');
  };

  return (
    <span className={className}>
      {renderTextWithMentions(text)}
    </span>
  );
};
