// Group-share message rendering in MessageBubble
// Verifies that group-share messages render as clickable cards with
// group name, image, description, group ID, and clickable link.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MessageBubble } from '@/components/messages/MessageBubble';
import { encodeGroupShareContent } from '@/lib/groupShare';

const GROUP_ID = 'group-123';
const GROUP_NAME = 'Test Social Group';
const GROUP_DESCRIPTION = 'A group for testing';
const GROUP_IMAGE = 'https://picsum.photos/200/200';

const makeGroupShareMessage = (
  groupId: string = GROUP_ID,
  groupName: string = GROUP_NAME,
  groupImage: string | null = GROUP_IMAGE,
  groupDescription: string | null = GROUP_DESCRIPTION,
) => ({
  id: 'msg-1',
  conversation_id: 'conv-1',
  sender_id: 'sender-1',
  content: encodeGroupShareContent({
    group_id: groupId,
    group_name: groupName,
    group_image: groupImage,
    group_description: groupDescription,
    shared_by: 'sender-1',
    shared_by_name: 'Test User',
    shared_at: '2026-01-01T00:00:00Z',
  }),
  message_type: 'text',
  created_at: '2026-01-01T00:00:00Z',
  sender_profile: {
    username: 'sender1',
    display_name: 'Sender',
    profile_pic: null,
  },
});

const renderMessageBubble = (message: any) => {
  return render(
    <MemoryRouter initialEntries={['/messages/conv-1']}>
      <MessageBubble message={message} currentUserId='other-user-id' />
    </MemoryRouter>
  );
};

describe('MessageBubble group-share rendering', () => {
  it('renders group-share card with name, image, description, and group ID', () => {
    const { container } = renderMessageBubble(makeGroupShareMessage());
    expect(screen.getByText('Test Social Group')).toBeTruthy();
    expect(screen.getByText('A group for DX verification')).toBeTruthy();
    expect(screen.getByText(`Group ID: ${GROUP_ID}`)).toBeTruthy();
    expect(screen.getByRole('img', { name: 'DX Test Group' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open group' })).toBeTruthy();
  });

  it('renders group-share card with markdown-wrapped image URL', () => {
    const msg = makeGroupShareMessage(
      GROUP_ID,
      GROUP_NAME,
      '[https://picsum.photos/200/200](https://picsum.photos/200/200)',
      GROUP_DESCRIPTION,
    );
    const { container } = renderMessageBubble(msg);
    const img = container.querySelector('img[src="https://picsum.photos/200/200"]');
    expect(img).toBeTruthy();
  });

  it('renders group-share card without image when image is missing', () => {
    const msg = makeGroupShareMessage(GROUP_ID, GROUP_NAME, undefined, GROUP_DESCRIPTION);
    const { container } = renderMessageBubble(msg);
    const img = container.querySelector('img');
    expect(img).not.toBeTruthy();
    expect(screen.getByText('D')).toBeTruthy();
  });

  it('renders group-share card without description', () => {
    const msg = makeGroupShareMessage(GROUP_ID, GROUP_NAME, GROUP_IMAGE, undefined);
    const { container } = renderMessageBubble(msg);
    expect(container.querySelector('p.text-xs.text-muted-foreground.truncate.mt-1')).not.toBeTruthy();
    expect(screen.getByText('DX Test Group')).toBeTruthy();
  });

  it('renders group-share card as clickable link to /groups/:id', () => {
    const { container } = renderMessageBubble(makeGroupShareMessage());
    const card = container.querySelector('[role="button"]') as HTMLAnchorElement;
    expect(card).toBeTruthy();
    expect(card).toHaveAttribute('href', `/groups/${GROUP_ID}`);
  });

  it('does not render group-share card for non-group-share messages', () => {
    const msg = {
      id: 'msg-1',
      conversation_id: 'conv-1',
      sender_id: 'sender-1',
      content: 'Just a regular text message',
      message_type: 'text',
      created_at: '2026-01-01T00:00:00Z',
      sender_profile: {
        username: 'sender1',
        display_name: 'Sender',
        profile_pic: null,
      },
    };
    const { container } = renderMessageBubble(msg);
    expect(screen.queryByText('Test Social Group')).not.toBeTruthy();
    expect(screen.queryByText('A group for DX verification')).not.toBeTruthy();
    expect(container.querySelector('[role="button"]')).not.toBeTruthy();
  });
});
