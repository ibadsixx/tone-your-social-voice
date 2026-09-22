// Regression tests for the Messenger-style voice composer (do.md):
//  1. Mounting the recorder starts recording immediately.
//  2. The ONLY controls are Delete and Send — no Play, no Pause, no Stop, no
//     intermediate preview step.
//  3. Delete discards (cancel + onCancel, no send).
//  4. Send finalizes the MediaRecorder via stopRecording and hands the clip to
//     onSendAudio; after a failed send the same clip can be retried without
//     re-recording, or deleted.
//  5. No 60-second time limit: the hook is called with maxDurationSeconds: 0.
//  6. An instant send that captured no audio does not upload an empty file —
//     it starts a fresh recording instead.
//
// The MediaRecorder API is mocked away; the component only talks to
// useAudioRecorder, which is what we assert against.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import { MessageRecorder } from '@/components/messages/MessageRecorder';
import type { AudioRecording } from '@/hooks/useAudioRecorder';

const hoisted = vi.hoisted(() => ({
  hookState: {
    isRecording: true,
    recordingTime: 12,
    audioLevel: 0.3,
    startRecording: vi.fn(async () => true),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
    formatTime: (s: number) =>
      `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`,
  },
  hookOptions: [] as Array<{ maxDurationSeconds?: number } | undefined>,
}));

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: (options?: { maxDurationSeconds?: number }) => {
    hoisted.hookOptions.push(options);
    return hoisted.hookState;
  },
}));

const RECORDING: AudioRecording = {
  blob: new Blob(['some-audio'], { type: 'audio/webm' }),
  duration: 12,
  url: 'blob:mock-recording',
};

describe('MessageRecorder (Messenger-style voice composer)', () => {
  let onSendAudio: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    hoisted.hookState.isRecording = true;
    hoisted.hookState.recordingTime = 12;
    hoisted.hookState.audioLevel = 0.3;
    hoisted.hookState.startRecording.mockReset();
    hoisted.hookState.startRecording.mockResolvedValue(true);
    hoisted.hookState.stopRecording.mockReset();
    hoisted.hookState.stopRecording.mockResolvedValue(RECORDING);
    hoisted.hookState.cancelRecording.mockReset();
    hoisted.hookOptions.length = 0;

    onSendAudio = vi.fn();
    onCancel = vi.fn();

    // jsdom does not implement these; the component uses them for the
    // finalized-clip lifecycle.
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('starts recording immediately on mount', async () => {
    render(<MessageRecorder onSendAudio={onSendAudio} onCancel={onCancel} />);

    await waitFor(() => expect(hoisted.hookState.startRecording).toHaveBeenCalledTimes(1));
    expect(screen.getByTitle('Delete recording')).toBeTruthy();
    expect(screen.getByTitle('Send voice message')).toBeTruthy();
  });

  it('shows ONLY Delete and Send — no Play/Pause/Stop/preview controls', async () => {
    render(<MessageRecorder onSendAudio={onSendAudio} onCancel={onCancel} />);
    await waitFor(() => expect(hoisted.hookState.startRecording).toHaveBeenCalledTimes(1));

    // The two legitimate controls are present.
    expect(screen.getByTitle('Delete recording')).toBeTruthy();
    expect(screen.getByTitle('Send voice message')).toBeTruthy();

    // No recording-control step of any kind.
    expect(screen.queryByTitle(/Pause|Resume/i)).toBeNull();
    expect(screen.queryByTitle(/Stop/i)).toBeNull();
    expect(screen.queryByTitle(/Play/i)).toBeNull();
    expect(screen.queryByLabelText(/preview/i)).toBeNull();
    expect(screen.getByText('0:12')).toBeTruthy(); // live duration shown
  });

  it('enforces no 60-second time limit (maxDurationSeconds: 0)', async () => {
    render(<MessageRecorder onSendAudio={onSendAudio} onCancel={onCancel} />);
    await waitFor(() => expect(hoisted.hookState.startRecording).toHaveBeenCalledTimes(1));
    expect(hoisted.hookOptions[0]?.maxDurationSeconds).toBe(0);
  });

  it('Delete discards the recording: no upload, no message, back to composer', async () => {
    render(<MessageRecorder onSendAudio={onSendAudio} onCancel={onCancel} />);
    await waitFor(() => expect(hoisted.hookState.startRecording).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTitle('Delete recording'));

    expect(hoisted.hookState.cancelRecording).toHaveBeenCalledTimes(1);
    expect(onSendAudio).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Send finalizes the recorder and passes the clip to onSendAudio', async () => {
    render(<MessageRecorder onSendAudio={onSendAudio} onCancel={onCancel} />);
    await waitFor(() => expect(hoisted.hookState.startRecording).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTitle('Send voice message'));

    await waitFor(() => expect(hoisted.hookState.stopRecording).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSendAudio).toHaveBeenCalledWith(RECORDING));
    expect(onCancel).not.toHaveBeenCalled();
    expect(hoisted.hookState.cancelRecording).not.toHaveBeenCalled();
  });

  it('after a failed send, Send retries the same clip without re-recording', async () => {
    render(<MessageRecorder onSendAudio={onSendAudio} onCancel={onCancel} />);
    await waitFor(() => expect(hoisted.hookState.startRecording).toHaveBeenCalledTimes(1));

    // First attempt (the parent decides this failed and keeps us mounted).
    fireEvent.click(screen.getByTitle('Send voice message'));
    await waitFor(() => expect(onSendAudio).toHaveBeenCalledTimes(1));
    expect(hoisted.hookState.stopRecording).toHaveBeenCalledTimes(1);

    // Retry of the same clip — no second stop, no second recording.
    fireEvent.click(screen.getByTitle('Send voice message'));
    await waitFor(() => expect(onSendAudio).toHaveBeenCalledTimes(2));
    expect(hoisted.hookState.stopRecording).toHaveBeenCalledTimes(1);
    expect(hoisted.hookState.startRecording).toHaveBeenCalledTimes(1);
  });

  it('does not upload an empty file when Send is hit before any audio', async () => {
    hoisted.hookState.stopRecording.mockResolvedValue({
      blob: new Blob([]),
      duration: 0,
      url: 'blob:empty',
    });
    render(<MessageRecorder onSendAudio={onSendAudio} onCancel={onCancel} />);
    await waitFor(() => expect(hoisted.hookState.startRecording).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTitle('Send voice message'));

    await waitFor(() => expect(hoisted.hookState.startRecording).toHaveBeenCalledTimes(2));
    expect(onSendAudio).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('disables both controls while a send is in flight (disabled prop)', async () => {
    render(<MessageRecorder onSendAudio={onSendAudio} onCancel={onCancel} disabled />);
    await waitFor(() => expect(hoisted.hookState.startRecording).toHaveBeenCalledTimes(1));

    expect((screen.getByTitle('Send voice message') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTitle('Delete recording') as HTMLButtonElement).disabled).toBe(true);
  });
});