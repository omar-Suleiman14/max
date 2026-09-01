import {
  Binary,
  Calendar,
  CheckSquare,
  CircleDot,
  DollarSign,
  Hash,
  Link2,
  List,
  Plus,
  Sigma,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';

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
  { description: 'Currency amounts with formatted cents', icon: DollarSign, label: 'Money', type: 'money' },
  { description: 'Single selection from colored tags', icon: CircleDot, label: 'Select', type: 'select' },
  { description: 'Multiple tags selection', icon: List, label: 'Multi-select', type: 'multi_select' },
  { description: 'Workflow progress stages', icon: CircleDot, label: 'Status', type: 'status' },
  { description: 'Dates, timestamps, deadlines', icon: Calendar, label: 'Date', type: 'date' },
  { description: 'True/false interactive checkbox', icon: CheckSquare, label: 'Checkbox', type: 'checkbox' },
  { description: 'Link records from another database', icon: Link2, label: 'Relation', type: 'relation' },
  { description: 'Calculated expressions from properties', icon: Sigma, label: 'Formula', type: 'formula' },
  { description: 'Summarize values across relations', icon: Binary, label: 'Rollup', type: 'rollup' },
];

const colorOptions = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#64748b'];

export function PropertyEditor({
  databaseId,
  isOpen,
  onClose,
  onSave,
  property,
  schema,
}: PropertyEditorProps) {
  const isEditing = Boolean(property);

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
  const [conversionStrategy, setConversionStrategy] = useState<TypeConversionStrategy>('convert_all');

  // Type Conversion Preview
  const [preview, setPreview] = useState<TypeConversionPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        if (type === 'relation') {
          if (!createdProperty || !relationTargetDatabaseId) {
            throw new Error('A target database is required for a relation.');
          }
          const relation = await window.maxApi.workspace.createRelation({
            inversePropertyName: inversePropertyName.trim() || null,
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

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save property.');
    } finally {
      setSaving(false);
    }
  };

  const relationProperties = schema?.properties.filter((p) => p.type === 'relation') || [];

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-container property-editor-modal" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div className="modal-header">
            <div className="modal-header__title">
              <Type size={18} className="text-primary" />
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
                placeholder="e.g. Price, Customer, Status..."
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
                <div className="property-type-grid">
                  {propertyTypeOptions.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = type === opt.type;
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        className={`property-type-card ${isSelected ? 'property-type-card--selected' : ''}`}
                        onClick={() => setType(opt.type)}
                      >
                        <div className="property-type-card__icon">
                          <Icon size={16} />
                        </div>
                        <div className="property-type-card__text">
                          <span className="property-type-card__label">{opt.label}</span>
                          <span className="property-type-card__desc">{opt.description}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Type Conversion Warning */}
            {preview && preview.invalidCount > 0 && (
              <div className="alert alert-warning">
                <strong>Type Conversion Notice:</strong> {preview.invalidCount} of {preview.totalRecords} records cannot be cleanly converted to <code>{type}</code>.
                <div className="text-danger font-semibold mt-1">
                  Warning: Incompatible values may be set to null.
                </div>
                <select
                  className="select-field mt-2"
                  value={conversionStrategy}
                  onChange={(event) => setConversionStrategy(event.target.value as TypeConversionStrategy)}
                >
                  {preview.availableStrategies.filter((strategy) => strategy !== 'cancel').map((strategy) => (
                    <option key={strategy} value={strategy}>{strategy.replaceAll('_', ' ')}</option>
                  ))}
                </select>
              </div>
            )}

            {type === 'relation' && !isEditing && (
              <div className="space-y-3">
                <div className="form-group">
                  <label className="form-label">Target Database</label>
                  <select
                    className="select-field"
                    onChange={(event) => setRelationTargetDatabaseId(event.target.value)}
                    required
                    value={relationTargetDatabaseId}
                  >
                    {databases.map((database) => (
                      <option key={database.id} value={database.id}>{database.title}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Inverse Property Name (optional)</label>
                  <input
                    className="input-field"
                    onChange={(event) => setInversePropertyName(event.target.value)}
                    placeholder="e.g. Repairs"
                    type="text"
                    value={inversePropertyName}
                  />
                </div>
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
                  <select
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
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Target Property ID</label>
                  <input
                    type="text"
                    className="input-field font-mono text-sm"
                    placeholder="e.g. prop_inv_delta or prop_amount"
                    value={rollupTargetPropId}
                    onChange={(e) => setRollupTargetPropId(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Calculation</label>
                  <select
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
                  </select>
                </div>
              </div>
            )}

            {/* Constraint checkboxes */}
            <div className="flex gap-4 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="checkbox-custom"
                />
                Required
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={uniqueValue}
                  onChange={(e) => setUniqueValue(e.target.checked)}
                  className="checkbox-custom"
                />
                Unique Value
              </label>
            </div>
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
      </div>
    </div>
  );
}
