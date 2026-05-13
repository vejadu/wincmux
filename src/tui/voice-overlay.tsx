import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

type VoiceState =
  | 'disabled'
  | 'sleeping'
  | 'wake-word-heard'
  | 'listening'
  | 'transcribing'
  | 'processing';

type VoiceOverlayProps = {
  voiceState: VoiceState;
};

const DOT_FRAMES = ['', '.', '..', '...'];

export function VoiceOverlay({ voiceState }: VoiceOverlayProps) {
  const [dotIndex, setDotIndex] = useState(0);

  const animated = voiceState === 'listening' || voiceState === 'transcribing';

  useEffect(() => {
    if (!animated) {
      setDotIndex(0);
      return;
    }
    const t = setInterval(() => {
      setDotIndex(i => (i + 1) % DOT_FRAMES.length);
    }, 100);
    return () => clearInterval(t);
  }, [animated]);

  if (voiceState === 'disabled') return null;

  const dots = DOT_FRAMES[dotIndex] ?? '';

  type StateConfig = {
    icon: string;
    label: string;
    color: string;
    bold: boolean;
    dimColor: boolean;
  };

  const config: Record<Exclude<VoiceState, 'disabled'>, StateConfig> = {
    sleeping: {
      icon: '◦',
      label: 'voice: ready',
      color: 'gray',
      bold: false,
      dimColor: true,
    },
    'wake-word-heard': {
      icon: '◉',
      label: 'wake word heard — speak now',
      color: 'yellow',
      bold: true,
      dimColor: false,
    },
    listening: {
      icon: '◉',
      label: `listening${dots}`,
      color: 'green',
      bold: true,
      dimColor: false,
    },
    transcribing: {
      icon: '◎',
      label: `transcribing${dots}`,
      color: 'cyan',
      bold: false,
      dimColor: false,
    },
    processing: {
      icon: '◈',
      label: 'processing command',
      color: 'magenta',
      bold: false,
      dimColor: false,
    },
  };

  const state = config[voiceState as Exclude<VoiceState, 'disabled'>];
  if (!state) return null;

  return (
    <Box paddingX={1} flexDirection="row" gap={1}>
      <Text color={state.color} bold={state.bold} dimColor={state.dimColor}>
        {state.icon}
      </Text>
      <Text color={state.color} bold={state.bold} dimColor={state.dimColor}>
        {state.label}
      </Text>
    </Box>
  );
}
