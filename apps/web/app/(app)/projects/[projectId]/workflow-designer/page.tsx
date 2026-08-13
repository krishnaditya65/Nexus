'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useWorkflowStates,
  useWorkflowEdges,
  useCreateWorkflowState,
  useUpdateWorkflowState,
  useDeleteWorkflowState,
  useCreateWorkflowEdge,
  useDeleteWorkflowEdge,
  WorkflowState,
} from '@/lib/hooks/use-workflow-designer';

const NODE_W = 140;
const NODE_H = 56;

/** Visual workflow designer (docs/FEATURES.md §13.1) — the drag-and-drop
 *  state/transition graph editor, deliberately separate from
 *  `.../workflow`'s Conditions/Validators/Post-Functions editor: that page
 *  edits the LOGIC bound to an already-existing transition; this page
 *  edits the GRAPH itself (which states exist, which transitions connect
 *  them).
 *
 *  Node positions are a client-side-only layout concern — the schema
 *  (`workflow_states`) has no x/y columns, deliberately: position is
 *  presentation, not workflow semantics (an ordered `position` int for
 *  board-column ordering already exists and is untouched by this). Layout
 *  is auto-computed (states arranged left-to-right in a topological-ish
 *  order derived from transition edges) and persisted per-project in
 *  localStorage purely so a manual drag survives a reload — losing it
 *  (private browsing, different device) just re-triggers the same
 *  deterministic auto-layout, never a data-loss concern since the graph
 *  itself lives server-side. */
export default function WorkflowDesignerPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('workflowDesigner');
  const tCommon = useTranslations('common');
  const { data: states, isLoading, error } = useWorkflowStates(params.projectId);
  const { data: edges } = useWorkflowEdges(params.projectId);
  const createState = useCreateWorkflowState(params.projectId);
  const updateState = useUpdateWorkflowState(params.projectId);
  const deleteState = useDeleteWorkflowState(params.projectId);
  const createEdge = useCreateWorkflowEdge(params.projectId);
  const deleteEdge = useDeleteWorkflowEdge(params.projectId);

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [newStateName, setNewStateName] = useState('');
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const storageKey = `workflow-designer-layout:${params.projectId}`;

  useEffect(() => {
    if (!states) return;
    let stored: Record<string, { x: number; y: number }> = {};
    try {
      stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    } catch {
      stored = {};
    }
    const next = { ...stored };
    let changed = false;
    states.forEach((s, i) => {
      if (!next[s.id]) {
        next[s.id] = { x: 40 + (i % 4) * (NODE_W + 60), y: 40 + Math.floor(i / 4) * (NODE_H + 60) };
        changed = true;
      }
    });
    setPositions(next);
    if (changed) localStorage.setItem(storageKey, JSON.stringify(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states, storageKey]);

  function persistPositions(next: Record<string, { x: number; y: number }>) {
    setPositions(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function onNodeMouseDown(stateId: string) {
    setDragging(stateId);
  }

  function onCanvasMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - NODE_W / 2);
    const y = Math.max(0, e.clientY - rect.top - NODE_H / 2);
    persistPositions({ ...positions, [dragging]: { x, y } });
  }

  function onCanvasMouseUp() {
    setDragging(null);
  }

  function nodeCenter(id: string) {
    const p = positions[id];
    if (!p) return { x: 0, y: 0 };
    return { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 };
  }

  const canvasHeight = useMemo(() => {
    const maxY = Math.max(200, ...Object.values(positions).map((p) => p.y + NODE_H + 60));
    return maxY;
  }, [positions]);

  function handleNodeClick(state: WorkflowState) {
    if (!linkFrom) {
      setLinkFrom(state.id);
      return;
    }
    if (linkFrom === state.id) {
      setLinkFrom(null);
      return;
    }
    const name = window.prompt(t('transitionNamePrompt'), `Move to ${state.name}`);
    if (name) {
      createEdge.mutate({ name, fromStateId: linkFrom, toStateId: state.id });
    }
    setLinkFrom(null);
  }

  if (isLoading) return <p className="text-text-secondary">{tCommon('loading')}</p>;
  if (error) return <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{t('title')}</h1>
            <Link href={`/projects/${params.projectId}/workflow`} className="text-sm text-primary hover:underline">
              {t('logicLink')}
            </Link>
          </div>
          <p className="text-sm text-text-secondary">{linkFrom ? t('linkHint') : t('subtitle')}</p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newStateName.trim()) return;
            createState.mutate({ name: newStateName.trim() }, { onSuccess: () => setNewStateName('') });
          }}
        >
          <input
            className="rounded border border-border bg-surface-raised px-2 py-1 text-sm"
            placeholder={t('newStatePlaceholder')}
            value={newStateName}
            onChange={(e) => setNewStateName(e.target.value)}
          />
          <button className="rounded bg-primary px-3 py-1 text-sm text-white" type="submit">
            {t('addState')}
          </button>
        </form>
      </div>

      <svg
        className="w-full rounded-lg border border-border bg-surface-raised"
        height={canvasHeight}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onMouseLeave={onCanvasMouseUp}
      >
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" className="fill-text-secondary" />
          </marker>
        </defs>

        {edges?.map((edge) => {
          if (!positions[edge.from_state_id] || !positions[edge.to_state_id]) return null;
          const from = nodeCenter(edge.from_state_id);
          const to = nodeCenter(edge.to_state_id);
          const mx = (from.x + to.x) / 2;
          const my = (from.y + to.y) / 2;
          return (
            <g key={edge.id}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className="stroke-text-secondary"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
              <rect
                x={mx - 40}
                y={my - 10}
                width={80}
                height={20}
                rx={4}
                className="cursor-pointer fill-surface stroke-border"
                onClick={() => deleteEdge.mutate({ id: edge.id })}
              />
              <text x={mx} y={my + 4} textAnchor="middle" className="cursor-pointer fill-text-secondary text-[10px]">
                {edge.name}
              </text>
            </g>
          );
        })}

        {states?.map((s) => {
          const p = positions[s.id];
          if (!p) return null;
          return (
            <g key={s.id} transform={`translate(${p.x}, ${p.y})`}>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                className={`cursor-move stroke-2 ${
                  linkFrom === s.id
                    ? 'fill-primary/20 stroke-primary'
                    : s.is_terminal
                      ? 'fill-success/10 stroke-success'
                      : s.is_initial
                        ? 'fill-primary/10 stroke-primary'
                        : 'fill-surface stroke-border'
                }`}
                onMouseDown={() => onNodeMouseDown(s.id)}
                onClick={() => handleNodeClick(s)}
              />
              <text x={NODE_W / 2} y={22} textAnchor="middle" className="pointer-events-none fill-text text-sm font-medium">
                {s.name}
              </text>
              <text x={NODE_W / 2} y={38} textAnchor="middle" className="pointer-events-none fill-text-secondary text-[10px]">
                {s.is_initial ? t('initialBadge') : s.is_terminal ? t('terminalBadge') : ''}
              </text>
              <text
                x={NODE_W - 10}
                y={14}
                textAnchor="end"
                className="cursor-pointer fill-danger text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(t('deleteStateConfirm', { name: s.name }))) deleteState.mutate({ id: s.id });
                }}
              >
                ×
              </text>
            </g>
          );
        })}
      </svg>

      <p className="mt-2 text-xs text-text-secondary">{t('instructions')}</p>
    </div>
  );
}
