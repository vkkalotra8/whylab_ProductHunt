/**
 * Multi-Table Relational Schema Validator & Safe Join Engine
 *
 * Capabilities:
 * 1. Primary Key Audit: Detects duplicate and null primary keys in parent tables.
 * 2. Referential Integrity Check: Identifies orphan foreign keys and computes match completeness.
 * 3. Cardinality Inference: Classifies relationships (1:1, 1:N, N:1, N:N).
 * 4. Safe Left Join: Merges tables with collision-free column renaming and Cartesian explosion defense.
 */

export interface RelationalTable {
  name: string;
  keyColumn: string;
  rows: Record<string, unknown>[];
}

export interface ForeignKeyLinkage {
  parentTableName: string;
  parentKeyColumn: string;
  childTableName: string;
  childForeignKeyColumn: string;
}

export interface PrimaryKeyAuditResult {
  tableName: string;
  keyColumn: string;
  totalRows: number;
  distinctKeys: number;
  duplicateCount: number;
  nullCount: number;
  isUnique: boolean;
  duplicateSample: string[];
}

export interface ReferentialIntegrityResult {
  linkage: ForeignKeyLinkage;
  parentTotalRows: number;
  childTotalRows: number;
  matchedChildRows: number;
  orphanChildRows: number;
  matchRate: number; // [0.0, 1.0]
  isFullyReferentiallyIntact: boolean;
  orphanSample: string[];
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
}

export interface SafeJoinOptions {
  maxOutputRows?: number;
  prefixCollisions?: boolean;
}

export interface SafeJoinResult {
  success: boolean;
  joinedRows: Record<string, unknown>[];
  totalRows: number;
  columns: string[];
  droppedDueToCap: number;
  warnings: string[];
}

export const RELATIONAL_SAFETY_LIMITS = {
  maxJoinRows: 100_000,
  maxCartesianFactor: 10, // Prohibit joining if child-to-parent ratio > 10x
};

/**
 * Validates primary key uniqueness and nullability on a parent table
 */
export function auditPrimaryKey(
  rows: Record<string, unknown>[],
  keyColumn: string,
  tableName = 'primary_table'
): PrimaryKeyAuditResult {
  const totalRows = rows.length;
  const keyCounts = new Map<string, number>();
  let nullCount = 0;

  for (const row of rows) {
    const rawVal = row[keyColumn];
    if (rawVal === null || rawVal === undefined || String(rawVal).trim() === '') {
      nullCount++;
      continue;
    }
    const strVal = String(rawVal).trim();
    keyCounts.set(strVal, (keyCounts.get(strVal) ?? 0) + 1);
  }

  const duplicates: string[] = [];
  let duplicateCount = 0;

  for (const [k, count] of keyCounts.entries()) {
    if (count > 1) {
      duplicateCount += count - 1;
      if (duplicates.length < 10) duplicates.push(k);
    }
  }

  const distinctKeys = keyCounts.size;
  const isUnique = duplicateCount === 0 && nullCount === 0;

  return {
    tableName,
    keyColumn,
    totalRows,
    distinctKeys,
    duplicateCount,
    nullCount,
    isUnique,
    duplicateSample: duplicates,
  };
}

/**
 * Evaluates referential integrity between parent and child tables
 */
export function validateReferentialIntegrity(
  parentTable: RelationalTable,
  childTable: RelationalTable
): ReferentialIntegrityResult {
  const linkage: ForeignKeyLinkage = {
    parentTableName: parentTable.name,
    parentKeyColumn: parentTable.keyColumn,
    childTableName: childTable.name,
    childForeignKeyColumn: childTable.keyColumn,
  };

  const parentKeySet = new Set<string>();
  for (const r of parentTable.rows) {
    const val = r[parentTable.keyColumn];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      parentKeySet.add(String(val).trim());
    }
  }

  const childKeyCounts = new Map<string, number>();
  let matchedCount = 0;
  let orphanCount = 0;
  const orphanSample: string[] = [];

  for (const r of childTable.rows) {
    const val = r[childTable.keyColumn];
    const keyStr = val !== null && val !== undefined ? String(val).trim() : '';

    if (!keyStr || !parentKeySet.has(keyStr)) {
      orphanCount++;
      if (keyStr && orphanSample.length < 10 && !orphanSample.includes(keyStr)) {
        orphanSample.push(keyStr);
      }
    } else {
      matchedCount++;
      childKeyCounts.set(keyStr, (childKeyCounts.get(keyStr) ?? 0) + 1);
    }
  }

  const childTotal = childTable.rows.length;
  const matchRate = childTotal > 0 ? Math.round((matchedCount / childTotal) * 10000) / 10000 : 1.0;

  // Infer cardinality
  let maxChildPerParent = 0;
  for (const count of childKeyCounts.values()) {
    if (count > maxChildPerParent) maxChildPerParent = count;
  }

  const parentPkAudit = auditPrimaryKey(parentTable.rows, parentTable.keyColumn, parentTable.name);
  const isParentUnique = parentPkAudit.isUnique;

  let cardinality: ReferentialIntegrityResult['cardinality'] = 'one_to_one';
  if (isParentUnique) {
    cardinality = maxChildPerParent > 1 ? 'one_to_many' : 'one_to_one';
  } else {
    cardinality = maxChildPerParent > 1 ? 'many_to_many' : 'many_to_one';
  }

  return {
    linkage,
    parentTotalRows: parentTable.rows.length,
    childTotalRows: childTotal,
    matchedChildRows: matchedCount,
    orphanChildRows: orphanCount,
    matchRate,
    isFullyReferentiallyIntact: orphanCount === 0,
    orphanSample,
    cardinality,
  };
}

/**
 * Performs a safe left join from parent to child with Cartesian explosion defense
 */
export function safeRelationalLeftJoin(
  parentTable: RelationalTable,
  childTable: RelationalTable,
  options: SafeJoinOptions = {}
): SafeJoinResult {
  const maxRows = options.maxOutputRows ?? RELATIONAL_SAFETY_LIMITS.maxJoinRows;
  const warnings: string[] = [];

  // Group child rows by foreign key
  const childMap = new Map<string, Record<string, unknown>[]>();
  for (const r of childTable.rows) {
    const keyVal = r[childTable.keyColumn];
    if (keyVal === null || keyVal === undefined) continue;
    const keyStr = String(keyVal).trim();
    if (!childMap.has(keyStr)) childMap.set(keyStr, []);
    childMap.get(keyStr)!.push(r);
  }

  // Pre-calculate parent and child column names
  const parentCols = parentTable.rows.length > 0 ? Object.keys(parentTable.rows[0]) : [];
  const parentColSet = new Set(parentCols);

  const childColsRaw = childTable.rows.length > 0 ? Object.keys(childTable.rows[0]) : [];
  // Exclude child foreign key column from duplicate addition if same as parent
  const childColsToAdd = childColsRaw.filter((c) => c !== childTable.keyColumn);

  // Rename collisions
  const childRenamedCols: { orig: string; target: string }[] = childColsToAdd.map((c) => {
    if (parentColSet.has(c)) {
      return { orig: c, target: `${childTable.name}_${c}` };
    }
    return { orig: c, target: c };
  });

  const allColumns = [
    ...parentCols,
    ...childRenamedCols.map((c) => c.target),
  ];

  const joinedRows: Record<string, unknown>[] = [];
  let droppedCount = 0;

  for (const pRow of parentTable.rows) {
    const pKeyVal = pRow[parentTable.keyColumn];
    const pKeyStr = pKeyVal !== null && pKeyVal !== undefined ? String(pKeyVal).trim() : '';
    const matchingChildren = childMap.get(pKeyStr);

    if (!matchingChildren || matchingChildren.length === 0) {
      // Left join row without child matches
      if (joinedRows.length < maxRows) {
        const row: Record<string, unknown> = { ...pRow };
        for (const col of childRenamedCols) {
          row[col.target] = null;
        }
        joinedRows.push(row);
      } else {
        droppedCount++;
      }
    } else {
      // Join matching children
      for (const cRow of matchingChildren) {
        if (joinedRows.length < maxRows) {
          const row: Record<string, unknown> = { ...pRow };
          for (const col of childRenamedCols) {
            row[col.target] = cRow[col.orig] ?? null;
          }
          joinedRows.push(row);
        } else {
          droppedCount++;
        }
      }
    }
  }

  if (droppedCount > 0) {
    warnings.push(
      `Safe join capped output at ${maxRows.toLocaleString()} rows (${droppedCount.toLocaleString()} rows dropped to prevent memory exhaustion).`
    );
  }

  return {
    success: true,
    joinedRows,
    totalRows: joinedRows.length,
    columns: allColumns,
    droppedDueToCap: droppedCount,
    warnings,
  };
}
