import { PostLinkPreview } from './previews/PostLinkPreview';
import { ProfileLinkPreview } from './previews/ProfileLinkPreview';
import { GroupLinkPreview } from './previews/GroupLinkPreview';
import { PageLinkPreview } from './previews/PageLinkPreview';

interface DetectedLink {
  type: 'post' | 'profile' | 'group' | 'page';
  id: string;
}

interface MessageLinkPreviewProps {
  content: string;
}

function detectLinks(text: string): DetectedLink[] {
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const links: DetectedLink[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0];
    let path: string;
    try {
      path = new URL(url).pathname;
    } catch {
      path = url;
    }

    const postMatch = path.match(/^\/post\/([^/]+)/);
    if (postMatch && !seen.has(`post-${postMatch[1]}`)) {
      seen.add(`post-${postMatch[1]}`);
      links.push({ type: 'post', id: postMatch[1] });
      continue;
    }

    const profileMatch = path.match(/^\/profile\/([^/]+)/);
    if (profileMatch && !seen.has(`profile-${profileMatch[1]}`)) {
      seen.add(`profile-${profileMatch[1]}`);
      links.push({ type: 'profile', id: profileMatch[1] });
      continue;
    }

    const groupMatch = path.match(/^\/groups?\/([^/]+)/);
    if (groupMatch && !seen.has(`group-${groupMatch[1]}`)) {
      seen.add(`group-${groupMatch[1]}`);
      links.push({ type: 'group', id: groupMatch[1] });
      continue;
    }

    const pageMatch = path.match(/^\/pages?\/([^/]+)/);
    if (pageMatch && !seen.has(`page-${pageMatch[1]}`)) {
      seen.add(`page-${pageMatch[1]}`);
      links.push({ type: 'page', id: pageMatch[1] });
    }
  }

  return links;
}

export const MessageLinkPreview = ({ content }: MessageLinkPreviewProps) => {
  const links = detectLinks(content);

  if (links.length === 0) return null;

  return (
    <>
      {links.map((link) => {
        switch (link.type) {
          case 'post':
            return <PostLinkPreview key={`post-${link.id}`} postId={link.id} />;
          case 'profile':
            return <ProfileLinkPreview key={`profile-${link.id}`} username={link.id} />;
          case 'group':
            return <GroupLinkPreview key={`group-${link.id}`} groupId={link.id} />;
          case 'page':
            return <PageLinkPreview key={`page-${link.id}`} pageId={link.id} />;
        }
      })}
    </>
  );
};
