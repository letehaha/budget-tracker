# Using Gemini CLI for Large Codebase Analysis

When analyzing large codebases or multiple files that might exceed context limits, use the Gemini CLI with its massive context window (up to 2 million tokens). Use `gemini -p` to leverage Google Gemini's large context capacity.

## Prerequisites

Ensure Gemini CLI is installed before using these commands. Installation instructions: https://github.com/google-gemini/gemini-cli?tab=readme-ov-file#quickstart

## File and Directory Inclusion Syntax

Use the `@` syntax to include files and directories in your Gemini prompts. The paths should be relative to WHERE you run the gemini command:

### Examples:

**Single file analysis:**

```bash
gemini -p "@web/src/server/server.ts Explain this file's purpose and structure"
```

**Multiple files:**

```bash
gemini -p "@package.json @web/src/client/app.ts Analyze the dependencies used in the code"
```

**Entire directory:**

```bash
gemini -p "@src/ Summarize the architecture of this codebase"
```

**Multiple directories:**

```bash
gemini -p "@src/ @tests/ Analyze test coverage for the source code"
```

**Current directory and subdirectories:**

```bash
gemini -p "@./ Give me an overview of this entire project"
# Or use --all_files flag:
gemini --all_files -p "Analyze the project structure and dependencies"
```

**⚠️ Security Warning:** Using `@./` may include sensitive files like `.env`, `.git/`, or API keys. Consider using specific directories or exclusion patterns.

## Implementation Verification Examples

**Check if a feature is implemented:**

```bash
gemini -p "@src/ @lib/ Has dark mode been implemented in this codebase? Show me the relevant files and functions"
```

**Verify authentication implementation:**

```bash
gemini -p "@src/ @middleware/ Is JWT authentication implemented? List all auth-related endpoints and middleware"
```

**Check for specific patterns:**

```bash
gemini -p "@src/ Are there any React hooks that handle WebSocket connections? List them with file paths"
```

**Verify error handling:**

```bash
gemini -p "@src/ @api/ Is proper error handling implemented for all API endpoints? Show examples of try-catch blocks"
```

**Check for rate limiting:**

```bash
gemini -p "@backend/ @middleware/ Is rate limiting implemented for the API? Show the implementation details"
```

**Verify caching strategy:**

```bash
gemini -p "@src/ @lib/ @services/ Is Redis caching implemented? List all cache-related functions and their usage"
```

**Check for specific security measures:**

```bash
gemini -p "@src/ @api/ Are SQL injection protections implemented? Show how user inputs are sanitized"
```

**Verify test coverage for features:**

```bash
gemini -p "@src/payment/ @tests/ Is the payment processing module fully tested? List all test cases"
```

## Error Scenarios and Handling

**Gemini CLI not installed:**

```bash
# Error: command not found: gemini
# Solution: Install Gemini CLI following instructions at https://github.com/google/gemini-cli#installation
```

**Invalid file paths:**

```bash
gemini -p "@nonexistent/path/ Analyze this code"
# Gemini will report: "Error: Path 'nonexistent/path/' does not exist"
# The command continues with any valid paths provided
```

**Network connectivity issues:**

```bash
# If API calls fail, you'll see:
# "Error: Failed to connect to Gemini API"
# Solution: Check your internet connection and API key configuration
```

**File encoding problems:**

```bash
# Non-UTF8 files are automatically skipped with a warning:
# "Warning: Skipping binary or non-UTF8 file: path/to/file"
```

**Context limit exceeded:**

```bash
# For extremely large codebases:
# "Error: Context limit exceeded (2M tokens)"
# Solution: Use more specific paths or directories instead of @./
```

**Timeout during analysis:**

```bash
# Default timeout is 30 seconds for API calls
# For longer operations, use the --timeout flag:
gemini --timeout 120 -p "@large-codebase/ Analyze architecture"
```

## When to Use Gemini CLI

**PRIMARY REASON: TOKEN EFFICIENCY**

Use `gemini -p` to save Claude tokens and reduce costs when:

- **Any multi-file analysis** - Even if files are small, use Gemini to analyze multiple files together instead of reading them individually in Claude
- **Code exploration tasks** - When searching for implementations, patterns, or understanding how features work across the codebase
- **Architecture understanding** - When you need to understand how components interact or where functionality is implemented
- **Feature verification** - Checking if specific features, patterns, or security measures are implemented
- **Token conservation** - When the task involves reading multiple files that would consume significant Claude tokens

**SECONDARY REASONS: Context limitations**

- Analyzing entire codebases or large directories that exceed Claude's context window
- Comparing multiple large files
- Working with files totaling more than 100KB
- Current context window is insufficient for the task

**RULE OF THUMB: If you're about to read 2+ files to understand something, use Gemini first**

This saves tokens regardless of file size and often provides better comprehensive analysis due to Gemini's 2M token context window.

## Important Notes

- Paths in @ syntax are relative to your current working directory when invoking gemini
- The CLI will include file contents directly in the context
- The --yolo flag bypasses confirmation prompts (use cautiously)
- Gemini's context window can handle entire codebases that would overflow Claude's context
- When checking implementations, be specific about what you're looking for to get accurate results
- Symlinks are followed by default - be cautious with circular references
- Binary files are automatically excluded from analysis
- Use `.geminiignore` file to exclude specific patterns (similar to `.gitignore`)

## Using .geminiignore

Create a `.geminiignore` file in your project root to exclude files and directories from Gemini analysis. The syntax follows `.gitignore` patterns:

```
# Environment and secrets
.env*
*.key
*.pem
secrets/
credentials/

# Build artifacts
dist/
build/
# Built application files
*.apk
*.aar
*.ap_
*.aab

# Files for the ART/Dalvik VM
*.dex

# Java class files
*.class

# Generated files
bin/
gen/
out/
#  Uncomment the following line in case you need and you don't have the release build type files in your app
# release/

# Gradle files
.gradle/
build/

# Local configuration file (sdk path, etc)
local.properties

# Proguard folder generated by Eclipse
proguard/

# Log Files
*.log

# Android Studio Navigation editor temp files
.navigation/

# Android Studio captures folder
captures/

# IntelliJ
*.iml
.idea/

# Keystore files
# Uncomment the following lines if you do not want to check your keystore files in.
*.jks
*.keystore

# External native build folder generated in Android Studio 2.2 and later
.externalNativeBuild
.cxx/

# Google Services (e.g. APIs or Firebase)
google-services.json

# Version control
vcs.xml

# lint
lint/intermediates/
lint/generated/
lint/outputs/
lint/tmp/
# lint/reports/

# Android Profiling
*.hprof

# Aider files
.aider*
!.aider-desk/
```

**Pattern Examples:**

- `*.log` - Exclude all log files
- `temp/` - Exclude temp directory
- `!important.log` - Include important.log even if \*.log is excluded
- `src/**/test.js` - Exclude test.js in any subdirectory of src
- `/config.json` - Exclude config.json only in root directory

## Error Handling

- If paths don't exist, Gemini will report an error and continue with valid paths
- File encoding issues are handled gracefully (non-UTF8 files are skipped)
- For large repositories, consider using specific subdirectories to avoid timeouts
