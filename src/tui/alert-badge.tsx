import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

type NotifSource = 'github' | 'teams' | 'email';

type AlertBadgeProps = {
  active: boolean;
  label: string;
  source: NotifSource;
};

const SOURCE_COLORS_A: Record<NotifSource, string> = {
  github: 'blue',
  teams: 'magenta',
  email: 'yellow',
};

const SOURCE_COLORS_B: Record<NotifSource, string> = {
  github: 'cyan',
  teams: 'white',
  email: 'white',
};

export function AlertBadge({ active, label, source }: AlertBadgeProps) {
  const [flashOn, setFlashOn] = useState(true);

  useEffect(() => {
    if (!active) {
      setFlashOn(true);
      return;
    }
    const t = setInterval(() => {
      setFlashOn(f => !f);
    }, 500);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;

  const color = flashOn ? SOURCE_COLORS_A[source] : SOURCE_COLORS_B[source];

  return (
    <Box>
      <Text color={color} bold>
        ▲ {label}
      </Text>
    </Box>
  );
}
