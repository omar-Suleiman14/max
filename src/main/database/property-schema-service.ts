import type { DatabaseSync } from 'node:sqlite';

import type { PropertyType, TypeConversionPreview, WorkspaceProperty } from '../../shared/property-contract';
import { WorkspaceDomainError } from '../../shared/workspace-contract';
import type { PropertyRepository } from './property-repository';
import { dateValueToText, valueToText } from './value-utils';
import type { DependencyService } from './dependency-service';

type RawValueRow = Readonly<{
  boolean_value: number | null;
  date_start: string | null;
  money_minor_value: number | null;
  number_value: number | null;
  option_id: string | null;
  record_id: string;
  text_value: string | null;
}>;

export class PropertySchemaService {
  readonly #database: DatabaseSync;
  readonly #propertyRepo: PropertyRepository;
  readonly #dependencyService: DependencyService;

  constructor(
    database: DatabaseSync,
    propertyRepo: PropertyRepository,
    dependencyService: DependencyService,
  ) {
    this.#database = database;
    this.#propertyRepo = propertyRepo;
    this.#dependencyService = dependencyService;
  }

  previewTypeConversion(propertyId: string, targetType: PropertyType): TypeConversionPreview {
    const prop = this.#propertyRepo.getProperty(propertyId);
    if (!prop) {
      throw new WorkspaceDomainError('not-found', `Property not found: ${propertyId}`);
    }

    if (prop.type === 'title') {
      throw new WorkspaceDomainError('invalid-input', 'Cannot change the type of a Title property.');
    }

    if (prop.type === targetType) {
      return {
        availableStrategies: ['convert_all'],
        convertibleCount: 0,
        dependencies: [],
        invalidCount: 0,
        sampleFailures: [],
        totalRecords: 0,
      };
    }

    const rows = this.#database
      .prepare('SELECT * FROM workspace_property_values WHERE property_id = ?')
      .all(propertyId) as RawValueRow[];

    let convertibleCount = 0;
    let invalidCount = 0;
    const sampleFailures: { current: unknown; error: string; recordId: string; recordTitle: string }[] = [];

    for (const row of rows) {
      const raw = this.#extractRawValue(row, prop.type);
      if (raw === null || raw === undefined || raw === '') {
        continue;
      }

      const canConvert = this.#canConvertValue(raw, targetType);
      if (canConvert) {
        convertibleCount++;
      } else {
        invalidCount++;
        if (sampleFailures.length < 5) {
          sampleFailures.push({
            current: raw,
            error: `Cannot convert to ${targetType}`,
            recordId: row.record_id,
            recordTitle: '',
          });
        }
      }
    }

    const deps = this.#dependencyService.listDependencies('property', propertyId);
    const dependencies = deps.map((d) => ({
      id: d.targetId,
      name: `${d.sourceKind}:${d.sourceId}`,
      type: d.dependencyType,
    }));

    const availableStrategies: ('convert_all' | 'first_value' | 'set_null' | 'cancel')[] =
      invalidCount === 0 ? ['convert_all', 'cancel'] : ['set_null', 'cancel'];

    return {
      availableStrategies,
      convertibleCount,
      dependencies,
      invalidCount,
      sampleFailures,
      totalRecords: rows.length,
    };
  }

  applyTypeConversion(
    propertyId: string,
    targetType: PropertyType,
    strategy: 'convert_all' | 'first_value' | 'set_null' = 'convert_all',
  ): WorkspaceProperty {
    const prop = this.#propertyRepo.getProperty(propertyId);
    if (!prop) {
      throw new WorkspaceDomainError('not-found', `Property not found: ${propertyId}`);
    }

    if (prop.type === 'title') {
      throw new WorkspaceDomainError('invalid-input', 'Cannot change the type of a Title property.');
    }

    if (prop.type === targetType) {
      return prop;
    }

    const rows = this.#database
      .prepare('SELECT * FROM workspace_property_values WHERE property_id = ?')
      .all(propertyId) as RawValueRow[];

    const now = new Date().toISOString();

    for (const row of rows) {
      const raw = this.#extractRawValue(row, prop.type);
      if (raw === null || raw === undefined || raw === '') {
        continue;
      }

      const converted = this.#convertValue(raw, targetType);
      if (converted === null && strategy === 'set_null') {
        this.#database
          .prepare(`
            UPDATE workspace_property_values
            SET text_value = NULL, number_value = NULL, money_minor_value = NULL, boolean_value = NULL,
                date_start = NULL, date_end = NULL, option_id = NULL, json_value = NULL, updated_at = ?
            WHERE record_id = ? AND property_id = ?
          `)
          .run(now, row.record_id, propertyId);
      } else {
        this.#applyConvertedValue(row.record_id, propertyId, targetType, converted, now);
      }
    }

    // Update property type definition
    this.#database
      .prepare('UPDATE workspace_properties SET type = ?, updated_at = ? WHERE id = ?')
      .run(targetType, now, propertyId);

    return this.#propertyRepo.getProperty(propertyId)!;
  }

  #extractRawValue(row: RawValueRow, type: PropertyType): unknown {
    switch (type) {
      case 'number':
        return row.number_value;
      case 'checkbox':
        return row.boolean_value !== null ? Boolean(row.boolean_value) : null;
      case 'date':
        return row.date_start;
      case 'select':
      case 'status':
        return row.option_id;
      default:
        return row.text_value;
    }
  }

  #canConvertValue(val: unknown, toType: PropertyType): boolean {
    if (toType === 'text' || toType === 'url' || toType === 'email' || toType === 'phone') {
      return true;
    }

    if (toType === 'number') {
      const num = Number(val);
      return Number.isFinite(num);
    }

    if (toType === 'checkbox') {
      return true;
    }

    if (toType === 'date') {
      const d = new Date(dateValueToText(val));
      return !Number.isNaN(d.getTime());
    }

    return false;
  }

  #convertValue(val: unknown, toType: PropertyType): unknown {
    if (val === null || val === undefined) return null;

    if (toType === 'text' || toType === 'url' || toType === 'email' || toType === 'phone') {
      return valueToText(val);
    }

    if (toType === 'number') {
      const num = Number(val);
      return Number.isFinite(num) ? num : null;
    }


    if (toType === 'checkbox') {
      return Boolean(val);
    }

    if (toType === 'date') {
      const d = new Date(dateValueToText(val));
      return !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
    }

    return null;
  }

  #applyConvertedValue(recordId: string, propertyId: string, targetType: PropertyType, val: unknown, now: string): void {
    let textVal: string | null = null;
    let numVal: number | null = null;
    const moneyMinor = null;
    let boolVal: number | null = null;
    let dateStart: string | null = null;

    if (val !== null && val !== undefined) {
      if (targetType === 'number') numVal = Number(val);
      else if (targetType === 'checkbox') boolVal = val ? 1 : 0;
      else if (targetType === 'date') dateStart = dateValueToText(val);
      else textVal = valueToText(val);
    }

    this.#database
      .prepare(`
        UPDATE workspace_property_values
        SET text_value = ?, number_value = ?, money_minor_value = ?, boolean_value = ?,
            date_start = ?, date_end = NULL, option_id = NULL, json_value = NULL, updated_at = ?
        WHERE record_id = ? AND property_id = ?
      `)
      .run(textVal, numVal, moneyMinor, boolVal, dateStart, now, recordId, propertyId);
  }
}
