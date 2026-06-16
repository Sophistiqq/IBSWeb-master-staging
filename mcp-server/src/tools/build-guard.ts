import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function runBuild(projectRoot: string) {
  try {
    // -nologo and -v:q (quiet) could be too quiet, stick with nologo
    const { stdout, stderr } = await execAsync('dotnet build -nologo -clp:NoSummary', { cwd: projectRoot });
    return {
      success: true,
      output: stdout
    };
  } catch (error: any) {
    return {
      success: false,
      output: error.stdout || error.message,
      error: error.stderr
    };
  }
}

export function parseBuildErrors(output: string, projectRoot: string = '') {
  const lines = output.split('\n');
  const errorLines = lines.filter(line => line.includes(': error '));
  const warningLines = lines.filter(line => line.includes(': warning '));

  const processLine = (line: string) => {
    let trimmed = line.trim();
    if (projectRoot) {
      const normalizedRoot = projectRoot.replace(/\\/g, '/');
      const normalizedLine = trimmed.replace(/\\/g, '/');
      
      // Replace all occurrences of normalizedRoot with empty string
      // Use global regex with escaped normalizedRoot
      const escapedRoot = normalizedRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedRoot, 'g');
      trimmed = normalizedLine.replace(regex, '').replace(/\/\//g, '/');
      
      // Clean up leading slashes that might remain
      trimmed = trimmed.replace(/^[\/\\]+/, '');
    }
    return trimmed;
  };

  // Limit warnings to top 10 to prevent token bloat
  const limitedWarnings = warningLines.slice(0, 10);
  const extraWarningsCount = Math.max(0, warningLines.length - 10);

  const result = {
    errors: errorLines.map(processLine),
    warnings: limitedWarnings.map(processLine)
  };

  if (extraWarningsCount > 0) {
    result.warnings.push(`... and ${extraWarningsCount} more warnings.`);
  }

  return result;
}
