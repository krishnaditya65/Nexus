import { alreadyImportedIssueNumbers, buildImportedDescription } from './github.connector';

describe('alreadyImportedIssueNumbers', () => {
  it('extracts issue numbers from tickets carrying the import marker', () => {
    const tickets = [
      { description: 'Some body.\n\n---\nImported from GitHub #42 (https://github.com/o/r/issues/42)' },
      { description: 'Another one.\n\n---\nImported from GitHub #7 (https://github.com/o/r/issues/7)' },
    ];
    expect(alreadyImportedIssueNumbers(tickets)).toEqual(new Set(['42', '7']));
  });

  it('ignores tickets with no import marker (manually created tickets)', () => {
    const tickets = [{ description: 'A regular hand-written ticket, nothing to do with GitHub.' }];
    expect(alreadyImportedIssueNumbers(tickets)).toEqual(new Set());
  });

  it('handles a null description without throwing', () => {
    expect(alreadyImportedIssueNumbers([{ description: null }])).toEqual(new Set());
  });

  it('returns an empty set for an empty ticket list', () => {
    expect(alreadyImportedIssueNumbers([])).toEqual(new Set());
  });
});

describe('buildImportedDescription', () => {
  it('embeds the issue body and a matching "Imported from GitHub #<n>" marker', () => {
    const desc = buildImportedDescription({ body: 'The bug details.', number: 42, html_url: 'https://github.com/o/r/issues/42' });
    expect(desc).toContain('The bug details.');
    expect(desc).toContain('Imported from GitHub #42');
    expect(desc).toContain('https://github.com/o/r/issues/42');
  });

  it('handles a null body (GitHub allows an empty issue body)', () => {
    const desc = buildImportedDescription({ body: null, number: 1, html_url: 'https://github.com/o/r/issues/1' });
    expect(desc).toContain('Imported from GitHub #1');
  });

  // The idempotency loop in runConnectorSync depends on this marker being
  // parseable back out by alreadyImportedIssueNumbers's regex — this
  // round-trip is the actual invariant that matters.
  it('round-trips through alreadyImportedIssueNumbers', () => {
    const desc = buildImportedDescription({ body: 'x', number: 999, html_url: 'https://github.com/o/r/issues/999' });
    expect(alreadyImportedIssueNumbers([{ description: desc }])).toEqual(new Set(['999']));
  });
});
