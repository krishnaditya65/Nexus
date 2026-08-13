'use client';

import { useTranslations } from 'next-intl';
import { useDependencyGraph, useCriticalPath } from '@/lib/hooks/use-ticket-detail';

const LINK_COLORS: Record<string, string> = {
  blocks: '#ef4444',
  duplicates: '#f59e0b',
  relates_to: '#6b7280',
};

/** A hand-rolled circular-layout SVG graph — no physics/force-directed
 *  library dependency for what's typically a few dozen dependency edges
 *  per project. Nodes placed evenly around a circle by index, which is
 *  deterministic (same graph always renders the same way) and legible
 *  enough at this scale; a force-directed layout would need to run
 *  client-side simulation for a marginal legibility gain. */
export default function DependencyGraphPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('dependencyGraph');
  const tCommon = useTranslations('common');
  const { data, isLoading, error } = useDependencyGraph(params.projectId);
  const { data: criticalPath } = useCriticalPath(params.projectId);
  const criticalPathIds = new Set(criticalPath?.path.map((p) => p.id) ?? []);
  const criticalPathEdgeKeys = new Set(
    (criticalPath?.path ?? []).slice(0, -1).map((p, i) => `${p.id}->${criticalPath!.path[i + 1].id}`),
  );

  const size = 480;
  const radius = 180;
  const center = size / 2;
  const positions = new Map<string, { x: number; y: number }>();
  data?.nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(data.nodes.length, 1);
    positions.set(n.id, { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) });
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {data && data.nodes.length === 0 && <p className="text-text-secondary">{t('empty')}</p>}

      {data && data.nodes.length > 0 && (
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full rounded border border-border bg-surface-raised">
          {data.edges.map((e, i) => {
            const from = positions.get(e.source);
            const to = positions.get(e.target);
            if (!from || !to) return null;
            const onCriticalPath = criticalPathEdgeKeys.has(`${e.source}->${e.target}`);
            return (
              <line
                key={i}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={onCriticalPath ? '#dc2626' : (LINK_COLORS[e.linkType] ?? '#6b7280')}
                strokeWidth={onCriticalPath ? 3 : 1.5}
                markerEnd="url(#arrow)"
              />
            );
          })}
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#6b7280" />
            </marker>
          </defs>
          {data.nodes.map((n) => {
            const pos = positions.get(n.id)!;
            return (
              <g key={n.id}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={22}
                  fill="currentColor"
                  fillOpacity={0.15}
                  stroke={criticalPathIds.has(n.id) ? '#dc2626' : 'currentColor'}
                  strokeWidth={criticalPathIds.has(n.id) ? 2.5 : 1}
                />
                <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={10} fill="currentColor">
                  #{n.ticket_number}
                </text>
                <text x={pos.x} y={pos.y + 34} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.7}>
                  {n.title.slice(0, 16)}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      <div className="mt-4 flex gap-4 text-xs text-text-secondary">
        {Object.entries(LINK_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {type}
          </span>
        ))}
      </div>

      {criticalPath && (
        <div className="mt-6 rounded border border-border p-4">
          <h2 className="mb-2 text-sm font-medium">{t('criticalPathTitle')}</h2>
          {criticalPath.hasCycle && <p className="text-sm text-danger">{t('criticalPathCycle')}</p>}
          {!criticalPath.hasCycle && criticalPath.path.length === 0 && (
            <p className="text-sm text-text-secondary">{t('criticalPathEmpty')}</p>
          )}
          {!criticalPath.hasCycle && criticalPath.path.length > 0 && (
            <p className="text-sm">
              {criticalPath.path.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ' → '}
                  <span className="font-mono text-danger">#{p.ticketNumber}</span>
                </span>
              ))}
              <span className="ml-2 text-text-secondary">
                {t('criticalPathTotal', { points: criticalPath.totalPoints })}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
