import type { Blueprint } from './blueprint-contract';

export const phoneShopBlueprint: Blueprint = {
  description: 'Pre-configured schema with IMEI, Brand, Condition, Pricing, and Quick Templates.',
  locale: 'en',
  name: 'Mobile & Electronics Shop',
  properties: {
    item: [
      {
        name: 'Model',
        rules: { choices: [], digitsOnly: false, required: true, unique: false },
        semanticRole: 'DISPLAY_NAME',
        type: 'text',
      },
      {
        name: 'Brand',
        rules: {
          choices: ['Apple', 'Samsung', 'Xiaomi', 'Oppo', 'Realme', 'Huawei', 'Other'],
          digitsOnly: false,
          required: false,
          unique: false,
        },
        type: 'select',
      },
      {
        name: 'Condition',
        rules: {
          choices: ['Brand New', 'Like New', 'Used - Good', 'For Parts'],
          digitsOnly: false,
          required: false,
          unique: false,
        },
        type: 'status',
      },
      {
        name: 'IMEI',
        rules: {
          choices: [],
          digitsOnly: true,
          maximumLength: 18,
          minimumLength: 14,
          required: false,
          unique: true,
        },
        type: 'text',
      },
      {
        name: 'Cost Price',
        rules: { choices: [], digitsOnly: false, minimum: 0, required: false, unique: false },
        type: 'money',
      },
      {
        name: 'Selling Price',
        rules: { choices: [], digitsOnly: false, minimum: 0, required: false, unique: false },
        semanticRole: 'PRICE',
        type: 'money',
      },
      {
        name: 'Stock',
        rules: { choices: [], digitsOnly: false, minimum: 0, required: true, unique: false },
        semanticRole: 'QUANTITY',
        type: 'number',
      },
    ],
    person: [
      {
        name: 'Phone Number',
        rules: { choices: [], digitsOnly: true, maximumLength: 15, minimumLength: 8, required: false, unique: true },
        type: 'text',
      },
      {
        name: 'Type',
        rules: { choices: ['Customer', 'Supplier', 'Technician'], digitsOnly: false, required: false, unique: false },
        type: 'select',
      },
      {
        name: 'Notes',
        rules: { choices: [], digitsOnly: false, required: false, unique: false },
        type: 'text',
      },
    ],
  },
  templates: [
    {
      defaults: { Condition: 'Brand New' },
      fieldOrder: ['Model', 'Selling Price', 'Stock', 'Brand', 'Condition', 'IMEI', 'Cost Price'],
      name: 'New Phone',
      objectKind: 'item',
      progressive: ['Cost Price'],
    },
    {
      defaults: { Condition: 'Used - Good' },
      fieldOrder: ['Model', 'Selling Price', 'Stock', 'Brand', 'Condition', 'IMEI', 'Cost Price'],
      name: 'Used Phone',
      objectKind: 'item',
      progressive: ['Cost Price'],
    },
    {
      defaults: {},
      fieldOrder: ['Model', 'Selling Price', 'Stock', 'Brand', 'Cost Price'],
      name: 'Accessory / Case',
      objectKind: 'item',
      progressive: ['Cost Price'],
    },
    {
      defaults: { Type: 'Customer' },
      fieldOrder: ['Phone Number', 'Type', 'Notes'],
      name: 'Customer',
      objectKind: 'person',
      progressive: ['Notes'],
    },
    {
      defaults: { Type: 'Supplier' },
      fieldOrder: ['Phone Number', 'Type', 'Notes'],
      name: 'Supplier',
      objectKind: 'person',
      progressive: ['Notes'],
    },
  ],
  version: 1,
};
