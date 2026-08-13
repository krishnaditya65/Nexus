'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useWorkflowTransitions,
  useUpdateWorkflowTransition,
  WorkflowTransition,
  WorkflowCondition,
  WorkflowValidator,
  WorkflowPostFunction,
} from '@/lib/hooks/use-workflow-transitions';

const ROLES = ['owner', 'admin', 'member'] as const;

/** Workflow Conditions/Validators/Post Functions editor (docs/FEATURES.md
 *  §13.1) — the config surface for the fixed, server-validated vocabulary
 *  TicketsService.transition() enforces. One card per transition, three
 *  editable lists each. Deliberately NOT the visual drag-and-drop state
 *  graph editor (that's `.../workflow-designer`, linked below) — this
 *  edits the logic gates on an already-existing transition, not the state
 *  graph itself. */
export default function WorkflowPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('workflow');
  const tCommon = useTranslations('common');
  const { data: transitions, isLoading, error } = useWorkflowTransitions(params.projectId);
  const update = useUpdateWorkflowTransition(params.projectId);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <Link href={`/projects/${params.projectId}/workflow-designer`} className="text-sm text-primary hover:underline">
          {t('designerLink')}
        </Link>
      </div>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <div className="space-y-6">
        {transitions?.map((tr) => (
          <TransitionCard key={tr.id} transition={tr} onSave={(body) => update.mutate({ id: tr.id, ...body })} />
        ))}
      </div>
    </div>
  );
}

function TransitionCard({
  transition,
  onSave,
}: {
  transition: WorkflowTransition;
  onSave: (body: { conditions?: WorkflowCondition[]; validators?: WorkflowValidator[]; postFunctions?: WorkflowPostFunction[] }) => void;
}) {
  const t = useTranslations('workflow');

  const [conditionType, setConditionType] = useState<WorkflowCondition['type']>('assignee_only');
  const [conditionRoles, setConditionRoles] = useState<string[]>([]);

  const [validatorField, setValidatorField] = useState('');

  const [pfType, setPfType] = useState<WorkflowPostFunction['type']>('assign_user');
  const [pfField, setPfField] = useState('');
  const [pfValue, setPfValue] = useState('');

  return (
    <div className="rounded border border-border p-4">
      <h2 className="mb-3 text-sm font-medium">
        {transition.from_state_name} → {transition.to_state_name}{' '}
        <span className="text-text-secondary">({transition.name})</span>
      </h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <h3 className="mb-1 text-xs font-medium text-text-secondary">{t('conditionsLabel')}</h3>
          <ul className="mb-2 space-y-1">
            {transition.conditions.map((c, i) => (
              <li key={i} className="flex items-center justify-between rounded bg-surface-raised px-2 py-1 text-xs">
                <span>{c.type === 'assignee_only' ? t('assigneeOnly') : `${t('roleIn')}: ${c.roles.join(', ')}`}</span>
                <button
                  onClick={() => onSave({ conditions: transition.conditions.filter((_, j) => j !== i) })}
                  className="text-danger hover:underline"
                >
                  ×
                </button>
              </li>
            ))}
            {transition.conditions.length === 0 && <li className="text-xs text-text-secondary">{t('none')}</li>}
          </ul>
          <select
            className="mb-1 w-full rounded border border-border bg-surface-raised px-1.5 py-1 text-xs"
            value={conditionType}
            onChange={(e) => setConditionType(e.target.value as WorkflowCondition['type'])}
          >
            <option value="assignee_only">{t('assigneeOnly')}</option>
            <option value="role_in">{t('roleIn')}</option>
          </select>
          {conditionType === 'role_in' && (
            <div className="mb-1 flex gap-2">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={conditionRoles.includes(r)}
                    onChange={(e) =>
                      setConditionRoles((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))
                    }
                  />
                  {r}
                </label>
              ))}
            </div>
          )}
          <button
            className="w-full rounded border border-border px-1.5 py-1 text-xs hover:bg-surface-raised"
            onClick={() => {
              const newCondition: WorkflowCondition =
                conditionType === 'assignee_only' ? { type: 'assignee_only' } : { type: 'role_in', roles: conditionRoles };
              onSave({ conditions: [...transition.conditions, newCondition] });
              setConditionRoles([]);
            }}
          >
            {t('addCondition')}
          </button>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium text-text-secondary">{t('validatorsLabel')}</h3>
          <ul className="mb-2 space-y-1">
            {transition.validators.map((v, i) => (
              <li key={i} className="flex items-center justify-between rounded bg-surface-raised px-2 py-1 text-xs">
                <span>{t('fieldRequired')}: {v.field}</span>
                <button
                  onClick={() => onSave({ validators: transition.validators.filter((_, j) => j !== i) })}
                  className="text-danger hover:underline"
                >
                  ×
                </button>
              </li>
            ))}
            {transition.validators.length === 0 && <li className="text-xs text-text-secondary">{t('none')}</li>}
          </ul>
          <input
            className="mb-1 w-full rounded border border-border bg-surface-raised px-1.5 py-1 text-xs"
            placeholder={t('fieldNamePlaceholder')}
            value={validatorField}
            onChange={(e) => setValidatorField(e.target.value)}
          />
          <button
            className="w-full rounded border border-border px-1.5 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
            disabled={!validatorField.trim()}
            onClick={() => {
              onSave({
                validators: [...transition.validators, { type: 'field_required', field: validatorField.trim() }],
              });
              setValidatorField('');
            }}
          >
            {t('addValidator')}
          </button>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium text-text-secondary">{t('postFunctionsLabel')}</h3>
          <ul className="mb-2 space-y-1">
            {transition.post_functions.map((pf, i) => (
              <li key={i} className="flex items-center justify-between rounded bg-surface-raised px-2 py-1 text-xs">
                <span>
                  {pf.type === 'assign_user' && `${t('assignUser')}: ${pf.userId}`}
                  {pf.type === 'clear_field' && `${t('clearField')}: ${pf.field}`}
                  {pf.type === 'set_field' && `${t('setField')}: ${pf.field} = ${String(pf.value)}`}
                </span>
                <button
                  onClick={() => onSave({ postFunctions: transition.post_functions.filter((_, j) => j !== i) })}
                  className="text-danger hover:underline"
                >
                  ×
                </button>
              </li>
            ))}
            {transition.post_functions.length === 0 && <li className="text-xs text-text-secondary">{t('none')}</li>}
          </ul>
          <select
            className="mb-1 w-full rounded border border-border bg-surface-raised px-1.5 py-1 text-xs"
            value={pfType}
            onChange={(e) => setPfType(e.target.value as WorkflowPostFunction['type'])}
          >
            <option value="assign_user">{t('assignUser')}</option>
            <option value="clear_field">{t('clearField')}</option>
            <option value="set_field">{t('setField')}</option>
          </select>
          <input
            className="mb-1 w-full rounded border border-border bg-surface-raised px-1.5 py-1 text-xs"
            placeholder={pfType === 'assign_user' ? t('userIdPlaceholder') : t('fieldNamePlaceholder')}
            value={pfField}
            onChange={(e) => setPfField(e.target.value)}
          />
          {pfType === 'set_field' && (
            <input
              className="mb-1 w-full rounded border border-border bg-surface-raised px-1.5 py-1 text-xs"
              placeholder={t('valuePlaceholder')}
              value={pfValue}
              onChange={(e) => setPfValue(e.target.value)}
            />
          )}
          <button
            className="w-full rounded border border-border px-1.5 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
            disabled={!pfField.trim()}
            onClick={() => {
              let newPf: WorkflowPostFunction;
              if (pfType === 'assign_user') newPf = { type: 'assign_user', userId: pfField.trim() };
              else if (pfType === 'clear_field') newPf = { type: 'clear_field', field: pfField.trim() };
              else newPf = { type: 'set_field', field: pfField.trim(), value: pfValue };
              onSave({ postFunctions: [...transition.post_functions, newPf] });
              setPfField('');
              setPfValue('');
            }}
          >
            {t('addPostFunction')}
          </button>
        </div>
      </div>
    </div>
  );
}
