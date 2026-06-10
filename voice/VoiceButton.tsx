'use client';

import { useEffect } from 'react';
import { Mic } from 'lucide-react';
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
      size="lg"
      variant={isListening ? 'default' : 'outline'}
      className="gap-2"
      onMouseDown={handlePress}
      onMouseUp={handleRelease}
      onMouseLeave={isListening ? handleRelease : undefined}
      onTouchStart={handlePress}
      onTouchEnd={handleRelease}
      aria-pressed={isListening}
    >
      {isListening ? (
        <>
          <span
            className="intake-live-dot size-2 rounded-full bg-current"
            aria-hidden
          />
          Listening — release to stop
        </>
      ) : (
        <>
          <Mic className="size-4" aria-hidden />
          Hold to talk
        </>
      )}
    </Button>
  );
}
