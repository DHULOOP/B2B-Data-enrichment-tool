import { EnrichmentRow } from "../types";

/**
 * Parses raw CSV text into objects containing ALL columns of the CSV.
 * It dynamically maps all columns so that the full context is preserved.
 */
export function parseCSVText(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];

  // Parse headers
  const firstLine = lines[0];
  if (!firstLine) return [];

  const rawHeaders = parseCSVLine(firstLine);
  // Ensure unique, clean headers
  const headers = rawHeaders.map((h, i) => {
    const clean = h.trim();
    if (!clean) return `Column_${i + 1}`;
    return clean;
  });

  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = parseCSVLine(line);
    const rowObj: Record<string, string> = {};

    // Map cells to headers
    for (let j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = cells[j] !== undefined ? cells[j] : "";
    }

    // Only add if there is at least some data in the row
    if (Object.values(rowObj).some(val => val.trim() !== "")) {
      result.push(rowObj);
    }
  }

  return result;
}

/**
 * Parses a single CSV line properly handling double quoted cells with commas
 */
function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let inQuotes = false;
  let currentCell = "";

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(currentCell.trim());
      currentCell = "";
    } else {
      currentCell += char;
    }
  }
  cells.push(currentCell.trim());

  // Strip enclosing quotes from each cell
  return cells.map(cell => cell.replace(/^["']|["']$/g, "").trim());
}

/**
 * Converts enriched data rows back into a CSV download string.
 * It preserves all the original uploaded columns and appends the enriched columns.
 */
export function exportToCSV(rows: EnrichmentRow[]): string {
  if (rows.length === 0) return "";

  // Get all unique input keys across all rows
  const inputKeys = Array.from(
    new Set(rows.flatMap(row => Object.keys(row.inputData)))
  );

  // Enriched headers
  const enrichedHeaders = [
    "Verified Domain",
    "Company LinkedIn",
    "Traffic Analytics",
    "Discovered Email",
    "Status"
  ];

  const headers = [...inputKeys, ...enrichedHeaders];
  const csvRows = [headers.join(",")];

  for (const row of rows) {
    const values: string[] = [];

    // Add original input values
    for (const key of inputKeys) {
      values.push(escapeCSVCell(row.inputData[key] || ""));
    }

    // Add enriched values
    values.push(escapeCSVCell(row.domain || "Not Found"));
    values.push(escapeCSVCell(row.company_linkedin || "Not Found"));
    values.push(escapeCSVCell(row.traffic_analytics || "Not Found"));
    values.push(escapeCSVCell(row.work_email || "Not Found"));
    values.push(escapeCSVCell(row.status));

    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

function escapeCSVCell(val: string): string {
  const clean = val.replace(/"/g, '""');
  if (clean.includes(",") || clean.includes("\n") || clean.includes('"')) {
    return `"${clean}"`;
  }
  return clean;
}
