import { DatabasePopover } from '../ui/database-popover';
import { IconPickerDialog } from '../ui/icon-picker-dialog';
import { PropertyIcon } from './PropertyIcon';
import { Select } from '../ui/select';
import {
  Binary,
  Calendar,
  CheckSquare,
  CircleDot,
  CircleDashed,
  Clock,
  File,
  Hash,
  Link2,
  List,
  Plus,
  Sigma,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

import type { DatabaseSchema } from '../../shared/database-contract';
import type {
  PropertyOptionDraft,
  PropertyType,
  RollupAggregation,
  TypeConversionStrategy,
  TypeConversionPreview,
  WorkspaceProperty,
  WorkspacePropertyDraft,
  WorkspacePropertyPatch,
} from '../../shared/property-contract';
import type { NavigationItem } from '../../shared/workspace-contract';

type PropertyEditorProps = Readonly<{
  databaseId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (draft: WorkspacePropertyDraft | WorkspacePropertyPatch) => Promise<WorkspaceProperty | null>;
  property?: WorkspaceProperty | null;
  schema: DatabaseSchema | null;
}>;

const propertyTypeOptions: { description: string; icon: typeof Type; label: string; type: PropertyType }[] = [
  { description: 'Single-line plain text or names', icon: Type, label: 'Text', type: 'text' },
  { description: 'Numbers, quantities, counts', icon: Hash, label: 'Number', type: 'number' },
  { description: 'Single selection from colored tags', icon: CircleDot, label: 'Select', type: 'select' },
  { description: 'Multiple tags selection', icon: List, label: 'Multi-select', type: 'multi_select' },
  { description: 'Workflow progress stages', icon: CircleDashed, label: 'Status', type: 'status' },
  { description: 'Dates, timestamps, deadlines', icon: Calendar, label: 'Date', type: 'date' },
  { description: 'True/false interactive checkbox', icon: CheckSquare, label: 'Checkbox', type: 'checkbox' },
  { description: 'Link records from another database', icon: Link2, label: 'Relation', type: 'relation' },
  ...(['url', 'email', 'phone'] as const).map(type => ({ description: 'Contact information', icon: Link2, label: ({ url: 'URL', email: 'Email', phone: 'Phone' })[type], type })),
  { description: 'Calculated expressions from properties', icon: Sigma, label: 'Formula', type: 'formula' },
  { description: 'Summarize values across relations', icon: Binary, label: 'Rollup', type: 'rollup' },
  { description: 'Upload files and media', icon: File, label: 'File', type: 'file' },
  { description: 'Record creation timestamp', icon: Clock, label: 'Created time', type: 'created_time' },
  { description: 'Last modified timestamp', icon: Clock, label: 'Last edited time', type: 'last_edited_time' },
  { description: 'Auto-incrementing unique ID', icon: Hash, label: 'Auto ID', type: 'auto_id' },
];

const colorOptions = ['blue', 'pink', 'yellow', 'green', 'brown', 'purple', 'red', 'gray'].map(color => `var(--option-${color}-bg)`);

export function PropertyEditor({
  databaseId,
  isOpen,
  onClose,
  onSave,
  property,
  schema,
}: PropertyEditorProps) {
  const isEditing = Boolean(property);

  const [icon, setIcon] = useState(typeof property?.config.icon === 'string' ? property.config.icon : '');
  const [pickingIcon, setPickingIcon] = useState(false);
  const iconButtonRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState(property?.name || '');
  const [type, setType] = useState<PropertyType>(property?.type || 'text');
  const [required, setRequired] = useState(property?.required || false);
  const [uniqueValue, setUniqueValue] = useState(property?.uniqueValue || false);

  // Options for Select / Status
  const [options, setOptions] = useState<PropertyOptionDraft[]>(
    () => (property?.options ? [...property.options] : [{ label: 'Option 1', style: { background: colorOptions[0] } }]),
  );

  // Formula config
  const [formulaExpr, setFormulaExpr] = useState(() => {
    const f = property?.config?.formula;
    if (typeof f === 'string') return f;
    if (f && typeof f === 'object' && 'expression' in f && typeof f.expression === 'string') return f.expression;
    return '';
  });

  // Rollup config
  const [rollupRelationId, setRollupRelationId] = useState(
    () => property?.config?.rollup?.relationPropertyId || '',
  );
  const [rollupTargetPropId, setRollupTargetPropId] = useState(
    () => property?.config?.rollup?.targetPropertyId || '',
  );
  const [rollupAggregation, setRollupAggregation] = useState<RollupAggregation>(
    () => property?.config?.rollup?.aggregation || 'sum',
  );
  const [databases, setDatabases] = useState<readonly NavigationItem[]>([]);
  const [relationTargetDatabaseId, setRelationTargetDatabaseId] = useState('');
  const [inversePropertyName, setInversePropertyName] = useState('');
  const [relationLimit, setRelationLimit] = useState<'one' | 'many'>('many');
  const [targetProperties, setTargetProperties] = useState<readonly WorkspaceProperty[]>([]);
  const [conversionStrategy, setConversionStrategy] = useState<TypeConversionStrategy>('convert_all');

  // Type Conversion Preview
  const [preview, setPreview] = useState<TypeConversionPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || type !== 'rollup' || !rollupRelationId) return;
    let active = true;
    void window.maxApi.workspace.listRelations(databaseId).then(async (relations) => {
      const relation = relations.find((item) => item.sourcePropertyId === rollupRelationId || item.inversePropertyId === rollupRelationId);
      if (!relation) { if (active) setTargetProperties([]); return; }
      const targetId = relation.sourcePropertyId === rollupRelationId ? relation.targetDatabaseId : relation.sourceDatabaseId;
      const properties = await window.maxApi.workspace.listProperties(targetId);
      if (active) setTargetProperties(properties);
    }).catch((cause: unknown) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [databaseId, isOpen, rollupRelationId, type]);

  useEffect(() => {
    if (property) {
      setName(property.name);
      setType(property.type);
      setRequired(property.required || false);
      setUniqueValue(property.uniqueValue || false);
      setOptions(property.options ? [...property.options] : []);
      const f = property.config?.formula;
      if (typeof f === 'string') {
        setFormulaExpr(f);
      } else if (f && typeof f === 'object' && 'expression' in f && typeof f.expression === 'string') {
        setFormulaExpr(f.expression);
      } else {
        setFormulaExpr('');
      }
      setRollupRelationId(property.config?.rollup?.relationPropertyId || '');
      setRollupTargetPropId(property.config?.rollup?.targetPropertyId || '');
      setRollupAggregation(property.config?.rollup?.aggregation || 'sum');
    } else {
      setName('');
      setType('text');
      setRequired(false);
      setUniqueValue(false);
      setOptions([{ label: 'Option 1', style: { background: colorOptions[0] } }]);
      setFormulaExpr('');
      setRollupRelationId('');
      setRollupTargetPropId('');
      setRollupAggregation('sum');
    }
    setPreview(null);
    setError(null);
  }, [property, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    void window.maxApi.workspace.getNavigation().then((navigation) => {
      setDatabases(navigation.databases);
      setRelationTargetDatabaseId((current) => current || navigation.databases[0]?.id || databaseId);
    });
  }, [databaseId, isOpen]);

  // Check type conversion preview if editing existing property and type changes
  useEffect(() => {
    if (isEditing && property && property.type !== type) {
      void window.maxApi.workspace
        .previewTypeConversion(property.id, type)
        .then((res) => {
          setPreview(res);
          setConversionStrategy(res.invalidCount > 0 ? 'set_null' : 'convert_all');
        })
        .catch(() => setPreview(null));
    } else {
      setPreview(null);
    }
  }, [isEditing, property, type]);

  if (!isOpen) return null;

  const handleAddOption = () => {
    const nextColor = colorOptions[options.length % colorOptions.length];
    setOptions([...options, { label: `Option ${options.length + 1}`, style: { background: nextColor } }]);
  };

  const handleRemoveOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleUpdateOption = (index: number, label: string, color?: string) => {
    setOptions(
      options.map((opt, i) => {
        if (i !== index) return opt;
        return {
          ...opt,
          label,
          style: color ? { background: color } : opt.style,
        };
      }),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Property name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let config: Record<string, unknown> | undefined;

      if (type === 'formula') {
        config = { formula: { expression: formulaExpr.trim() } };
      } else if (type === 'rollup') {
        config = {
          rollup: {
            aggregation: rollupAggregation,
            relationPropertyId: rollupRelationId,
            targetPropertyId: rollupTargetPropId,
          },
        };
      }

      config = { ...property?.config, ...config, icon };
      if (isEditing && property) {
        if (property.type !== type) {
          const conversion = await window.maxApi.workspace.applyTypeConversion(property.id, type, conversionStrategy);
          if (!conversion.ok) throw new Error(conversion.error.message);
        }
        await onSave({
          config,
          name: name.trim(),
          options: ['select', 'multi_select', 'status'].includes(type) ? options : undefined,
          required,
          uniqueValue,
        });
      } else {
        const createdProperty = await onSave({
          config,
          databaseId,
          name: name.trim(),
          options: ['select', 'multi_select', 'status'].includes(type) ? options : undefined,
          required,
          type,
          uniqueValue,
        });
        if (!createdProperty) throw new Error('Property could not be saved. Check the name and constraints.');
        if (type === 'relation') {
          if (!createdProperty || !relationTargetDatabaseId) {
            throw new Error('A target database is required for a relation.');
          }
          const relation = await window.maxApi.workspace.createRelation({
            inversePropertyName: inversePropertyName.trim() || schema?.database.title || 'Related pages',
            sourceCardinality: relationLimit,
            sourceDatabaseId: databaseId,
            sourcePropertyId: createdProperty.id,
            targetDatabaseId: relationTargetDatabaseId,
          });
          if (!relation.ok) {
            await window.maxApi.workspace.archiveProperty(createdProperty.id);
            throw new Error(relation.error.message);
          }
        }
      }

      window.dispatchEvent(new Event('max:workspace-changed'));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save property.');
    } finally {
      setSaving(false);
    }
  };

  const relationProperties = schema?.properties.filter((p) => p.type === 'relation') || [];

  return (
    <DatabasePopover onClose={onClose}>
      <div className="modal-container property-editor-modal" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div className="modal-header">
            <div className="modal-header__title">
              <button ref={iconButtonRef} type="button" className="property-icon-button" aria-label="Choose property icon" onClick={() => setPickingIcon((open) => !open)}><PropertyIcon type={type} icon={icon} /></button>
              <h3>{isEditing ? 'Edit Property' : 'New Property'}</h3>
            </div>
            <button className="btn-icon" onClick={onClose} type="button" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div className="modal-body space-y-4">
            {error && <div className="alert alert-danger">{error}</div>}

            {/* Name */}
            <div className="form-group">
              <label className="form-label">Property Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="Property name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>

            {/* Type selector (disabled for auto-created title in edit mode) */}
            {(!isEditing || property?.type !== 'title') && (
              <div className="form-group">
                <label className="form-label">Property Type</label>
                <div className="property-type-menu" aria-label="Property type">{propertyTypeOptions.map(option => <button type="button" aria-pressed={type === option.type} key={option.type} onClick={() => setType(option.type)}><option.icon size={17} />{option.label}</button>)}</div>
              </div>
            )}

            {/* Type Conversion Warning */}
            {preview && preview.invalidCount > 0 && (
              <div className="alert alert-warning">
                <strong>Type Conversion Notice:</strong> {preview.invalidCount} of {preview.totalRecords} records cannot be cleanly converted to <code>{type}</code>.
                <div className="text-danger font-semibold mt-1">
                  Warning: Incompatible values may be set to null.
                </div>
                <Select
                  className="select-field mt-2"
                  value={conversionStrategy}
                  onChange={(event) => setConversionStrategy(event.target.value as TypeConversionStrategy)}
                >
                  {preview.availableStrategies.filter((strategy) => strategy !== 'cancel').map((strategy) => (
                    <option key={strategy} value={strategy}>{strategy.replaceAll('_', ' ')}</option>
                  ))}
                </Select>
              </div>
            )}

            {type === 'relation' && !isEditing && (
              <div className="space-y-3">
                <div className="form-group">
                  <label className="form-label">Target Database</label>
                  <Select
                    className="select-field"
                    onChange={(event) => setRelationTargetDatabaseId(event.target.value)}
                    required
                    value={relationTargetDatabaseId}
                  >
                    {databases.map((database) => (
                      <option key={database.id} value={database.id}>{database.title}</option>
                    ))}
                  </Select>
                </div>
                <div className="form-group">
                  <label className="form-label">Inverse Property Name (optional)</label>
                  <input
                    className="input-field"
                    onChange={(event) => setInversePropertyName(event.target.value)}
                    placeholder={schema?.database.title ?? 'Related pages'}
                    type="text"
                    value={inversePropertyName}
                  />
                </div>
                <div className="form-group"><label className="form-label">Page limit</label><Select value={relationLimit} onChange={(event) => setRelationLimit(event.target.value as 'one' | 'many')}><option value="many">No limit</option><option value="one">One page</option></Select></div>
              </div>
            )}

            {/* Select / Status Options Manager */}
            {['select', 'multi_select', 'status'].includes(type) && (
              <div className="form-group">
                <label className="form-label">Options</label>
                <div className="options-manager-list space-y-2">
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full cursor-pointer flex-shrink-0"
                        style={{ background: opt.style?.background || colorOptions[0] }}
                        title="Click to cycle color"
                        onClick={() => {
                          const currIdx = colorOptions.indexOf(opt.style?.background || '');
                          const next = colorOptions[(currIdx + 1) % colorOptions.length];
                          handleUpdateOption(i, opt.label, next);
                        }}
                      />
                      <input
                        type="text"
                        className="input-field flex-1 text-sm py-1"
                        value={opt.label}
                        onChange={(e) => handleUpdateOption(i, e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-icon text-danger p-1"
                        onClick={() => handleRemoveOption(i)}
                        disabled={options.length <= 1}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={handleAddOption}>
                    <Plus size={14} className="mr-1" /> Add Option
                  </button>
                </div>
              </div>
            )}

            {/* Formula Expression Editor */}
            {type === 'formula' && (
              <div className="form-group">
                <label className="form-label">Formula Expression</label>
                <input
                  type="text"
                  className="input-field font-mono text-sm"
                  placeholder="e.g. [prop_price] * 1.14 or upper([prop_name])"
                  value={formulaExpr}
                  onChange={(e) => setFormulaExpr(e.target.value)}
                />
                <div className="text-xs text-muted mt-1">
                  Supported: +, -, *, /, %, &amp;&amp;, ||, ==, !=, &gt;, &lt;, if(cond, a, b), concat(), upper(), lower(), round()
                </div>
              </div>
            )}

            {/* Rollup Configuration */}
            {type === 'rollup' && (
              <div className="space-y-3">
                <div className="form-group">
                  <label className="form-label">Relation Property</label>
                  <Select
                    className="select-field"
                    value={rollupRelationId}
                    onChange={(e) => setRollupRelationId(e.target.value)}
                    required
                  >
                    <option value="">Select relation property...</option>
                    {relationProperties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="form-group">
                  <label className="form-label">Property to summarize</label>
                  <Select
                    className="select-field"
                    value={rollupTargetPropId}
                    onChange={(e) => setRollupTargetPropId(e.target.value)}
                    required
                  ><option value="">Choose a property…</option>{targetProperties.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</Select>
                </div>

                <div className="form-group">
                  <label className="form-label">Calculation</label>
                  <Select
                    className="select-field"
                    value={rollupAggregation}
                    onChange={(e) => setRollupAggregation(e.target.value as RollupAggregation)}
                  >
                    <option value="sum">Sum</option>
                    <option value="avg">Average</option>
                    <option value="min">Min</option>
                    <option value="max">Max</option>
                    <option value="count">Count all</option>
                    <option value="count_distinct">Count unique</option>
                  </Select>
                </div>
              </div>
            )}


          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Property'}
            </button>
          </div>
        </form>
        {pickingIcon && <IconPickerDialog anchor={iconButtonRef.current} locale="en" currentIcon={icon} onClose={() => setPickingIcon(false)} onSelect={(value) => { setIcon(value); setPickingIcon(false); }} showColors={false} />}
      </div>
    </DatabasePopover>
  );
}
