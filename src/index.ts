#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './tui/dashboard.js';

// TODO: Initialize event bus
// TODO: Load config (see config.ts)
// TODO: Start session manager
// TODO: Start notification feed
// TODO: Start voice listener (optional, if config present)

render(React.createElement(App));
