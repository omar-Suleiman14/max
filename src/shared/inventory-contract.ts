export const inventoryReasons = [
  'opening',
  'sale',
  'purchase',
  'adjustment',
  'damaged',
  'refund',
  'reversal',
] as const;
export type InventoryReason = (typeof inventoryReasons)[number];

export type InventoryMovement = Readonly<{
  createdAt: string;
  id: number;
  itemId: string;
  operationId?: string;
  quantityDelta: number;
  reason: InventoryReason;
}>;
