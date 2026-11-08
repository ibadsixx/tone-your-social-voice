// Group-share message rendering in MiniChatWindow
// Verifies that group-share messages render as clickable cards with
// group name, image, description, group ID, and clickable link.
// Do not merely test parseGroupShareContent() — test the rendered component.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MiniChatWindow } from '@/components/im/MiniChatWindow';

// jsdom doesn't implement scrollIntoView on HTMLDivElement
Object.defineProperty(HTMLDivElement.prototype, 'scrollIntoView', {
  value: vi.fn(),
  writable: true,
  configurable: true,
});

vi.mock('@/hooks/useConversations', () => ({
  useConversations: vi.fn(),
}));

vi.mock('@/contexts/CallContext', () => ({
  useCall: vi.fn(() => ({ initiateCall: vi.fn(), status: 'idle' })),
}));

vi.mock('@/hooks/usePresencePrivacy', () => ({
  usePresencePrivacy: vi.fn(() => ({ isPresenceHidden: () => false })),
}));

// MessageInput uses useAuth(), mock it so the component renders
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'sender-1', username: 'sender1', display_name: 'Sender', profile_pic: null } })),
}));

import { useConversations } from '@/hooks/useConversations';

const mockUseConversations = useConversations as ReturnType<typeof vi.fn>;

const GROUP_ID = 'group-123';
const GROUP_NAME = 'DX Test Group';
const GROUP_DESCRIPTION = 'A group for DX verification';
const GROUP_IMAGE = 'https://picsum.photos/200/200';

const makeGroupShareMessage = (groupImage: string | null = GROUP_IMAGE, groupDescription: string | null = GROUP_DESCRIPTION) => ({
  id: 'msg-1',
  conversation_id: 'conv-1',
  sender_id: 'sender-1',
  content: JSON.stringify({
    __group_share: true,
    group_id: GROUP_ID,
    group_name: GROUP_NAME,
    group_image: groupImage,
    group_description: groupDescription,
    shared_by: 'sender-1',
    shared_by_name: 'Test User',
    shared_at: '2026-01-01T00:00:00Z',
  }),
  message_type: 'text',
  created_at: '2026-01-01T00:00:00Z',
});

const makeTextMessage = (content: string = 'Just a regular text message') => ({
  id: 'msg-2',
  conversation_id: 'conv-1',
  sender_id: 'sender-1',
  content,
  message_type: 'text',
  created_at: '2026-01-01T00:00:00Z',
});

const renderMiniChatWindow = (messages: any[], isMinimized = false) => {
  const user = {
    id: 'recipient-1',
    username: 'recipient1',
    display_name: 'Recipient',
    profile_pic: null,
  };
  const currentUserId = 'sender-1';

  return render(
    <MemoryRouter initialEntries={['/messages/conv-1']}>
      <MiniChatWindow
        user={user}
        currentUserId={currentUserId}
        onClose={vi.fn()}
        onMinimize={vi.fn()}
        isMinimized={isMinimized}
      />
    </MemoryRouter>
  );
};

describe('MiniChatWindow group-share rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders group-share card with name, image, description, and group ID', () => {
    mockUseConversations.mockReturnValue({
      messages: [makeGroupShareMessage()],
      fetchMessages: vi.fn(),
      sendMessage: vi.fn(),
      sendAudioMessage: vi.fn(),
      getOrCreateDM: vi.fn().mockResolvedValue('conv-1'),
      setActiveConversationId: vi.fn(),
    });

    const { container } = renderMiniChatWindow([makeGroupShareMessage()], false);

    // Group name is displayed
    expect(screen.getByText(GROUP_NAME)).toBeTruthy();
    // Group description is displayed
    expect(screen.getByText(GROUP_DESCRIPTION)).toBeTruthy();
    // Group ID is displayed
    expect(screen.getByText(`Group ID: ${GROUP_ID}`)).toBeTruthy();
    // Group image is rendered as direct URL
    expect(screen.getByRole('img', { name: GROUP_NAME })).toBeTruthy();
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img?.src).toBe(GROUP_IMAGE);
    // Open group text is present
    expect(screen.getByText('Open group')).toBeTruthy();
  });

  it('renders group-share card with markdown-wrapped image URL stripped to direct URL', () => {
    const msg = {
      ...makeGroupShareMessage(),
      content: JSON.stringify({
        __group_share: true,
        group_id: GROUP_ID,
        group_name: GROUP_NAME,
        group_image: '[https://picsum.photos/200/200](https://picsum.photos/200/200)',
        group_description: GROUP_DESCRIPTION,
        shared_by: 'sender-1',
        shared_by_name: 'Test User',
        shared_at: '2026-01-01T00:00:00Z',
      }),
    };
    mockUseConversations.mockReturnValue({
      messages: [msg],
      fetchMessages: vi.fn(),
      sendMessage: vi.fn(),
      sendAudioMessage: vi.fn(),
      getOrCreateDM: vi.fn().mockResolvedValue('conv-1'),
      setActiveConversationId: vi.fn(),
    });

    const { container } = renderMiniChatWindow([msg], false);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img?.src).toBe('https://picsum.photos/200/200');
  });

  it('renders group-share card without image using fallback initial letter', () => {
    const msg = makeGroupShareMessage(null, GROUP_DESCRIPTION);
    mockUseConversations.mockReturnValue({
      messages: [msg],
      fetchMessages: vi.fn(),
      sendMessage: vi.fn(),
      sendAudioMessage: vi.fn(),
      getOrCreateDM: vi.fn().mockResolvedValue('conv-1'),
      setActiveConversationId: vi.fn(),
    });

    const { container } = renderMiniChatWindow([msg], false);
    // No group-share image should be present (check for img with alt matching group name)
    expect(container.querySelector(`img[alt="${GROUP_NAME}"]`)).not.toBeTruthy();
    // Fallback initial letter should show
    expect(screen.getByText('D')).toBeTruthy();
  });

  it('renders group-share card without description', () => {
    // Construct message directly so group_description is truly undefined
    // (makeGroupShareMessage default params would override explicit undefined otherwise)
    const msg = {
      id: 'msg-1',
      conversation_id: 'conv-1',
      sender_id: 'sender-1',
      content: JSON.stringify({
        __group_share: true,
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
    };
    mockUseConversations.mockReturnValue({
      messages: [msg],
      fetchMessages: vi.fn(),
      sendMessage: vi.fn(),
      sendAudioMessage: vi.fn(),
      getOrCreateDM: vi.fn().mockResolvedValue('conv-1'),
      setActiveConversationId: vi.fn(),
    });

    const { container } = renderMiniChatWindow([msg], false);

    // Group name still shows
    expect(screen.getByText(GROUP_NAME)).toBeTruthy();
    // No description paragraph should be present
    expect(container.querySelector('p.text-xs.text-muted-foreground.truncate.mt-1')).not.toBeTruthy();
    // Group ID still shows
    expect(screen.getByText(`Group ID: ${GROUP_ID}`)).toBeTruthy();
  });

  it('renders group-share card with clickable navigation structure to /groups/:id', () => {
    mockUseConversations.mockReturnValue({
      messages: [makeGroupShareMessage()],
      fetchMessages: vi.fn(),
      sendMessage: vi.fn(),
      sendAudioMessage: vi.fn(),
      getOrCreateDM: vi.fn().mockResolvedValue('conv-1'),
      setActiveConversationId: vi.fn(),
    });

    renderMiniChatWindow([makeGroupShareMessage()], false);
    // The card contains "Open group" text (clickable via onClick handler)
    expect(screen.getByText('Open group')).toBeTruthy();
    // The group-share card div exists with cursor-pointer styling
    const card = screen.getByText('Open group').closest('div.cursor-pointer');
    expect(card).toBeTruthy();
  });

  it('renders ordinary text messages unchanged', () => {
    mockUseConversations.mockReturnValue({
      messages: [makeTextMessage()],
      fetchMessages: vi.fn(),
      sendMessage: vi.fn(),
      sendAudioMessage: vi.fn(),
      getOrCreateDM: vi.fn().mockResolvedValue('conv-1'),
      setActiveConversationId: vi.fn(),
    });

    const { container } = renderMiniChatWindow([makeTextMessage()], false);

    // Text content is shown as plain text
    expect(screen.getByText('Just a regular text message')).toBeTruthy();
    // No group-share card elements
    expect(screen.queryByText(GROUP_NAME)).not.toBeTruthy();
    expect(screen.queryByText(`Group ID: ${GROUP_ID}`)).not.toBeTruthy();
  });

  it('does not render group-share card when minimized', () => {
    mockUseConversations.mockReturnValue({
      messages: [makeGroupShareMessage()],
      fetchMessages: vi.fn(),
      sendMessage: vi.fn(),
      sendAudioMessage: vi.fn(),
      getOrCreateDM: vi.fn().mockResolvedValue('conv-1'),
      setActiveConversationId: vi.fn(),
    });

    renderMiniChatWindow([makeGroupShareMessage()], true);

    // Minimized view only shows the avatar button, no messages
    expect(screen.queryByText(GROUP_NAME)).not.toBeTruthy();
    expect(screen.queryByText(`Group ID: ${GROUP_ID}`)).not.toBeTruthy();
  });
});
