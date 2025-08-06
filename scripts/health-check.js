#!/usr/bin/env node
/**
 * Health check script for GH200 Retrieval Router
 * Can be used for monitoring and container health checks
 */

const http = require('http');
const https = require('https');

class HealthChecker {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || process.env.BASE_URL || 'http://localhost:8080';
        this.timeout = options.timeout || 10000;
        this.verbose = options.verbose || false;
        this.json = options.json || false;
    }
    
    /**
     * Perform comprehensive health check
     */
    async check() {
        const results = {
            timestamp: new Date().toISOString(),
            baseUrl: this.baseUrl,
            overall: 'healthy',
            checks: {}
        };
        
        try {
            // Basic ping test
            await this.checkEndpoint('/ping', results, 'ping');
            
            // API health check
            await this.checkEndpoint('/api/v1/health', results, 'api');
            
            // System info
            await this.checkEndpoint('/', results, 'system');
            
            // Determine overall health
            const failedChecks = Object.values(results.checks).filter(check => !check.healthy).length;
            
            if (failedChecks === 0) {
                results.overall = 'healthy';
            } else if (failedChecks < Object.keys(results.checks).length) {
                results.overall = 'degraded';
            } else {
                results.overall = 'unhealthy';
            }
            
        } catch (error) {
            results.overall = 'unhealthy';
            results.error = error.message;
        }
        
        return results;
    }
    
    /**
     * Check specific endpoint
     */
    async checkEndpoint(path, results, checkName) {
        const startTime = Date.now();
        
        try {
            const response = await this.makeRequest(path);
            const latency = Date.now() - startTime;
            
            results.checks[checkName] = {
                healthy: response.statusCode >= 200 && response.statusCode < 400,
                statusCode: response.statusCode,
                latency,
                path
            };
            
            if (this.verbose) {
                results.checks[checkName].body = response.body;
            }
            
        } catch (error) {
            const latency = Date.now() - startTime;
            
            results.checks[checkName] = {
                healthy: false,
                error: error.message,
                latency,
                path
            };
        }
    }
    
    /**
     * Make HTTP request
     */
    async makeRequest(path) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const client = url.protocol === 'https:' ? https : http;
            
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: 'GET',
                timeout: this.timeout
            };
            
            const req = client.request(options, (res) => {
                let body = '';
                
                res.on('data', (chunk) => {
                    body += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const parsedBody = JSON.parse(body);
                        resolve({
                            statusCode: res.statusCode,
                            body: parsedBody,
                            headers: res.headers
                        });
                    } catch (e) {
                        resolve({
                            statusCode: res.statusCode,
                            body: body,
                            headers: res.headers
                        });
                    }
                });
            });
            
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            req.setTimeout(this.timeout);
            req.end();
        });
    }
    
    /**
     * Format results for output
     */
    formatResults(results) {
        if (this.json) {
            return JSON.stringify(results, null, 2);
        }
        
        let output = `Health Check Results (${results.timestamp})\n`;
        output += `Base URL: ${results.baseUrl}\n`;
        output += `Overall Status: ${results.overall.toUpperCase()}\n\n`;
        
        for (const [name, check] of Object.entries(results.checks)) {
            const status = check.healthy ? '✅ PASS' : '❌ FAIL';
            output += `${status} ${name.padEnd(10)} (${check.latency}ms)`;
            
            if (check.statusCode) {
                output += ` - HTTP ${check.statusCode}`;
            }
            
            if (check.error) {
                output += ` - ${check.error}`;
            }
            
            output += '\n';
        }
        
        return output;
    }
    
    /**
     * Get appropriate exit code
     */
    getExitCode(results) {
        switch (results.overall) {
            case 'healthy':
                return 0;
            case 'degraded':
                return 1;
            case 'unhealthy':
                return 2;
            default:
                return 3;
        }
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--url':
            case '-u':
                options.baseUrl = args[++i];
                break;
            case '--timeout':
            case '-t':
                options.timeout = parseInt(args[++i]);
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--json':
            case '-j':
                options.json = true;
                break;
            case '--help':
            case '-h':
                console.log(`
Health Check Script for GH200 Retrieval Router

Usage: node health-check.js [options]

Options:
  -u, --url <url>      Base URL to check (default: http://localhost:8080)
  -t, --timeout <ms>   Request timeout in milliseconds (default: 10000)
  -v, --verbose        Include response bodies in output
  -j, --json          Output results as JSON
  -h, --help          Show this help message

Exit Codes:
  0 - Healthy
  1 - Degraded (some checks failed)
  2 - Unhealthy (all checks failed)
  3 - Error during health check
`);
                process.exit(0);
                break;
        }
    }
    
    const checker = new HealthChecker(options);
    
    try {
        const results = await checker.check();
        const output = checker.formatResults(results);
        const exitCode = checker.getExitCode(results);
        
        console.log(output);
        process.exit(exitCode);
        
    } catch (error) {
        console.error('Health check failed:', error.message);
        process.exit(3);
    }
}

if (require.main === module) {
    main();
}

module.exports = HealthChecker;