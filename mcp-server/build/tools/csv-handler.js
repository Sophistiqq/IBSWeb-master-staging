import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { glob } from 'glob';
export async function listCsvFiles(projectRoot) {
    const patterns = [
        path.join(projectRoot, 'Exported', '**', '*.csv'),
        path.join(projectRoot, 'Imports', '**', '*.csv')
    ];
    const files = [];
    for (const pattern of patterns) {
        const matched = await glob(pattern.replace(/\\/g, '/'));
        for (const file of matched) {
            const stats = fs.statSync(file);
            files.push({
                path: path.relative(projectRoot, file),
                size: stats.size
            });
        }
    }
    return files;
}
export async function queryCsv(projectRoot, filePath, filter, limit = 100) {
    const fullPath = path.join(projectRoot, filePath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    // Basic heuristic: check if the first row looks like a title/empty
    // or if it's a standard header.
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0)
        return [];
    const firstLine = lines[0];
    const columns = firstLine.split(',').map(c => c.trim());
    // If first line starts with a comma or looks like a single title
    let skipLines = 0;
    let hasHeader = true;
    if (firstLine.startsWith(',') || columns.filter(c => c.length > 0).length <= 1) {
        skipLines = 1;
    }
    // Check if the resulting "header" line looks like data
    const potentialHeaderLine = lines[skipLines];
    if (potentialHeaderLine) {
        const potentialHeaderColumns = potentialHeaderLine.split(',').map(c => c.trim());
        // If many columns are numeric, it's likely data, not a header
        const numericCount = potentialHeaderColumns.filter(c => c.length > 0 && !isNaN(Number(c))).length;
        if (numericCount > potentialHeaderColumns.length / 2) {
            hasHeader = false;
        }
    }
    const records = parse(content, {
        columns: hasHeader ? true : undefined,
        skip_empty_lines: true,
        from_line: skipLines + 1,
        relax_column_count: true,
        trim: true
    });
    // If no header, normalize to objects with col0, col1...
    let results = records;
    if (!hasHeader) {
        results = records.map((row) => {
            const obj = {};
            row.forEach((cell, i) => {
                obj[`col${i}`] = cell;
            });
            return obj;
        });
    }
    if (filter) {
        results = results.filter((row) => {
            for (const [key, value] of Object.entries(filter)) {
                if (row[key] !== value)
                    return false;
            }
            return true;
        });
    }
    return results.slice(0, limit);
}
