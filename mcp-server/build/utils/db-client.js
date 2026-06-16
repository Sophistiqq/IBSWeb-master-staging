import pg from "pg";
import fs from "fs";
import path from "path";
const { Pool } = pg;
export async function getDbPool(projectRoot) {
    const appSettingsPath = path.join(projectRoot, "IBSWeb", "appsettings.Development.json");
    if (!fs.existsSync(appSettingsPath)) {
        throw new Error(`Could not find appsettings.Development.json at ${appSettingsPath}`);
    }
    const settings = JSON.parse(fs.readFileSync(appSettingsPath, "utf-8"));
    const connectionString = settings.ConnectionStrings?.DefaultConnection;
    if (!connectionString) {
        throw new Error("DefaultConnection string not found in appsettings.Development.json");
    }
    // Convert .NET connection string to pg format if necessary
    // Standard Npgsql string: "Server=localhost;Port=5432;Database=ibs_dev;User Id=postgres;Password=mis123"
    // pg wants: postgres://user:password@host:port/database
    const parts = connectionString.split(";").reduce((acc, part) => {
        const [key, value] = part.split("=");
        if (key && value) {
            acc[key.trim().toLowerCase()] = value.trim();
        }
        return acc;
    }, {});
    const config = {
        user: parts["user id"] || parts["user"],
        password: parts["password"],
        host: parts["server"] || parts["host"],
        port: parseInt(parts["port"] || "5432"),
        database: parts["database"],
    };
    return new Pool(config);
}
