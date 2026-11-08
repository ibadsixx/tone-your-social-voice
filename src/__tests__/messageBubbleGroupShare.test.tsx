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
const GROUP_DESCRIPTION = 'A group for DX verification';
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
    expect(screen.getByText(GROUP_NAME)).toBeTruthy();
    expect(screen.getByText(GROUP_DESCRIPTION)).toBeTruthy();
    expect(screen.getByText(`Group ID: ${GROUP_ID}`)).toBeTruthy();
    expect(screen.getByRole('img', { name: GROUP_NAME })).toBeTruthy();
    expect(screen.getByText('Open group')).toBeTruthy();
  });

  it('renders group-share card with markdown-wrapped image URL stripped to direct URL', () => {
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
    // Construct directly so group_image is truly undefined (default param would
    // override explicit undefined otherwise)
    const msg = {
      id: 'msg-1',
      conversation_id: 'conv-1',
      sender_id: 'sender-1',
      content: encodeGroupShareContent({
        group_id: GROUP_ID,
        group_name: GROUP_NAME,
        group_image: undefined,
        group_description: GROUP_DESCRIPTION,
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
    };
    const { container } = renderMessageBubble(msg);
    const img = container.querySelector('img');
    expect(img).not.toBeTruthy();
    // Falls back to initial letter
    expect(screen.getByText('T')).toBeTruthy();
  });

  it('renders group-share card without description', () => {
    // Construct directly so group_description is truly undefined
    const msg = {
      id: 'msg-1',
      conversation_id: 'conv-1',
      sender_id: 'sender-1',
      content: encodeGroupShareContent({
        group_id: GROUP_ID,
        group_name: GROUP_NAME,
        group_image: GROUP_IMAGE,
        group_description: undefined,
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
    };
    const { container } = renderMessageBubble(msg);
    // No description paragraph should be present
    expect(container.querySelector('p.text-xs.text-muted-foreground.truncate.mt-1')).not.toBeTruthy();
    // But name should still show
    expect(screen.getByText(GROUP_NAME)).toBeTruthy();
    // Group ID still shows
    expect(screen.getByText(`Group ID: ${GROUP_ID}`)).toBeTruthy();
  });

  it('renders group-share card with clickable navigation structure to /groups/:id', () => {
    const { container } = renderMessageBubble(makeGroupShareMessage());
    // The card contains "Open group" text (clickable via onClick handler)
    expect(screen.getByText('Open group')).toBeTruthy();
    // The group-share card div exists with cursor-pointer styling
    const card = container.querySelector('div.cursor-pointer');
    expect(card).toBeTruthy();
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
    expect(screen.queryByText(GROUP_NAME)).not.toBeTruthy();
    expect(screen.queryByText(GROUP_DESCRIPTION)).not.toBeTruthy();
    expect(container.querySelector('div[class*="bg-muted/50"]')).not.toBeTruthy();
  });
});
