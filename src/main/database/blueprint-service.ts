import type { DatabaseSync } from 'node:sqlite';

import type {
  Blueprint,
  BlueprintProperty,
  BlueprintTemplate,
  BlueprintValidationIssue,
  BlueprintValidationResult,
} from '../../shared/blueprint-contract';
import {
  objectKinds,
  propertyTypes,
  type ObjectKind,
  type PropertyDraft,
  type PropertyRules,
} from '../../shared/object-contract';
import type { TemplateDraft } from '../../shared/template-contract';
import { ObjectDomainError, type ObjectRepository } from './object-repository';
import type { ShopMetadataRepository } from './shop-metadata-repository';
import type { TemplateRepository } from './template-repository';

export class BlueprintService {
  constructor(
    private readonly database: DatabaseSync,
    private readonly objectRepository: ObjectRepository,
    private readonly templateRepository: TemplateRepository,
    private readonly shopMetadataRepository: ShopMetadataRepository,
  ) {}

  exportBlueprint(): Blueprint {
    const metadata = this.shopMetadataRepository.getMetadata();
    const itemProperties = this.objectRepository.listProperties('item');
    const personProperties = this.objectRepository.listProperties('person');

    const itemPropsById = new Map(itemProperties.map((p) => [p.id, p.name]));
    const personPropsById = new Map(personProperties.map((p) => [p.id, p.name]));

    const mapProperty = (p: { name: string; rules: PropertyRules; type: PropertyDraft['type'] }): BlueprintProperty => ({
      name: p.name,
      rules: p.rules,
      type: p.type,
    });

    const itemTemplates = this.templateRepository.listTemplates('item');
    const personTemplates = this.templateRepository.listTemplates('person');

    const mapTemplate = (
      t: { defaults: Record<string, unknown>; fieldOrder: readonly string[]; name: string; objectKind: ObjectKind; progressive: readonly string[] },
      propsById: Map<string, string>,
    ): BlueprintTemplate => {
      const fieldOrder = t.fieldOrder.map((idOrName) => propsById.get(idOrName) ?? idOrName);
      const progressive = t.progressive.map((idOrName) => propsById.get(idOrName) ?? idOrName);
      const defaults: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(t.defaults)) {
        const propName = propsById.get(key) ?? key;
        defaults[propName] = val;
      }

      return {
        defaults: defaults as BlueprintTemplate['defaults'],
        fieldOrder,
        name: t.name,
        objectKind: t.objectKind,
        progressive,
      };
    };

    return {
      description: metadata.blueprintName ? `Exported blueprint from ${metadata.shopName || 'Max'}` : undefined,
      locale: metadata.locale,
      name: metadata.blueprintName || metadata.shopName || 'Shop Blueprint',
      properties: {
        item: itemProperties.map(mapProperty),
        person: personProperties.map(mapProperty),
      },
      templates: [
        ...itemTemplates.map((t) => mapTemplate(t, itemPropsById)),
        ...personTemplates.map((t) => mapTemplate(t, personPropsById)),
      ],
      version: 1,
    };
  }

  validateBlueprint(input: unknown): BlueprintValidationResult {
    const issues: BlueprintValidationIssue[] = [];

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { issues: [{ message: 'Blueprint must be a valid JSON object.', path: '$' }], valid: false };
    }

    const bp = input as Partial<Blueprint>;

    if (bp.version !== 1) {
      issues.push({ field: 'version', message: 'Blueprint version must be 1.', path: '$.version' });
    }

    if (typeof bp.name !== 'string' || bp.name.trim().length < 1 || bp.name.trim().length > 120) {
      issues.push({ field: 'name', message: 'Blueprint name must contain 1–120 characters.', path: '$.name' });
    }

    if (!bp.properties || typeof bp.properties !== 'object') {
      issues.push({ field: 'properties', message: 'Blueprint properties object is required.', path: '$.properties' });
    } else {
      for (const kind of objectKinds) {
        const list = (bp.properties as Record<string, unknown>)[kind];
        if (!Array.isArray(list)) {
          issues.push({ field: `properties.${kind}`, message: `${kind} properties must be an array.`, path: `$.properties.${kind}` });
          continue;
        }

        const seenNames = new Set<string>();
        for (let i = 0; i < list.length; i++) {
          const prop = list[i] as Partial<BlueprintProperty>;
          const propPath = `$.properties.${kind}[${i}]`;

          if (!prop || typeof prop !== 'object') {
            issues.push({ message: 'Property must be an object.', path: propPath });
            continue;
          }

          if (typeof prop.name !== 'string' || prop.name.trim().length < 1 || prop.name.trim().length > 80) {
            issues.push({ field: 'name', message: 'Property name must contain 1–80 characters.', path: `${propPath}.name` });
          } else {
            const canonical = prop.name.trim().toLowerCase();
            if (seenNames.has(canonical)) {
              issues.push({ field: 'name', message: `Duplicate property name "${prop.name}" in ${kind} schema.`, path: `${propPath}.name` });
            }
            seenNames.add(canonical);
          }

          if (!prop.type || !propertyTypes.includes(prop.type)) {
            issues.push({ field: 'type', message: `Property type "${String(prop.type)}" is invalid.`, path: `${propPath}.type` });
          }

          if (!prop.rules || typeof prop.rules !== 'object') {
            issues.push({ field: 'rules', message: 'Property rules must be an object.', path: `${propPath}.rules` });
          } else {
            if ((prop.type === 'select' || prop.type === 'status') && (!Array.isArray(prop.rules.choices) || prop.rules.choices.length === 0)) {
              issues.push({ field: 'rules.choices', message: 'Select and status properties require at least one choice.', path: `${propPath}.rules.choices` });
            }
            if (prop.type === 'relation' && !prop.rules.relationTarget) {
              issues.push({ field: 'rules.relationTarget', message: 'Relation properties require an item or person target.', path: `${propPath}.rules.relationTarget` });
            }
          }
        }
      }
    }

    if (bp.templates !== undefined) {
      if (!Array.isArray(bp.templates)) {
        issues.push({ field: 'templates', message: 'Templates must be an array.', path: '$.templates' });
      } else {
        const itemPropNames = new Set(
          Array.isArray(bp.properties?.item)
            ? (bp.properties.item as readonly Partial<BlueprintProperty>[])
                .map((p) => (typeof p.name === 'string' ? p.name.trim().toLowerCase() : ''))
                .filter(Boolean)
            : [],
        );
        const personPropNames = new Set(
          Array.isArray(bp.properties?.person)
            ? (bp.properties.person as readonly Partial<BlueprintProperty>[])
                .map((p) => (typeof p.name === 'string' ? p.name.trim().toLowerCase() : ''))
                .filter(Boolean)
            : [],
        );

        for (let i = 0; i < bp.templates.length; i++) {
          const t = bp.templates[i] as Partial<BlueprintTemplate>;
          const tPath = `$.templates[${i}]`;

          if (!t || typeof t !== 'object') {
            issues.push({ message: 'Template must be an object.', path: tPath });
            continue;
          }

          if (typeof t.name !== 'string' || t.name.trim().length < 1 || t.name.trim().length > 80) {
            issues.push({ field: 'name', message: 'Template name must contain 1–80 characters.', path: `${tPath}.name` });
          }

          if (!t.objectKind || !objectKinds.includes(t.objectKind)) {
            issues.push({ field: 'objectKind', message: `Template objectKind "${String(t.objectKind)}" is invalid (must be item or person).`, path: `${tPath}.objectKind` });
          } else {
            const validPropNames = t.objectKind === 'item' ? itemPropNames : personPropNames;

            if (t.fieldOrder !== undefined) {
              if (!Array.isArray(t.fieldOrder)) {
                issues.push({ field: 'fieldOrder', message: 'Template fieldOrder must be an array of property names.', path: `${tPath}.fieldOrder` });
              } else if (validPropNames.size > 0) {
                for (const field of t.fieldOrder) {
                  if (typeof field === 'string' && !validPropNames.has(field.trim().toLowerCase())) {
                    issues.push({ field: 'fieldOrder', message: `Template field "${field}" does not exist in ${t.objectKind} properties.`, path: `${tPath}.fieldOrder` });
                  }
                }
              }
            }

            if (t.progressive !== undefined) {
              if (!Array.isArray(t.progressive)) {
                issues.push({ field: 'progressive', message: 'Template progressive must be an array of property names.', path: `${tPath}.progressive` });
              } else if (validPropNames.size > 0) {
                for (const field of t.progressive) {
                  if (typeof field === 'string' && !validPropNames.has(field.trim().toLowerCase())) {
                    issues.push({ field: 'progressive', message: `Progressive field "${field}" does not exist in ${t.objectKind} properties.`, path: `${tPath}.progressive` });
                  }
                }
              }
            }
          }

          if (t.defaults !== undefined && (typeof t.defaults !== 'object' || Array.isArray(t.defaults))) {
            issues.push({ field: 'defaults', message: 'Template defaults must be an object.', path: `${tPath}.defaults` });
          }
        }
      }
    }

    return {
      issues,
      valid: issues.length === 0,
    };
  }

  importBlueprint(blueprint: Blueprint): Blueprint {
    const validation = this.validateBlueprint(blueprint);
    if (!validation.valid) {
      const firstIssue = validation.issues[0];
      throw new ObjectDomainError('invalid-input', `Invalid blueprint: ${firstIssue?.message ?? 'validation failed'}`);
    }

    this.#transaction(() => {
      // 1. Import Item Properties
      const itemProps = blueprint.properties.item ?? [];
      const itemNameToId = new Map<string, string>();
      const existingItemProps = this.objectRepository.listProperties('item');
      const existingItemByName = new Map(existingItemProps.map((p) => [p.name.toLowerCase(), p]));

      for (const p of itemProps) {
        const existing = existingItemByName.get(p.name.trim().toLowerCase());
        const draft: PropertyDraft = {
          name: p.name.trim(),
          objectKind: 'item',
          rules: p.rules,
          type: p.type,
        };

        if (existing) {
          const updated = this.objectRepository.updateProperty(existing.id, draft);
          itemNameToId.set(p.name.trim().toLowerCase(), updated.id);
        } else {
          const created = this.objectRepository.createProperty(draft);
          itemNameToId.set(p.name.trim().toLowerCase(), created.id);
        }
      }

      // 2. Import Person Properties
      const personProps = blueprint.properties.person ?? [];
      const personNameToId = new Map<string, string>();
      const existingPersonProps = this.objectRepository.listProperties('person');
      const existingPersonByName = new Map(existingPersonProps.map((p) => [p.name.toLowerCase(), p]));

      for (const p of personProps) {
        const existing = existingPersonByName.get(p.name.trim().toLowerCase());
        const draft: PropertyDraft = {
          name: p.name.trim(),
          objectKind: 'person',
          rules: p.rules,
          type: p.type,
        };

        if (existing) {
          const updated = this.objectRepository.updateProperty(existing.id, draft);
          personNameToId.set(p.name.trim().toLowerCase(), updated.id);
        } else {
          const created = this.objectRepository.createProperty(draft);
          personNameToId.set(p.name.trim().toLowerCase(), created.id);
        }
      }

      // 3. Import Templates
      const templates = blueprint.templates ?? [];
      for (const t of templates) {
        const nameToId = t.objectKind === 'item' ? itemNameToId : personNameToId;
        const existingTemplates = this.templateRepository.listTemplates(t.objectKind);
        const existing = existingTemplates.find((et) => et.name.toLowerCase() === t.name.trim().toLowerCase());

        const fieldOrder = (t.fieldOrder ?? []).map((name) => nameToId.get(name.trim().toLowerCase()) ?? name);
        const progressive = (t.progressive ?? []).map((name) => nameToId.get(name.trim().toLowerCase()) ?? name);
        const defaults: Record<string, unknown> = {};

        for (const [key, val] of Object.entries(t.defaults ?? {})) {
          const id = nameToId.get(key.trim().toLowerCase()) ?? key;
          defaults[id] = val;
        }

        const templateDraft: TemplateDraft = {
          defaults: defaults as TemplateDraft['defaults'],
          fieldOrder,
          name: t.name.trim(),
          objectKind: t.objectKind,
          progressive,
        };

        if (existing) {
          this.templateRepository.updateTemplate(existing.id, templateDraft);
        } else {
          this.templateRepository.createTemplate(templateDraft);
        }
      }

      // 4. Update shop metadata blueprint name
      this.shopMetadataRepository.setKey('shop.blueprint_name', blueprint.name.trim());
      if (blueprint.locale) {
        this.shopMetadataRepository.setKey('shop.locale', blueprint.locale);
      }
    });

    return blueprint;
  }

  #transaction<T>(work: () => T): T {
    const isNested = this.database.isTransaction;
    if (!isNested) {
      this.database.exec('BEGIN IMMEDIATE;');
    }
    try {
      const result = work();
      if (!isNested) {
        this.database.exec('COMMIT;');
      }
      return result;
    } catch (error) {
      if (!isNested && this.database.isTransaction) {
        this.database.exec('ROLLBACK;');
      }
      throw error;
    }
  }
}
