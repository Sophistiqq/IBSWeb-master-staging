import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { getDbPool } from "./utils/db-client.js";
import { runBuild, parseBuildErrors } from "./tools/build-guard.js";
import { findMethodInFile, extractReferencedTypes, findTypeDefinition, traceMethodCalls, extractModelInfo, analyzeActionRelations, } from "./utils/dotnet-parser.js";
import { listCsvFiles, queryCsv } from "./tools/csv-handler.js";
import { glob } from "glob";
import * as Formatter from "./utils/formatter.js";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// If running from build/index.js, root is two levels up.
// If running from src/index.ts (via ts-node), root is also two levels up.
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, "..", "..");
console.error(`Starting MCP server with PROJECT_ROOT: ${PROJECT_ROOT}`);
const server = new Server({
    name: "ibs-assistant",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "execute_sql",
                description: "Run SQL queries against the IBS database. Prompt on Write is enforced by the client.",
                inputSchema: {
                    type: "object",
                    properties: {
                        sql: { type: "string", description: "The SQL query to execute." },
                    },
                    required: ["sql"],
                },
            },
            {
                name: "check_build_status",
                description: "Runs 'dotnet build' and returns structured errors/warnings.",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "search_code_context",
                description: "Search for a C# method and get its body plus all related DTO/Model definitions.",
                inputSchema: {
                    type: "object",
                    properties: {
                        methodName: { type: "string" },
                        filePath: {
                            type: "string",
                            description: "Optional file path to narrow search.",
                        },
                    },
                    required: ["methodName"],
                },
            },
            {
                name: "read_model",
                description: "Get a concise summary of a Model or DTO's properties.",
                inputSchema: {
                    type: "object",
                    properties: {
                        modelName: { type: "string" },
                    },
                    required: ["modelName"],
                },
            },
            {
                name: "analyze_action",
                description: "Deep-dive into a controller action and show all its relations.",
                inputSchema: {
                    type: "object",
                    properties: {
                        filePath: { type: "string" },
                        methodName: { type: "string" },
                    },
                    required: ["filePath", "methodName"],
                },
            },
            {
                name: "trace_workflow",
                description: "Recursively trace service and repository calls for a given code block or method.",
                inputSchema: {
                    type: "object",
                    properties: {
                        methodName: { type: "string" },
                        filePath: { type: "string" },
                    },
                    required: ["methodName", "filePath"],
                },
            },
            {
                name: "list_csv_files",
                description: "List all CSV files in Exported and Imports directories.",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "query_csv",
                description: "Query and filter data from a CSV file.",
                inputSchema: {
                    type: "object",
                    properties: {
                        filePath: {
                            type: "string",
                            description: "Relative path to the CSV file.",
                        },
                        filter: {
                            type: "object",
                            description: "Optional key-value pairs to filter rows.",
                        },
                        limit: {
                            type: "integer",
                            description: "Max rows to return (default 100).",
                        },
                    },
                    required: ["filePath"],
                },
            },
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        if (name === "execute_sql") {
            const sql = args?.sql;
            const pool = await getDbPool(PROJECT_ROOT);
            const result = await pool.query(sql);
            return {
                content: [
                    { type: "text", text: Formatter.formatSqlResult(result.rows) },
                ],
            };
        }
        if (name === "check_build_status") {
            const buildResult = await runBuild(PROJECT_ROOT);
            const parsed = parseBuildErrors(buildResult.output, PROJECT_ROOT);
            return {
                content: [
                    {
                        type: "text",
                        text: Formatter.formatBuildStatus(buildResult.success, parsed.errors, parsed.warnings),
                    },
                ],
            };
        }
        if (name === "search_code_context") {
            const methodName = args?.methodName;
            const filePath = args?.filePath;
            let methodBody = null;
            let foundPath = filePath;
            if (filePath) {
                methodBody = await findMethodInFile(path.join(PROJECT_ROOT, filePath), methodName);
            }
            else {
                // Search in Controllers and Services by default
                const searchDirs = ["IBSWeb", "IBS.Services"];
                for (const dir of searchDirs) {
                    const files = await glob(path.join(PROJECT_ROOT, dir, "**", "*.cs").replace(/\\/g, "/"));
                    for (const file of files) {
                        methodBody = await findMethodInFile(file, methodName);
                        if (methodBody) {
                            foundPath = path.relative(PROJECT_ROOT, file);
                            break;
                        }
                    }
                    if (methodBody)
                        break;
                }
            }
            if (!methodBody)
                return { content: [{ type: "text", text: "Method not found." }] };
            const types = extractReferencedTypes(methodBody);
            const definitions = {};
            for (const type of types) {
                const def = await findTypeDefinition(PROJECT_ROOT, type);
                if (def) {
                    const props = extractModelInfo(def);
                    if (props.length > 0) {
                        definitions[type] =
                            `| Property | Type | Attributes |\n| --- | --- | --- |\n` +
                                props
                                    .map((p) => `| ${p.name} | ${p.type} | ${p.attributes.join(", ")} |`)
                                    .join("\n");
                    }
                    else {
                        // If it's an enum or small class that extractModelInfo missed, show first 20 lines
                        definitions[type] =
                            def.split("\n").slice(0, 20).join("\n") +
                                (def.split("\n").length > 20 ? "\n..." : "");
                    }
                }
            }
            return {
                content: [
                    {
                        type: "text",
                        text: Formatter.formatCodeContext({
                            path: foundPath,
                            method: methodBody,
                            types: definitions,
                        }),
                    },
                ],
            };
        }
        if (name === "read_model") {
            const modelName = args?.modelName;
            const def = await findTypeDefinition(PROJECT_ROOT, modelName);
            if (!def)
                return {
                    content: [{ type: "text", text: `Model ${modelName} not found.` }],
                };
            const props = extractModelInfo(def);
            return {
                content: [
                    { type: "text", text: Formatter.formatModel(modelName, props) },
                ],
            };
        }
        if (name === "analyze_action") {
            const filePath = args?.filePath;
            const methodName = args?.methodName;
            const analysis = await analyzeActionRelations(PROJECT_ROOT, filePath, methodName);
            return {
                content: [
                    { type: "text", text: Formatter.formatActionAnalysis(analysis) },
                ],
            };
        }
        if (name === "trace_workflow") {
            const methodName = args?.methodName;
            const filePath = args?.filePath;
            const fullPath = path.join(PROJECT_ROOT, filePath);
            const methodBody = await findMethodInFile(fullPath, methodName);
            if (!methodBody)
                return { content: [{ type: "text", text: "Method not found." }] };
            const trace = await traceMethodCalls(PROJECT_ROOT, methodBody);
            return {
                content: [{ type: "text", text: Formatter.formatWorkflowTrace(trace) }],
            };
        }
        if (name === "list_csv_files") {
            const files = await listCsvFiles(PROJECT_ROOT);
            return {
                content: [{ type: "text", text: Formatter.formatCsvList(files) }],
            };
        }
        if (name === "query_csv") {
            const filePath = args?.filePath;
            const filter = args?.filter;
            const limit = args?.limit || 100;
            const data = await queryCsv(PROJECT_ROOT, filePath, filter, limit);
            return {
                content: [{ type: "text", text: Formatter.formatCsvQuery(data) }],
            };
        }
        throw new Error(`Tool not found: ${name}`);
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});
const transport = new StdioServerTransport();
await server.connect(transport);
