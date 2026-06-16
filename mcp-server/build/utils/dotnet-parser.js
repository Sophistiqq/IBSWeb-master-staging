import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
export async function findMethodInFile(filePath, methodName) {
    if (!fs.existsSync(filePath))
        return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    const escapedMethodName = methodName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const methodRegex = new RegExp(`(?:public|private|protected|internal|static|async|virtual|override|new|\\s)+\\s+[\\w\\<\\>\\[\\]\\?\\,]+\\s+${escapedMethodName}\\s*\\(`, 'g');
    const bodies = [];
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
        const startIdx = match.index;
        const openingBraceIdx = content.indexOf('{', startIdx + match[0].length);
        if (openingBraceIdx === -1)
            continue;
        let braceCount = 1;
        let endIdx = openingBraceIdx + 1;
        while (braceCount > 0 && endIdx < content.length) {
            if (content[endIdx] === '{')
                braceCount++;
            else if (content[endIdx] === '}')
                braceCount--;
            endIdx++;
        }
        if (braceCount === 0) {
            bodies.push(content.substring(startIdx, endIdx));
        }
    }
    return bodies.length > 0 ? bodies.join('\n\n') : null;
}
export function extractReferencedTypes(code) {
    // Extract words that look like Types (Capitalized, not keywords)
    const words = code.match(/\b[A-Z][a-zA-Z0-9_]*\b/g) || [];
    const keywords = new Set([
        'Task', 'String', 'Int32', 'DateTime', 'DateOnly', 'Guid', 'Boolean', 'Decimal',
        'ActionResult', 'JsonResult', 'IActionResult', 'List', 'IEnumerable', 'IQueryable',
        'Context', 'DbSet', 'Repository', 'UnitOfWork', 'IUnitOfWork', 'Controller',
        'SelectListItem', 'CancellationToken', 'ClaimsPrincipal', 'UserManager', 'ILogger',
        'ApplicationUser', 'ApplicationDbContext', 'View', 'ViewBag', 'TempData', 'ModelState',
        'User', 'Ok', 'BadRequest', 'NotFound', 'RedirectToAction', 'Json', 'nameof'
    ]);
    return [...new Set(words)].filter(word => !keywords.has(word));
}
export async function findTypeDefinition(projectRoot, typeName) {
    // Search in IBS.Models, IBS.DTOs, etc.
    const searchPatterns = [
        path.join(projectRoot, 'IBS.Models', '**', `${typeName}.cs`),
        path.join(projectRoot, 'IBS.DTOs', '**', `${typeName}.cs`),
        path.join(projectRoot, 'IBS.Models', '**', '*.cs'), // Fallback to search inside files
        path.join(projectRoot, 'IBS.DTOs', '**', '*.cs')
    ];
    for (const pattern of searchPatterns) {
        const files = await glob(pattern.replace(/\\/g, '/'));
        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            // Look for "class TypeName", "record TypeName", "enum TypeName", "interface TypeName"
            const typeRegex = new RegExp(`(?:public|internal|private|protected|static|partial|\\s)+\\s+(?:class|record|enum|struct|interface)\\s+${typeName}\\b`);
            if (typeRegex.test(content)) {
                // Find the whole block (naive brace counting again)
                const match = content.match(typeRegex);
                if (match) {
                    const startIdx = match.index;
                    const openingBraceIdx = content.indexOf('{', startIdx + match[0].length);
                    if (openingBraceIdx === -1) {
                        // Maybe it's a simple enum or something without braces on same line?
                        // Or maybe it's a file-scoped namespace class? 
                        // For now, return the whole file if it's small, or a chunk.
                        return content;
                    }
                    let braceCount = 1;
                    let endIdx = openingBraceIdx + 1;
                    while (braceCount > 0 && endIdx < content.length) {
                        if (content[endIdx] === '{')
                            braceCount++;
                        else if (content[endIdx] === '}')
                            braceCount--;
                        endIdx++;
                    }
                    return content.substring(startIdx, endIdx);
                }
            }
        }
    }
    return null;
}
export async function traceMethodCalls(projectRoot, code, depth = 2) {
    if (depth === 0)
        return [];
    // Look for patterns like _someService.SomeMethod( or unitOfWork.SomeRepo.SomeMethod(
    // Matches variableName.MethodName( or variableName.Property.MethodName(
    // Allows for whitespace/newlines around dots.
    const callRegex = /\b(_?[a-z][\w]*(?:\s*\.\s*[A-Z][\w]*)*)\s*\.\s*(\w+)\s*\(/g;
    const matches = [...code.matchAll(callRegex)];
    const traces = [];
    for (const match of matches) {
        const memberName = match[1];
        const methodName = match[2];
        if (['logger', 'console', 'await', 'task', 'string'].includes(memberName.toLowerCase().split('.')[0]))
            continue;
        // Try to find where this member is defined (e.g., in the constructor or field)
        // This is hard without a full parser, so we'll search for the method in Services and DataAccess
        const searchPatterns = [
            path.join(projectRoot, 'IBS.Services', '**', '*.cs'),
            path.join(projectRoot, 'IBS.DataAccess', '**', '*.cs')
        ];
        for (const pattern of searchPatterns) {
            const files = await glob(pattern.replace(/\\/g, '/'));
            for (const file of files) {
                const methodBody = await findMethodInFile(file, methodName);
                if (methodBody) {
                    const subTraces = await traceMethodCalls(projectRoot, methodBody, depth - 1);
                    traces.push({
                        member: memberName,
                        method: methodName,
                        file: path.relative(projectRoot, file),
                        body: methodBody,
                        calls: subTraces
                    });
                    break; // Found it, move to next match
                }
            }
        }
    }
    return traces;
}
export function extractModelInfo(code) {
    const propertyRegex = /\[([^\]]+)\]\s*public\s+([\w\<\>\[\]\?]+)\s+(\w+)\s*\{\s*get;\s*set;\s*\}/g;
    const simplePropertyRegex = /public\s+([\w\<\>\[\]\?]+)\s+(\w+)\s*\{\s*get;\s*set;\s*\}/g;
    const properties = [];
    let match;
    // First pass: properties with attributes
    while ((match = propertyRegex.exec(code)) !== null) {
        properties.push({
            attributes: match[1].split(',').map(a => a.trim()),
            type: match[2],
            name: match[3]
        });
    }
    // Second pass: properties without attributes (avoiding duplicates)
    while ((match = simplePropertyRegex.exec(code)) !== null) {
        if (!properties.find(p => p.name === match[2])) {
            properties.push({
                attributes: [],
                type: match[1],
                name: match[2]
            });
        }
    }
    return properties;
}
export async function analyzeActionRelations(projectRoot, filePath, methodName) {
    const fullPath = path.join(projectRoot, filePath);
    if (!fs.existsSync(fullPath))
        throw new Error(`File not found: ${filePath}`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    // Find injected services in constructor
    const constructorRegex = /public\s+\w+\s*\(([^)]*)\)/;
    const constructorMatch = content.match(constructorRegex);
    const injectedServices = [];
    if (constructorMatch) {
        const params = constructorMatch[1].split(',');
        params.forEach(p => {
            const parts = p.trim().split(/\s+/);
            if (parts.length >= 2) {
                injectedServices.push(parts[0]); // Take the Type
            }
        });
    }
    const methodBody = await findMethodInFile(fullPath, methodName);
    if (!methodBody)
        throw new Error(`Action ${methodName} not found in ${filePath}`);
    const referencedModels = extractReferencedTypes(methodBody);
    const calls = await traceMethodCalls(projectRoot, methodBody, 1);
    return {
        methodName,
        filePath,
        injectedServices: [...new Set(injectedServices)],
        referencedModels,
        calls
    };
}
