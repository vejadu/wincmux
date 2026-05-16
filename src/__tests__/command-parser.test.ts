import { describe, it, expect } from 'vitest';
import { parseVoiceCommand } from '../voice/command-parser.js';

describe('parseVoiceCommand', () => {
  // --- switch ---
  it('parses "switch to N"', () => {
    expect(parseVoiceCommand('switch to 2')).toEqual({ type: 'switch', paneIndex: 1 });
  });

  it('parses "go to N"', () => {
    expect(parseVoiceCommand('go to 1')).toEqual({ type: 'switch', paneIndex: 0 });
  });

  it('parses "go to pane N"', () => {
    expect(parseVoiceCommand('go to pane 3')).toEqual({ type: 'switch', paneIndex: 2 });
  });

  it('parses "pane N"', () => {
    expect(parseVoiceCommand('pane 4')).toEqual({ type: 'switch', paneIndex: 3 });
  });

  it('parses "number N"', () => {
    expect(parseVoiceCommand('number 5')).toEqual({ type: 'switch', paneIndex: 4 });
  });

  it('handles leading/trailing whitespace', () => {
    expect(parseVoiceCommand('  switch to 2  ')).toEqual({ type: 'switch', paneIndex: 1 });
  });

  it('handles mixed case', () => {
    expect(parseVoiceCommand('Switch To 2')).toEqual({ type: 'switch', paneIndex: 1 });
  });

  // --- tell ---
  it('parses "tell agent N: text"', () => {
    expect(parseVoiceCommand('tell agent 1: fix the tests')).toEqual({
      type: 'tell',
      paneIndex: 0,
      text: 'fix the tests',
    });
  });

  it('parses "tell N: text"', () => {
    expect(parseVoiceCommand('tell 2: do something')).toEqual({
      type: 'tell',
      paneIndex: 1,
      text: 'do something',
    });
  });

  it('parses "send to N: text"', () => {
    expect(parseVoiceCommand('send to 3: hello world')).toEqual({
      type: 'tell',
      paneIndex: 2,
      text: 'hello world',
    });
  });

  it('preserves original case in tell text', () => {
    const result = parseVoiceCommand('tell agent 1: Fix The Tests');
    expect(result).toMatchObject({ type: 'tell', text: 'Fix The Tests' });
  });

  it('trims colon-adjacent whitespace in tell', () => {
    const result = parseVoiceCommand('tell 1:   spaced text');
    expect(result).toMatchObject({ type: 'tell', text: 'spaced text' });
  });

  // --- new ---
  it('parses "new session"', () => {
    expect(parseVoiceCommand('new session')).toEqual({ type: 'new' });
  });

  it('parses "new pane"', () => {
    expect(parseVoiceCommand('new pane')).toEqual({ type: 'new' });
  });

  it('parses "open new"', () => {
    expect(parseVoiceCommand('open new')).toEqual({ type: 'new' });
  });

  // --- close ---
  it('parses "close this"', () => {
    expect(parseVoiceCommand('close this')).toEqual({ type: 'close' });
  });

  it('parses "close current"', () => {
    expect(parseVoiceCommand('close current')).toEqual({ type: 'close' });
  });

  it('parses "close pane"', () => {
    expect(parseVoiceCommand('close pane')).toEqual({ type: 'close' });
  });

  // --- unknown ---
  it('returns unknown for unrecognised utterance', () => {
    expect(parseVoiceCommand('hello world')).toEqual({ type: 'unknown', raw: 'hello world' });
  });

  it('returns unknown for empty string', () => {
    expect(parseVoiceCommand('')).toEqual({ type: 'unknown', raw: '' });
  });

  it('returns unknown for partial switch phrase', () => {
    expect(parseVoiceCommand('switch')).toEqual({ type: 'unknown', raw: 'switch' });
  });

  it('returns unknown for close without qualifier', () => {
    expect(parseVoiceCommand('close')).toEqual({ type: 'unknown', raw: 'close' });
  });
});
