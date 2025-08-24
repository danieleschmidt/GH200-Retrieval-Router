/**
 * Startup validation utilities for robust system initialization
 * Validates system readiness before server startup
 */

const { logger } = require('./logger');

/**
 * Validate system startup with timeout and retries
 * @param {Object} config - Configuration options
 * @param {number} timeout - Initialization timeout in ms (default: 60000)
 * @param {number} retries - Number of retries (default: 3)
 * @returns {Promise<Object>} Router instance or throws error
 */
async function validateSystemStartup(router, config = {}, timeout = 60000, retries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        logger.info(`System startup validation attempt ${attempt}/${retries}`);
        
        try {
            // Validate provided router instance
            if (!router) {
                throw new Error('Router instance is required for validation');
            }
            
            // Validate critical components
            const validationResults = await validateComponents(router);
            
            if (validationResults.allHealthy) {
                logger.info('System startup validation successful', {
                    attempt,
                    healthyComponents: validationResults.healthyCount,
                    totalComponents: validationResults.totalComponents
                });
                return router;
            } else {
                const error = new Error(`Component validation failed: ${validationResults.errors.join(', ')}`);
                logger.error('Component validation failed', {
                    attempt,
                    errors: validationResults.errors,
                    healthyComponents: validationResults.healthyCount,
                    totalComponents: validationResults.totalComponents
                });
                throw error;
            }
            
        } catch (error) {
            lastError = error;
            logger.error(`Startup validation attempt ${attempt} failed`, {
                error: error.message,
                stack: error.stack,
                attempt,
                retries
            });
            
            if (attempt < retries) {
                const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
                logger.info(`Retrying in ${backoffDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
        }
    }
    
    throw new Error(`System startup validation failed after ${retries} attempts. Last error: ${lastError.message}`);
}

/**
 * Validate all system components
 * @param {Object} router - Router instance
 * @returns {Promise<Object>} Validation results
 */
async function validateComponents(router) {
    const results = {
        allHealthy: true,
        healthyCount: 0,
        totalComponents: 0,
        errors: [],
        componentStatus: {}
    };
    
    try {
        // Validate router
        results.totalComponents++;
        try {
            const routerHealth = await router.healthCheck();
            results.componentStatus.router = routerHealth;
            if (routerHealth.healthy) {
                results.healthyCount++;
            } else {
                results.allHealthy = false;
                results.errors.push('Router unhealthy');
            }
        } catch (error) {
            results.allHealthy = false;
            results.errors.push(`Router health check failed: ${error.message}`);
            results.componentStatus.router = { healthy: false, error: error.message };
        }
        
        // Validate memory manager
        if (router.memoryManager) {
            results.totalComponents++;
            try {
                const memoryHealth = await router.memoryManager.healthCheck();
                results.componentStatus.memoryManager = memoryHealth;
                if (memoryHealth.healthy) {
                    results.healthyCount++;
                } else {
                    results.allHealthy = false;
                    results.errors.push('Memory manager unhealthy');
                }
            } catch (error) {
                results.allHealthy = false;
                results.errors.push(`Memory manager health check failed: ${error.message}`);
                results.componentStatus.memoryManager = { healthy: false, error: error.message };
            }
        }
        
        // Validate vector database
        if (router.vectorDatabase) {
            results.totalComponents++;
            try {
                const dbHealth = await router.vectorDatabase.healthCheck();
                results.componentStatus.vectorDatabase = dbHealth;
                if (dbHealth.healthy) {
                    results.healthyCount++;
                } else {
                    results.allHealthy = false;
                    results.errors.push('Vector database unhealthy');
                }
            } catch (error) {
                results.allHealthy = false;
                results.errors.push(`Vector database health check failed: ${error.message}`);
                results.componentStatus.vectorDatabase = { healthy: false, error: error.message };
            }
        }
        
        // Validate quantum planner
        if (router.quantumPlanner) {
            results.totalComponents++;
            try {
                if (typeof router.quantumPlanner.healthCheck === 'function') {
                    const quantumHealth = await router.quantumPlanner.healthCheck();
                    results.componentStatus.quantumPlanner = quantumHealth;
                    if (quantumHealth.healthy) {
                        results.healthyCount++;
                    } else {
                        results.allHealthy = false;
                        results.errors.push('Quantum planner unhealthy');
                    }
                } else {
                    // Basic check if no health check method
                    results.componentStatus.quantumPlanner = { healthy: true, status: 'basic_check' };
                    results.healthyCount++;
                }
            } catch (error) {
                results.allHealthy = false;
                results.errors.push(`Quantum planner health check failed: ${error.message}`);
                results.componentStatus.quantumPlanner = { healthy: false, error: error.message };
            }
        }
        
        // Validate adaptive optimizer
        if (router.optimizer) {
            results.totalComponents++;
            try {
                if (typeof router.optimizer.healthCheck === 'function') {
                    const optimizerHealth = await router.optimizer.healthCheck();
                    results.componentStatus.optimizer = optimizerHealth;
                    if (optimizerHealth.healthy) {
                        results.healthyCount++;
                    } else {
                        results.allHealthy = false;
                        results.errors.push('Optimizer unhealthy');
                    }
                } else {
                    // Basic check if no health check method
                    results.componentStatus.optimizer = { healthy: true, status: 'basic_check' };
                    results.healthyCount++;
                }
            } catch (error) {
                results.allHealthy = false;
                results.errors.push(`Optimizer health check failed: ${error.message}`);
                results.componentStatus.optimizer = { healthy: false, error: error.message };
            }
        }
        
    } catch (error) {
        results.allHealthy = false;
        results.errors.push(`Component validation error: ${error.message}`);
        logger.error('Component validation error', { error: error.message });
    }
    
    return results;
}

/**
 * Perform pre-flight checks before system startup
 * @returns {Promise<Object>} Pre-flight check results
 */
async function performPreflightChecks() {
    const checks = {
        allPassed: true,
        passedCount: 0,
        totalChecks: 0,
        errors: [],
        checkResults: {}
    };
    
    try {
        // Check Node.js version
        checks.totalChecks++;
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
        if (majorVersion >= 16) {
            checks.passedCount++;
            checks.checkResults.nodeVersion = { passed: true, version: nodeVersion };
        } else {
            checks.allPassed = false;
            checks.errors.push(`Node.js version ${nodeVersion} is too old (require >= 16)`);
            checks.checkResults.nodeVersion = { passed: false, version: nodeVersion, required: '>=16' };
        }
        
        // Check memory availability
        checks.totalChecks++;
        const totalMemoryMB = require('os').totalmem() / 1024 / 1024;
        const requiredMemoryMB = process.env.NODE_ENV === 'production' ? 8192 : 1024; // 1GB for dev/test, 8GB for production
        if (totalMemoryMB >= requiredMemoryMB) {
            checks.passedCount++;
            checks.checkResults.memory = { passed: true, totalMemoryMB, requiredMB: requiredMemoryMB };
        } else {
            checks.allPassed = false;
            checks.errors.push(`Insufficient memory: ${totalMemoryMB.toFixed(1)}MB (require >= ${requiredMemoryMB}MB)`);
            checks.checkResults.memory = { passed: false, totalMemoryMB, requiredMB: requiredMemoryMB };
        }
        
        // Check CPU cores
        checks.totalChecks++;
        const cpuCores = require('os').cpus().length;
        if (cpuCores >= 2) {
            checks.passedCount++;
            checks.checkResults.cpu = { passed: true, cores: cpuCores };
        } else {
            checks.allPassed = false;
            checks.errors.push(`Insufficient CPU cores: ${cpuCores} (require >= 2)`);
            checks.checkResults.cpu = { passed: false, cores: cpuCores, required: 2 };
        }
        
        // Check environment variables
        checks.totalChecks++;
        const requiredEnvVars = ['NODE_ENV'];
        const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
        if (missingEnvVars.length === 0) {
            checks.passedCount++;
            checks.checkResults.environment = { passed: true, variables: requiredEnvVars };
        } else {
            // Don't fail on missing env vars, just warn
            checks.passedCount++;
            checks.checkResults.environment = { 
                passed: true, 
                missingOptional: missingEnvVars,
                message: 'Some optional environment variables are missing'
            };
        }
        
    } catch (error) {
        checks.allPassed = false;
        checks.errors.push(`Pre-flight check error: ${error.message}`);
        logger.error('Pre-flight check error', { error: error.message });
    }
    
    return checks;
}

module.exports = {
    validateSystemStartup,
    validateComponents,
    performPreflightChecks
};