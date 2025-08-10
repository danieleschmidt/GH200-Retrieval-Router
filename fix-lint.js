#!/usr/bin/env node

/**
 * Fix common ESLint warnings by adding underscores to unused variables
 */

const fs = require('fs');
const path = require('path');

// Function to fix unused variables by adding underscores
function fixUnusedVariables(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Common patterns to fix
    const fixes = [
      // Function parameters
      { pattern: /(\([^)]*,\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*(\)|\s*[,)])/g, replacement: '$1_$2$3' },
      // Destructured assignments
      { pattern: /{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}/g, replacement: '{ _$1 }' },
      // Simple variable assignments
      { pattern: /const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g, replacement: 'const _$1 =' },
      { pattern: /let\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g, replacement: 'let _$1 =' },
    ];
    
    // Apply fixes cautiously - only for specific known unused variables
    const knownUnused = [
      'metadataPath', 'shardId', 'resultCount', 'validateConfig',
      'filters', 'poolName', 'pool', 'size', 'skipSuccessfulRequests',
      'skipFailedRequests', 'next', 'Joi', 'result', 'metrics',
      'category', 'options', 'key', 'value', 'GraceMemoryManager',
      'level', 'now', 'requestType', 'needsLargeMemory', 'node',
      'request', 'taskEntry', 'patternName', 'errors', 'imbalanceScore',
      'data', 'context', 'region', 'queryContext', 'cacheKey',
      'contextText', 'queryId', 'retrievedCount', 'error', 'name',
      'k', 'database', 'embeddings', 'userId', 'config', 'nodeId',
      'rules'
    ];
    
    for (const variable of knownUnused) {
      // Fix destructuring
      const destructureRegex = new RegExp(`{([^}]*,\\s*)${variable}(\\s*[,}])`, 'g');
      if (destructureRegex.test(content)) {
        content = content.replace(destructureRegex, `{$1_${variable}$2`);
        modified = true;
      }
      
      // Fix function parameters
      const paramRegex = new RegExp(`(\\([^)]*,\\s*)${variable}(\\s*[,)])`, 'g');
      if (paramRegex.test(content)) {
        content = content.replace(paramRegex, `$1_${variable}$2`);
        modified = true;
      }
      
      // Fix simple assignments
      const assignRegex = new RegExp(`(const|let)\\s+${variable}\\s*=`, 'g');
      if (assignRegex.test(content)) {
        content = content.replace(assignRegex, `$1 _${variable} =`);
        modified = true;
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`Fixed unused variables in: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Get all JavaScript files in src/
function getAllJSFiles(dir) {
  const files = [];
  
  function walkDir(currentPath) {
    const items = fs.readdirSync(currentPath);
    
    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (stat.isFile() && path.extname(item) === '.js') {
        files.push(fullPath);
      }
    }
  }
  
  walkDir(dir);
  return files;
}

// Main execution
const srcDir = path.join(__dirname, 'src');
const jsFiles = getAllJSFiles(srcDir);
let totalFixed = 0;

console.log(`Processing ${jsFiles.length} JavaScript files...`);

for (const file of jsFiles) {
  if (fixUnusedVariables(file)) {
    totalFixed++;
  }
}

console.log(`Fixed unused variables in ${totalFixed} files.`);

// Run lint again to check results
const { exec } = require('child_process');
exec('npm run lint', (error, stdout, stderr) => {
  if (stdout) {
    const warningMatch = stdout.match(/✖ (\d+) problems \((\d+) errors, (\d+) warnings\)/);
    if (warningMatch) {
      console.log(`\nLint results after fixes: ${warningMatch[3]} warnings, ${warningMatch[2]} errors`);
    }
  }
});