'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useSpeechRecognition } from './useSpeechRecognition';

type Props = {
  onTranscript: (text: string) => void;
};

export function VoiceButton({ onTranscript }: Props) {
  const { isSupported, isListening, transcript, start, stop } =
    useSpeechRecognition();

  useEffect(() => {
    if (!isListening && transcript) {
      onTranscript(transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  if (!isSupported) return null;

  const handlePress = () => start();
  const handleRelease = () => stop();

  return (
    <Button
      type="button"
      size="sm"
      variant={isListening ? 'default' : 'outline'}
      onMouseDown={handlePress}
      onMouseUp={handleRelease}
      onMouseLeave={isListening ? handleRelease : undefined}
      onTouchStart={handlePress}
      onTouchEnd={handleRelease}
      aria-pressed={isListening}
    >
      {isListening ? '● Listening — release to stop' : '🎙 Hold to talk'}
    </Button>
  );
}
