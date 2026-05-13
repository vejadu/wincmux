// tui/alert-badge.tsx — flash/badge for Teams/email pane alerts
import React, { useEffect, useState } from 'react';
import { Text } from 'ink';

interface AlertBadgeProps {
  count?: number;
  /** Flash the badge to draw attention */
  flash?: boolean;
}

// TODO: Implement timed flash animation using useInterval
// TODO: Integrate with TeamsMonitor and EmailAgentFeed events

export function AlertBadge({ count = 0, flash = false }: AlertBadgeProps): React.ReactElement | null {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!flash) return;
    // TODO: toggle visible on a 500ms interval to create flash effect
  }, [flash]);

  if (count === 0) return null;

  return (
    <Text backgroundColor="red" color="white" bold>
      {visible ? ` ${count} ` : '   '}
    </Text>
  );
}
