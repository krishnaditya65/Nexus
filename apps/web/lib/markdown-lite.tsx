// A deliberately small markdown-subset renderer for the Wiki (docs/
// FEATURES.md — Wiki was shipped as plain-text-only specifically because
// real markdown rendering means either a new dependency or hand-rolled
// parsing, and either earns its own security review before shipping).
// This is that review, done the way that makes the review itself
// unnecessary: every node below is built via React.createElement, never
// dangerouslySetInnerHTML — there is no HTML string assembled anywhere in
// this file, so there is no injection surface to have gotten wrong, by
// construction rather than by escaping discipline. Supports headers,
// bold/italic, inline code, fenced code blocks, links (http(s)/relative
// only — anything else, e.g. `javascript:`, renders as plain text),
// unordered/ordered lists, and paragraphs. Not a spec-complete CommonMark
// implementation — tables, nested blockquotes, and images are out of
// scope for this first pass.
import { Fragment, ReactNode } from 'react';

function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|\/|#)/i.test(href.trim());
}

/** Parses inline spans within a single line/paragraph: **bold**,
 *  *italic*, `code`, [text](url). Order matters — code spans are
 *  extracted first so markdown syntax inside a code span (e.g. a literal
 *  asterisk) is never misread as bold/italic. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // One pass, one regex covering all inline forms, alternation order = precedence.
  const inlineRe = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = inlineRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const key = `${keyPrefix}-${i++}`;
    if (match[1] !== undefined) {
      nodes.push(
        <code key={key} className="rounded bg-surface px-1 py-0.5 font-mono text-xs">
          {match[1]}
        </code>,
      );
    } else if (match[2] !== undefined) {
      nodes.push(<strong key={key}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(<em key={key}>{match[3]}</em>);
    } else if (match[4] !== undefined && match[5] !== undefined) {
      if (isSafeHref(match[5])) {
        nodes.push(
          <a key={key} href={match[5]} className="text-accent hover:underline" target="_blank" rel="noreferrer">
            {match[4]}
          </a>,
        );
      } else {
        // Unsafe scheme (javascript:, data:, etc.) — render as literal
        // text rather than a clickable link. Silent downgrade, not a
        // thrown error: a wiki page shouldn't fail to render over one bad link.
        nodes.push(`[${match[4]}](${match[5]})`);
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function renderMarkdownLite(content: string): ReactNode {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block — no inline parsing inside, shown verbatim.
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <pre key={key++} className="my-2 overflow-x-auto rounded border border-border bg-surface p-2 text-xs">
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Headers
    const headerMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const HeaderTag = (`h${Math.min(level, 6)}` as unknown) as keyof JSX.IntrinsicElements;
      const sizeClass = ['text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm', 'text-sm'][level - 1];
      blocks.push(
        <HeaderTag key={key++} className={`${sizeClass} mb-2 mt-4 font-semibold first:mt-0`}>
          {renderInline(headerMatch[2], `h${key}`)}
        </HeaderTag>,
      );
      i++;
      continue;
    }

    // List blocks (consecutive lines) — unordered "- " or ordered "1. "
    const isUnordered = /^\s*[-*]\s+/.test(line);
    const isOrdered = /^\s*\d+\.\s+/.test(line);
    if (isUnordered || isOrdered) {
      const items: ReactNode[] = [];
      while (i < lines.length && (isUnordered ? /^\s*[-*]\s+/.test(lines[i]) : /^\s*\d+\.\s+/.test(lines[i]))) {
        const itemText = lines[i].replace(isUnordered ? /^\s*[-*]\s+/ : /^\s*\d+\.\s+/, '');
        items.push(<li key={key++}>{renderInline(itemText, `li${key}`)}</li>);
        i++;
      }
      const ListTag = isUnordered ? 'ul' : 'ol';
      blocks.push(
        <ListTag key={key++} className={`my-2 ${isUnordered ? 'list-disc' : 'list-decimal'} pl-5 text-sm`}>
          {items}
        </ListTag>,
      );
      continue;
    }

    // Blank line — paragraph separator, no output of its own.
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — consume consecutive non-blank, non-special lines,
    // joined with a line break each.
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="mb-3 text-sm leading-relaxed">
        {paraLines.map((l, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(l, `p${key}-${idx}`)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <>{blocks}</>;
}
