export function formatSqlResult(rows: any[]): string {
  if (!rows || rows.length === 0) return "No results found.";

  const keys = Object.keys(rows[0]);
  const header = `| ${keys.join(" | ")} |`;
  const separator = `| ${keys.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${keys.map((key) => row[key]).join(" | ")} |`)
    .join("\n");

  return `### SQL Query Results\n\n${header}\n${separator}\n${body}`;
}

export function formatBuildStatus(success: boolean, errors: string[], warnings: string[]): string {
  let output = `### Build Status: ${success ? "✅ Success" : "❌ Failed"}\n\n`;

  if (errors.length > 0) {
    output += `#### 🛑 Errors (${errors.length})\n` + errors.map((e) => `- ${e}`).join("\n") + "\n\n";
  }

  if (warnings.length > 0) {
    output += `#### ⚠️ Warnings (${warnings.length})\n` + warnings.map((w) => `- ${w}`).join("\n") + "\n\n";
  }

  return output;
}

export function formatModel(modelName: string, properties: any[]): string {
  let output = `### Model: ${modelName}\n\n`;
  output += `| Property | Type | Attributes |\n| --- | --- | --- |\n`;
  output += properties
    .map((p) => `| ${p.name} | ${p.type} | ${p.attributes.join(", ")} |`)
    .join("\n");

  return output;
}

export function formatActionAnalysis(analysis: any): string {
  let output = `### Action Analysis: ${analysis.methodName}\n\n`;

  output += `**File Path:** \`${analysis.filePath}\`\n\n`;

  if (analysis.injectedServices.length > 0) {
    output += `#### 💉 Injected Services\n` + analysis.injectedServices.map((s: string) => `- ${s}`).join("\n") + "\n\n";
  }

  if (analysis.referencedModels.length > 0) {
    output += `#### 📦 Referenced Models\n` + analysis.referencedModels.map((m: string) => `- ${m}`).join("\n") + "\n\n";
  }

  if (analysis.calls.length > 0) {
    output += `#### 📞 Method Calls\n` + analysis.calls.map((c: any) => `- \`${c.member}.${c.method}\``).join("\n") + "\n\n";
  }

  return output;
}

export function formatCodeContext(data: { path: string, method: string, types: Record<string, string> }): string {
  let output = `### Code Context: ${data.path}\n\n`;
  output += "#### Method Implementation\n\n```csharp\n" + data.method + "\n```\n\n";

  if (Object.keys(data.types).length > 0) {
    output += "#### Referenced Type Definitions\n\n";
    for (const [type, def] of Object.entries(data.types)) {
      output += `<details>\n<summary>${type}</summary>\n\n\`\`\`csharp\n${def}\n\`\`\`\n\n</details>\n`;
    }
  }

  return output;
}

export function formatWorkflowTrace(traces: any[], level: number = 0): string {
  if (!traces || traces.length === 0) return level === 0 ? "No service/repository calls detected." : "";

  let output = level === 0 ? "### Workflow Trace\n\n" : "";
  const indent = "  ".repeat(level);

  for (const trace of traces) {
    output += `${indent}- **${trace.member}.${trace.method}** (\`${trace.file}\`)\n`;
    if (trace.calls && trace.calls.length > 0) {
      output += formatWorkflowTrace(trace.calls, level + 1);
    }
  }

  return output;
}

export function formatCsvList(files: any[]): string {
  let output = "### CSV Files\n\n| Path | Size (bytes) |\n| --- | --- |\n";
  output += files.map(f => `| ${f.path} | ${f.size} |`).join("\n");
  return output;
}

export function formatCsvQuery(data: any[]): string {
  if (data.length === 0) return "No CSV records found.";
  return formatSqlResult(data); // Re-use table formatting
}
