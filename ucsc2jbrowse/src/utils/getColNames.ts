import pkg from 'node-sql-parser'

import type { AST, ColumnRef, Create } from 'node-sql-parser'

const { Parser } = pkg

// A column definition's name is normally a plain identifier (ColumnRefItem), but
// the AST union also allows an aliased expression form; unwrap both to the name.
function columnName(ref: ColumnRef): string {
  const item = ref.type === 'expr' ? ref.expr : ref
  return typeof item.column === 'string' ? item.column : ''
}

/**
 * Extracts column names and table name from a SQL CREATE TABLE statement.
 * @param sqlContent The SQL CREATE TABLE statement as a string.
 * @returns An object containing the table name and an array of column names.
 * @throws Error if the SQL content cannot be parsed or does not contain a CREATE TABLE statement.
 */
export function getColNames(sqlContent: string): {
  tableName: string
  colNames: string[]
} {
  const parser = new Parser()
  // Parse the SQL content. Assumes MySQL grammar by default.
  const ast: AST[] | AST = parser.astify(sqlContent)
  const statements = Array.isArray(ast) ? ast : [ast]

  const createStatement = statements.find(
    (node): node is Create => node.type === 'create',
  )

  if (!createStatement?.table || !createStatement.create_definitions) {
    throw new Error(
      'Invalid SQL content: Could not find a CREATE TABLE statement or its definitions.',
    )
  }

  const { table } = createStatement
  const tableName = Array.isArray(table) ? (table[0]?.table ?? '') : table.table

  // Keep positional integrity with the data rows (parseTableLine maps values to
  // columns by index), so map every column definition rather than dropping any.
  const colNames = createStatement.create_definitions
    .filter(def => def.resource === 'column')
    .map(def => columnName(def.column))

  return {
    tableName,
    colNames,
  }
}
